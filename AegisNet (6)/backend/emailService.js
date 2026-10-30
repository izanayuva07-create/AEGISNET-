const nodemailer = require('nodemailer');
const { query } = require('./database');
require('dotenv').config();

// Create Nodemailer Transporter if credentials provided
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user, pass }
    });
  }
  return null;
}

/**
 * Builds professional responsive HTML email template for emergency alert
 */
function buildEmergencyEmailHtml({
  incidentCode,
  userName,
  userPhone,
  incidentType,
  description,
  priority,
  latitude,
  longitude,
  accuracy,
  altitude,
  googleMapsUrl,
  timestamp,
  contactsCount,
  dashboardUrl
}) {
  const isCritical = priority?.toLowerCase() === 'critical';
  const priorityColor = isCritical ? '#E05252' : '#D8BC43';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URGENT EMERGENCY ALERT – AEGISNET</title>
  <style>
    body { margin: 0; padding: 0; background-color: #080909; font-family: 'Inter', Arial, sans-serif; color: #F5F5F2; }
    .wrapper { max-width: 640px; margin: 20px auto; background-color: #141414; border: 1px solid rgba(216, 188, 67, 0.35); border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1c1c1a 0%, #080909 100%); padding: 24px; border-bottom: 2px solid ${priorityColor}; text-align: center; }
    .brand-title { color: #D8BC43; font-size: 22px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; margin: 0; }
    .brand-sub { color: #A7A7A7; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 4px; }
    .alert-banner { background-color: ${isCritical ? 'rgba(224, 82, 82, 0.18)' : 'rgba(216, 188, 67, 0.18)'}; border: 1px solid ${priorityColor}; color: ${isCritical ? '#ff9999' : '#f1d77a'}; padding: 12px 18px; text-align: center; font-weight: 700; font-size: 14px; letter-spacing: 0.04em; }
    .content { padding: 24px; }
    .incident-meta { margin-bottom: 20px; }
    .meta-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); font-size: 13px; }
    .meta-label { color: #A7A7A7; text-transform: uppercase; font-size: 11px; font-weight: 600; }
    .meta-val { color: #F5F5F2; font-weight: 600; }
    .priority-pill { background-color: ${priorityColor}; color: #080909; padding: 3px 10px; border-radius: 999px; font-weight: 800; font-size: 11px; text-transform: uppercase; }
    .desc-box { background-color: #1c1c1c; border-left: 3px solid #D8BC43; padding: 12px 16px; margin: 18px 0; border-radius: 4px; font-size: 13px; color: #E0E0DC; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #D8BC43, #E9D46F); color: #080909 !important; font-weight: 700; font-size: 14px; text-decoration: none; padding: 14px 28px; border-radius: 8px; text-align: center; margin: 20px 0; box-shadow: 0 4px 15px rgba(216, 188, 67, 0.3); }
    .footer { background-color: #0d0e10; padding: 18px; text-align: center; font-size: 11px; color: #777777; border-top: 1px solid rgba(255, 255, 255, 0.06); }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1 class="brand-title">AEGISNET</h1>
      <div class="brand-sub">AI-ENABLED EMERGENCY & INTELLIGENT SAFETY NETWORK</div>
    </div>
    <div class="alert-banner">
      🚨 URGENT EMERGENCY SOS INCIDENT DISPATCHED TO YOUR ORGANISATION
    </div>
    <div class="content">
      <div class="incident-meta">
        <div class="meta-row">
          <span class="meta-label">Incident ID</span>
          <span class="meta-val"><code>${incidentCode}</code></span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Distress Category</span>
          <span class="meta-val">${incidentType}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Priority Assessment</span>
          <span class="meta-val"><span class="priority-pill">${priority || 'Critical'}</span></span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Reporting User</span>
          <span class="meta-val">${userName} (${userPhone || 'Phone protected'})</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Timestamp</span>
          <span class="meta-val">${new Date(timestamp).toUTCString()}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">GPS Coordinates</span>
          <span class="meta-val">${latitude ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)} (±${Math.round(accuracy || 15)}m)` : 'Manual / Landmark'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Altitude</span>
          <span class="meta-val">${altitude ? `${Math.round(altitude)} m` : 'Not reported'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Trusted Contacts SMS Status</span>
          <span class="meta-val" style="color: #43B581;">✓ ${contactsCount} Contact(s) Dispatched via SMS</span>
        </div>
      </div>

      <div class="desc-box">
        <strong>Reported Situation Telemetry:</strong><br>
        ${description || 'Emergency assistance requested via 3-second SOS activation.'}
      </div>

      <div style="text-align: center;">
        <a href="${dashboardUrl}" class="cta-btn" target="_blank">
          OPEN INCIDENT IN ORGANISATION COMMAND CENTER ➔
        </a>
      </div>

      <p style="font-size: 12px; color: #A7A7A7; text-align: center;">
        Direct Map Coordinates: <a href="${googleMapsUrl}" style="color: #D8BC43;" target="_blank">${googleMapsUrl}</a>
      </p>
    </div>
    <div class="footer">
      This is an automated priority emergency dispatch notification from AegisNet Core Engine.<br>
      Confidential safety telemetry intended strictly for authorised emergency response operations.
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Dispatches emergency alert email to all verified emergency organisations or target organisation
 */
async function sendOrganisationEmergencyEmail({
  sosId,
  incidentCode,
  userName,
  userPhone,
  incidentType,
  description,
  priority,
  latitude,
  longitude,
  accuracy,
  altitude,
  googleMapsUrl,
  timestamp,
  contactsCount
}) {
  const subject = `URGENT EMERGENCY ALERT – AEGISNET – Incident [${incidentCode}]`;
  const dashboardUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}/dashboard`;

  const htmlBody = buildEmergencyEmailHtml({
    incidentCode,
    userName,
    userPhone,
    incidentType,
    description,
    priority,
    latitude,
    longitude,
    accuracy,
    altitude,
    googleMapsUrl,
    timestamp,
    contactsCount,
    dashboardUrl
  });

  // Get active organisations configured to receive emergency notifications
  const orgsRes = await query(
    'SELECT id, name, notification_email, official_email FROM organisations WHERE verification_status = $1',
    ['verified']
  );

  let targetOrgs = orgsRes.rows;
  if (targetOrgs.length === 0) {
    // If no orgs seeded yet, use default emergency ops email
    targetOrgs = [{
      id: null,
      name: 'AegisNet Central Disaster Response',
      notification_email: process.env.ADMIN_NOTIFICATION_EMAIL || 'emergency-ops@aegisnet.org'
    }];
  }

  const transporter = getTransporter();
  const mailFrom = process.env.MAIL_FROM || '"AegisNet Emergency Dispatch" <alerts@aegisnet.org>';
  const results = [];

  for (const org of targetOrgs) {
    const recipientEmail = org.notification_email || org.official_email;
    const provider = transporter ? 'smtp-nodemailer' : 'development-simulation';

    // 1. Insert record in email_notifications table
    const insertRes = await query(
      `INSERT INTO email_notifications (
        sos_id, organisation_id, recipient_email, subject, html_body, provider, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id`,
      [sosId, org.id, recipientEmail, subject, htmlBody, provider]
    );
    const emailNotifId = insertRes.rows[0].id;

    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: mailFrom,
          to: recipientEmail,
          subject,
          html: htmlBody
        });

        await query(
          'UPDATE email_notifications SET status = $1, provider_message_id = $2, sent_at = CURRENT_TIMESTAMP WHERE id = $3',
          ['sent', info.messageId, emailNotifId]
        );
        console.log(`[Email Dispatch Engine] Live email dispatched via SMTP to ${recipientEmail} (${info.messageId})`);
        results.push({ success: true, email: recipientEmail, provider: 'smtp-nodemailer', messageId: info.messageId });
      } catch (err) {
        console.error(`[Email Dispatch Error] Failed to send via SMTP to ${recipientEmail}:`, err.message);
        await query(
          'UPDATE email_notifications SET status = $1, error_message = $2 WHERE id = $3',
          ['failed', err.message, emailNotifId]
        );
        results.push({ success: false, email: recipientEmail, error: err.message });
      }
    } else {
      // Development Simulation Engine
      // As specified in Section 6.4:
      // "If email credentials are not configured, provide a clearly labelled development simulation: [SIMULATED EMAIL - DEV PROVIDER]."
      const devMessageId = `sim-email-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await query(
        `UPDATE email_notifications 
         SET status = 'sent', provider_message_id = $1, error_message = $2, sent_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [devMessageId, '[SIMULATED EMAIL - DEV PROVIDER] Emergency dispatch email generated and saved to PostgreSQL.', emailNotifId]
      );
      console.log(`[Email Dispatch Engine] [SIMULATED EMAIL - DEV PROVIDER] Simulated emergency email recorded for ${org.name} (${recipientEmail})`);
      results.push({ success: true, email: recipientEmail, provider: 'development-simulation', simulated: true, messageId: devMessageId });
    }
  }

  return results;
}

module.exports = {
  sendOrganisationEmergencyEmail,
  buildEmergencyEmailHtml
};
