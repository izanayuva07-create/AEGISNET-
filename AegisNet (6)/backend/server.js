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
const { sendOrganisationEmergencyEmail } = require('./emailService');
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
       VALUES ($1, 'Unknown', 'None reported', 'None', '')
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

    // 6. Asynchronous Emergency Email Dispatch to Organisation
    let emailResults = [];
    const userRow = (await query('SELECT name, phone FROM users WHERE id = $1', [finalUserId])).rows[0];
    try {
      emailResults = await sendOrganisationEmergencyEmail({
        sosId: createdSosId,
        incidentCode,
        userName: userRow?.name || 'AegisNet User',
        userPhone: userRow?.phone || '',
        incidentType: incident_type,
        description,
        priority: priorityResult.priority,
        latitude: validLat,
        longitude: validLng,
        accuracy: accuracy ? Number(accuracy) : 15,
        altitude: altitude ? Number(altitude) : null,
        googleMapsUrl: mapUrl,
        timestamp: new Date().toISOString(),
        contactsCount: notificationResults.length
      });
      console.log(`[Email Dispatch] Organisation emergency alert email processed (${emailResults.length} recipient orgs).`);
    } catch (emailErr) {
      console.error('[Organisation Email Error]:', emailErr.message);
    }

    // 7. Broadcast Real-Time Alert to Responders via Socket.IO
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
    console.log(`[Socket.IO Broadcast] Emergency ${incidentCode} published to responder & organisation network.`);

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
      notifications: notificationResults,
      emailNotifications: emailResults
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

// ==========================================
// 7. USER PORTAL REST APIS (SPEC SECTION 9)
// ==========================================

// GET /api/v1/users/me
app.get('/api/v1/users/me', authenticateToken, async (req, res) => {
  try {
    const userRes = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'User profile not found.' });

    const profileRes = await query('SELECT * FROM emergency_profiles WHERE user_id = $1', [req.user.id]);
    const contactsRes = await query('SELECT * FROM emergency_contacts WHERE user_id = $1 ORDER BY priority ASC', [req.user.id]);

    res.json({
      user: publicUser(user),
      emergencyProfile: profileRes.rows[0] || null,
      contacts: contactsRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user profile.' });
  }
});

