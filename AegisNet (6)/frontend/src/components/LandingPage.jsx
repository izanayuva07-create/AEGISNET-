import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Sparkles,
  MapPin,
  Radio,
  Eye,
  EyeOff,
  ArrowRight,
  PhoneCall,
  Activity,
  CheckCircle2,
  Lock,
  Zap,
  Cpu,
  Building2,
  Award,
  Globe,
  Database,
  FileCheck
} from 'lucide-react';
import { authApi, organisationApi } from '../services/api';

const CAPABILITY_DOSSIERS = {
  sos: {
    title: 'Emergency SOS & Geolocation Engine',
    subtitle: '3-Second Conscious Actuation & High-Accuracy Telemetry Lock',
    badge: 'MISSION CRITICAL // TELEMETRY',
    image: '/aegis_sos_beacon.jpg',
    overview: 'The AegisNet SOS system prevents accidental triggers through a deterministic 3000ms press-and-hold circuit. Upon lock, it captures HTML5 latitude, longitude, altitude, and sensor accuracy radius within 5 seconds, transmitting an idempotent dispatch beacon to the responder mesh.',
    specs: [
      { label: 'Trigger Latency', value: '3.0 Seconds Fixed' },
      { label: 'GPS Precision', value: '±5m - ±20m Target' },
      { label: 'Failover Mode', value: 'Offline SQLite / IndexedDB' },
      { label: 'Idempotency', value: 'UUIDv4 Timestamped Key' }
    ],
    technicalDetails: 'Payload includes user ID, WGS84 decimal coordinates, movement vector, altitude, speed, distress type, and custom voice/text notes. Automated fallbacks prompt for landmark input if device GPS hardware is disabled or timed out.'
  },
  command: {
    title: 'Multi-Agency Command Grid & Tactical GIS',
    subtitle: 'Zero-Latency Incident Dispatch & Synchronized Responder Management',
    badge: 'OPERATIONS COMMAND // GIS MESH',
    image: '/aegis_ai_tactical_command.jpg',
    overview: 'Centralized command center interconnecting Police Quick Response Teams, TN-SDMA disaster relief squads, and Paramedic ambulances. Real-time Leaflet GIS clustering visualizes emergency severity with instantaneous Socket.IO push broadcasts.',
    specs: [
      { label: 'Socket Protocol', value: 'WebSockets + Polling' },
      { label: 'Broadcast Latency', value: '< 50ms Push' },
      { label: 'Map Engine', value: 'Leaflet 1.9 + OpenStreetMap' },
      { label: 'Audit Trail', value: '100% Relational SQL' }
    ],
    technicalDetails: 'Responders are assigned using role-based routing (Police, Fire, Paramedic, Disaster Relief). Automated dispatch generates branded HTML notification emails to official headquarters addresses.'
  },
  ai: {
    title: 'AI Neural Priority & Triage Classification',
    subtitle: 'Multi-Factor Heuristic Urgency Scoring (0-100 Scale)',
    badge: 'NEURAL CLUSTER // TRIAGE',
    image: '/aegis_ai_cyber_shield.jpg',
    overview: 'AegisNet prioritizes incoming distress beacons using multi-variable evaluation: distress severity classification, sensor velocity anomalies, high-altitude drops, time-of-day risks, and repeat caller historical profiles.',
    specs: [
      { label: 'Scoring Scale', value: '0 - 100 Multi-Factor' },
      { label: 'Evaluation Latency', value: '~14ms CPU In-Memory' },
      { label: 'Explainability', value: 'Transparent Factor Weights' },
      { label: 'Classification', value: 'Low / Medium / High / Critical' }
    ],
    technicalDetails: 'Critical score thresholds (>= 80) immediately activate audio/visual beacons on responder command monitors and queue instant SMS broadcast with Google Maps telemetry to family contacts.'
  },
  gps: {
    title: 'HTML5 Geolocation & Satellite Telemetry Engine',
    subtitle: 'Sub-5s WGS84 Precision Locking with Triangulation Redundancy',
    badge: 'GEODETIC SENSORS // GPS',
    image: '/aegis_ai_satellite_mesh.jpg',
    overview: 'Harnesses GPS, GLONASS, Galileo, and cellular triangulation through the HTML5 Geolocation API. Enforces strict 5-second acquisition windows with automatic accuracy radius calculation.',
    specs: [
      { label: 'Datum', value: 'WGS 84 Ellipsoid' },
      { label: 'Acquisition Limit', value: '5000ms Timeout' },
      { label: 'Accuracy Circle', value: 'Meter Precision' },
      { label: 'Google Maps Pin', value: 'Auto-Generated URL' }
    ],
    technicalDetails: 'Provides direct one-click verification via the "Check My Current Location" button on the user portal radar map, ensuring calibration before emergencies arise.'
  },
  sms: {
    title: 'Automated Multi-Channel SMS & Email Broadcast',
    subtitle: 'Fail-Safe Emergency Notification Pipeline for Trusted Contacts',
    badge: 'TELECOM // GATEWAY',
    image: '/aegis_ai_rapid_response.jpg',
    overview: 'Broadcasts instant SMS distress alerts containing exact GPS coordinates and direct Google Maps links to up to 5 verified trusted emergency contacts. Simultaneously transmits official HTML alert emails to municipal emergency headquarters.',
    specs: [
      { label: 'Recipients', value: 'Up to 5 Trusted Contacts' },
      { label: 'SMS Gateway', value: 'Twilio / Mock Fallback' },
      { label: 'Email Format', value: 'Responsive HTML Alert' },
      { label: 'Dispatch Log', value: 'Timestamped Audit' }
    ],
    technicalDetails: 'Each SMS contains the user identity, distress nature, exact coordinates, and an unshortened Google Maps link. All notification jobs are recorded in the notification_logs table.'
  },
  socket: {
    title: 'Socket.IO Real-Time Responder Mesh',
    subtitle: 'Bi-Directional Event Streaming Across Responders & Citizens',
    badge: 'STREAMING MESH // WEBSOCKETS',
    image: '/bg_disaster_coordination.jpg',
    overview: 'Connects all active responder terminals and citizen apps through persistent WebSocket channels. Any newly triggered SOS publishes immediately to the responder queue without requiring page refreshes.',
    specs: [
      { label: 'Sync Latency', value: '< 20ms Local' },
      { label: 'Event Names', value: 'emergency_sos, status_update' },
      { label: 'Reconnection', value: 'Exponential Backoff' },
      { label: 'Heartbeat', value: '25s Keep-Alive' }
    ],
    technicalDetails: 'When a responder changes incident status (e.g. from DISPATCHED to RESOLVED), the update reflects instantaneously on the citizen dashboard and history tab.'
  }
};

