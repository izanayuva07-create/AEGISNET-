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
  Cpu
} from 'lucide-react';
import { authApi } from '../services/api';

export default function LandingPage({ onAuthSuccess }) {
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('user'); // 'user' | 'responder' | 'admin'
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Quick 1-Click Demo Logins
  function fillDemoAccount(demoRole) {
    if (demoRole === 'citizen') {
      setEmail('citizen.aarav1@aegisnet.org');
      setPassword('UserPass123!');
      setAuthMode('login');
    } else if (demoRole === 'responder') {
      setEmail('responder.police1@aegisnet.org');
      setPassword('ResponderPass123!');
      setAuthMode('login');
    } else if (demoRole === 'admin') {
      setEmail('admin@aegisnet.org');
      setPassword('AdminPass123!');
      setAuthMode('login');
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    setBusy(true);

    try {
      let result;
      if (authMode === 'login') {
        result = await authApi.login({ email: email.trim(), password });
      } else {
        result = await authApi.register({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim(),
          role
        });
      }

      if (onAuthSuccess) {
        onAuthSuccess(result.user, result.token);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
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
            <p className="kicker">COMMUNITY SAFETY COORDINATION</p>
            <h1>When every minute matters, AegisNet keeps help connected.</h1>
            <p className="subtext">
              Report incidents quickly, share your location automatically, notify trusted contacts and connect with emergency responders through one intelligent safety network.
            </p>

            <div className="hero-actions">
              <button
                className="primary-btn"
                onClick={() => {
                  setAuthMode('register');
                  document.getElementById('auth-card')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Create Account
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  setAuthMode('login');
                  document.getElementById('auth-card')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Member Sign In
              </button>
            </div>

            {/* Quick Demo Access Bar */}
            <div className="demo-accounts-pillbox">
              <span className="demo-label">1-Click Test Accounts:</span>
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
                id="demo-chip-admin"
                type="button"
                className="demo-chip admin"
                onClick={() => fillDemoAccount('admin')}
                title="Login as System Administrator"
              >
                ⚡ Admin Demo
              </button>
            </div>
          </div>

          {/* Right Auth Panel */}
          <div className="auth-panel" id="auth-card">
            <div className="auth-tabs">
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('login');
                  setErrorMsg('');
                }}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('register');
                  setErrorMsg('');
                }}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {authMode === 'register' && (
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
                    <span className="picker-label">Account Type:</span>
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
                        Responder
                      </button>
                    </div>
                  </div>
                </>
              )}

              <label>
                Email Address
                <input
                  type="email"
                  placeholder="you@aegisnet.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label>
                Password
                <div className="password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
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
                  ? 'Connecting to AegisNet...'
                  : authMode === 'login'
                  ? 'Sign In to Safety Grid'
                  : 'Create Protected Account'}
              </button>
            </form>
          </div>
        </section>

        {/* THREE CORE FEATURES BELOW HERO */}
        <section id="features" className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <ShieldAlert size={24} className="gold-text" />
            </div>
            <h3>Emergency Response</h3>
            <p>Fast emergency reporting with automatic location sharing and high-accuracy GPS coordinates.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Users size={24} className="gold-text" />
            </div>
            <h3>Trusted Emergency Contacts</h3>
            <p>Notify up to 5 registered emergency contacts instantly with SMS alerts, live map links, and distress details.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Sparkles size={24} className="gold-text" />
            </div>
            <h3>Intelligent Safety Assistant</h3>
            <p>AI-assisted emergency classification, priority analysis, and explainable response guidance.</p>
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
            </div>

            <div className="tech-card">
              <div className="tech-icon"><PhoneCall size={20} /></div>
              <h4>Automated SMS Dispatch</h4>
              <p>Broadcasts emergency SMS alerts with direct Google Maps links (`https://www.google.com/maps?q=lat,lng`) to up to 5 verified contacts.</p>
            </div>

            <div className="tech-card">
              <div className="tech-icon"><Radio size={20} /></div>
              <h4>Socket.IO Responder Grid</h4>
              <p>Immediate zero-latency emergency feeds published to authorized police, medical, and fire dispatchers without page refreshes.</p>
            </div>

            <div className="tech-card">
              <div className="tech-icon"><Cpu size={20} /></div>
              <h4>AI Multi-Factor Priority Scoring</h4>
              <p>Evaluates distress classification, speed, altitude, and urgency window (0-99 scale) with transparent explanations for human responders.</p>
            </div>
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
      </main>
    </div>
  );
}
