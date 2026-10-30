const bcrypt = require('bcryptjs');
const { query, getClient } = require('./database');

async function seedDatabase() {
  const check = await query('SELECT COUNT(*) AS count FROM users');
  if (parseInt(check.rows[0].count) >= 45) {
    console.log('Database already has demonstration dataset. Skipping seed.');
    return;
  }

  console.log('Seeding AegisNet demonstration dataset into PostgreSQL...');
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Default password hashes for demo accounts
    const userHash = await bcrypt.hash('UserPass123!', 10);
    const responderHash = await bcrypt.hash('ResponderPass123!', 10);
    const adminHash = await bcrypt.hash('AdminPass123!', 10);

    // 1. Create 5 Administrator accounts
    const adminEmails = [
      'admin@aegisnet.org',
      'command.director@aegisnet.org',
      'operations.lead@aegisnet.org',
      'chief.dispatch@aegisnet.org',
      'regional.admin@aegisnet.org'
    ];
    const adminNames = [
      'AegisNet Master Administrator',
      'Dr. K. Ramanathan (Director)',
      'Lakshmi Sundaram (Operations Lead)',
      'Rajesh Verma (Chief Dispatcher)',
      'Priya Nambiar (Regional Safety Admin)'
    ];

    const adminIds = [];
    for (let i = 0; i < 5; i++) {
      const res = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, role, status)
         VALUES ($1, $2, $3, $4, 'admin', 'active')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [adminNames[i], adminEmails[i], adminHash, `+91 98400 ${10000 + i}`]
      );
      adminIds.push(res.rows[0].id);
    }

    // 2. Create 10 Authorized Responder accounts & profiles
    const indianCities = [
      { city: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
      { city: 'Chennai', lat: 13.0827, lng: 80.2707 },
      { city: 'Madurai', lat: 9.9252, lng: 78.1198 },
      { city: 'Tiruppur', lat: 11.1085, lng: 77.3411 },
      { city: 'Salem', lat: 11.6643, lng: 78.1460 },
      { city: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
      { city: 'Kochi', lat: 9.9312, lng: 76.2673 }
    ];

    const responderData = [
      { name: 'Inspector R. Selvakumar', email: 'responder.police1@aegisnet.org', type: 'Police', agency: 'Tamil Nadu Police Emergency Wing', unit: 'Patrol Unit Alpha-1', badge: 'TNPD-4401' },
      { name: 'Dr. Anita George, MD', email: 'responder.medical1@aegisnet.org', type: 'Paramedic', agency: 'Government Medical College Trauma Centre', unit: 'Rapid Ambulance-04', badge: 'EMRI-108-A' },
      { name: 'Captain M. Balaji', email: 'responder.fire1@aegisnet.org', type: 'Fire Rescue', agency: 'Fire and Rescue Services Department', unit: 'Rescue Tender 3', badge: 'TNFRS-729' },
      { name: 'Paramedic S. Karthik', email: 'responder.medical2@aegisnet.org', type: 'Paramedic', agency: 'Emergency Medical Care Unit', unit: 'Mobile ICU-12', badge: 'EMRI-108-B' },
      { name: 'Officer Deepa Raghavan', email: 'responder.police2@aegisnet.org', type: 'Police', agency: 'City Police Control Division', unit: 'Highway Interceptor 8', badge: 'TNPD-5120' },
      { name: 'Commander Victor Paul', email: 'responder.rescue1@aegisnet.org', type: 'Disaster Relief', agency: 'State Disaster Response Force (SDRF)', unit: 'Flood Response Team 2', badge: 'SDRF-088' },
      { name: 'Dr. Praveen Nair', email: 'responder.medical3@aegisnet.org', type: 'Paramedic', agency: 'District Emergency Healthcare', unit: 'ALS Ambulance 09', badge: 'EMRI-108-C' },
      { name: 'Lieutenant Manoj Kumar', email: 'responder.fire2@aegisnet.org', type: 'Fire Rescue', agency: 'Industrial Safety Fire Squad', unit: 'Hazmat Foam Engine 1', badge: 'TNFRS-911' },
      { name: 'Officer Sarah Thomas', email: 'responder.police3@aegisnet.org', type: 'Police', agency: 'Women Safety Quick Response Force', unit: 'Pink Patrol 03', badge: 'TNPD-6340' },
      { name: 'Specialist Arun Prakash', email: 'responder.rescue2@aegisnet.org', type: 'Disaster Relief', agency: 'Civil Defence & Mountain Rescue', unit: 'Search Team Echo', badge: 'CD-704' }
    ];

    const responderUserIds = [];
    for (let i = 0; i < responderData.length; i++) {
      const resp = responderData[i];
      const cityObj = indianCities[i % indianCities.length];
      const userRes = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, role, status)
         VALUES ($1, $2, $3, $4, 'responder', 'active')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [resp.name, resp.email, responderHash, `+91 97890 ${20000 + i}`]
      );
      const uid = userRes.rows[0].id;
      responderUserIds.push(uid);

      await client.query(
        `INSERT INTO responder_profiles (user_id, badge_number, unit_name, agency, responder_type, status, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, 'available', $6, $7)
         ON CONFLICT (user_id) DO NOTHING`,
        [uid, resp.badge, resp.unit, resp.agency, resp.type, cityObj.lat + (Math.random() - 0.5) * 0.05, cityObj.lng + (Math.random() - 0.5) * 0.05]
      );
    }

    // 3. Create 30 Citizen/User accounts with emergency profiles & emergency contacts
    const firstNames = ['Aarav', 'Diya', 'Kavya', 'Rohan', 'Aditi', 'Siddharth', 'Meera', 'Ananya', 'Harish', 'Naveen', 'Pooja', 'Vikram', 'Divya', 'Suresh', 'Keerthi', 'Gautam', 'Sneha', 'Ajay', 'Revathi', 'Ganesh', 'Deepak', 'Swetha', 'Madhav', 'Priyanka', 'Sanjay', 'Malini', 'Karthik', 'Nisha', 'Vijay', 'Sandhya'];
    const lastNames = ['Iyer', 'Menon', 'Sharma', 'Patel', 'Natarajan', 'Krishnan', 'Subramanian', 'Reddy', 'Gounder', 'Pillai', 'Rao', 'Balan', 'Chowdhury', 'Venkatesh', 'Gupta'];
    const relationships = ['Parent', 'Spouse', 'Sibling', 'Friend', 'Guardian', 'Doctor'];
    const bloodGroups = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-'];

    const citizenUserIds = [];
    for (let i = 0; i < 30; i++) {
      const fullName = `${firstNames[i]} ${lastNames[i % lastNames.length]}`;
      const email = `citizen.${firstNames[i].toLowerCase()}${i + 1}@aegisnet.org`;
      const phone = `+91 94430 ${30000 + i}`;

      const userRes = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, role, status)
         VALUES ($1, $2, $3, $4, 'user', 'active')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [fullName, email, userHash, phone]
      );
      const uid = userRes.rows[0].id;
      citizenUserIds.push(uid);

      // Emergency profile
      await client.query(
        `INSERT INTO emergency_profiles (user_id, blood_group, allergies, medications, medical_notes, emergency_instructions)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          uid,
          bloodGroups[i % bloodGroups.length],
          i % 3 === 0 ? 'Penicillin allergy, Sulfa drugs' : 'None reported',
          i % 4 === 0 ? 'Inhaler (Asthma), Insulin' : 'None',
          `[DEMO DATA] Emergency medical profile for ${fullName}. No physical mobility impairment.`,
          'Contact primary emergency contact immediately. Provide patient medical history.'
        ]
      );

      // Add up to 3-5 trusted emergency contacts for each user (max 5)
      const contactCount = (i % 3) + 3; // 3 to 5 contacts
      for (let c = 1; c <= contactCount; c++) {
        const contactName = `${firstNames[(i + c * 2) % firstNames.length]} ${lastNames[(i + c) % lastNames.length]}`;
        const contactPhone = `+91 99400 ${40000 + i * 10 + c}`;
        const rel = relationships[(c + i) % relationships.length];

        await client.query(
          `INSERT INTO emergency_contacts (user_id, name, phone, relationship, priority)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, phone) DO NOTHING`,
          [uid, contactName, contactPhone, rel, c]
        );
      }
    }

    // 4. Create 100 Historical SOS Records with locations, priorities, notifications, status histories, and responder assignments
    const incidentTypes = [
      'Medical Emergency',
      'Personal Safety Alert',
      'Road Accident / Vehicle Collision',
      'Severe Fire Hazard',
      'Flash Flooding Emergency',
      'Physical Assault / Threat',
      'Structural Collapse',
      'Harassment Alert'
    ];
    const priorities = ['Critical', 'High', 'Medium', 'Low'];
    const statuses = ['Closed', 'Resolved', 'In Progress', 'Contacts Notified', 'Received', 'Triggered'];

    console.log('Generating 100 historical SOS records across Coimbatore, Chennai, Bengaluru, Madurai, Tiruppur, Salem, Kochi...');
    const now = Date.now();

    for (let s = 1; s <= 100; s++) {
      const citizenId = citizenUserIds[s % citizenUserIds.length];
      const cityObj = indianCities[s % indianCities.length];
      const type = incidentTypes[s % incidentTypes.length];
      const priority = priorities[(s * 3) % priorities.length];
      // Keep last 15 incidents open or in-progress, rest resolved or closed
      const status = s > 85 ? (s > 95 ? 'Triggered' : s > 90 ? 'Contacts Notified' : 'In Progress') : (s % 2 === 0 ? 'Resolved' : 'Closed');
      const incidentCode = `SOS-2026-${String(s).padStart(5, '0')}`;
      const timeOffset = (100 - s) * 3600 * 1000 * 2.5; // Stretched across past 10 days
      const createdAt = new Date(now - timeOffset);
      const updatedAt = new Date(createdAt.getTime() + 1000 * 60 * 35);

      const lat = cityObj.lat + (Math.sin(s * 1.5) * 0.08);
      const lng = cityObj.lng + (Math.cos(s * 1.5) * 0.08);
      const mapUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
      const desc = `[DEMO DATA] ${type} reported near ${cityObj.city} central sector. Immediate assistance requested by user via 3-second hold SOS activation.`;

      // Insert SOS log
      const sosRes = await client.query(
        `INSERT INTO sos_logs (incident_code, user_id, incident_type, description, priority, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [incidentCode, citizenId, type, desc, priority, status, createdAt, updatedAt]
      );
      const sosId = sosRes.rows[0].id;

      // Insert Location
      await client.query(
        `INSERT INTO sos_locations (sos_id, latitude, longitude, altitude, accuracy, heading, speed, location_text, google_maps_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sosId,
          lat,
          lng,
          cityObj.city === 'Coimbatore' ? 411 : cityObj.city === 'Bengaluru' ? 920 : 15,
          8.5,
          (s * 37) % 360,
          0.0,
          `${cityObj.city} Sector ${s % 12 + 1}, Tamil Nadu / Karnataka`,
          mapUrl,
          createdAt
        ]
      );

      // Insert Incident Priority (AI & Rule based scoring)
      const score = priority === 'Critical' ? 92 : priority === 'High' ? 76 : priority === 'Medium' ? 52 : 28;
      await client.query(
        `INSERT INTO incident_priorities (sos_id, calculated_score, priority_level, ai_confidence, explanation, factors, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sosId,
          score,
          priority,
          0.94,
          `[DEMO DATA] Priority calculated via AegisNet Emergency Telemetry Rule Engine: ${type} scored ${score}/100. Keywords and location proximity triggered ${priority} urgency classification.`,
          JSON.stringify({
            incident_type: type,
            urgency_score: score,
            location_zone: cityObj.city,
            auto_dispatched: priority === 'Critical'
          }),
          createdAt
        ]
      );

      // Insert Status History
      await client.query(
        `INSERT INTO incident_histories (sos_id, status, notes, changed_by, timestamp)
         VALUES ($1, 'Triggered', '[DEMO DATA] SOS button held for 3 seconds. GPS coordinates acquired.', $2, $3)`,
        [sosId, citizenId, createdAt]
      );
      await client.query(
        `INSERT INTO incident_histories (sos_id, status, notes, changed_by, timestamp)
         VALUES ($1, 'Contacts Notified', '[DEMO DATA] Broadcast SMS dispatched to registered emergency contacts.', $2, $3)`,
        [sosId, citizenId, new Date(createdAt.getTime() + 1000 * 4)]
      );

      if (status === 'In Progress' || status === 'Resolved' || status === 'Closed') {
        const responderId = responderUserIds[s % responderUserIds.length];
        await client.query(
          `INSERT INTO incident_histories (sos_id, status, notes, changed_by, timestamp)
           VALUES ($1, 'In Progress', '[DEMO DATA] First responder unit acknowledged alert and en route.', $2, $3)`,
          [sosId, responderId, new Date(createdAt.getTime() + 1000 * 60 * 3)]
        );

        // Responder assignment
        await client.query(
          `INSERT INTO responder_assignments (sos_id, responder_id, unit_dispatched, notes, assigned_at, resolved_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            sosId,
            responderId,
            `Unit ${cityObj.city}-QRF-${(s % 5) + 1}`,
            `[DEMO DATA] Dispatched to coordinates ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            new Date(createdAt.getTime() + 1000 * 60 * 3),
            status === 'Resolved' || status === 'Closed' ? updatedAt : null
          ]
        );
      }

      if (status === 'Resolved' || status === 'Closed') {
        await client.query(
          `INSERT INTO incident_histories (sos_id, status, notes, changed_by, timestamp)
           VALUES ($1, $2, '[DEMO DATA] Emergency stabilized. On-scene responder cleared incident.', $3, $4)`,
          [sosId, status, adminIds[0], updatedAt]
        );
      }

      // Insert Notifications to Contacts
      const contactsRes = await client.query('SELECT name, phone FROM emergency_contacts WHERE user_id = $1 LIMIT 3', [citizenId]);
      for (const contact of contactsRes.rows) {
        const notifMsg = `EMERGENCY ALERT: An SOS has been triggered by user #${citizenId}. Location: ${mapUrl}. Incident ID: ${incidentCode}. Please contact user immediately. [SIMULATED SMS - DEMO DATA]`;
        const notifRes = await client.query(
          `INSERT INTO notifications (sos_id, recipient_phone, recipient_name, message_body, provider, status, created_at)
           VALUES ($1, $2, $3, $4, 'development-simulation', 'delivered', $5)
           RETURNING id`,
          [sosId, contact.phone, contact.name, notifMsg, createdAt]
        );
        const notifId = notifRes.rows[0].id;

        await client.query(
          `INSERT INTO notification_deliveries (notification_id, attempt_number, status, details, delivered_at)
           VALUES ($1, 1, 'delivered', '[SIMULATED SMS] Delivered via AegisNet Local Simulation Engine to ' || $2, $3)`,
          [notifId, contact.phone, new Date(createdAt.getTime() + 1000 * 5)]
        );
      }
    }

    await client.query('COMMIT');
    console.log('AegisNet complete demonstration dataset successfully seeded!');
    console.log('Demo Accounts created:');
    console.log(' - Admin: admin@aegisnet.org / AdminPass123!');
    console.log(' - Responder: responder.police1@aegisnet.org / ResponderPass123!');
    console.log(' - Responder: responder.medical1@aegisnet.org / ResponderPass123!');
    console.log(' - Citizen User: citizen.aarav1@aegisnet.org / UserPass123!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding demonstration dataset:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { seedDatabase };
