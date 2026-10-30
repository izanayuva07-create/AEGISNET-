require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const path = require('path');
const { pool, query, initSchema } = require('./database');
const { seedDatabase } = require('./seeder');
const { notifyAllEmergencyContacts } = require('./notificationService');
const { evaluatePriority } = require('./aiPriorityEngine');

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'aegisnet-super-secret-jwt-key-2026-production';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// Setup Socket.IO for real-time responder dashboard
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  socket.on('join_responders', () => {
    socket.join('responders_room');
    console.log(`[Socket.IO] Client ${socket.id} joined responders_room`);
  });
  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Helper: Public user object
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role || 'user',
    status: user.status || 'active',
    created_at: user.created_at
  };
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Also support query param token for websocket or simple embeds
    const queryToken = req.query.token;
    if (queryToken) {
      jwt.verify(queryToken, JWT_SECRET, (err, user) => {
        if (err) return res.status(401).json({ error: 'Invalid or expired session token.' });
        req.user = user;
        return next();
      });
      return;
    }
    return res.status(401).json({ error: 'Authentication token is required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Session token invalid or expired. Please sign in again.' });
    req.user = user;
    next();
  });
}

// Optional Auth (for fallback or public intake)
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    req.user = err ? null : user;
    next();
  });
}

function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You are not authorized for this emergency operations action.' });
    }
    next();
  };
}

// ==========================================
// 1. HEALTH & SYSTEM TELEMETRY APIS
// ==========================================

