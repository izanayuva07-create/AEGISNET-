import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import SosInterface from './components/SosInterface';
import EmergencyContacts from './components/EmergencyContacts';
import EmergencyProfile from './components/EmergencyProfile';
import UserIncidentHistory from './components/UserIncidentHistory';
import ResponderDashboard from './components/ResponderDashboard';
import OrganisationPortal from './components/OrganisationPortal';
import OfflineBanner from './components/OfflineBanner';
import {
  getToken,
  setToken,
  getCurrentUser,
  setCurrentUser,
  authApi
} from './services/api';
import './App.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState('sos'); // 'sos' | 'contacts' | 'profile' | 'history' | 'organisation' | 'dashboard' | 'landing' | 'auth'

  useEffect(() => {
    bootstrapSession();

    // Check if URL matches organisation portal or dashboard
    if (window.location.pathname === '/dashboard' || window.location.pathname === '/organisation') {
      setActiveTab('organisation');
    }
  }, []);

  async function bootstrapSession() {
    const savedToken = getToken();
    const savedUser = getCurrentUser();

    if (savedToken && savedUser) {
      setUser(savedUser);
      // Auto-set tab based on role or path
      if (['responder', 'admin'].includes(savedUser.role) || savedUser.organisationId) {
        setActiveTab('organisation');
      } else {
        setActiveTab('sos');
      }

      // Verify token with backend
      try {
        const res = await authApi.getProfile();
        if (res.user) {
          setUser(res.user);
          setCurrentUser(res.user);
        }
      } catch (err) {
        console.warn('Session verification fallback:', err.message);
      }
    } else {
      setActiveTab('landing');
    }
    setCheckingAuth(false);
  }

  function handleAuthSuccess(userData, token) {
    setUser(userData);
    setToken(token);
    setCurrentUser(userData);

    if (['responder', 'admin'].includes(userData.role) || userData.organisationId) {
      setActiveTab('organisation');
    } else {
      setActiveTab('sos');
    }
  }

  function handleLogout() {
    setUser(null);
    setToken(null);
    setCurrentUser(null);
    setActiveTab('landing');
  }

  if (checkingAuth) {
    return (
      <div className="loading-screen">
        <div className="brand-mark loading-pulse">🛡️</div>
        <p>Initializing AegisNet Intelligent Safety Core...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Offline Status & Event Sync Banner */}
      <OfflineBanner />

      {/* Global Navigation Bar */}
      <Navbar
        user={user}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content Router */}
      <div className="main-content-wrapper">
        {/* If user is not logged in OR is on landing tab */}
        {(!user || activeTab === 'landing' || activeTab === 'auth') ? (
          <LandingPage onAuthSuccess={handleAuthSuccess} />
        ) : (
          <>
            {activeTab === 'sos' && (
              <SosInterface
                user={user}
                onSosSuccess={() => {
                  // After successful SOS, user can still see details or jump to history
                }}
              />
            )}

            {activeTab === 'contacts' && <EmergencyContacts />}

            {activeTab === 'profile' && (
              <EmergencyProfile
                user={user}
                onProfileUpdated={(updated) => setUser(updated)}
              />
            )}

            {activeTab === 'history' && <UserIncidentHistory user={user} />}

            {(activeTab === 'organisation' || activeTab === 'dashboard') && (
              <OrganisationPortal user={user} onLogout={handleLogout} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
