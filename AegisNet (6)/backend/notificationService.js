const { query } = require('./database');

async function sendEmergencySMS({ sosId, contactName, contactPhone, userName, incidentCode, latitude, longitude, priority, description }) {
  const mapUrl = (latitude != null && longitude != null && !isNaN(latitude))
    ? `https://www.google.com/maps?q=${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`
    : 'Location coordinates unavailable (manual landmark)';

  const messageBody = `EMERGENCY ALERT: An SOS has been triggered by ${userName || 'a registered user'}. Location: ${mapUrl}. Incident ID: ${incidentCode}. Priority: ${priority || 'Critical'}. ${description ? `Note: ${description.slice(0, 80)}. ` : ''}Please contact the user immediately and seek emergency assistance.`;

  const twilioConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
  const provider = twilioConfigured ? 'twilio' : 'development-simulation';

  // 1. Insert notification record into PostgreSQL
  const notifRes = await query(
    `INSERT INTO notifications (sos_id, recipient_phone, recipient_name, message_body, provider, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')
     RETURNING id`,
    [sosId, contactPhone, contactName, messageBody, provider]
  );
  const notificationId = notifRes.rows[0].id;

  if (twilioConfigured) {
    try {
      // Direct Twilio REST API call
      const authHeader = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', contactPhone);
      params.append('From', process.env.TWILIO_PHONE_NUMBER);
      params.append('Body', messageBody);

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString(),
          signal: AbortSignal.timeout(6000)
        }
      );

      const data = await twilioRes.json();
      if (!twilioRes.ok) {
        throw new Error(data.message || 'Twilio dispatch rejected');
      }

      await query('UPDATE notifications SET status = $1 WHERE id = $2', ['delivered', notificationId]);
      await query(
        `INSERT INTO notification_deliveries (notification_id, attempt_number, status, external_sid, details)
         VALUES ($1, 1, 'delivered', $2, $3)`,
        [notificationId, data.sid, `Live SMS sent via Twilio to ${contactPhone}`]
      );

      return { success: true, provider: 'twilio', sid: data.sid };
    } catch (err) {
      console.error(`Twilio SMS dispatch failed to ${contactPhone}:`, err.message);
      await query('UPDATE notifications SET status = $1 WHERE id = $2', ['failed', notificationId]);
      await query(
        `INSERT INTO notification_attempts (notification_id, attempt_number, status, error_message)
         VALUES ($1, 1, 'failed', $2)`,
        [notificationId, err.message]
      );
      return { success: false, provider: 'twilio', error: err.message };
    }
  } else {
    // Development Simulated Notification Provider
    // As per specification: "Clearly label simulated messages. Never claim a real SMS was delivered when only a development simulation occurred."
    const details = `[SIMULATED SMS - DEV PROVIDER] Simulated emergency SMS generated and saved to database for ${contactName} (${contactPhone}). Live Twilio credentials not configured in backend/.env.`;
    
    await query('UPDATE notifications SET status = $1 WHERE id = $2', ['delivered', notificationId]);
    await query(
      `INSERT INTO notification_deliveries (notification_id, attempt_number, status, details)
       VALUES ($1, 1, 'delivered', $2)`,
      [notificationId, details]
    );

    console.log(`[SMS Broadcast Engine] Simulated SMS delivered to ${contactName} (${contactPhone}) for ${incidentCode}`);
    return { success: true, provider: 'development-simulation', simulated: true };
  }
}

async function notifyAllEmergencyContacts(sosId, userId, incidentCode, latitude, longitude, priority, description) {
  // Query user and emergency contacts from PostgreSQL
  const userRes = await query('SELECT name, phone FROM users WHERE id = $1', [userId]);
  const userName = userRes.rows[0]?.name || 'AegisNet User';

  const contactsRes = await query(
    'SELECT name, phone, priority FROM emergency_contacts WHERE user_id = $1 ORDER BY priority ASC LIMIT 5',
    [userId]
  );

  const results = [];
  for (const contact of contactsRes.rows) {
    try {
      const res = await sendEmergencySMS({
        sosId,
        contactName: contact.name,
        contactPhone: contact.phone,
        userName,
        incidentCode,
        latitude,
        longitude,
        priority,
        description
      });
      results.push({ contact: contact.name, phone: contact.phone, ...res });
    } catch (err) {
      console.error(`Failed notifying contact ${contact.name}:`, err);
      results.push({ contact: contact.name, phone: contact.phone, success: false, error: err.message });
    }
  }

  return results;
}

module.exports = {
  sendEmergencySMS,
  notifyAllEmergencyContacts
};
