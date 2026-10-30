const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aegisnet';

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}

async function getClient() {
  const client = await pool.connect();
  return client;
}

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(30),
        role VARCHAR(20) NOT NULL DEFAULT 'user', -- 'user', 'responder', 'admin'
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);

    // 2. Emergency Profiles
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blood_group VARCHAR(10),
        allergies TEXT,
        medications TEXT,
        medical_notes TEXT,
        emergency_instructions TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Emergency Contacts (Max 5 per user)
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_contacts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        relationship VARCHAR(50) NOT NULL DEFAULT 'Family',
        priority INTEGER NOT NULL DEFAULT 1 CHECK (priority >= 1 AND priority <= 5),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_user_contact_phone UNIQUE (user_id, phone)
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_user ON emergency_contacts(user_id);
    `);

    // 4. SOS Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS sos_logs (
        id SERIAL PRIMARY KEY,
        incident_code VARCHAR(50) UNIQUE NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        incident_type VARCHAR(50) NOT NULL DEFAULT 'Emergency',
        description TEXT,
        priority VARCHAR(20) NOT NULL DEFAULT 'Critical', -- 'Critical', 'High', 'Medium', 'Low'
        status VARCHAR(30) NOT NULL DEFAULT 'Triggered', -- 'Triggered', 'Received', 'Contacts Notified', 'Acknowledged', 'In Progress', 'Resolved', 'Closed'
        idempotency_key VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sos_user ON sos_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_logs(status);
      CREATE INDEX IF NOT EXISTS idx_sos_priority ON sos_logs(priority);
      CREATE INDEX IF NOT EXISTS idx_sos_code ON sos_logs(incident_code);
    `);

    // 5. SOS Locations
    await client.query(`
      CREATE TABLE IF NOT EXISTS sos_locations (
        id SERIAL PRIMARY KEY,
        sos_id INTEGER NOT NULL REFERENCES sos_logs(id) ON DELETE CASCADE,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        altitude DOUBLE PRECISION,
        accuracy DOUBLE PRECISION,
        heading DOUBLE PRECISION,
        speed DOUBLE PRECISION,
        location_text TEXT,
        google_maps_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sos_location_sos ON sos_locations(sos_id);
    `);

    // 6. Incident Priorities (AI & Rule-based scoring)
    await client.query(`
      CREATE TABLE IF NOT EXISTS incident_priorities (
        id SERIAL PRIMARY KEY,
        sos_id INTEGER NOT NULL REFERENCES sos_logs(id) ON DELETE CASCADE,
        calculated_score INTEGER NOT NULL,
        priority_level VARCHAR(20) NOT NULL,
        ai_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.90,
        explanation TEXT,
        factors JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Incident History (Audit trail of state transitions)
    await client.query(`
      CREATE TABLE IF NOT EXISTS incident_histories (
        id SERIAL PRIMARY KEY,
        sos_id INTEGER NOT NULL REFERENCES sos_logs(id) ON DELETE CASCADE,
        status VARCHAR(30) NOT NULL,
        notes TEXT,
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_history_sos ON incident_histories(sos_id);
    `);

    // 8. Responder Profiles
    await client.query(`
      CREATE TABLE IF NOT EXISTS responder_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        badge_number VARCHAR(50),
        unit_name VARCHAR(100) NOT NULL,
        agency VARCHAR(100) NOT NULL DEFAULT 'Emergency Response Service',
        responder_type VARCHAR(50) NOT NULL DEFAULT 'Paramedic', -- 'Paramedic', 'Fire Rescue', 'Police', 'Disaster Relief'
        status VARCHAR(30) NOT NULL DEFAULT 'available', -- 'available', 'dispatched', 'off-duty'
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. Responder Assignments
    await client.query(`
      CREATE TABLE IF NOT EXISTS responder_assignments (
        id SERIAL PRIMARY KEY,
        sos_id INTEGER NOT NULL REFERENCES sos_logs(id) ON DELETE CASCADE,
        responder_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        unit_dispatched VARCHAR(100),
        notes TEXT,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMPTZ
      );
    `);

    // 10. Notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        sos_id INTEGER NOT NULL REFERENCES sos_logs(id) ON DELETE CASCADE,
        recipient_phone VARCHAR(30) NOT NULL,
        recipient_name VARCHAR(150) NOT NULL,
        message_body TEXT NOT NULL,
        provider VARCHAR(50) NOT NULL DEFAULT 'development-simulation',
        status VARCHAR(30) NOT NULL DEFAULT 'queued', -- 'queued', 'delivered', 'failed'
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_sos ON notifications(sos_id);
    `);

    // 11. Notification Deliveries
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        id SERIAL PRIMARY KEY,
        notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(30) NOT NULL,
        details TEXT,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 12. Audit Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        details JSONB,
        ip_address VARCHAR(50),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 13. Offline Sync Records (Idempotent replay queue)
    await client.query(`
      CREATE TABLE IF NOT EXISTS offline_sync_records (
        id SERIAL PRIMARY KEY,
        client_temp_id VARCHAR(100) NOT NULL,
        idempotency_key VARCHAR(100) UNIQUE NOT NULL,
        synced BOOLEAN NOT NULL DEFAULT TRUE,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('COMMIT');
    console.log('PostgreSQL AegisNet schema initialized successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Schema initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  getClient,
  initSchema
};
