# AEGISNET — AI-Enabled Emergency & Intelligent Safety Network

> **"When every minute matters, AegisNet keeps help connected."**  
> Community Emergency Communication, Intelligent Safety, and First Responder Coordination Platform.

---

## 🛡️ Project Overview & Architecture

**AEGISNET** is an emergency communication and multi-agency response coordination platform designed to drastically minimize the critical elapsed time between an individual experiencing an emergency and emergency response organisations receiving, triaging, and responding to that incident.

The platform provides **two interconnected portals** operating over a unified backend and shared PostgreSQL database:
1. **User Portal (Citizen Safety)**: Mobile-first interface for individuals to register, maintain up to 5 verified emergency contacts, configure medical telemetry, trigger high-priority SOS alerts via a 3-second press-and-hold interaction with real GPS telemetry, and track real-time incident status.
2. **Organisation Portal (Command & Emergency Response Authority)**: Desktop-first emergency operations command center for authorized emergency management organisations (e.g., Disaster Management Authorities, Police Control Grids, Fire & Rescue Services, Medical Emergency Grids) to receive real-time incident feeds via Socket.IO, view active Leaflet tactical maps, assign/dispatch units, update incident status through strict workflow states (`NEW ➔ ACKNOWLEDGED ➔ IN_PROGRESS ➔ DISPATCHED ➔ RESOLVED`), manage personnel rosters, and configure official emergency notification emails.

### End-to-End Emergency Workflow
```
CITIZEN FACES EMERGENCY
         ↓
OPENS AEGISNET USER PORTAL
         ↓
PRESSES & HOLDS SOS (3-Second SVG Countdown)
         ↓
AUTOMATIC GPS CAPTURE (HTML5 Geolocation · High-Accuracy Mode)
         ↓
BACKEND VALIDATION & COMMIT (POST /api/v1/sos/trigger)
         ↓
POSTGRESQL RELATIONAL STORAGE (sos_logs, sos_locations, incident_priorities)
         ↓
      ┌───────────────────────────────────────────────────────────────┐
      ↓                                                               ↓
ORGANISATION EMAIL DISPATCH                          TRUSTED CONTACTS SMS
- Recipient: alerts.tnsdma@aegisnet.org              - Up to 5 registered contacts
- Priority Subject: URGENT EMERGENCY ALERT           - SMS with live Google Maps link
- Full Telemetry & Google Maps Link                  - Recorded in notification_deliveries
      ↓                                                               ↓
      └──────────────────────────────┬────────────────────────────────┘
                                     ↓
             REAL-TIME SOCKET.IO BROADCAST (responders_room)
                                     ↓
         ORGANISATION COMMAND CENTRE & LEAFLET TACTICAL MAP
                                     ↓
          INCIDENT REVIEW & TRIAGE (AI / Rule-based Score)
                                     ↓
                   STATUS: ACKNOWLEDGED (Verified)
                                     ↓
             FIRST RESPONDER DISPATCHED (e.g. Police QRT)
                                     ↓
                STATUS: IN_PROGRESS ➔ DISPATCHED
                                     ↓
           EMERGENCY RESOLVED & AUDIT TRAIL RECORDED
```

---

## ⚡ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, TypeScript/JavaScript, Tailwind CSS, Lucide React, Leaflet & React-Leaflet, OpenStreetMap |
| **Backend** | Node.js, Express.js, Socket.IO, JSON Web Tokens (JWT), Bcrypt password hashing, REST API Architecture |
| **Database** | PostgreSQL 16 (16 normalized relational tables, constraints, foreign keys, indexes), `pg` pool connection manager |
| **Email Service** | Nodemailer with SMTP integration & clearly labeled development simulation (`[SIMULATED EMAIL - DEV PROVIDER]`), HTML email templates with AegisNet branding |
| **SMS Service** | Twilio SMS API with asynchronous retry queue and dev simulation (`[SIMULATED SMS - DEV PROVIDER]`) |
| **AI Priority Engine** | Transparent multi-vector emergency scoring (0–100 scale), distress categorization, urgency window analysis, transparent explanation |
| **Testing** | Complete End-to-End Integration Test Suite (`test_integration.js`), 20 test assertions passing |

---

## 🚀 Live Services & Ports

| Component | Target URL / Port | Status | Description |
|---|---|---|---|
| **Frontend Web App** | `http://localhost:5173` | Active | Vite React SPA (User & Organisation Portals) |
| **Backend REST Core** | `http://localhost:5000` | Active | Node.js / Express API + Socket.IO Engine |
| **PostgreSQL Database** | `localhost:5432` (`aegisnet`) | Active | PostgreSQL 16 Relational Engine |
| **API Health Check** | `http://localhost:5000/api/v1/health` | Active | System health check (`200 OK`) |
| **Organisation Portal** | `http://localhost:5173/dashboard` | Active | Emergency Command Operations Center |

