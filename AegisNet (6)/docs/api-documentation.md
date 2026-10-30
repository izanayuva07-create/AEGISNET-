# AegisNet REST API & WebSocket Specification

**Base URL**: `http://localhost:5000/api/v1`  
**WebSocket Server**: `ws://localhost:5000` (Socket.IO)

---

## 1. Authentication APIs

### Register Account
`POST /api/v1/auth/register`
```json
{
  "name": "Aarav Sharma",
  "email": "aarav@example.com",
  "password": "Password123!",
  "phone": "+91 98765 43210",
  "role": "user" // "user" | "responder" | "admin"
}
```
**Response**: `201 Created`
```json
{
  "message": "Account registered successfully.",
  "token": "eyJhbGciOi...",
  "user": {
    "id": 16,
    "name": "Aarav Sharma",
    "email": "aarav@example.com",
    "role": "user"
  }
}
```

### Sign In
`POST /api/v1/auth/login`
```json
{
  "email": "aarav@example.com",
  "password": "Password123!"
}
```
**Response**: `200 OK` (returns JWT token and public user profile)

### Get Current Profile
`GET /api/v1/auth/profile`  
*Headers*: `Authorization: Bearer <token>`  
**Response**: `200 OK` (returns user details, emergencyProfile, trusted contacts, responderProfile)

### Update Profile
`PUT /api/v1/auth/profile`  
*Headers*: `Authorization: Bearer <token>`  
**Payload**:
```json
{
  "name": "Aarav Sharma",
  "phone": "+91 98765 43210",
  "blood_group": "O+",
  "allergies": "Penicillin",
  "medications": "Inhaler",
  "medical_notes": "Asthmatic condition",
  "emergency_instructions": "Medication in backpack"
}
```

---

## 2. Trusted Emergency Contacts APIs (Enforces Max 5)

### List Trusted Contacts
`GET /api/v1/contacts`  
*Headers*: `Authorization: Bearer <token>`

### Add Contact
`POST /api/v1/contacts`  
*Headers*: `Authorization: Bearer <token>`
```json
{
  "name": "Dr. K. Raman",
  "phone": "+91 94433 11223",
  "relationship": "Doctor",
  "priority": 1
}
```

### Update Contact
`PUT /api/v1/contacts/:id`

### Delete Contact
`DELETE /api/v1/contacts/:id`

---

## 3. Emergency SOS Dispatch Core

### Trigger SOS Alert
`POST /api/v1/sos/trigger`  
*Headers*: `Authorization: Bearer <token>` (optional for emergency callers)
```json
{
  "user_id": 16,
  "latitude": 11.0168,
  "longitude": 76.9558,
  "altitude": 412,
  "accuracy": 12,
  "timestamp": "2026-10-30T14:30:00.000Z",
  "incident_type": "Medical Distress",
  "description": "Emergency medical assistance required immediately",
  "idempotency_key": "sos-16-1793372560-abcde"
}
```
**Response**: `201 Created`
```json
{
  "ok": true,
  "message": "Emergency SOS activated and recorded in AegisNet.",
  "incident": {
    "id": 102,
    "incident_code": "SOS-2026-70236",
    "incident_type": "Medical Distress",
    "priority": "Critical",
    "status": "Contacts Notified",
    "latitude": 11.0168,
    "longitude": 76.9558,
    "google_maps_url": "https://www.google.com/maps?q=11.016800,76.955800"
  },
  "priorityAnalysis": {
    "score": 92,
    "priority": "Critical",
    "confidence": "94%",
    "explanation": "Critical priority: Medical distress urgency score 92/100."
  },
  "contactsNotifiedCount": 3,
  "notifications": [
    {
      "recipient_name": "Deepa Sharma",
      "recipient_phone": "+91 98421 11223",
      "provider": "[SIMULATED SMS - DEV PROVIDER]",
      "delivery_status": "Delivered (Simulated)"
    }
  ]
}
```

---

## 4. Responder Command Grid APIs

### Get Active Incidents & Metrics
`GET /api/v1/sos/active`  
*Headers*: `Authorization: Bearer <token>` (responder / admin)  
Returns:
- `metrics`: `{ totalAlerts, activeIncidents, criticalIncidents, inProgressIncidents, resolvedIncidents }`
- `incidents`: List of active emergencies sorted by priority (Critical ➔ High ➔ Medium ➔ Low) and timestamp.

### Update Incident Status
`PATCH /api/v1/sos/:id/status`  
*Payload*: `{ "status": "In Progress" | "Resolved" | "Closed", "notes": "..." }`

### Dispatch Emergency Unit
`POST /api/v1/sos/:id/dispatch`  
*Payload*: `{ "unit_dispatched": "Quick Response Team 1", "notes": "ETA 3 mins" }`

---

## 5. Socket.IO Real-Time Dispatch Events

| Event Name | Direction | Payload Description |
|---|---|---|
| `join_responders` | Client ➔ Server | Joins authenticated responder dispatch room |
| `new_sos_incident` | Server ➔ Clients | Real-time push of newly activated SOS event |
| `incident_status_changed` | Server ➔ Clients | Live broadcast of status transition (e.g. In Progress) |
| `unit_dispatched` | Server ➔ Clients | Live broadcast of unit assignment and ETA |
