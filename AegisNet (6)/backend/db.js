const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.resolve(process.env.AEGIS_DATA_DIR || path.join(__dirname, 'data'));
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new sqlite3.Database(path.join(dataDir, 'aegisnet.sqlite'));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}
async function tableExists(name) {
  const row = await get("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name]);
  return Boolean(row);
}
async function addColumnIfMissing(table, column, definition) {
  const info = await all(`PRAGMA table_info(${table})`);
  if (!info.some(row => row.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
async function init() {
  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    phone TEXT,
    avatar_url TEXT,
    bio TEXT,
    availability TEXT,
    skills TEXT,
    location TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    volunteer_id INTEGER,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'Medium',
    status TEXT NOT NULL DEFAULT 'New',
    location_text TEXT,
    latitude REAL,
    longitude REAL,
    evidence_summary TEXT,
    consent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(volunteer_id) REFERENCES users(id)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(incident_id) REFERENCES incidents(id),
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(actor_id) REFERENCES users(id)
  )`);

  await addColumnIfMissing('users', 'role', 'TEXT NOT NULL DEFAULT "user"');
  await addColumnIfMissing('users', 'phone', 'TEXT');
  await addColumnIfMissing('users', 'avatar_url', 'TEXT');
  await addColumnIfMissing('users', 'bio', 'TEXT');
  await addColumnIfMissing('users', 'availability', 'TEXT');
  await addColumnIfMissing('users', 'skills', 'TEXT');
  await addColumnIfMissing('users', 'location', 'TEXT');
  await addColumnIfMissing('users', 'status', 'TEXT NOT NULL DEFAULT "active"');
  await addColumnIfMissing('incidents', 'evidence_summary', 'TEXT');
  await addColumnIfMissing('incidents', 'evidence_filename', 'TEXT');
  await addColumnIfMissing('incidents', 'evidence_mime', 'TEXT');
  await addColumnIfMissing('incidents', 'latitude', 'REAL');
  await addColumnIfMissing('incidents', 'longitude', 'REAL');

  if (!(await tableExists('alerts'))) {
    await run(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'Open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
  }
  await run(`CREATE TABLE IF NOT EXISTS alert_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(incident_id) REFERENCES incidents(id)
  )`);
  if (!(await tableExists('scans'))) {
    await run(`CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      score INTEGER NOT NULL,
      findings INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
  }
  if (!(await tableExists('threat_events'))) {
    await run(`CREATE TABLE IF NOT EXISTS threat_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_code TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source_ip TEXT NOT NULL,
      destination TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    await run('CREATE INDEX IF NOT EXISTS idx_threat_events_severity ON threat_events(severity)');
    await run('CREATE INDEX IF NOT EXISTS idx_threat_events_type ON threat_events(event_type)');
    const count = await get('SELECT COUNT(*) AS count FROM threat_events');
    if (count.count < 15500) {
      await run('BEGIN TRANSACTION');
      const types = ['Suspicious Login', 'Malware Signature', 'Port Scan Pattern', 'Unusual Data Transfer', 'Policy Violation', 'Failed Authentication', 'Phishing Indicator', 'Firewall Rule Match', 'DNS Anomaly', 'Endpoint Warning'];
      const severities = ['Low', 'Medium', 'High', 'Critical'];
      const statuses = ['Open', 'Investigating', 'Resolved'];
      const destinations = ['Gateway-01', 'Workstation-02', 'Database-01', 'Endpoint-04', 'Cloud-Service-01', 'Mail-Server-01'];
      const insert = db.prepare('INSERT INTO threat_events (event_code,event_type,source_ip,destination,severity,status,description,created_at) VALUES (?,?,?,?,?,?,?,?)');
      for (let i = count.count; i < 15500; i++) {
        const type = types[i % types.length];
        const sev = severities[(i * 7 + Math.floor(i / 13)) % severities.length];
        const status = statuses[(i * 3) % statuses.length];
        const ip = `10.${(i % 240) + 1}.${(Math.floor(i / 240) % 250) + 1}.${(i % 253) + 1}`;
        const date = new Date(Date.UTC(2025, 0, 1) + i * 60000).toISOString();
        insert.run([`EVT-${String(i + 1).padStart(6, '0')}`, type, ip, destinations[i % destinations.length], sev, status, `Synthetic training/demo event: ${type.toLowerCase()} detected for review.`, date]);
      }
      await new Promise((resolve, reject) => insert.finalize(err => err ? reject(err) : resolve()));
      await run('COMMIT');
    }
  }

  await seedCommunityData();
}

async function seedCommunityData() {
  const adminHash = '$2a$10$m.G5pubD0JDTZhFenbzP0uHZn3elQv8VqTiAAbSJUooOgOQgaz2hW'; // AdminPass123!
  const volHash = '$2a$10$jyDqopIzvaF9j7b1lpK23eTBZp2UXbuu6VgMLCr0Otb0Lu3.mfqmu'; // VolunteerPass123!

  // 1. Seed Owner Admin if missing
  const admin = await get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  let adminId;
  if (!admin) {
    const res = await run(
      'INSERT INTO users (name, email, password_hash, role, status, bio, location) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['AegisNet Command Admin', 'admin@aegisnet.local', adminHash, 'admin', 'active', 'Central Emergency Network Director', 'San Francisco Metro Ops']
    );
    adminId = res.id;
  } else {
    adminId = admin.id;
  }

  // 2. Seed Verified Volunteers if fewer than 3 exist
  const volCount = await get("SELECT COUNT(*) AS count FROM users WHERE role = 'volunteer'");
  let v1Id, v2Id, v3Id, v4Id;
  if (volCount.count < 3) {
    const v1 = await run(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url, bio, availability, skills, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['Dr. Sarah Chen, MD', 'sarah.chen@aegisnet.org', volHash, 'volunteer', '+1 (555) 234-5678', '', 'Emergency Medicine physician and trauma responder.', 'Evenings & Weekends', 'Emergency Medicine, CPR, Trauma Care, First Aid, Medical Triage', 'Downtown Metro', 'active']
    );
    v1Id = v1.id;

    const v2 = await run(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url, bio, availability, skills, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['Marcus Vance', 'marcus.vance@aegisnet.org', volHash, 'volunteer', '+1 (555) 345-6789', '', 'Disaster relief specialist and technical search & rescue leader.', '24/7 On-call', 'Disaster Response, Search & Rescue, Logistics, Heavy Equipment', 'North District', 'active']
    );
    v2Id = v2.id;

    const v3 = await run(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url, bio, availability, skills, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['Elena Rostova', 'elena.rostova@aegisnet.org', volHash, 'volunteer', '+1 (555) 456-7890', '', 'Certified crisis counselor and community mental health advocate.', 'Weekday Afternoons', 'Crisis Counseling, Mental Health, De-escalation, Conflict Resolution', 'East Sector', 'active']
    );
    v3Id = v3.id;

    const v4 = await run(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url, bio, availability, skills, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['James Rodriguez', 'james.rodriguez@aegisnet.org', volHash, 'volunteer', '+1 (555) 567-8901', '', 'Certified EMT-Paramedic and water rescue responder.', 'Nights & Weekends', 'Paramedic, Fire Safety, Water Rescue, First Aid', 'South Bay', 'active']
    );
    v4Id = v4.id;
  } else {
    const existingVols = await all("SELECT id FROM users WHERE role = 'volunteer' LIMIT 4");
    v1Id = existingVols[0]?.id;
    v2Id = existingVols[1]?.id;
    v3Id = existingVols[2]?.id;
    v4Id = existingVols[3]?.id;
  }

  // 3. Seed Realistic Incidents if fewer than 3 exist
  const incCount = await get("SELECT COUNT(*) AS count FROM incidents");
  if (incCount.count < 3) {
    const userRow = await get("SELECT id FROM users WHERE role = 'user' LIMIT 1");
    const reporterId = userRow ? userRow.id : adminId;

    // Incident 1: Critical Gas Leak (In Progress, claimed by Marcus Vance)
    const inc1 = await run(
      'INSERT INTO incidents (user_id, volunteer_id, title, category, description, severity, status, location_text, latitude, longitude, evidence_summary, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        reporterId,
        v2Id || null,
        'Gas Odor & Possible Leak near Community Recreation Center',
        'Fire or environmental hazard',
        'Strong pungent odor of natural gas detected near the ventilation exhaust of the community hall. Building has been evacuated. Fire department dispatched, need volunteer perimeter control.',
        'Critical',
        'In Progress',
        'Market St & 7th, San Francisco, CA',
        37.7785,
        -122.4148,
        'Odor reported by 8 residents. Gas company notified.',
        1
      ]
    );

    // Incident 2: Medical Assistance Request (Assigned to Dr. Sarah Chen)
    const inc2 = await run(
      'INSERT INTO incidents (user_id, volunteer_id, title, category, description, severity, status, location_text, latitude, longitude, evidence_summary, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        reporterId,
        v1Id || null,
        'Elderly Resident Requiring Urgent Medical Transport & Triage',
        'Medical assistance request',
        'Senior resident experiencing severe shortness of breath and dehydration following local power outage. Needs immediate vitals check and oxygen stabilization while awaiting transit.',
        'Critical',
        'Assigned',
        'Mission St & 16th St, San Francisco, CA',
        37.7651,
        -122.4198,
        'Patient alert, resting in shaded entryway with neighbor.',
        1
      ]
    );

    // Incident 3: Fallen Tree Branch Blocking Primary Access Road (New Offer)
    await run(
      'INSERT INTO incidents (user_id, volunteer_id, title, category, description, severity, status, location_text, latitude, longitude, evidence_summary, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        reporterId,
        null,
        'Large Fallen Oak Branch Blocking Primary Access Road',
        'Blocked road',
        'Severe wind gust downed a large oak limb across both lanes of traffic. Vehicles are turning around unsafely. Needs chainsaw / removal crew and road flares for traffic warning.',
        'Medium',
        'New',
        'Haight St & Ashbury St, San Francisco, CA',
        37.7699,
        -122.4467,
        'Road completely impassable for standard vehicles.',
        1
      ]
    );

    // Incident 4: Broken Streetlights & Low Visibility Hazard (New Offer)
    await run(
      'INSERT INTO incidents (user_id, volunteer_id, title, category, description, severity, status, location_text, latitude, longitude, evidence_summary, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        reporterId,
        null,
        'Cluster of 4 Broken Streetlights Creating High-Risk Dark Corridor',
        'Broken streetlight',
        'Entire stretch between 22nd and 24th street has non-functioning lamps. High pedestrian traffic area with several slip-and-fall hazards reported by commuters.',
        'Low',
        'New',
        'Valencia Corridor, 22nd St, San Francisco, CA',
        37.7554,
        -122.4212,
        'City 311 ticket logged. Night escort volunteer requested.',
        1
      ]
    );

    // Incident 5: Suspicious Unattended Container near Transit Station
    await run(
      'INSERT INTO incidents (user_id, volunteer_id, title, category, description, severity, status, location_text, latitude, longitude, evidence_summary, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        reporterId,
        null,
        'Suspicious Heavy Container Left Unattended at Transit Terminal',
        'Suspicious or dangerous situation',
        'Unattended sealed container left beneath the west shelter for over 90 minutes. Security notified, request community volunteer observation from a safe perimeter distance.',
        'Medium',
        'Awaiting Info',
        'Embarcadero Transit Plaza, San Francisco, CA',
        37.7942,
        -122.3965,
        'Perimeter established at 50ft radius.',
        1
      ]
    );

    // Incident 6: Flash Flood Overflow (Resolved)
    await run(
      'INSERT INTO incidents (user_id, volunteer_id, title, category, description, severity, status, location_text, latitude, longitude, evidence_summary, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        reporterId,
        v4Id || null,
        'Storm Drain Overflow & Sidewalk Flooding',
        'Flooding',
        'Clogged storm drain caused 8 inches of water accumulation near residential doorways. Volunteer team deployed sandbags and cleared drainage grates.',
        'Medium',
        'Resolved',
        'Noe Valley Basin, 24th St, San Francisco, CA',
        37.7516,
        -122.4331,
        'Drain cleared and sandbags secured. Water receded.',
        1
      ]
    );

    // 4. Seed Live Messages in Case Chat for Incident 1 & 2
    if (inc1.id && v2Id) {
      await run('INSERT INTO messages (incident_id, sender_id, receiver_id, body) VALUES (?, ?, ?, ?)', [
        inc1.id,
        v2Id,
        reporterId,
        'AegisNet Dispatch: Volunteer Marcus Vance accepted the case. I am equipped with perimeter tape, hazard markers, and safety gear. What is the current situation on site?'
      ]);
      await run('INSERT INTO messages (incident_id, sender_id, receiver_id, body) VALUES (?, ?, ?, ?)', [
        inc1.id,
        reporterId,
        v2Id,
        'Thank you Marcus! The building is cleared, but pedestrians are still walking down 7th street. Gas smell is noticeable from 50 yards.'
      ]);
      await run('INSERT INTO messages (incident_id, sender_id, receiver_id, body) VALUES (?, ?, ?, ?)', [
        inc1.id,
        v2Id,
        reporterId,
        'Understood. ETA is 3 minutes. I will set up a cordon at the corner of 7th and Market. Please remain upwind and do not operate any electrical devices nearby.'
      ]);
    }

    if (inc2.id && v1Id) {
      await run('INSERT INTO messages (incident_id, sender_id, receiver_id, body) VALUES (?, ?, ?, ?)', [
        inc2.id,
        v1Id,
        reporterId,
        'Dr. Chen here. I have my mobile trauma/diagnostic bag and oxygen kit. Can you tell me if the resident is conscious and communicating clearly?'
      ]);
      await run('INSERT INTO messages (incident_id, sender_id, receiver_id, body) VALUES (?, ?, ?, ?)', [
        inc2.id,
        reporterId,
        v1Id,
        'Yes, conscious and seated in the lobby. Breathing is shallow. We provided cool water.'
      ]);
    }

    // 5. Seed Alert Deliveries and Audit Logs
    await run('INSERT INTO alert_deliveries (incident_id, provider, status, details) VALUES (?, ?, ?, ?)', [
      inc1.id,
      'smtp',
      'sent',
      'Alert dispatched to operational safety team mailbox'
    ]);
    await run('INSERT INTO alert_deliveries (incident_id, provider, status, details) VALUES (?, ?, ?, ?)', [
      inc1.id,
      'webhook',
      'sent',
      'HMAC-SHA256 authenticated payload acknowledged by external emergency dispatch hook'
    ]);
    await run('INSERT INTO audit_logs (actor_id, action, details) VALUES (?, ?, ?)', [
      adminId,
      'system_seeded',
      'AegisNet high-readiness demo environment initialized with verified responders, incidents, and threat telemetry.'
    ]);
  }
}

module.exports = { db, run, get, all, init };