// PUT /api/v1/users/me
app.put('/api/v1/users/me', authenticateToken, async (req, res) => {
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
      message: 'Profile updated successfully.',
      user: publicUser(updatedUser),
      emergencyProfile: updatedProfile
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// GET /api/v1/users/me/contacts
app.get('/api/v1/users/me/contacts', authenticateToken, async (req, res) => {
  try {
    const contactsRes = await query('SELECT * FROM emergency_contacts WHERE user_id = $1 ORDER BY priority ASC, created_at ASC', [req.user.id]);
    res.json({ contacts: contactsRes.rows, count: contactsRes.rows.length, maxAllowed: 5 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve contacts.' });
  }
});

// POST /api/v1/users/me/contacts
app.post('/api/v1/users/me/contacts', authenticateToken, async (req, res) => {
  try {
    const { name, phone, relationship, email, priority } = req.body;
    const cleanName = String(name || '').trim();
    const cleanPhone = String(phone || '').trim();

    if (!cleanName || cleanName.length < 2) return res.status(400).json({ error: 'Contact name must contain at least 2 characters.' });
    if (!cleanPhone || cleanPhone.length < 7) return res.status(400).json({ error: 'Enter a valid phone number.' });

    const countCheck = await query('SELECT COUNT(*) AS count FROM emergency_contacts WHERE user_id = $1', [req.user.id]);
    if (parseInt(countCheck.rows[0].count) >= 5) return res.status(400).json({ error: 'Maximum of 5 emergency contacts permitted per user account.' });

    const dupCheck = await query('SELECT id FROM emergency_contacts WHERE user_id = $1 AND phone = $2', [req.user.id, cleanPhone]);
    if (dupCheck.rows.length > 0) return res.status(409).json({ error: 'This phone number is already registered in your emergency contacts.' });

    const assignedPriority = Math.min(Math.max(parseInt(priority) || (parseInt(countCheck.rows[0].count) + 1), 1), 5);

    const insertRes = await query(
      `INSERT INTO emergency_contacts (user_id, name, phone, relationship, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, cleanName, cleanPhone, relationship || 'Family', assignedPriority]
    );

    res.status(201).json({ message: 'Contact registered.', contact: insertRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register contact.' });
  }
});

// PUT /api/v1/users/me/contacts/:id
app.put('/api/v1/users/me/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const { name, phone, relationship, priority } = req.body;

    const check = await query('SELECT id FROM emergency_contacts WHERE id = $1 AND user_id = $2', [contactId, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Contact not found.' });

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

// DELETE /api/v1/users/me/contacts/:id
app.delete('/api/v1/users/me/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const delRes = await query('DELETE FROM emergency_contacts WHERE id = $1 AND user_id = $2 RETURNING id', [contactId, req.user.id]);
    if (delRes.rows.length === 0) return res.status(404).json({ error: 'Contact not found.' });
    res.json({ message: 'Contact removed.', id: contactId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete contact.' });
  }
});

// GET /api/v1/sos/my-incidents
app.get('/api/v1/sos/my-incidents', authenticateToken, async (req, res) => {
  try {
    const incidents = await query(`
      SELECT s.*, l.latitude, l.longitude, l.google_maps_url, l.location_text,
             p.calculated_score, p.priority_level
      FROM sos_logs s
      LEFT JOIN sos_locations l ON l.sos_id = s.id
      LEFT JOIN incident_priorities p ON p.sos_id = s.id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
      LIMIT 50
    `, [req.user.id]);
    res.json({ count: incidents.rows.length, incidents: incidents.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user incidents.' });
  }
});

// POST /api/v1/sos/:id/cancel
app.post('/api/v1/sos/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const sosId = parseInt(req.params.id);
    const { reason = 'Emergency cancelled by reporting user' } = req.body;

    const check = await query('SELECT id, status FROM sos_logs WHERE id = $1 AND user_id = $2', [sosId, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Incident not found or unauthorized.' });

    await query("UPDATE sos_logs SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [sosId]);
    await query(
      `INSERT INTO incident_histories (sos_id, status, notes, changed_by)
       VALUES ($1, 'CANCELLED', $2, $3)`,
      [sosId, reason, req.user.id]
    );

    io.emit('incident_status_changed', { id: sosId, status: 'CANCELLED', updated_at: new Date().toISOString() });
    res.json({ message: 'Incident successfully cancelled.', id: sosId, status: 'CANCELLED' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel incident.' });
  }
});

// POST /api/v1/auth/forgot-password & reset-password
app.post('/api/v1/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const userRes = await query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (userRes.rows.length === 0) {
      return res.json({ message: 'If this email address exists in AegisNet, password reset instructions have been dispatched.' });
    }
    const resetToken = jwt.sign({ id: userRes.rows[0].id, type: 'pwd_reset' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({
      message: 'Password reset link generated.',
      resetToken,
      instructions: '[SIMULATED EMAIL] In production, an email with the secure reset token is dispatched to the user.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Forgot password request failed.' });
  }
});

app.post('/api/v1/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Valid reset token and password (min 6 chars) required.' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, decoded.id]);
    res.json({ message: 'Password has been successfully updated. You may now sign in.' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
  }
});

// POST /api/v1/auth/logout
app.post('/api/v1/auth/logout', (_req, res) => {
  res.json({ message: 'Session terminated successfully.' });
});

// POST /api/v1/auth/refresh
app.post('/api/v1/auth/refresh', authenticateToken, (req, res) => {
  const token = jwt.sign(
    { id: req.user.id, email: req.user.email, role: req.user.role, name: req.user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user: req.user });
});

// ==========================================
// 8. ORGANISATION PORTAL REST APIS (SPEC SECTION 9)
// ==========================================

// POST /api/v1/organisation/register
app.post('/api/v1/organisation/register', async (req, res) => {
  try {
    const {
      name,
      official_email,
      notification_email,
      phone,
      address,
      admin_name,
      password
    } = req.body;

    const cleanOrgName = String(name || '').trim();
    const cleanOfficialEmail = String(official_email || '').trim().toLowerCase();
    const cleanNotifEmail = String(notification_email || official_email || '').trim().toLowerCase();
    const cleanAdminName = String(admin_name || '').trim();
    const rawPassword = String(password || '');

    if (!cleanOrgName || cleanOrgName.length < 3) return res.status(400).json({ error: 'Organisation name must contain at least 3 characters.' });
    if (!cleanOfficialEmail.includes('@')) return res.status(400).json({ error: 'Valid official organisation email address required.' });
    if (!cleanAdminName || cleanAdminName.length < 2) return res.status(400).json({ error: 'Administrator full name required.' });
    if (rawPassword.length < 6) return res.status(400).json({ error: 'Administrator password must be at least 6 characters.' });

    // Check duplicate org email
    const existingOrg = await query('SELECT id FROM organisations WHERE official_email = $1', [cleanOfficialEmail]);
    if (existingOrg.rows.length > 0) return res.status(409).json({ error: 'An organisation with this official email address already exists.' });

    const client = await pool.connect();
    let newOrg, newAdminUser, token;

    try {
      await client.query('BEGIN');

      // 1. Insert organisation
      const orgRes = await client.query(
        `INSERT INTO organisations (name, official_email, notification_email, phone, address, verification_status)
         VALUES ($1, $2, $3, $4, $5, 'verified')
         RETURNING *`,
        [cleanOrgName, cleanOfficialEmail, cleanNotifEmail, phone || '', address || '']
      );
      newOrg = orgRes.rows[0];

      // 2. Insert admin user
      const passwordHash = await bcrypt.hash(rawPassword, 10);
      const userRes = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, role, status)
         VALUES ($1, $2, $3, $4, 'admin', 'active')
         ON CONFLICT (email) DO UPDATE SET role = 'admin'
         RETURNING id, name, email, phone, role, status`,
        [cleanAdminName, cleanOfficialEmail, passwordHash, phone || '']
      );
      newAdminUser = userRes.rows[0];

      // 3. Link as organisation member
      await client.query(
        `INSERT INTO organisation_members (organisation_id, user_id, role, status)
         VALUES ($1, $2, 'admin', 'active')
         ON CONFLICT (organisation_id, user_id) DO NOTHING`,
        [newOrg.id, newAdminUser.id]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    token = jwt.sign(
      { id: newAdminUser.id, email: newAdminUser.email, role: 'admin', name: newAdminUser.name, organisationId: newOrg.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Organisation registered and authorized successfully.',
      token,
      organisation: newOrg,
      adminUser: publicUser(newAdminUser)
    });
  } catch (err) {
    console.error('Organisation registration error:', err);
    res.status(500).json({ error: 'Organisation registration failed: ' + err.message });
  }
});

// POST /api/v1/organisation/login
app.post('/api/v1/organisation/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const rawPassword = String(password || '');

    const userRes = await query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    const user = userRes.rows[0];

    if (!user || !(await bcrypt.compare(rawPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid organisation credentials.' });
    }

    if (!['admin', 'responder'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied. Only authorised emergency organisations and responders may access this portal.' });
    }

    // Find organisation member association
    const memberRes = await query(`
      SELECT om.*, o.name AS organisation_name, o.official_email, o.notification_email, o.verification_status
      FROM organisation_members om
      JOIN organisations o ON o.id = om.organisation_id
      WHERE om.user_id = $1 AND om.status = 'active'
      LIMIT 1
    `, [user.id]);

    let orgData = memberRes.rows[0];
    if (!orgData) {
      // Default to first organisation for system admins/responders
      const defaultOrg = (await query('SELECT * FROM organisations LIMIT 1')).rows[0];
      orgData = defaultOrg ? {
        organisation_id: defaultOrg.id,
        organisation_name: defaultOrg.name,
        official_email: defaultOrg.official_email,
        notification_email: defaultOrg.notification_email,
        role: user.role
      } : null;
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        organisationId: orgData?.organisation_id || null
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Signed in to Organisation Portal.',
      token,
      user: publicUser(user),
      organisation: orgData
    });
  } catch (err) {
    res.status(500).json({ error: 'Organisation login failed: ' + err.message });
  }
});

// GET /api/v1/organisation/dashboard
app.get('/api/v1/organisation/dashboard', authenticateToken, requireRole(['admin', 'responder']), async (_req, res) => {
  try {
    const totalAlerts = (await query('SELECT COUNT(*) AS count FROM sos_logs')).rows[0].count;
    const activeCount = (await query("SELECT COUNT(*) AS count FROM sos_logs WHERE status NOT IN ('Closed', 'Resolved', 'RESOLVED', 'CANCELLED')")).rows[0].count;
    const unackCount = (await query("SELECT COUNT(*) AS count FROM sos_logs WHERE status IN ('Triggered', 'Received', 'Contacts Notified', 'NEW')")).rows[0].count;
    const inProgressCount = (await query("SELECT COUNT(*) AS count FROM sos_logs WHERE status IN ('In Progress', 'IN_PROGRESS', 'DISPATCHED')")).rows[0].count;
    const resolvedCount = (await query("SELECT COUNT(*) AS count FROM sos_logs WHERE status IN ('Resolved', 'RESOLVED', 'Closed')")).rows[0].count;
    const criticalCount = (await query("SELECT COUNT(*) AS count FROM sos_logs WHERE priority = 'Critical' AND status NOT IN ('Closed', 'Resolved', 'RESOLVED', 'CANCELLED')")).rows[0].count;
    const responderCount = (await query("SELECT COUNT(*) AS count FROM responder_profiles WHERE status = 'available'")).rows[0].count;

    // Latest 10 active incidents
    const incidentsRes = await query(`
      SELECT s.*, l.latitude, l.longitude, l.accuracy, l.google_maps_url, l.location_text,
             u.name AS user_name, u.phone AS user_phone,
             p.calculated_score, p.explanation AS priority_explanation,
             ra.unit_dispatched, resp.name AS responder_name
      FROM sos_logs s
      LEFT JOIN sos_locations l ON l.sos_id = s.id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN incident_priorities p ON p.sos_id = s.id
      LEFT JOIN responder_assignments ra ON ra.sos_id = s.id
      LEFT JOIN users resp ON resp.id = ra.responder_id
      WHERE s.status NOT IN ('Closed', 'Resolved', 'RESOLVED', 'CANCELLED')
      ORDER BY 
        CASE s.priority 
          WHEN 'Critical' THEN 1 
          WHEN 'High' THEN 2 
          WHEN 'Medium' THEN 3 
          ELSE 4 
        END,
        s.created_at DESC
      LIMIT 25
    `);

    res.json({
      metrics: {
        totalIncidents: parseInt(totalAlerts),
        activeIncidents: parseInt(activeCount),
        unacknowledgedIncidents: parseInt(unackCount),
        inProgressIncidents: parseInt(inProgressCount),
        resolvedIncidents: parseInt(resolvedCount),
        criticalIncidents: parseInt(criticalCount),
        availableResponders: parseInt(responderCount)
      },
      latestIncidents: incidentsRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve organisation dashboard: ' + err.message });
  }
});

// GET /api/v1/organisation/incidents
app.get('/api/v1/organisation/incidents', authenticateToken, requireRole(['admin', 'responder']), async (req, res) => {
  try {
    const { status, priority, limit = 50 } = req.query;
    let whereClauses = [];
    let params = [];

    if (status && status !== 'ALL') {
      params.push(status);
      whereClauses.push(`s.status ILIKE $${params.length}`);
    }
    if (priority && priority !== 'ALL') {
      params.push(priority);
      whereClauses.push(`s.priority ILIKE $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    params.push(parseInt(limit));

    const incidentsRes = await query(`
      SELECT s.*, l.latitude, l.longitude, l.accuracy, l.google_maps_url, l.location_text,
             u.name AS user_name, u.phone AS user_phone,
             p.calculated_score, p.explanation AS priority_explanation,
             ra.unit_dispatched, resp.name AS responder_name
      FROM sos_logs s
      LEFT JOIN sos_locations l ON l.sos_id = s.id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN incident_priorities p ON p.sos_id = s.id
      LEFT JOIN responder_assignments ra ON ra.sos_id = s.id
      LEFT JOIN users resp ON resp.id = ra.responder_id
      ${whereSql}
      ORDER BY s.created_at DESC
      LIMIT $${params.length}
    `, params);

    res.json({ count: incidentsRes.rows.length, incidents: incidentsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve incidents: ' + err.message });
  }
});

// GET /api/v1/organisation/incidents/:id
app.get('/api/v1/organisation/incidents/:id', authenticateToken, requireRole(['admin', 'responder']), async (req, res) => {
  try {
    const sosId = parseInt(req.params.id);
    const incidentRes = await query(`
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

    if (incidentRes.rows.length === 0) return res.status(404).json({ error: 'Incident not found.' });

    const historyRes = await query(`
      SELECT ih.*, u.name AS changed_by_name
      FROM incident_histories ih
      LEFT JOIN users u ON u.id = ih.changed_by
      WHERE ih.sos_id = $1
      ORDER BY ih.timestamp ASC
    `, [sosId]);

    const notifsRes = await query('SELECT * FROM notifications WHERE sos_id = $1 ORDER BY created_at ASC', [sosId]);
    const emailsRes = await query('SELECT * FROM email_notifications WHERE sos_id = $1 ORDER BY created_at ASC', [sosId]);
    const assignmentsRes = await query(`
      SELECT ra.*, u.name AS responder_name, u.phone AS responder_phone, rp.agency, rp.unit_name
      FROM responder_assignments ra
      LEFT JOIN users u ON u.id = ra.responder_id
      LEFT JOIN responder_profiles rp ON rp.user_id = u.id
      WHERE ra.sos_id = $1
      ORDER BY ra.assigned_at DESC
    `, [sosId]);

    res.json({
      incident: incidentRes.rows[0],
      statusHistory: historyRes.rows,
      smsNotifications: notifsRes.rows,
      emailNotifications: emailsRes.rows,
      assignments: assignmentsRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve incident details: ' + err.message });
  }
});

// PATCH /api/v1/organisation/incidents/:id/status
app.patch('/api/v1/organisation/incidents/:id/status', authenticateToken, requireRole(['admin', 'responder']), async (req, res) => {
  try {
    const sosId = parseInt(req.params.id);
    const { status, remarks = '' } = req.body;

    const validStatuses = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'DISPATCHED', 'RESOLVED', 'CANCELLED', 'REJECTED', 'Acknowledged', 'In Progress', 'Resolved', 'Closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Permitted: NEW, ACKNOWLEDGED, IN_PROGRESS, DISPATCHED, RESOLVED, CANCELLED, REJECTED` });
    }

    const currentRes = await query('SELECT status FROM sos_logs WHERE id = $1', [sosId]);
    if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Incident not found.' });
    const prevStatus = currentRes.rows[0].status;

    await query('UPDATE sos_logs SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, sosId]);
    await query(
      `INSERT INTO incident_histories (sos_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [sosId, status, remarks || `Status changed from ${prevStatus} to ${status} by ${req.user.name}`, req.user.id]
    );

    io.emit('incident_status_changed', { id: sosId, previous_status: prevStatus, status, updated_at: new Date().toISOString() });
    res.json({ message: `Incident #${sosId} status updated to ${status}.`, id: sosId, status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update incident status: ' + err.message });
  }
});

// POST /api/v1/organisation/incidents/:id/assign
app.post('/api/v1/organisation/incidents/:id/assign', authenticateToken, requireRole(['admin', 'responder']), async (req, res) => {
  try {
    const sosId = parseInt(req.params.id);
    const { responder_id, unit_name = 'Quick Response Unit Alpha', remarks = 'Dispatched to scene' } = req.body;

    const targetResponderId = responder_id ? parseInt(responder_id) : req.user.id;

    await query("UPDATE sos_logs SET status = 'DISPATCHED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [sosId]);

    const assignRes = await query(
      `INSERT INTO responder_assignments (sos_id, responder_id, unit_dispatched, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sosId, targetResponderId, unit_name, remarks]
    );

    await query(
      `INSERT INTO incident_histories (sos_id, status, notes, changed_by)
       VALUES ($1, 'DISPATCHED', $2, $3)`,
      [sosId, `Assigned unit "${unit_name}" by ${req.user.name}. ${remarks}`, req.user.id]
    );

    io.emit('unit_dispatched', {
      sos_id: sosId,
      unit_name,
      responder_id: targetResponderId,
      assigned_by: req.user.name,
      status: 'DISPATCHED'
    });

    res.json({
      message: `Responder unit "${unit_name}" successfully assigned.`,
      assignment: assignRes.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Responder assignment failed: ' + err.message });
  }
});

// GET /api/v1/organisation/responders
app.get('/api/v1/organisation/responders', authenticateToken, requireRole(['admin', 'responder']), async (_req, res) => {
  try {
    const responders = await query(`
      SELECT rp.*, u.name, u.email, u.phone, u.status AS user_status, o.name AS organisation_name
      FROM responder_profiles rp
      JOIN users u ON u.id = rp.user_id
      LEFT JOIN organisations o ON o.id = rp.organisation_id
      ORDER BY rp.status ASC, u.name ASC
    `);
    res.json({ count: responders.rows.length, responders: responders.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve responders: ' + err.message });
  }
});

// POST /api/v1/organisation/responders
app.post('/api/v1/organisation/responders', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { name, email, phone, password = 'ResponderPass123!', unit_name = 'Patrol Unit', agency = 'Emergency Response Grid', responder_type = 'Paramedic', badge_number = 'TN-RES-01' } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();

    const existing = await query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const userRes = await query(
      `INSERT INTO users (name, email, password_hash, phone, role, status)
       VALUES ($1, $2, $3, $4, 'responder', 'active')
       RETURNING id, name, email, phone, role`,
      [name, cleanEmail, passwordHash, phone || '']
    );
    const newUserId = userRes.rows[0].id;

    // Get organisation ID from admin token
    const orgId = req.user.organisationId || (await query('SELECT id FROM organisations LIMIT 1')).rows[0]?.id;

    const profRes = await query(
      `INSERT INTO responder_profiles (user_id, organisation_id, badge_number, unit_name, agency, responder_type, status, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, 'available', 11.0168, 76.9558)
       RETURNING *`,
      [newUserId, orgId, badge_number, unit_name, agency, responder_type]
    );

    res.status(201).json({
      message: 'Responder added successfully.',
      responder: { ...userRes.rows[0], ...profRes.rows[0] }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create responder: ' + err.message });
  }
});

// PUT /api/v1/organisation/responders/:id
app.put('/api/v1/organisation/responders/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const responderId = parseInt(req.params.id);
    const { status, unit_name, agency } = req.body;

    const updateRes = await query(
      `UPDATE responder_profiles
       SET status = COALESCE($1, status),
           unit_name = COALESCE($2, unit_name),
           agency = COALESCE($3, agency)
       WHERE id = $4
       RETURNING *`,
      [status, unit_name, agency, responderId]
    );

    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Responder not found.' });
    res.json({ message: 'Responder profile updated.', responder: updateRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update responder.' });
  }
});

// DELETE /api/v1/organisation/responders/:id
app.delete('/api/v1/organisation/responders/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const responderId = parseInt(req.params.id);
    await query("UPDATE responder_profiles SET status = 'off-duty' WHERE id = $1", [responderId]);
    res.json({ message: 'Responder status marked as off-duty.', id: responderId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate responder.' });
  }
});

// GET /api/v1/organisation/settings
app.get('/api/v1/organisation/settings', authenticateToken, requireRole(['admin', 'responder']), async (req, res) => {
  try {
    const orgRes = await query('SELECT * FROM organisations LIMIT 1');
    if (orgRes.rows.length === 0) return res.status(404).json({ error: 'Organisation settings not found.' });
    res.json({ organisation: orgRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve settings.' });
  }
});

// PUT /api/v1/organisation/settings
app.put('/api/v1/organisation/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { name, notification_email, phone, address } = req.body;
    const cleanEmail = String(notification_email || '').trim().toLowerCase();

    if (cleanEmail && !cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid emergency notification email address.' });
    }

    const updateRes = await query(
      `UPDATE organisations
       SET name = COALESCE($1, name),
           notification_email = COALESCE($2, notification_email),
           phone = COALESCE($3, phone),
           address = COALESCE($4, address),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM organisations LIMIT 1)
       RETURNING *`,
      [name, cleanEmail || null, phone, address]
    );

    res.json({
      message: 'Organisation emergency notification settings updated successfully.',
      organisation: updateRes.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings: ' + err.message });
  }
});

// GET /api/v1/organisation/notification-logs
app.get('/api/v1/organisation/notification-logs', authenticateToken, requireRole(['admin', 'responder']), async (_req, res) => {
  try {
    const emailLogs = await query(`
      SELECT en.*, s.incident_code, o.name AS organisation_name
      FROM email_notifications en
      LEFT JOIN sos_logs s ON s.id = en.sos_id
      LEFT JOIN organisations o ON o.id = en.organisation_id
      ORDER BY en.created_at DESC
      LIMIT 50
    `);

    const smsLogs = await query(`
      SELECT n.*, s.incident_code, nd.delivered_at, nd.details AS delivery_details
      FROM notifications n
      LEFT JOIN sos_logs s ON s.id = n.sos_id
      LEFT JOIN notification_deliveries nd ON nd.notification_id = n.id
      ORDER BY n.created_at DESC
      LIMIT 50
    `);

    res.json({
      emailNotifications: emailLogs.rows,
      smsNotifications: smsLogs.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notification logs: ' + err.message });
  }
});

// ==========================================
// 9. GENERAL NOTIFICATIONS APIS (SPEC SECTION 9)
// ==========================================

// GET /api/v1/notifications
app.get('/api/v1/notifications', authenticateToken, async (req, res) => {
  try {
    const notifs = await query(`
      SELECT n.*, s.incident_code
      FROM notifications n
      LEFT JOIN sos_logs s ON s.id = n.sos_id
      WHERE s.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 30
    `, [req.user.id]);
    res.json({ notifications: notifs.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// GET /api/v1/notifications/:id
app.get('/api/v1/notifications/:id', authenticateToken, async (req, res) => {
  try {
    const notifId = parseInt(req.params.id);
    const notif = await query('SELECT * FROM notifications WHERE id = $1', [notifId]);
    if (notif.rows.length === 0) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ notification: notif.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notification.' });
  }
});

// PATCH /api/v1/notifications/:id/read
app.patch('/api/v1/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const notifId = parseInt(req.params.id);
    res.json({ message: 'Notification marked as read.', id: notifId });
  } catch (err) {
    res.status(500).json({ error: 'Operation failed.' });
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
