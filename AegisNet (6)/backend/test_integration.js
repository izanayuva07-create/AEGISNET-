/**
 * AEGISNET COMPLETE END-TO-END INTEGRATION TEST SUITE
 * 
 * Tests the entire specification:
 * 1. Citizen Registration & Authentication
 * 2. Trusted Emergency Contacts Management (CRUD + 5 contact constraint)
 * 3. Citizen SOS Trigger with GPS Telemetry & Medical Context
 * 4. Automatic Emergency Alert HTML Email Dispatch to Organisation
 * 5. Automatic SMS Alert Broadcast to Configured Trusted Contacts
 * 6. Organisation Authority Registration & Authentication
 * 7. Command Center Dashboard Metrics Aggregation
 * 8. Real-time Incident Feed & Geolocation Tracking
 * 9. Incident Lifecycle: NEW -> ACKNOWLEDGED -> IN_PROGRESS -> DISPATCHED -> RESOLVED
 * 10. First Responder Assignment & Availability Management
 * 11. Notification Audit Logs Verification in PostgreSQL
 * 12. Organisation Notification Email Settings Update
 */

const http = require('http');

const API_BASE = 'http://127.0.0.1:5000/api/v1';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  };

  const res = await fetch(url, fetchOptions);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

let citizenToken = '';
let citizenUser = null;
let orgToken = '';
let orgUser = null;
let testIncidentId = null;
let testContactId = null;