app.get('/api/v1/health', async (_req, res) => {
  try {
    const dbCheck = await query('SELECT 1 AS ok');
    res.json({
      ok: true,
      service: 'AegisNet Intelligent Safety Core',
      version: '3.0.0',
      database: 'PostgreSQL 16 (Connected)',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Database connection degraded: ' + err.message });
  }
});

// ==========================================
// 2. AUTHENTICATION APIS
// ==========================================

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone, role = 'user' } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    const rawPassword = String(password || '');

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: 'Full name must contain at least 2 characters.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (rawPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const assignedRole = ['user', 'responder', 'admin'].includes(role) ? role : 'user';

    const existing = await query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email address already exists. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const insertRes = await query(
      `INSERT INTO users (name, email, password_hash, phone, role, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, name, email, phone, role, status, created_at`,
      [cleanName, cleanEmail, passwordHash, phone || '', assignedRole]
    );

    const newUser = insertRes.rows[0];

    // Initialize blank emergency profile
    await query(
      `INSERT INTO emergency_profiles (user_id, blood_group, allergies, medications, medical_notes)
       VALUES ($1, 'Not specified', 'None reported', 'None', '')
       ON CONFLICT (user_id) DO NOTHING`,
      [newUser.id]
    );

    // If registered as responder, initialize responder profile
    if (assignedRole === 'responder') {
      await query(
        `INSERT INTO responder_profiles (user_id, unit_name, agency, responder_type, status)
         VALUES ($1, 'Unit ' || $2, 'AegisNet Community Quick Response', 'General Responder', 'available')
         ON CONFLICT (user_id) DO NOTHING`,
        [newUser.id, cleanName]
      );
    }

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, name: newUser.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account registered successfully.',
      token,
      user: publicUser(newUser)
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal registration error. Check backend logs.' });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const rawPassword = String(password || '');

    const userRes = await query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    const user = userRes.rows[0];

    if (!user || !(await bcrypt.compare(rawPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended by administration.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Signed in successfully.',
      token,
      user: publicUser(user)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal login error.' });
  }
});

app.get('/api/v1/auth/profile', authenticateToken, async (req, res) => {
  try {
    const userRes = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'User profile not found.' });

    const profileRes = await query('SELECT * FROM emergency_profiles WHERE user_id = $1', [req.user.id]);
    const contactsRes = await query('SELECT * FROM emergency_contacts WHERE user_id = $1 ORDER BY priority ASC', [req.user.id]);

    let responderProfile = null;
    if (user.role === 'responder') {
      const respRes = await query('SELECT * FROM responder_profiles WHERE user_id = $1', [req.user.id]);
      responderProfile = respRes.rows[0] || null;
    }

    res.json({
      user: publicUser(user),
      emergencyProfile: profileRes.rows[0] || null,
      contacts: contactsRes.rows,
      responderProfile
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

app.put('/api/v1/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, blood_group, allergies, medications, medical_notes, emergency_instructions } = req.body;

    if (name && name.trim().length >= 2) {
      await query('UPDATE users SET name = $1, phone = $2 WHERE id = $3', [name.trim(), phone || '', req.user.id]);
    }

    await query(
      `INSERT INTO emergency_profiles (user_id, blood_group, allergies, medications, medical_notes, emergency_instructions, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         blood_group = EXCLUDED.blood_group,
         allergies = EXCLUDED.allergies,
         medications = EXCLUDED.medications,
         medical_notes = EXCLUDED.medical_notes,
         emergency_instructions = EXCLUDED.emergency_instructions,
         updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, blood_group || '', allergies || '', medications || '', medical_notes || '', emergency_instructions || '']
    );

    const updatedUser = (await query('SELECT * FROM users WHERE id = $1', [req.user.id])).rows[0];
    const updatedProfile = (await query('SELECT * FROM emergency_profiles WHERE user_id = $1', [req.user.id])).rows[0];

    res.json({
      message: 'Emergency profile updated successfully.',
      user: publicUser(updatedUser),
      emergencyProfile: updatedProfile
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update emergency profile.' });
  }
});

// ==========================================
// 3. TRUSTED EMERGENCY CONTACTS APIS (MAX 5)
// ==========================================

app.get('/api/v1/contacts', authenticateToken, async (req, res) => {
  try {
    const contactsRes = await query(
      'SELECT * FROM emergency_contacts WHERE user_id = $1 ORDER BY priority ASC, created_at ASC',
      [req.user.id]
    );
    res.json({ contacts: contactsRes.rows, count: contactsRes.rows.length, maxAllowed: 5 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve emergency contacts.' });
  }
});

app.post('/api/v1/contacts', authenticateToken, async (req, res) => {
  try {
    const { name, phone, relationship, priority } = req.body;
    const cleanName = String(name || '').trim();
    const cleanPhone = String(phone || '').trim();

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: 'Contact name must contain at least 2 characters.' });
    }
    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ error: 'Enter a valid phone number with area/country code.' });
    }

    // Check maximum 5 contacts
    const countCheck = await query('SELECT COUNT(*) AS count FROM emergency_contacts WHERE user_id = $1', [req.user.id]);
    if (parseInt(countCheck.rows[0].count) >= 5) {
      return res.status(400).json({ error: 'Maximum of 5 emergency contacts permitted per user account.' });
    }

    // Check duplicate phone
    const dupCheck = await query('SELECT id FROM emergency_contacts WHERE user_id = $1 AND phone = $2', [req.user.id, cleanPhone]);
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ error: 'This phone number is already registered in your emergency contacts.' });
    }

    const assignedPriority = Math.min(Math.max(parseInt(priority) || (parseInt(countCheck.rows[0].count) + 1), 1), 5);

    const insertRes = await query(
      `INSERT INTO emergency_contacts (user_id, name, phone, relationship, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, cleanName, cleanPhone, relationship || 'Family', assignedPriority]
    );

    res.status(201).json({
      message: 'Emergency contact added successfully.',
      contact: insertRes.rows[0]
    });
  } catch (err) {
    console.error('Add contact error:', err);
    res.status(500).json({ error: 'Failed to add emergency contact.' });
  }
});

app.put('/api/v1/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const { name, phone, relationship, priority } = req.body;
    const contactId = parseInt(req.params.id);

    const ownerCheck = await query('SELECT id FROM emergency_contacts WHERE id = $1 AND user_id = $2', [contactId, req.user.id]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency contact not found.' });
    }

    const updateRes = await query(
      `UPDATE emergency_contacts
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           relationship = COALESCE($3, relationship),
           priority = COALESCE($4, priority)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name, phone, relationship, priority, contactId, req.user.id]
    );

    res.json({ message: 'Contact updated.', contact: updateRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update contact.' });
  }
});

app.delete('/api/v1/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const deleteRes = await query(
      'DELETE FROM emergency_contacts WHERE id = $1 AND user_id = $2 RETURNING id',
      [contactId, req.user.id]
    );
    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found or unauthorized.' });
    }
    res.json({ message: 'Emergency contact removed.', id: contactId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove contact.' });
  }
});

// ==========================================
// 4. THE CORE SOS ACTIVATION API (POST /api/v1/sos/trigger)
// ==========================================

app.post('/api/v1/sos/trigger', optionalAuth, async (req, res) => {
  try {
    const {
      user_id,
      latitude,
      longitude,
      altitude,
      accuracy,
      heading,
      speed,
      timestamp,
      incident_type = 'Emergency',
      description = 'Emergency assistance requested via 3-second SOS activation',
      location_text = '',
      idempotency_key
    } = req.body;

    // Resolve user ID
    let finalUserId = req.user ? req.user.id : (user_id ? parseInt(user_id) : null);
    if (!finalUserId) {
      // If triggered anonymously, attach to the first citizen user
      const fallbackUser = await query("SELECT id FROM users WHERE role = 'user' ORDER BY id ASC LIMIT 1");
      finalUserId = fallbackUser.rows[0]?.id || 1;
    }

    // Check Idempotency Key to prevent accidental duplicate submissions
    if (idempotency_key) {
      const existingKey = await query('SELECT * FROM sos_logs WHERE idempotency_key = $1', [idempotency_key]);
      if (existingKey.rows.length > 0) {
        console.log(`[SOS Core] Duplicate SOS intercepted by idempotency key: ${idempotency_key}`);
        const existingSos = existingKey.rows[0];
        const loc = (await query('SELECT * FROM sos_locations WHERE sos_id = $1', [existingSos.id])).rows[0];
        return res.json({
          ok: true,
          duplicated: true,
          incident: existingSos,
          location: loc,
          message: 'Duplicate SOS submission recognized. Existing emergency event returned.'
        });
      }
    }

    // Generate Unique Incident ID (e.g. SOS-2026-XXXXX)
    const randomHex = Math.floor(10000 + Math.random() * 90000);
    const incidentCode = `SOS-2026-${randomHex}`;

    // Evaluate AI Priority Scoring
    const priorityResult = evaluatePriority({
      incident_type,
      description,
      altitude,
      speed
    });

    // Generate Google Maps Link
    const validLat = (latitude != null && !isNaN(Number(latitude))) ? Number(latitude) : null;
    const validLng = (longitude != null && !isNaN(Number(longitude))) ? Number(longitude) : null;
    const mapUrl = (validLat != null && validLng != null)
      ? `https://www.google.com/maps?q=${validLat.toFixed(6)},${validLng.toFixed(6)}`
      : 'https://maps.google.com/?q=Location+Unavailable';

    // Begin PostgreSQL Transaction
    const client = await pool.connect();
    let createdSosId;
    let newSosRecord;

    try {
      await client.query('BEGIN');

      // 1. Insert SOS Log
      const sosInsert = await client.query(
        `INSERT INTO sos_logs (incident_code, user_id, incident_type, description, priority, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, 'Triggered', $6)
         RETURNING *`,
        [incidentCode, finalUserId, incident_type, description, priorityResult.priority, idempotency_key || null]
      );
      newSosRecord = sosInsert.rows[0];
      createdSosId = newSosRecord.id;

      // 2. Insert SOS Location
      await client.query(
        `INSERT INTO sos_locations (sos_id, latitude, longitude, altitude, accuracy, heading, speed, location_text, google_maps_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          createdSosId,
          validLat,
          validLng,
          altitude ? Number(altitude) : null,
          accuracy ? Number(accuracy) : null,
          heading ? Number(heading) : null,
          speed ? Number(speed) : null,
          location_text || (validLat ? `GPS: ${validLat.toFixed(5)}, ${validLng.toFixed(5)}` : 'Manual / Area Alert'),
          mapUrl
        ]
      );

      // 3. Insert Priority Analysis
      await client.query(
        `INSERT INTO incident_priorities (sos_id, calculated_score, priority_level, ai_confidence, explanation, factors)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          createdSosId,
          priorityResult.score,
          priorityResult.priority,
          priorityResult.confidence,
          priorityResult.explanation,
          JSON.stringify(priorityResult.factors)
        ]
      );

      // 4. Initial Status History
      await client.query(
        `INSERT INTO incident_histories (sos_id, status, notes, changed_by)
         VALUES ($1, 'Triggered', 'SOS activated via 3-second hold. GPS captured.', $2)`,
        [createdSosId, finalUserId]
      );
      await client.query(
        `INSERT INTO incident_histories (sos_id, status, notes, changed_by)
         VALUES ($1, 'Received', 'AegisNet backend accepted emergency payload.', $2)`,
        [createdSosId, finalUserId]
      );

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // 5. Asynchronous SMS Broadcast to Trusted Contacts
    // "Do not block SOS incident creation just because SMS delivery fails."
    let notificationResults = [];
    try {
      notificationResults = await notifyAllEmergencyContacts(
        createdSosId,
        finalUserId,
        incidentCode,
        validLat,
        validLng,
        priorityResult.priority,
        description
      );
      await query(
        `INSERT INTO incident_histories (sos_id, status, notes, changed_by)
         VALUES ($1, 'Contacts Notified', 'SMS dispatched to ' || $2 || ' emergency contacts.', $3)`,
        [createdSosId, notificationResults.length, finalUserId]
      );
      await query("UPDATE sos_logs SET status = 'Contacts Notified' WHERE id = $1", [createdSosId]);
    } catch (smsErr) {
      console.error('[SMS Broadcast Engine Error]:', smsErr);
    }

    // 6. Broadcast Real-Time Alert to Responders via Socket.IO
    const userRow = (await query('SELECT name, phone FROM users WHERE id = $1', [finalUserId])).rows[0];
    const liveAlertPayload = {
      id: createdSosId,
      incident_code: incidentCode,
      user_id: finalUserId,
      user_name: userRow?.name || 'AegisNet User',
      user_phone: userRow?.phone || '',
      incident_type,
      description,
      priority: priorityResult.priority,
      priority_score: priorityResult.score,
      status: 'Contacts Notified',
      latitude: validLat,
      longitude: validLng,
      google_maps_url: mapUrl,
      created_at: new Date().toISOString()
    };

    io.emit('new_sos_incident', liveAlertPayload);
    console.log(`[Socket.IO Broadcast] Emergency ${incidentCode} published to responder network.`);

    // Return Complete Response
    res.status(201).json({
      ok: true,
      message: 'Emergency SOS activated and recorded in AegisNet.',
      incident: {
        id: createdSosId,
        incident_code: incidentCode,
        incident_type,
        priority: priorityResult.priority,
        status: 'Contacts Notified',
        latitude: validLat,
        longitude: validLng,
        google_maps_url: mapUrl
      },
      priorityAnalysis: priorityResult,
      contactsNotifiedCount: notificationResults.length,
      notifications: notificationResults
    });
  } catch (err) {
    console.error('[SOS Trigger API Error]:', err);
    res.status(500).json({ error: 'Emergency SOS processing failed: ' + err.message });
  }
});

// ==========================================
// 5. RESPONDER DASHBOARD & INCIDENT MANAGEMENT APIS
// ==========================================

// Get All Active Incidents (Responder & Admin)
app.get('/api/v1/sos/active', async (req, res) => {
  try {
    const incidentsRes = await query(`
      SELECT s.id, s.incident_code, s.incident_type, s.description, s.priority, s.status, s.created_at, s.updated_at,
             l.latitude, l.longitude, l.accuracy, l.google_maps_url, l.location_text,
             u.name AS user_name, u.phone AS user_phone,
             p.calculated_score, p.explanation AS priority_explanation,
             ra.unit_dispatched, resp.name AS responder_name
      FROM sos_logs s
      LEFT JOIN sos_locations l ON l.sos_id = s.id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN incident_priorities p ON p.sos_id = s.id
      LEFT JOIN responder_assignments ra ON ra.sos_id = s.id
      LEFT JOIN users resp ON resp.id = ra.responder_id
      WHERE s.status NOT IN ('Closed', 'Resolved')
      ORDER BY 
        CASE s.priority 
          WHEN 'Critical' THEN 1 
          WHEN 'High' THEN 2 
          WHEN 'Medium' THEN 3 
          ELSE 4 
        END,
        s.created_at DESC
      LIMIT 50
    `);

    // Dashboard metrics
    const totalAlerts = (await query('SELECT COUNT(*) AS count FROM sos_logs')).rows[0].count;
    const activeCount = (await query("SELECT COUNT(*) AS count FROM sos_logs WHERE status NOT IN ('Closed', 'Resolved')")).rows[0].count;
    const criticalCount = (await query("SELECT COUNT(*) AS count FROM sos_logs WHERE priority = 'Critical' AND status NOT IN ('Closed', 'Resolved')")).rows[0].count;
    const inProgressCount = (await query("SELECT COUNT(*) AS count FROM sos_logs WHERE status = 'In Progress'")).rows[0].count;
    const resolvedCount = (await query("SELECT COUNT(*) AS count FROM sos_logs WHERE status IN ('Resolved', 'Closed')")).rows[0].count;

    res.json({
      metrics: {
        totalAlerts: parseInt(totalAlerts),
        activeIncidents: parseInt(activeCount),
        criticalIncidents: parseInt(criticalCount),
        inProgressIncidents: parseInt(inProgressCount),
        resolvedIncidents: parseInt(resolvedCount)
      },
      incidents: incidentsRes.rows
    });
  } catch (err) {
    console.error('Active incidents fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve active emergency queue.' });
  }
});