---

## 🔑 Test Credentials

The database has been seeded with realistic demonstration records (Tamil Nadu State Disaster Management, Coimbatore Police Grid, and citizen profiles):

| Portal | Role | Email Address | Password | Features / Access |
|---|---|---|---|---|
| **Organisation** | **🏢 Org Administrator** | `org.admin@aegisnet.org` | `OrgAdminPass123!` | Full Command Center, Tactical Leaflet Map, Incident Queue, Responder Roster, Email Logs, Org Settings |
| **Organisation** | **🚨 Police Responder** | `responder.police1@aegisnet.org` | `ResponderPass123!` | Tactical Map, Active Incidents Feed, Unit Dispatching, Status Progression |
| **Organisation** | **⚡ System Admin** | `admin@aegisnet.org` | `AdminPass123!` | System-wide incident queue, user roster, audit logs, external alert controls |
| **User Portal** | **🛡️ Citizen (Aarav)** | `citizen.aarav1@aegisnet.org` | `UserPass123!` | 3s SOS activation, 5 trusted contacts, medical profile, incident tracking |
| **User Portal** | **🛡️ Citizen (Priya)** | `citizen.priya2@aegisnet.org` | `UserPass123!` | Medical emergency telemetry, GPS broadcast, incident history |

*Note: 1-Click Demo Access buttons are available on the AegisNet landing page for instant login.*

---

## 📋 Comprehensive API Documentation

All APIs respond with standard JSON envelopes and appropriate HTTP status codes.

### 1. Authentication APIs
- `POST /api/v1/auth/register` — Citizen registration (Name, Email, Password, Phone, Role)
- `POST /api/v1/auth/login` — Citizen & user authentication, returns JWT token
- `GET /api/v1/auth/profile` — Retrieve current authenticated user profile
- `PUT /api/v1/auth/profile` — Update emergency medical telemetry profile

### 2. User & Trusted Contacts APIs (Max 5 Contacts)
- `GET /api/v1/users/me` — Current citizen profile and medical context
- `GET /api/v1/contacts` — List citizen's trusted emergency contacts
- `POST /api/v1/contacts` — Add trusted contact (enforces max 5 constraint & phone regex)
- `PUT /api/v1/contacts/:id` — Update trusted contact relationship/priority
- `DELETE /api/v1/contacts/:id` — Delete trusted contact

### 3. Emergency SOS APIs
- `POST /api/v1/sos/trigger` — Activate SOS: commits to PostgreSQL, captures GPS coordinates, triggers asynchronous email notification to official organisation email, broadcasts SMS to trusted contacts, and emits real-time Socket.IO event
- `GET /api/v1/sos/history` — Citizen's historical emergencies and lifecycle status
- `GET /api/v1/sos/:id` — Detailed incident audit trail and timeline
- `POST /api/v1/sos/:id/cancel` — Authorised cancellation with recorded remarks

### 4. Organisation Portal APIs (Section 9)
- `POST /api/v1/organisation/register` — Onboard new Emergency Authority / NGO
- `POST /api/v1/organisation/login` — Sign in to Organisation Portal with role verification
- `GET /api/v1/organisation/dashboard` — Live metrics (total, active, unacknowledged, critical, in-progress, resolved, available responders)
- `GET /api/v1/organisation/incidents` — Paginated and filtered incident queue
- `GET /api/v1/organisation/incidents/:id` — Incident detail with telemetry and assignment history
- `PATCH /api/v1/organisation/incidents/:id/status` — Status transition (`NEW ➔ ACKNOWLEDGED ➔ IN_PROGRESS ➔ DISPATCHED ➔ RESOLVED`) with audit remarks
- `POST /api/v1/organisation/incidents/:id/assign` — Assign first responder unit
- `GET /api/v1/organisation/responders` — List first responder roster and availability
- `POST /api/v1/organisation/responders` — Add new first responder unit
- `PUT /api/v1/organisation/responders/:id` — Toggle availability or update responder details
- `DELETE /api/v1/organisation/responders/:id` — Deactivate responder
- `GET /api/v1/organisation/settings` — Get organisation configuration & notification email
- `PUT /api/v1/organisation/settings` — Update organisation notification email and operational address
- `GET /api/v1/organisation/notification-logs` — Audit log of all dispatched emergency emails and SMS

---

## 📧 Organisation Email Notification System (Spec Section 6)

