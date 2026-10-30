import React from 'react';
import { ShieldCheck, Radio, AlertTriangle, PhoneCall, LogOut, UserCheck, Building2 } from 'lucide-react';

export default function Navbar({ user, onLogout, activeTab, setActiveTab }) {
  const isResponderOrAdmin = user && ['responder', 'admin'].includes(user.role);

  return (
    <header className="landing-header">
      <div className="brand-block" onClick={() => setActiveTab(user ? (isResponderOrAdmin ? 'organisation' : 'sos') : 'landing')} style={{ cursor: 'pointer' }}>
        <div className="brand-mark">
          <ShieldCheck size={20} />
        </div>
        <div>
          <strong style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '0.04em' }}>AegisNet</strong>
          <small>INTELLIGENT SAFETY NETWORK</small>
        </div>
      </div>

      <nav>
        {!user ? (
          <>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#workflow">SOS Workflow</a>
            <button className="primary-btn compact-btn" onClick={() => setActiveTab('auth')}>
              Sign In
            </button>
          </>
        ) : (
          <>
            <button
              id="nav-tab-sos"
              className={`nav-link-btn ${activeTab === 'sos' ? 'active' : ''}`}
              onClick={() => setActiveTab('sos')}
            >
              <AlertTriangle size={15} /> Emergency SOS
            </button>

            <button
              id="nav-tab-contacts"
              className={`nav-link-btn ${activeTab === 'contacts' ? 'active' : ''}`}
              onClick={() => setActiveTab('contacts')}
            >
              <PhoneCall size={15} /> Trusted Contacts
            </button>

            <button
              id="nav-tab-profile"
              className={`nav-link-btn ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <UserCheck size={15} /> Emergency Profile
            </button>

            <button
              id="nav-tab-history"
              className={`nav-link-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Incident History
            </button>

            <button
              id="nav-tab-organisation"
              className={`nav-link-btn responder-highlight ${activeTab === 'organisation' || activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('organisation')}
            >
              <Building2 size={15} /> Organisation Command
            </button>

            <div className="nav-user-badge">
              <span className={`role-pill ${user.role}`}>{user.role}</span>
              <span className="user-name">{user.name}</span>
              <button
                id="nav-btn-logout"
                className="text-button"
                title="Sign out"
                onClick={onLogout}
                style={{ marginLeft: 8 }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