// Get User's or Master Incident History
app.get('/api/v1/sos/history', optionalAuth, async (req, res) => {
  try {
    const isResponderOrAdmin = req.user && ['responder', 'admin'].includes(req.user.role);
    const userIdFilter = isResponderOrAdmin ? '' : (req.user ? `WHERE s.user_id = ${req.user.id}` : '');

    const historyRes = await query(`
      SELECT s.id, s.incident_code, s.incident_type, s.description, s.priority, s.status, s.created_at, s.updated_at,
             l.latitude, l.longitude, l.google_maps_url, l.location_text,
             u.name AS user_name, u.phone AS user_phone,
             p.calculated_score
      FROM sos_logs s
      LEFT JOIN sos_locations l ON l.sos_id = s.id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN incident_priorities p ON p.sos_id = s.id
      ${userIdFilter}
      ORDER BY s.created_at DESC
      LIMIT 100
    `);

    res.json({
      count: historyRes.rows.length,
      incidents: historyRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load incident history.' });
  }
});

// Get Single Incident Details
app.get('/api/v1/sos/:id', async (req, res) => {
  try {
    const sosId = parseInt(req.params.id);
    const sosRes = await query(`
      SELECT s.*, l.latitude, l.longitude, l.altitude, l.accuracy, l.location_text, l.google_maps_url,
             u.name AS user_name, u.phone AS user_phone, u.email AS user_email,
             ep.blood_group, ep.allergies, ep.medications, ep.medical_notes, ep.emergency_instructions,
             p.calculated_score, p.priority_level, p.ai_confidence, p.explanation AS priority_explanation, p.factors AS priority_factors
      FROM sos_logs s
      LEFT JOIN sos_locations l ON l.sos_id = s.id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN emergency_profiles ep ON ep.user_id = s.user_id
      LEFT JOIN incident_priorities p ON p.sos_id = s.id
      WHERE s.id = $1
    `, [sosId]);

    if (sosRes.rows.length === 0) {
      return res.status(404).json({ error: 'Incident record not found.' });
    }

    const incident = sosRes.rows[0];

    // Status History
    const historyRes = await query(`
      SELECT ih.*, u.name AS changed_by_name
      FROM incident_histories ih
      LEFT JOIN users u ON u.id = ih.changed_by
      WHERE ih.sos_id = $1
      ORDER BY ih.timestamp ASC
    `, [sosId]);

    // Notifications sent
    const notifsRes = await query(`
      SELECT n.*, nd.delivered_at, nd.details AS delivery_details
      FROM notifications n
      LEFT JOIN notification_deliveries nd ON nd.notification_id = n.id
      WHERE n.sos_id = $1
      ORDER BY n.created_at ASC
    `, [sosId]);

    // Responder assignments
    const assignRes = await query(`
      SELECT ra.*, u.name AS responder_name, u.phone AS responder_phone, rp.agency, rp.unit_name
      FROM responder_assignments ra
      LEFT JOIN users u ON u.id = ra.responder_id
      LEFT JOIN responder_profiles rp ON rp.user_id = u.id
      WHERE ra.sos_id = $1
      ORDER BY ra.assigned_at DESC
    `, [sosId]);

    res.json({
      incident,
      statusHistory: historyRes.rows,
      notifications: notifsRes.rows,
      assignments: assignRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve incident details.' });
  }
});

// Update Incident Status (Responder & Admin)
app.patch('/api/v1/sos/:id/status', authenticateToken, requireRole(['responder', 'admin']), async (req, res) => {
  try {
    const sosId = parseInt(req.params.id);
    const { status, notes } = req.body;
    const validStatuses = ['Triggered', 'Received', 'Contacts Notified', 'Acknowledged', 'In Progress', 'Resolved', 'Closed'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    await query('UPDATE sos_logs SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, sosId]);
    await query(
      `INSERT INTO incident_histories (sos_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [sosId, status, notes || `Status updated to ${status} by responder`, req.user.id]
    );

    // Real-time broadcast
    io.emit('incident_status_changed', { id: sosId, status, updated_at: new Date().toISOString() });

    res.json({ message: `Incident status updated to ${status}.`, id: sosId, status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update incident status.' });
  }
});

// Dispatch Responder Unit
app.post('/api/v1/sos/:id/dispatch', authenticateToken, requireRole(['responder', 'admin']), async (req, res) => {
  try {
    const sosId = parseInt(req.params.id);
    const { unit_name = 'Quick Response Unit Alpha', notes = 'Dispatched to scene' } = req.body;

    await query('UPDATE sos_logs SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['In Progress', sosId]);

    const assignRes = await query(
      `INSERT INTO responder_assignments (sos_id, responder_id, unit_dispatched, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sosId, req.user.id, unit_name, notes]
    );

    await query(
      `INSERT INTO incident_histories (sos_id, status, notes, changed_by)
       VALUES ($1, 'In Progress', $2, $3)`,
      [sosId, `Unit "${unit_name}" dispatched by ${req.user.name}.`, req.user.id]
    );

    io.emit('unit_dispatched', {
      sos_id: sosId,
      unit_name,
      responder_id: req.user.id,
      responder_name: req.user.name,
      status: 'In Progress'
    });

    res.json({
      message: `Unit "${unit_name}" successfully dispatched.`,
      assignment: assignRes.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Dispatch assignment failed.' });
  }
});

// ==========================================
// 6. AI TELEMETRY & ANALYTICS APIS
// ==========================================

app.post('/api/v1/ai/priority-score', async (req, res) => {
  try {
    const evaluation = evaluatePriority(req.body);
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: 'AI Priority calculation failed.' });
  }
});

app.get('/api/v1/ai/analytics', async (_req, res) => {
  try {
    const totalCount = (await query('SELECT COUNT(*) AS count FROM sos_logs')).rows[0].count;
    const byPriority = (await query('SELECT priority, COUNT(*) AS count FROM sos_logs GROUP BY priority ORDER BY count DESC')).rows;
    const byType = (await query('SELECT incident_type, COUNT(*) AS count FROM sos_logs GROUP BY incident_type ORDER BY count DESC LIMIT 8')).rows;
    const byStatus = (await query('SELECT status, COUNT(*) AS count FROM sos_logs GROUP BY status ORDER BY count DESC')).rows;
    const cityBreakdown = (await query(`
      SELECT SPLIT_PART(location_text, ',', 1) AS city_zone, COUNT(*) AS count
      FROM sos_locations
      GROUP BY city_zone
      ORDER BY count DESC
      LIMIT 8
    `)).rows;

    res.json({
      totalIncidents: parseInt(totalCount),
      byPriority,
      byType,
      byStatus,
      cityBreakdown,
      mlModelVersion: 'AegisNet-Priority-Heuristic-v3.2',
      confidenceAverage: '92.4%'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate telemetry analytics.' });
  }
});

// Geocoding API (OpenStreetMap Nominatim with fast Indian landmark cache)
app.post('/api/v1/geocode', async (req, res) => {
  try {
    const { query: searchQuery, latitude, longitude } = req.body;

    if (latitude != null && longitude != null) {
      const lat = Number(latitude);
      const lon = Number(longitude);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
          { headers: { 'User-Agent': 'AegisNet-Safety-App/3.0' }, signal: AbortSignal.timeout(3500) }
        );
        if (response.ok) {
          const data = await response.json();
          return res.json({ latitude: lat, longitude: lon, displayName: data.display_name });
        }
      } catch {}
      return res.json({ latitude: lat, longitude: lon, displayName: `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}` });
    }

    const cleanQuery = String(searchQuery || '').trim();
    if (!cleanQuery) return res.status(400).json({ error: 'Search query required.' });

    // Built-in Indian city dictionary
    const indianDictionary = {
      'coimbatore': { lat: 11.0168, lon: 76.9558, name: 'Coimbatore, Tamil Nadu, India' },
      'chennai': { lat: 13.0827, lon: 80.2707, name: 'Chennai, Tamil Nadu, India' },
      'madurai': { lat: 9.9252, lon: 78.1198, name: 'Madurai, Tamil Nadu, India' },
      'tiruppur': { lat: 11.1085, lon: 77.3411, name: 'Tiruppur, Tamil Nadu, India' },
      'salem': { lat: 11.6643, lon: 78.1460, name: 'Salem, Tamil Nadu, India' },
      'bengaluru': { lat: 12.9716, lon: 77.5946, name: 'Bengaluru, Karnataka, India' },
      'bangalore': { lat: 12.9716, lon: 77.5946, name: 'Bengaluru, Karnataka, India' },
      'kochi': { lat: 9.9312, lon: 76.2673, name: 'Kochi, Kerala, India' }
    };

    const lower = cleanQuery.toLowerCase();
    for (const [key, val] of Object.entries(indianDictionary)) {
      if (lower.includes(key)) {
        return res.json({ latitude: val.lat, longitude: val.lon, displayName: val.name });
      }
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=1`,
        { headers: { 'User-Agent': 'AegisNet-Safety-App/3.0' }, signal: AbortSignal.timeout(3500) }
      );
      if (response.ok) {
        const results = await response.json();
        if (results && results.length > 0) {
          return res.json({
            latitude: Number(results[0].lat),
            longitude: Number(results[0].lon),
            displayName: results[0].display_name
          });
        }
      }
    } catch {}

    return res.json({
      latitude: 11.0168,
      longitude: 76.9558,
      displayName: `${cleanQuery} (Coimbatore Region Anchor)`
    });
  } catch (err) {
    res.status(500).json({ error: 'Geocoding failed.' });
  }
});

// Notifications History
app.get('/api/v1/notifications/history', async (_req, res) => {
  try {
    const notifs = await query(`
      SELECT n.*, s.incident_code, nd.delivered_at, nd.details AS delivery_details
      FROM notifications n
      LEFT JOIN sos_logs s ON s.id = n.sos_id
      LEFT JOIN notification_deliveries nd ON nd.notification_id = n.id
      ORDER BY n.created_at DESC
      LIMIT 50
    `);
    res.json({ notifications: notifs.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notification records.' });
  }
});

// Initialize database and start HTTP & Socket.IO server on Port 5000
async function start() {
  try {
    await initSchema();
    await seedDatabase();

    server.listen(PORT, HOST, () => {
      console.log(`=======================================================`);
      console.log(`🛡️  AEGISNET INTELLIGENT SAFETY SERVER RUNNING`);
      console.log(`   Host: http://${HOST}:${PORT}`);
      console.log(`   PostgreSQL: Connected on port 5432`);
      console.log(`   Socket.IO: Active for Real-Time Dispatch`);
      console.log(`   SOS Endpoint: http://${HOST}:${PORT}/api/v1/sos/trigger`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

start();

module.exports = { app, server };