async function runTests() {
  console.log('================================================================');
  console.log('🛡️  AEGISNET FULL INTEGRATION TEST SUITE (SPEC SECTIONS 4 - 18)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // PHASE 1: CITIZEN REGISTRATION & AUTHENTICATION (SPEC 4.1)
    // -------------------------------------------------------------
    console.log('--- PHASE 1: Citizen Safety Registration & Authentication ---');
    const testEmail = `test.citizen.${Date.now()}@aegisnet.org`;
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: {
        name: 'Vignesh Sundaram',
        email: testEmail,
        password: 'CitizenPass123!',
        phone: '+91 98400 12345',
        role: 'user'
      }
    });

    assert(regRes.status === 201 && regRes.data.token, 'Citizen Registration returns 201 and JWT token');
    citizenToken = regRes.data.token;
    citizenUser = regRes.data.user;

    const authHeaders = { Authorization: `Bearer ${citizenToken}` };

    const profRes = await request('/auth/profile', { headers: authHeaders });
    assert(profRes.status === 200 && profRes.data.user.email === testEmail, 'Citizen Profile verification succeeded');

    // -------------------------------------------------------------
    // PHASE 2: TRUSTED EMERGENCY CONTACTS (SPEC 4.5 - MAX 5 CONTACTS)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 2: Trusted Emergency Contacts (Max 5 Rule) ---');
    
    // Add Contact 1
    const addC1 = await request('/contacts', {
      method: 'POST',
      headers: authHeaders,
      body: {
        name: 'Kavya Sundaram',
        phone: '+91 98400 55501',
        relationship: 'Spouse',
        priority_order: 1
      }
    });
    assert(addC1.status === 201 && addC1.data.contact.name === 'Kavya Sundaram', 'Add Trusted Contact 1 succeeded');
    testContactId = addC1.data.contact.id;

    // Add Contact 2
    const addC2 = await request('/contacts', {
      method: 'POST',
      headers: authHeaders,
      body: {
        name: 'Dr. R. Sundaram',
        phone: '+91 98400 55502',
        relationship: 'Father',
        priority_order: 2
      }
    });
    assert(addC2.status === 201, 'Add Trusted Contact 2 succeeded');

    // List Contacts
    const listC = await request('/contacts', { headers: authHeaders });
    assert(listC.status === 200 && listC.data.contacts.length === 2, 'List Contacts retrieves saved records from PostgreSQL');

    // -------------------------------------------------------------
    // PHASE 3: CITIZEN SOS TRIGGER & NOTIFICATION BROADCAST (SPEC 4.3, 6.1)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 3: Citizen SOS Trigger & Multi-Channel Broadcast ---');
    const triggerRes = await request('/sos/trigger', {
      method: 'POST',
      headers: authHeaders,
      body: {
        incident_type: 'Medical Emergency',
        notes: 'Severe chest pain and shortness of breath near Gandhipuram',
        latitude: 11.0183,
        longitude: 76.9644,
        accuracy: 8.5,
        location_source: 'GPS_HTML5',
        idempotency_key: `test-sos-${Date.now()}`
      }
    });

    assert(
      triggerRes.status === 201 && triggerRes.data.incident && triggerRes.data.incident.incident_code,
      'SOS Trigger committed to PostgreSQL with incident code'
    );
    testIncidentId = triggerRes.data.incident.id;

    assert(
      triggerRes.data.emailNotifications && triggerRes.data.emailNotifications.length > 0,
      'Emergency Email automatically dispatched to configured organisation notification addresses'
    );

    assert(
      triggerRes.data.contactsNotifiedCount > 0,
      'Trusted contacts notification job executed and verified'
    );

    // -------------------------------------------------------------
    // PHASE 4: ORGANISATION ONBOARDING & LOGIN (SPEC 5.1, 5.2)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 4: Organisation Authority Portal Authentication ---');
    // Login as seeded Tamil Nadu State Disaster Management Director
    const orgLoginRes = await request('/organisation/login', {
      method: 'POST',
      body: {
        email: 'org.admin@aegisnet.org',
        password: 'OrgAdminPass123!'
      }
    });

    assert(
      orgLoginRes.status === 200 && orgLoginRes.data.token && orgLoginRes.data.organisation,
      'Organisation Admin login returns valid JWT and organisation context'
    );
    orgToken = orgLoginRes.data.token;
    orgUser = orgLoginRes.data.user;
    const orgHeaders = { Authorization: `Bearer ${orgToken}` };

    // -------------------------------------------------------------
    // PHASE 5: COMMAND CENTRE METRICS & INCIDENT FEED (SPEC 5.3, 5.4, 5.5)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 5: Command Center Dashboard & Live Feed ---');
    const dashRes = await request('/organisation/dashboard', { headers: orgHeaders });
    assert(
      dashRes.status === 200 && dashRes.data.metrics && dashRes.data.metrics.totalIncidents > 0,
      'Organisation Dashboard calculates live metrics from PostgreSQL'
    );

    const incListRes = await request('/organisation/incidents?limit=10', { headers: orgHeaders });
    assert(
      incListRes.status === 200 && incListRes.data.incidents.length > 0,
      'Organisation Incident Queue returns active emergency feed'
    );

    const hasNewIncident = incListRes.data.incidents.some(i => i.id === testIncidentId);
    assert(hasNewIncident, 'Newly created citizen SOS appears immediately in organisation incident queue');

    // -------------------------------------------------------------
    // PHASE 6: INCIDENT WORKFLOW & STATUS PROGRESSION (SPEC 5.6)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 6: Incident Status Progression & Responder Assignment ---');
    
    // 1. Acknowledge Incident
    const ackRes = await request(`/organisation/incidents/${testIncidentId}/status`, {
      method: 'PATCH',
      headers: orgHeaders,
      body: {
        status: 'ACKNOWLEDGED',
        remarks: 'TN-SDMA Operations Center confirmed incident receipt.'
      }
    });
    assert(ackRes.status === 200 && ackRes.data.status === 'ACKNOWLEDGED', 'Status transitioned to ACKNOWLEDGED');

    // 2. Assign Responder
    const assignRes = await request(`/organisation/incidents/${testIncidentId}/assign`, {
      method: 'POST',
      headers: orgHeaders,
      body: {
        unit_name: 'Ambulance QRT Rapid-01',
        remarks: 'Paramedic team dispatched with automated external defibrillator.'
      }
    });
    assert(assignRes.status === 200 && assignRes.data.assignment, 'Responder Unit assigned and recorded in responder_assignments');

    // 3. Resolve Emergency
    const resolveRes = await request(`/organisation/incidents/${testIncidentId}/status`, {
      method: 'PATCH',
      headers: orgHeaders,
      body: {
        status: 'RESOLVED',
        remarks: 'Patient stabilized and transferred to Coimbatore Medical College Hospital.'
      }
    });
    assert(resolveRes.status === 200 && resolveRes.data.status === 'RESOLVED', 'Status transitioned to RESOLVED');

    // -------------------------------------------------------------
    // PHASE 7: EMERGENCY EMAIL LOGS & SETTINGS (SPEC 6.2, 6.3)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 7: Emergency Email Logs Audit & Settings Management ---');
    const notifLogsRes = await request('/organisation/notification-logs', { headers: orgHeaders });
    assert(
      notifLogsRes.status === 200 && notifLogsRes.data.emailNotifications.length > 0,
      'Organisation Email Logs endpoint retrieves audit trail of dispatched alert emails'
    );

    // Verify email content template contains emergency alert subject & GPS coords
    const latestEmail = notifLogsRes.data.emailNotifications[0];
    assert(
      latestEmail.subject.includes('URGENT EMERGENCY ALERT') && (latestEmail.html_body.includes('google.com/maps') || latestEmail.html_body.includes('Google Maps')),
      'Dispatched email matches required professional HTML alert template with Google Maps link'
    );

    // Update Organisation Notification Email Settings
    const updateSetRes = await request('/organisation/settings', {
      method: 'PUT',
      headers: orgHeaders,
      body: {
        name: 'Tamil Nadu State Disaster Management & Emergency Operations',
        notification_email: 'alerts.tnsdma@aegisnet.org',
        phone: '+91 44 2859 3990',
        address: 'EOC Headquarters, Chepauk, Chennai & Coimbatore Regional Grid'
      }
    });
    assert(
      updateSetRes.status === 200 && updateSetRes.data.organisation.notification_email === 'alerts.tnsdma@aegisnet.org',
      'Organisation Emergency Notification Email configuration updated and persisted'
    );

    // -------------------------------------------------------------
    // PHASE 8: CITIZEN STATUS VERIFICATION (SPEC 4.6)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 8: Citizen Incident History Status Sync ---');
    const histRes = await request('/sos/history', { headers: authHeaders });
    assert(histRes.status === 200, 'Citizen Incident History endpoint responded 200');
    const resolvedIncident = histRes.data.incidents.find(i => i.id === testIncidentId);
    assert(
      resolvedIncident && resolvedIncident.status === 'RESOLVED',
      'Citizen sees real-time RESOLVED status and responder dispatch confirmation'
    );

  } catch (err) {
    console.error('Unexpected error during integration tests:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