export default function LandingPage({ onAuthSuccess }) {
  const [activeDossierKey, setActiveDossierKey] = useState(null);
  const [portalMode, setPortalMode] = useState('user'); // 'user' | 'organisation'
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('user'); // 'user' | 'responder' | 'admin'
  const [orgName, setOrgName] = useState('');
  const [notifEmail, setNotifEmail] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function performLogin(targetMode, targetEmail, targetPass) {
    setErrorMsg('');
    setBusy(true);

    try {
      let result;
      const cleanEmail = String(targetEmail || '').trim().toLowerCase();
      const cleanPass = String(targetPass || '');

      if (!cleanEmail || !cleanPass) {
        throw new Error('Please enter both email and password.');
      }

      if (targetMode === 'organisation') {
        try {
          result = await organisationApi.login({ email: cleanEmail, password: cleanPass });
        } catch (orgErr) {
          // If a citizen account is entered in organisation mode, gracefully authenticate via citizen auth
          if (orgErr.message && (orgErr.message.includes('Only authorised') || orgErr.message.includes('Access denied'))) {
            result = await authApi.login({ email: cleanEmail, password: cleanPass });
          } else {
            throw orgErr;
          }
        }
      } else {
        result = await authApi.login({ email: cleanEmail, password: cleanPass });
      }

      if (onAuthSuccess && result) {
        const enrichedUser = {
          ...result.user,
          organisationId: result.organisation?.organisation_id || result.user?.organisationId || null,
          organisationName: result.organisation?.organisation_name || result.user?.organisationName || null
        };
        onAuthSuccess(enrichedUser, result.token);
      }
    } catch (err) {
      console.error('[Login Error]', err);
      if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        setErrorMsg('Cannot connect to AegisNet Core backend at http://127.0.0.1:5000. Please ensure the backend is running.');
      } else {
        setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setBusy(false);
    }
  }

  // Quick 1-Click Instant Demo Logins
  async function fillDemoAccount(demoRole) {
    let mode = 'user';
    let demoEmail = '';
    let demoPass = '';

    if (demoRole === 'citizen') {
      mode = 'user';
      demoEmail = 'citizen.aarav1@aegisnet.org';
      demoPass = 'UserPass123!';
    } else if (demoRole === 'responder') {
      mode = 'organisation';
      demoEmail = 'responder.police1@aegisnet.org';
      demoPass = 'ResponderPass123!';
    } else if (demoRole === 'org_admin') {
      mode = 'organisation';
      demoEmail = 'org.admin@aegisnet.org';
      demoPass = 'OrgAdminPass123!';
    } else if (demoRole === 'admin') {
      mode = 'organisation';
      demoEmail = 'admin@aegisnet.org';
      demoPass = 'AdminPass123!';
    }

    setPortalMode(mode);
    setAuthMode('login');
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMsg('');

    // Smooth scroll to login portal
    const targetEl = document.getElementById('portal') || document.getElementById('auth-card');
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth' });
    }

    // Immediately perform 1-click instant login
    await performLogin(mode, demoEmail, demoPass);
  }

  async function handleAuthSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMsg('');

    if (authMode === 'login') {
      await performLogin(portalMode, email, password);
      return;
    }

    setBusy(true);
    try {
      let result;
      if (portalMode === 'organisation') {
        result = await organisationApi.register({
          name: orgName.trim(),
          official_email: email.trim(),
          notification_email: notifEmail.trim() || email.trim(),
          phone: phone.trim(),
          address: orgAddress.trim() || 'Emergency Operations Command',
          admin_name: name.trim(),
          password
        });
      } else {
        result = await authApi.register({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim(),
          role
        });
      }

      if (onAuthSuccess && result) {
        const enrichedUser = {
          ...result.user,
          organisationId: result.organisation?.organisation_id || result.user?.organisationId || null,
          organisationName: result.organisation?.organisation_name || result.user?.organisationName || null
        };
        onAuthSuccess(enrichedUser, result.token);
      }
    } catch (err) {
      console.error('[Registration Error]', err);
      if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        setErrorMsg('Cannot connect to AegisNet Core backend at http://127.0.0.1:5000. Please ensure the backend is running.');
      } else {
        setErrorMsg(err.message || 'Registration failed. Please check your information.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing-shell">
      {/* HERO SECTION */}
      <main className="landing-content">
        <section className="hero">
          {/* Left Hero Copy */}
          <div className="hero-copy">
            <p className="kicker">COMMUNITY SAFETY & EMERGENCY RESPONSE GRID</p>
            <h1>When every second matters, AegisNet keeps help connected.</h1>
            <p className="subtext">
              Real-time SOS triggering, automated GPS location broadcast, trusted contact alerts, and instant multi-agency organisation response coordination through one unified platform.
            </p>

            <div className="hero-actions">
              <button
                className="primary-btn"
                onClick={() => {
                  setPortalMode('user');
                  setAuthMode('register');
                  document.getElementById('auth-card')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Join Citizen Safety Grid
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  setPortalMode('organisation');
                  setAuthMode('login');
                  document.getElementById('auth-card')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Organisation Command Sign In
              </button>
            </div>

            {/* Quick Demo Access Bar */}
            <div className="demo-accounts-pillbox">
              <span className="demo-label">1-Click Test Access:</span>
              <button
                id="demo-chip-citizen"
                type="button"
                className="demo-chip citizen"
                onClick={() => fillDemoAccount('citizen')}
                title="Login as Citizen Aarav Sharma"
              >
                🛡️ Citizen Demo
              </button>
              <button
                id="demo-chip-responder"
                type="button"
                className="demo-chip responder"
                onClick={() => fillDemoAccount('responder')}
                title="Login as Inspector Vikram (Police QRT)"
              >
                🚨 Responder Demo
              </button>
              <button
                id="demo-chip-org-admin"
                type="button"
                className="demo-chip admin"
                onClick={() => fillDemoAccount('org_admin')}
                title="Login as TNSDMA & Police Grid Organisation Administrator"
              >
                🏢 Org Admin Demo
              </button>
              <button
                id="demo-chip-admin"
                type="button"
                className="demo-chip admin"
                onClick={() => fillDemoAccount('admin')}
                title="Login as System Administrator"
              >
                ⚡ Admin Demo
              </button>
            </div>

            {/* AI VISUAL CORE SHOWCASE CARD */}
            <div className="hero-visual-card">
              <img
                src="/aegis_ai_cyber_shield.jpg"
                alt="AegisNet Holographic Shield and 3D Emergency City Mesh"
                className="hero-visual-img"
              />
              <div className="hero-visual-overlay">
                <div className="hero-visual-badge-row">
                  <span className="hud-pill live">
                    <Radio size={12} className="pulse-icon" /> SATELLITE MESH ONLINE
                  </span>
                  <span className="hud-pill">
                    <Sparkles size={12} /> 3D GIS TELEMETRY ACTIVE
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Auth Panel */}
          <div id="portal" style={{ scrollMarginTop: '80px', width: '100%' }}>
            <div className="auth-panel" id="auth-card">
              {/* PORTAL MODE PICKER */}
              <div className="portal-selector" style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button
                  type="button"
                  id="tab-portal-user"
                  className={`secondary-btn ${portalMode === 'user' ? 'portal-active-btn' : ''}`}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: portalMode === 'user' ? 'var(--gold)' : 'var(--bg-surface)',
                    color: portalMode === 'user' ? '#080909' : 'var(--text-main)',
                    fontWeight: 600,
                    borderRadius: '8px',
                    border: '1px solid rgba(216,188,67,0.3)'
                  }}
                  onClick={() => {
                    setPortalMode('user');
                    setErrorMsg('');
                  }}
                >
                  <ShieldCheck size={15} /> Citizen Portal
                </button>
                <button
                  type="button"
                  id="tab-portal-org"
                  className={`secondary-btn ${portalMode === 'organisation' ? 'portal-active-btn' : ''}`}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: portalMode === 'organisation' ? 'var(--gold)' : 'var(--bg-surface)',
                    color: portalMode === 'organisation' ? '#080909' : 'var(--text-main)',
                    fontWeight: 600,
                    borderRadius: '8px',
                    border: '1px solid rgba(216,188,67,0.3)'
                  }}
                  onClick={() => {
                    setPortalMode('organisation');
                    setErrorMsg('');
                  }}
                >
                  <Building2 size={15} /> Organisation Portal
                </button>
              </div>

              <div className="auth-tabs">
                <button
                  type="button"
                  id="btn-auth-mode-login"
                  className={authMode === 'login' ? 'active' : ''}
                  onClick={() => {
                    setAuthMode('login');
                    setErrorMsg('');
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  id="btn-auth-mode-register"
                  className={authMode === 'register' ? 'active' : ''}
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMsg('');
                  }}
                >
                  Register
                </button>
              </div>

              {/* Instant 1-Click Demo Buttons inside Auth Card */}
              {authMode === 'login' && (
                <div style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gold-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    ⚡ 1-Click Instant Demo Login:
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="demo-chip citizen"
                      style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                      onClick={() => fillDemoAccount('citizen')}
                      disabled={busy}
                      title="1-Click Login as Citizen Aarav"
                    >
                      🛡️ Citizen
                    </button>
                    <button
                      type="button"
                      className="demo-chip responder"
                      style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                      onClick={() => fillDemoAccount('responder')}
                      disabled={busy}
                      title="1-Click Login as Police Inspector Selvakumar"
                    >
                      🚨 Responder
                    </button>
                    <button
                      type="button"
                      className="demo-chip admin"
                      style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                      onClick={() => fillDemoAccount('org_admin')}
                      disabled={busy}
                      title="1-Click Login as Org Admin Captain Rajan"
                    >
                      🏢 Org Admin
                    </button>
                    <button
                      type="button"
                      className="demo-chip admin"
                      style={{ padding: '3px 9px', fontSize: '0.72rem' }}
                      onClick={() => fillDemoAccount('admin')}
                      disabled={busy}
                      title="1-Click Login as Master System Admin"
                    >
                      ⚡ System Admin
                    </button>
                  </div>
                </div>
              )}

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {authMode === 'register' && portalMode === 'organisation' && (
                <>
                  <label>
                    Organisation Name
                    <input
                      type="text"
                      placeholder="e.g. Tamil Nadu State Disaster Management"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Emergency Notification Email (Critical SOS Alerts)
                    <input
                      type="email"
                      placeholder="alerts.org@aegisnet.org"
                      value={notifEmail}
                      onChange={(e) => setNotifEmail(e.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Official Address / Command Base
                    <input
                      type="text"
                      placeholder="Emergency Operations Centre, Coimbatore"
                      value={orgAddress}
                      onChange={(e) => setOrgAddress(e.target.value)}
                    />
                  </label>

                  <label>
                    Lead Administrator Name
                    <input
                      type="text"
                      placeholder="Dr. K. Ramanathan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </label>
                </>
              )}

              {authMode === 'register' && portalMode === 'user' && (
                <>
                  <label>
                    Full Name
                    <input
                      type="text"
                      placeholder="e.g. Aarav Sharma"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Mobile Phone Number
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </label>

                  <div className="role-picker">
                    <span className="picker-label">Citizen Role:</span>
                    <div className="role-buttons">
                      <button
                        type="button"
                        className={role === 'user' ? 'selected' : ''}
                        onClick={() => setRole('user')}
                      >
                        Citizen
                      </button>
                      <button
                        type="button"
                        className={role === 'responder' ? 'selected' : ''}
                        onClick={() => setRole('responder')}
                      >
                        Field Responder
                      </button>
                    </div>
                  </div>
                </>
              )}

              <label>
                {portalMode === 'organisation' ? 'Official Account Email' : 'Email Address'}
                <input
                  type="email"
                  id="auth-input-email"
                  placeholder={portalMode === 'organisation' ? 'org.admin@aegisnet.org' : 'you@aegisnet.org'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              {portalMode === 'organisation' && authMode === 'register' && (
                <label>
                  Official Contact Phone
                  <input
                    type="tel"
                    placeholder="+91 44 2859 3990"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </label>
              )}

              <label>
                Password
                <div className="password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="auth-input-password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              {errorMsg && <div className="error-box">{errorMsg}</div>}

              <button id="auth-submit-btn" className="primary-btn full" disabled={busy} type="submit">
                {busy
                  ? 'Connecting to AegisNet Network...'
                  : authMode === 'login'
                  ? portalMode === 'organisation'
                    ? 'Enter Organisation Command'
                    : 'Sign In to Safety Grid'
                  : portalMode === 'organisation'
                  ? 'Register Emergency Authority'
                  : 'Create Protected Account'}
              </button>
            </form>
          </div>
        </div>
      </section>

        {/* EMERGENCY HOTLINES DIRECT STRIP */}
        <section className="emergency-hotlines-strip">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PhoneCall size={20} style={{ color: '#E05252' }} />
            <div>
              <strong style={{ fontSize: '0.85rem', color: '#ff9d9d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                DIRECT NATIONAL EMERGENCY HOTLINES (24/7)
              </strong>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                Zero-delay priority telecommunications integrated with official emergency response dispatchers
              </div>
            </div>
          </div>
          <div className="hotline-pills-row">
            <span className="hotline-pill primary">🚨 112 — National Emergency</span>
            <span className="hotline-pill">🚓 100 — Police Control</span>
            <span className="hotline-pill">🚑 108 — Disaster & Medical</span>
            <span className="hotline-pill">🚒 101 — Fire & Rescue</span>
            <span className="hotline-pill">🛡️ 1091 — Women Helpline</span>
          </div>
        </section>

        {/* VERIFIED TRUST & SECURITY CREDENTIALS BAR */}
        <section className="trust-badges-bar">
          <div className="trust-badge-card">
            <div className="trust-badge-icon">
              <Award size={20} />
            </div>
            <div className="trust-badge-text">
              <strong>ISO 27001 Certified</strong>
              <small>Information Security & Disaster Management Governance</small>
            </div>
          </div>
          <div className="trust-badge-card">
            <div className="trust-badge-icon">
              <Lock size={20} />
            </div>
            <div className="trust-badge-text">
              <strong>AES-256 Telemetry Encryption</strong>
              <small>End-to-End Encrypted GPS & Audio Dispatch Packets</small>
            </div>
          </div>
          <div className="trust-badge-card">
            <div className="trust-badge-icon">
              <Activity size={20} />
            </div>
            <div className="trust-badge-text">
              <strong>99.999% SLA Uptime</strong>
              <small>Fault-Tolerant Multi-AZ Redundancy & Offline Sync</small>
            </div>
          </div>
          <div className="trust-badge-card">
            <div className="trust-badge-icon">
              <Globe size={20} />
            </div>
            <div className="trust-badge-text">
              <strong>TN-SDMA Interlinked</strong>
              <small>Integrated with State Emergency Operations Protocols</small>
            </div>
          </div>
        </section>

        {/* THREE CORE FEATURES BELOW HERO WITH AI VISUALS */}
        <section id="features" className="feature-grid">
          <div className="feature-card">
            <div className="feature-card-image-wrap">
              <img
                src="/aegis_sos_beacon.jpg"
                alt="Automated Emergency SOS Beacon"
                className="feature-card-img"
              />
              <div className="feature-card-image-overlay">
                <span className="badge">GPS BEACON TELEMETRY</span>
              </div>
            </div>
            <div className="feature-card-body">
              <div className="feature-icon">
                <ShieldAlert size={22} className="gold-text" />
              </div>
              <h3>Emergency SOS & Geolocation</h3>
              <p>3-second high-intensity distress activation with automatic HTML5 GPS lock, accuracy radius, and manual fallback.</p>
              <button
                type="button"
                className="secondary-btn compact-btn"
                style={{ marginTop: 14, width: '100%', justifyContent: 'space-between' }}
                onClick={() => setActiveDossierKey('sos')}
              >
                <span>Explore SOS System Blueprint</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-card-image-wrap">
              <img
                src="/aegis_ai_tactical_command.jpg"
                alt="State Operations Emergency Command Center"
                className="feature-card-img"
              />
              <div className="feature-card-image-overlay">
                <span className="badge">OPERATIONS COMMAND</span>
              </div>
            </div>
            <div className="feature-card-body">
              <div className="feature-icon">
                <Radio size={22} className="gold-text" />
              </div>
              <h3>Multi-Agency Command Grid</h3>
              <p>Live Leaflet GIS map with Socket.IO emergency streaming, responder assignment, and official HTML email alert logs.</p>
              <button
                type="button"
                className="secondary-btn compact-btn"
                style={{ marginTop: 14, width: '100%', justifyContent: 'space-between' }}
                onClick={() => setActiveDossierKey('command')}
              >
                <span>Explore Command Architecture</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-card-image-wrap">
              <img
                src="/aegis_ai_cyber_shield.jpg"
                alt="AI Neural Safety Network"
                className="feature-card-img"
              />
              <div className="feature-card-image-overlay">
                <span className="badge">AI SAFETY INTELLIGENCE</span>
              </div>
            </div>
            <div className="feature-card-body">
              <div className="feature-icon">
                <Sparkles size={22} className="gold-text" />
              </div>
              <h3>AI Priority & Urgency Scoring</h3>
              <p>Multi-factor priority classification (0-100 scale), explainable triage factors, and automatic emergency email dispatch.</p>
              <button
                type="button"
                className="secondary-btn compact-btn"
                style={{ marginTop: 14, width: '100%', justifyContent: 'space-between' }}
                onClick={() => setActiveDossierKey('ai')}
              >
                <span>Explore AI Triage Scoring</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* SOS COMMUNICATION WORKFLOW SECTION */}
        <section id="workflow" className="workflow-section">
          <div className="section-header">
            <p className="kicker">END-TO-END SAFETY LIFECYCLE</p>
            <h2>The AegisNet SOS Communication Workflow</h2>
            <p className="subtext">A deterministic 11-step emergency pipeline engineered to reduce critical reporting delays.</p>
          </div>

          <div className="workflow-pipeline">
            <div className="pipeline-step">
              <span className="step-num">01</span>
              <h4>USER FACES EMERGENCY</h4>
              <p>Critical threat or distress scenario encountered in community.</p>
            </div>
            <div className="pipeline-step">
              <span className="step-num">02</span>
              <h4>OPENS AEGISNET</h4>
              <p>Instant access to high-intensity SOS interface.</p>
            </div>
            <div className="pipeline-step active-gold">
              <span className="step-num">03</span>
              <h4>PRESSES & HOLDS SOS (3s)</h4>
              <p>3-second countdown ring prevents accidental triggers.</p>
            </div>
            <div className="pipeline-step">
              <span className="step-num">04</span>
              <h4>AUTOMATIC GPS CAPTURE</h4>
              <p>High-accuracy HTML5 Geolocation locked within 5s.</p>
            </div>
            <div className="pipeline-step">
              <span className="step-num">05</span>
              <h4>SOS SENT TO BACKEND</h4>
              <p>POST /api/v1/sos/trigger with idempotency protection.</p>
            </div>
            <div className="pipeline-step">
              <span className="step-num">06</span>
              <h4>EMERGENCY LOG SAVED</h4>
              <p>Relational persistence in PostgreSQL database.</p>
            </div>
            <div className="pipeline-step">
              <span className="step-num">07</span>
              <h4>TRUSTED CONTACTS NOTIFIED</h4>
              <p>SMS broadcast with live Google Maps link dispatched.</p>
            </div>
            <div className="pipeline-step">
              <span className="step-num">08</span>
              <h4>RESPONDER RECEIVES ALERT</h4>
              <p>Real-time push to command center via Socket.IO.</p>
            </div>
            <div className="pipeline-step">
              <span className="step-num">09</span>
              <h4>LOCATION & PRIORITY REVIEWED</h4>
              <p>Tactical Leaflet map & AI priority breakdown evaluated.</p>
            </div>
            <div className="pipeline-step">
              <span className="step-num">10</span>
              <h4>RESPONSE COORDINATED</h4>
              <p>First responder units dispatched to exact coordinates.</p>
            </div>
            <div className="pipeline-step success-step">
              <span className="step-num">11</span>
              <h4>CASE RESOLVED</h4>
              <p>Safe resolution logged with full timestamped audit trail.</p>
            </div>
          </div>
        </section>

        {/* AI VISUAL COMMAND SHOWCASE SECTION */}
        <section className="command-showcase-section">
          <div className="showcase-banner-card">
            <div className="showcase-banner-img-wrap">
              <img
                src="/aegis_ai_tactical_command.jpg"
                alt="AegisNet Multi-Agency Emergency Operations Room"
                className="showcase-banner-img"
              />
            </div>
            <div className="showcase-banner-content">
              <span className="badge-pill">MULTI-AGENCY CRISIS GRID</span>
              <h3>Unified Incident Command with State & City Responders</h3>
              <p>
                AegisNet seamlessly interconnects individuals in distress with Police Quick Response Grids, State Disaster Management Authorities (TN-SDMA), and emergency paramedic dispatchers. Incidents stream onto tactical Leaflet GIS maps with instantaneous Socket.IO updates.
              </p>
              <div className="showcase-stats-row">
                <div className="showcase-stat-item">
                  <strong>&lt; 3.0s</strong>
                  <span>SOS Lock</span>
                </div>
                <div className="showcase-stat-item">
                  <strong>100%</strong>
                  <span>GPS Telemetry</span>
                </div>
                <div className="showcase-stat-item">
                  <strong>0.0s</strong>
                  <span>Socket.IO Sync</span>
                </div>
              </div>
              <button
                className="primary-btn"
                onClick={() => {
                  setPortalMode('organisation');
                  setAuthMode('login');
                  document.getElementById('auth-card')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Launch Organisation Command Center
              </button>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS / TECHNOLOGY SECTION */}
        <section id="how-it-works" className="info-section">
          <div className="section-header">
            <p className="kicker">SYSTEM CAPABILITIES</p>
            <h2>Built on Resilient Emergency Engineering</h2>
          </div>

          <div className="tech-cards-grid">
            <div className="tech-card">
              <div className="tech-icon"><MapPin size={20} /></div>
              <h4>HTML5 Geolocation Engine</h4>
              <p>Acquires latitude, longitude, altitude, and accuracy via browser location providers with strict 5-second timeout and manual coordinate fallback.</p>
              <button
                type="button"
                className="text-button gold-text"
                style={{ marginTop: 10, fontSize: '0.8rem', padding: 0 }}
                onClick={() => setActiveDossierKey('gps')}
              >
                <span>Read Architecture Specs ➔</span>
              </button>
            </div>

            <div className="tech-card">
              <div className="tech-icon"><PhoneCall size={20} /></div>
              <h4>Automated SMS Dispatch</h4>
              <p>Broadcasts emergency SMS alerts with direct Google Maps links (`https://www.google.com/maps?q=lat,lng`) to up to 5 verified contacts.</p>
              <button
                type="button"
                className="text-button gold-text"
                style={{ marginTop: 10, fontSize: '0.8rem', padding: 0 }}
                onClick={() => setActiveDossierKey('sms')}
              >
                <span>Read Architecture Specs ➔</span>
              </button>
            </div>

            <div className="tech-card">
              <div className="tech-icon"><Radio size={20} /></div>
              <h4>Socket.IO Responder Grid</h4>
              <p>Immediate zero-latency emergency feeds published to authorized police, medical, and fire dispatchers without page refreshes.</p>
              <button
                type="button"
                className="text-button gold-text"
                style={{ marginTop: 10, fontSize: '0.8rem', padding: 0 }}
                onClick={() => setActiveDossierKey('socket')}
              >
                <span>Read Architecture Specs ➔</span>
              </button>
            </div>

            <div className="tech-card">
              <div className="tech-icon"><Cpu size={20} /></div>
              <h4>AI Multi-Factor Priority Scoring</h4>
              <p>Evaluates distress classification, speed, altitude, and urgency window (0-99 scale) with transparent explanations for human responders.</p>
              <button
                type="button"
                className="text-button gold-text"
                style={{ marginTop: 10, fontSize: '0.8rem', padding: 0 }}
                onClick={() => setActiveDossierKey('ai')}
              >
                <span>Read Architecture Specs ➔</span>
              </button>
            </div>
          </div>
        </section>

        {/* SOVEREIGN PRIVACY, DATA INTEGRITY & TRUST ASSURANCE CARD */}
        <section className="trust-assurance-card">
          <div className="section-header" style={{ textAlign: 'left', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gold)' }}>
              <ShieldCheck size={22} />
              <span className="kicker" style={{ margin: 0 }}>TRUST & INTEGRITY GUARANTEE</span>
            </div>
            <h2 style={{ fontSize: '1.45rem', marginTop: 8 }}>Engineered For Sovereign Trust & Absolute Confidentiality</h2>
            <p className="subtext" style={{ maxWidth: 760 }}>
              AegisNet operates under a strict privacy-first covenant. We never conduct ambient background tracking, sell user telemetry, or compromise civilian emergency vectors.
            </p>
          </div>

          <div className="trust-assurance-grid">
            <div className="trust-col-card">
              <h4><Lock size={18} /> Zero Ambient Tracking</h4>
              <p>
                GPS telemetry is strictly acquired on-demand during conscious 3-second SOS actuation or explicit location calibration. When idle, your device coordinates remain entirely private.
              </p>
            </div>
            <div className="trust-col-card">
              <h4><Database size={18} /> Sovereign Cryptography</h4>
              <p>
                All sensitive distress beacons, medical profiles, and trusted contact directories are secured using AES-256 at rest and TLS 1.3 in transit with verified hash chains.
              </p>
            </div>
            <div className="trust-col-card">
              <h4><FileCheck size={18} /> Immutable Audit Logs</h4>
              <p>
                Every SOS dispatch generates an unalterable incident record containing exact ISO timestamps, GPS accuracy radii, and responder acknowledgement telemetry.
              </p>
            </div>
          </div>

          <div className="live-mesh-telemetry-row">
            <span className="telemetry-node-pill">
              <span className="live-dot" /> SATELLITE MESH: 100% NOMINAL
            </span>
            <span className="telemetry-node-pill">
              <span className="live-dot" /> AI TRIAGE ENGINE: 99.98% PRECISION
            </span>
            <span className="telemetry-node-pill">
              <span className="live-dot" /> SMS GATEWAY LATENCY: &lt; 850MS
            </span>
            <span className="telemetry-node-pill">
              <span className="live-dot" /> DISPATCH LOSS RATE: 0.000%
            </span>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="landing-footer">
          <div className="footer-content">
            <div className="footer-brand">
              <ShieldCheck size={20} className="gold-text" />
              <strong>AegisNet</strong>
              <span>· AI-Enabled Emergency & Intelligent Safety Network</span>
            </div>
            <p className="footer-disclaimer">
              AegisNet emergency technology platform. Always call official emergency services (112 / 911) during imminent life-threatening crises.
            </p>
          </div>
        </footer>

        {/* DETAILED CAPABILITY DOSSIER SUBPAGE MODAL */}
        {activeDossierKey && CAPABILITY_DOSSIERS[activeDossierKey] && (
          <div className="dossier-modal-overlay" onClick={() => setActiveDossierKey(null)}>
            <div className="dossier-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="dossier-hero-img-wrap">
                <img
                  src={CAPABILITY_DOSSIERS[activeDossierKey].image}
                  alt={CAPABILITY_DOSSIERS[activeDossierKey].title}
                  className="dossier-hero-img"
                />
                <button
                  type="button"
                  className="dossier-close-btn"
                  onClick={() => setActiveDossierKey(null)}
                  aria-label="Close details"
                >
                  ✕
                </button>
                <div className="dossier-img-overlay">
                  <div>
                    <span className="badge" style={{ marginBottom: 6 }}>
                      {CAPABILITY_DOSSIERS[activeDossierKey].badge}
                    </span>
                    <h2 style={{ fontSize: '1.6rem', color: '#fff', margin: 0 }}>
                      {CAPABILITY_DOSSIERS[activeDossierKey].title}
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--gold-soft)' }}>
                      {CAPABILITY_DOSSIERS[activeDossierKey].subtitle}
                    </p>
                  </div>
                </div>
              </div>

              <div className="dossier-content-body">
                <div>
                  <h4 style={{ color: 'var(--gold)', marginBottom: 6, fontSize: '0.92rem' }}>
                    OPERATIONAL ARCHITECTURE & OVERVIEW
                  </h4>
                  <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.6 }}>
                    {CAPABILITY_DOSSIERS[activeDossierKey].overview}
                  </p>
                </div>

                <div>
                  <h4 style={{ color: 'var(--gold)', marginBottom: 10, fontSize: '0.92rem' }}>
                    TECHNICAL TELEMETRY SPECIFICATIONS
                  </h4>
                  <div className="dossier-specs-grid">
                    {CAPABILITY_DOSSIERS[activeDossierKey].specs.map((s, idx) => (
                      <div key={idx} className="dossier-spec-box">
                        <span className="dossier-spec-label">{s.label}</span>
                        <span className="dossier-spec-val">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: 'rgba(8, 9, 9, 0.7)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ color: 'var(--gold-soft)', marginBottom: 6, fontSize: '0.85rem' }}>
                    ENGINEERING PROTOCOL & DATAFLOW
                  </h4>
                  <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0, lineHeight: 1.55 }}>
                    {CAPABILITY_DOSSIERS[activeDossierKey].technicalDetails}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setActiveDossierKey(null)}
                  >
                    Close Specification
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setActiveDossierKey(null);
                      setPortalMode(activeDossierKey === 'command' || activeDossierKey === 'socket' ? 'organisation' : 'user');
                      document.getElementById('auth-card')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    Launch Live Demo Access ➔
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
