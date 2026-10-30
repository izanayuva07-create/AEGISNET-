# AEGISNET — AI-Enabled Emergency & Intelligent Safety Network

> **"When every minute matters, AegisNet keeps help connected."**  
> Community Emergency Communication, Intelligent Safety, and First Responder Coordination Platform.

---

## 🛡️ Project Overview & Purpose

During emergencies, individuals often struggle to communicate distress information and accurate coordinates quickly. Manual phone calls and delayed reporting lead to critical communication bottlenecks.

**AegisNet** provides a centralized, fault-tolerant emergency communication platform where users can activate an SOS alert via a 3-second press-and-hold mechanism, automatically capture high-accuracy GPS coordinates, broadcast SMS notifications with live Google Maps links to up to 5 verified trusted contacts, and stream real-time prioritized incident feeds to an authorized responder command center.

### Core Emergency Workflow
```
USER FACES EMERGENCY
         ↓
  OPENS AEGISNET
         ↓
PRESSES & HOLDS SOS (3s)
         ↓
 AUTOMATIC GPS CAPTURE (HTML5 Geolocation · 5s Timeout)
         ↓
SOS REQUEST SENT TO BACKEND (POST /api/v1/sos/trigger)
         ↓
EMERGENCY LOG SAVED (PostgreSQL 16 Relational Storage)
         ↓
TRUSTED CONTACTS NOTIFIED (SMS Broadcast with Google Maps Link)
         ↓
RESPONDER RECEIVES ALERT (Real-Time Push via Socket.IO)
         ↓
LOCATION & PRIORITY REVIEWED (Interactive Leaflet Map & AI Triage)
         ↓
RESPONSE COORDINATED (Dispatch Units: Police, Ambulance, Fire)
         ↓
    CASE RESOLVED (Timestamped Audit History)
```

---

## ⚡ Technology Stack

- **Frontend**: React 18, Vite, TypeScript/JavaScript, Tailwind CSS, Lucide React, Framer Motion
- **Map & Telemetry**: Leaflet, React-Leaflet, OpenStreetMap, HTML5 High-Accuracy Geolocation API
- **Backend**: Node.js, Express.js, Socket.IO (zero-latency responder broadcasts), JWT Authentication, Bcrypt
- **Database**: PostgreSQL 16 (13 normalized relational tables), Pool connection manager
- **AI Priority Engine**: Multi-vector emergency scoring (0–99 scale), distress categorization, urgency window analysis, transparent explanation
- **Emergency Notifications**: Twilio SMS API with asynchronous retry queue and Development Simulation Provider
- **Offline Resiliency**: `localStorage` emergency event queue with idempotency keys and automatic online synchronization

---

## 🚀 Live Services & Ports

| Component | Target URL / Port | Status |
|---|---|---|
| **Frontend Web App** | `http://localhost:5173` | Active (Vite Dev Server) |
| **Backend REST Core** | `http://localhost:5000` | Active (Express + Socket.IO) |
| **PostgreSQL Database** | `localhost:5432` (`aegisnet`) | Active (PostgreSQL 16) |
| **Health Check API** | `http://localhost:5000/api/v1/health` | `200 OK` |
| **Responder Command** | `http://localhost:5173/dashboard` | Active |

---

## 🔑 Demo Login Credentials

The database has been seeded with realistic Indian demonstration profiles (Coimbatore, Chennai, Madurai, Tiruppur, Salem, Bengaluru, Kochi):

| Role | Email Address | Password | Features / Access |
|---|---|---|---|
| **🛡️ Citizen** | `citizen.aarav1@aegisnet.org` | `UserPass123!` | 3s SOS activation, 5 trusted contacts, medical profile, incident tracking |
| **🚨 Responder** | `responder.police1@aegisnet.org` | `ResponderPass123!` | Tactical Leaflet map, live Socket.IO incident feed, unit dispatching |
| **⚡ Administrator**| `admin@aegisnet.org` | `AdminPass123!` | System-wide incident queue, user roster, audit logs, external alert controls |

*Note: 1-click test chips are available on the AegisNet landing page for instant one-click login.*

---

## 📋 Key Modules & Features

### 1. 3-Second Press-and-Hold SOS Button
- Visual animated SVG countdown ring (3s countdown)
- Haptic feedback pattern (`navigator.vibrate([200, 100, 200])`)
- Automatic cancel upon early release
- High-accuracy GPS capture with 5-second timeout and manual coordinate fallback
- Idempotency key protection to eliminate duplicate emergency submissions

### 2. Trusted Emergency Contacts (Max 5)
- Priority order management (#1 to #5) with Up/Down reordering
- Strict phone number format validation
- Duplicate phone prevention
- Explicit user authorization verification checkbox

### 3. Emergency Medical Profile
- Confidential medical telemetry: Blood group, allergies, current medications, chronic conditions
- First responder field instructions (e.g. inhaler location, language preferences)

### 4. Asynchronous SMS Broadcast Engine
- Generates verified Google Maps link: `https://www.google.com/maps?q=LAT,LNG`
- Dispatches emergency alerts to all registered contacts
- Development provider mode: records simulated messages with transparent label `[SIMULATED SMS - DEV PROVIDER]`
- Unblocked incident creation: SMS failures are isolated from emergency record creation

### 5. Responder Command Center (`/dashboard`)
- Real-time dark command interface
- Top metric cards: Total SOS alerts, Active incidents, Critical incidents, In-Progress dispatches, Resolved cases
- Tactical Leaflet map with priority pins, severity pulse rings, and coordinate popups
- Live Socket.IO event feed (`new_sos_incident`, `incident_status_changed`, `unit_dispatched`)
- One-click responder actions: Update Status (`Acknowledged`, `In Progress`, `Resolved`, `Closed`) & Unit Dispatching

### 6. AI Multi-Factor Priority Scoring
- Analyzes distress category, description keywords, speed, and altitude
- Assigns priority: `Critical`, `High`, `Medium`, or `Low` (Score: 0–99)
- Renders explainable guidance; final operational decisions remain with authorized human responders

---

## 🛠️ Quick Start Guide

### 1. Database Setup
```bash
# Ensure PostgreSQL 16 is running on localhost:5432
# Create database aegisnet
createdb -U postgres aegisnet

# Seed initial demonstration accounts and 100 historical incidents
cd backend
node seeder.js
```

### 2. Start Backend Core
```bash
cd backend
npm install
node server.js
# Backend listening on http://127.0.0.1:5000
```

### 3. Start Frontend
```bash
cd frontend
npm install
npm run dev
# Frontend live on http://127.0.0.1:5173
```