Whenever any user triggers an SOS, AegisNet automatically executes the emergency email workflow:
1. Validates the SOS request and GPS telemetry.
2. Commits the emergency incident to PostgreSQL `sos_logs` and `sos_locations`.
3. Looks up the official emergency notification email configured in organisation settings (`organisations.notification_email`, e.g., `alerts.tnsdma@aegisnet.org`).
4. Generates an executive emergency HTML email matching AegisNet brand guidelines:
   - Subject: `URGENT EMERGENCY ALERT – AEGISNET – Incident [INCIDENT_CODE]`
   - Caller identity and mobile number
   - Distress type, priority, and AI triage score
   - Precise GPS coordinates (latitude, longitude, accuracy)
   - Direct clickable Google Maps pin: `https://www.google.com/maps?q=LAT,LNG`
   - One-click button: `OPEN INCIDENT IN ORGANISATION COMMAND CENTER`
   - Trusted-contact dispatch status
5. Dispatches via Nodemailer SMTP or transactional provider. When SMTP is not configured, saves a simulated delivery record with provider message ID (`[SIMULATED EMAIL - DEV PROVIDER]`).
6. Commits the dispatch attempt to `email_notifications` for compliance auditing.

---

## 🧪 Integration Test Suite Execution

Run the complete 8-phase end-to-end integration test suite:

```bash
cd "backend"
node test_integration.js
```

### Test Suite Results:
```
================================================================
🛡️  AEGISNET FULL INTEGRATION TEST SUITE (SPEC SECTIONS 4 - 18)
================================================================

--- PHASE 1: Citizen Safety Registration & Authentication ---
  ✅ PASS: Citizen Registration returns 201 and JWT token
  ✅ PASS: Citizen Profile verification succeeded

--- PHASE 2: Trusted Emergency Contacts (Max 5 Rule) ---
  ✅ PASS: Add Trusted Contact 1 succeeded
  ✅ PASS: Add Trusted Contact 2 succeeded
  ✅ PASS: List Contacts retrieves saved records from PostgreSQL

--- PHASE 3: Citizen SOS Trigger & Multi-Channel Broadcast ---
  ✅ PASS: SOS Trigger committed to PostgreSQL with incident code
  ✅ PASS: Emergency Email automatically dispatched to configured organisation notification addresses
  ✅ PASS: Trusted contacts notification job executed and verified

--- PHASE 4: Organisation Authority Portal Authentication ---
  ✅ PASS: Organisation Admin login returns valid JWT and organisation context

--- PHASE 5: Command Center Dashboard & Live Feed ---
  ✅ PASS: Organisation Dashboard calculates live metrics from PostgreSQL
  ✅ PASS: Organisation Incident Queue returns active emergency feed
  ✅ PASS: Newly created citizen SOS appears immediately in organisation incident queue

--- PHASE 6: Incident Status Progression & Responder Assignment ---
  ✅ PASS: Status transitioned to ACKNOWLEDGED
  ✅ PASS: Responder Unit assigned and recorded in responder_assignments
  ✅ PASS: Status transitioned to RESOLVED

--- PHASE 7: Emergency Email Logs Audit & Settings Management ---
  ✅ PASS: Organisation Email Logs endpoint retrieves audit trail of dispatched alert emails
  ✅ PASS: Dispatched email matches required professional HTML alert template with Google Maps link
  ✅ PASS: Organisation Emergency Notification Email configuration updated and persisted

--- PHASE 8: Citizen Incident History Status Sync ---
  ✅ PASS: Citizen Incident History endpoint responded 200
  ✅ PASS: Citizen sees real-time RESOLVED status and responder dispatch confirmation

================================================================
TEST SUMMARY: 20 PASSED | 0 FAILED
================================================================
```

---

## ⚙️ Environment Variables (`.env`)

```env
# Backend Configuration
PORT=5000
HOST=0.0.0.0
NODE_ENV=development
JWT_SECRET=aegisnet-super-secret-jwt-key-2026-production
FRONTEND_ORIGIN=http://localhost:5173

# PostgreSQL Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aegisnet
PGHOST=localhost
PGPORT=5432
PGDATABASE=aegisnet
PGUSER=postgres
PGPASSWORD=postgres

# Email Provider Configuration (Spec Section 6.3)
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM="AegisNet Emergency Dispatch" <alerts@aegisnet.org>
ADMIN_NOTIFICATION_EMAIL=alerts.tnsdma@aegisnet.org

# Twilio SMS Configuration (Optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

---

## 📦 How to Run Locally

### 1. Database Setup
Ensure PostgreSQL 16 is running on port 5432:
```bash
createdb -U postgres aegisnet
```
The backend automatically executes `initSchema()` and `seedDatabase()` on launch, creating all 16 relational tables and initial demonstration data.

### 2. Launch Backend Server
```bash
cd backend
npm install
node server.js
```
Backend will be live at `http://127.0.0.1:5000`.

### 3. Launch Frontend Web App
```bash
cd frontend
npm install
npm run dev
```
Frontend will be live at `http://127.0.0.1:5173`.
