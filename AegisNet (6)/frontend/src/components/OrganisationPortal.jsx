import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import {
  Building2,
  Radio,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  MapPin,
  ExternalLink,
  Users,
  Mail,
  Settings,
  RefreshCw,
  Sliders,
  Filter,
  Eye,
  X,
  UserPlus,
  ShieldCheck,
  PhoneCall,
  Save
} from 'lucide-react';
import { organisationApi } from '../services/api';
import { subscribeToIncidents } from '../services/socket';

function MapCenterController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      map.flyTo(center, zoom || 12, { duration: 1.2 });
    }
  }, [map, center, zoom]);
  return null;
}

export default function OrganisationPortal({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('command'); // 'command' | 'incidents' | 'responders' | 'notifications' | 'settings'
  const [metrics, setMetrics] = useState({
    totalIncidents: 0,
    activeIncidents: 0,
    unacknowledgedIncidents: 0,
    inProgressIncidents: 0,
    resolvedIncidents: 0,
    criticalIncidents: 0,
    availableResponders: 0
  });

  const [incidents, setIncidents] = useState([]);
  const [responders, setResponders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [notifLogs, setNotifLogs] = useState({ emailNotifications: [], smsNotifications: [] });

  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  // Modals
  const [actionModal, setActionModal] = useState(null); // { incident, type: 'status' | 'dispatch' | 'email_preview' }
  const [newStatus, setNewStatus] = useState('ACKNOWLEDGED');
  const [statusRemarks, setStatusRemarks] = useState('');
  const [selectedResponderId, setSelectedResponderId] = useState('');
  const [unitDispatchedName, setUnitDispatchedName] = useState('Police QRT Alpha-1');
  const [dispatchRemarks, setDispatchRemarks] = useState('');
  const [previewEmailHtml, setPreviewEmailHtml] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    notification_email: '',
    phone: '',
    address: ''
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');

  // Responder Form
  const [showAddResponder, setShowAddResponder] = useState(false);
  const [newRespForm, setNewRespForm] = useState({
    name: '',
    email: '',
    phone: '',
    unit_name: 'Patrol Unit 05',
    agency: 'Emergency Response Grid',
    responder_type: 'Police',
    badge_number: 'TN-RES-05'
  });

  const [mapCenter, setMapCenter] = useState([11.0168, 76.9558]);
  const [mapZoom, setMapZoom] = useState(11);

  useEffect(() => {
    loadAllOrganisationData();

    // Subscribe to Socket.IO real-time feed
    const unsubscribe = subscribeToIncidents((event) => {
      console.log('[Socket.IO Org Portal Event]:', event);
      if (event.type === 'NEW_INCIDENT') {
        flashToast(`🚨 URGENT: New Emergency SOS ${event.data.incident_code || 'Alert'} received!`);
        setIncidents((prev) => [event.data, ...prev]);
        setMetrics((prev) => ({
          ...prev,
          totalIncidents: prev.totalIncidents + 1,
          activeIncidents: prev.activeIncidents + 1,
          unacknowledgedIncidents: prev.unacknowledgedIncidents + 1
        }));
      } else if (event.type === 'STATUS_CHANGED') {
        setIncidents((prev) =>
          prev.map((i) => (i.id === event.data.id ? { ...i, status: event.data.status } : i))
        );
      } else if (event.type === 'UNIT_DISPATCHED') {
        flashToast(`Unit ${event.data.unit_name} dispatched to Incident #${event.data.sos_id}`);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  function flashToast(msg) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  }

  async function loadAllOrganisationData() {
    try {
      setLoading(true);
      const [dashData, incData, respData, setData, notifData] = await Promise.all([
        organisationApi.getDashboard().catch(() => ({ metrics: {}, latestIncidents: [] })),
        organisationApi.getIncidents({ limit: 100 }).catch(() => ({ incidents: [] })),
        organisationApi.getResponders().catch(() => ({ responders: [] })),
        organisationApi.getSettings().catch(() => ({ organisation: {} })),
        organisationApi.getNotificationLogs().catch(() => ({ emailNotifications: [], smsNotifications: [] }))
      ]);

      if (dashData.metrics) setMetrics(dashData.metrics);
      if (incData.incidents) {
        setIncidents(incData.incidents);
        const firstCoords = incData.incidents.find((i) => i.latitude != null && i.longitude != null);
        if (firstCoords) setMapCenter([Number(firstCoords.latitude), Number(firstCoords.longitude)]);
      }
      if (respData.responders) setResponders(respData.responders);
      if (setData.organisation) {
        setSettings(setData.organisation);
        setSettingsForm({
          name: setData.organisation.name || '',
          notification_email: setData.organisation.notification_email || '',
          phone: setData.organisation.phone || '',
          address: setData.organisation.address || ''
        });
      }
      if (notifData) setNotifLogs(notifData);
    } catch (err) {
      console.error('Failed to load organisation portal data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess('');
    try {
      const res = await organisationApi.updateSettings(settingsForm);
      setSettings(res.organisation);
      setSettingsSuccess('Organisation emergency notification email and settings saved.');
      setTimeout(() => setSettingsSuccess(''), 4000);
    } catch (err) {
      alert(err.message || 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleStatusSubmit(e) {
    e.preventDefault();
    if (!actionModal?.incident) return;
    setSubmittingAction(true);
    try {
      await organisationApi.updateStatus(actionModal.incident.id, newStatus, statusRemarks);
      flashToast(`Incident status updated to ${newStatus}.`);
      setActionModal(null);
      await loadAllOrganisationData();
    } catch (err) {
      alert(err.message || 'Status update failed');
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleDispatchSubmit(e) {
    e.preventDefault();
    if (!actionModal?.incident) return;
    setSubmittingAction(true);
    try {
      await organisationApi.assignResponder(actionModal.incident.id, {
        responder_id: selectedResponderId || null,
        unit_name: unitDispatchedName,
        remarks: dispatchRemarks
      });
      flashToast(`Unit ${unitDispatchedName} successfully assigned.`);
      setActionModal(null);
      await loadAllOrganisationData();
    } catch (err) {
      alert(err.message || 'Dispatch failed');
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleCreateResponder(e) {
    e.preventDefault();
    try {
      await organisationApi.addResponder(newRespForm);
      flashToast('New emergency responder account created.');
      setShowAddResponder(false);
      const respData = await organisationApi.getResponders();
      setResponders(respData.responders || []);
    } catch (err) {
      alert(err.message || 'Failed to create responder');
    }
  }

  // Filtered incidents
  const filteredIncidents = incidents.filter((i) => {
    if (statusFilter !== 'ALL' && i.status?.toUpperCase() !== statusFilter.toUpperCase()) return false;
    if (priorityFilter !== 'ALL' && i.priority?.toUpperCase() !== priorityFilter.toUpperCase()) return false;
    return true;
  });

  const geoIncidents = filteredIncidents.filter((i) => i.latitude != null && i.longitude != null);

  const getPriorityColor = (pri) => {
    switch (pri?.toLowerCase()) {
      case 'critical': return '#E05252';
      case 'high': return '#FF9800';
      case 'medium': return '#D8BC43';
      case 'low': return '#3BAA75';
      default: return '#D8BC43';
    }
  };

  return (
    <div className="dashboard-layout">
      {/* SIDEBAR NAVIGATION */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <Building2 size={24} className="gold-text" />
          <div>
            <strong>ORGANISATION PORTAL</strong>
            <small>{settings?.name?.slice(0, 24) || 'Emergency Authority'}</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            id="org-tab-command"
            className={`sidebar-nav-item ${activeTab === 'command' ? 'active' : ''}`}
            onClick={() => setActiveTab('command')}
          >
            <Radio size={16} className="pulse-icon" /> Command Center
            <span className="sidebar-pill">{metrics.activeIncidents}</span>
          </button>

          <button
            id="org-tab-incidents"
            className={`sidebar-nav-item ${activeTab === 'incidents' ? 'active' : ''}`}
            onClick={() => setActiveTab('incidents')}
          >
            <AlertTriangle size={16} /> Incident Queue
            <span className="sidebar-pill" style={{ background: 'var(--gold)', color: '#080909' }}>
              {incidents.length}
            </span>
          </button>

          <button
            id="org-tab-responders"
            className={`sidebar-nav-item ${activeTab === 'responders' ? 'active' : ''}`}
            onClick={() => setActiveTab('responders')}
          >
            <Users size={16} /> Responders ({responders.length})
          </button>

          <button
            id="org-tab-notifications"
            className={`sidebar-nav-item ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            <Mail size={16} /> Emergency Email Logs
            <span className="sidebar-pill" style={{ background: '#3BAA75' }}>
              {notifLogs.emailNotifications?.length || 0}
            </span>
          </button>

          <button
            id="org-tab-settings"
            className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} /> Organisation Settings
          </button>
        </nav>

        <div className="sidebar-responder-status">
          <div className="status-indicator-dot online" />
          <div className="status-text">
            <strong>{user?.name || 'Operations Lead'}</strong>
            <small>Authorised Administrator</small>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="dashboard-main-content">
        {toastMessage && (
          <div className="live-toast-banner">
            <Radio size={18} className="pulse-icon" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 1. COMMAND CENTER (MAP + FEED + TOP METRICS) */}
        {activeTab === 'command' && (
          <>
            <section className="metrics-row">
              <div className="metric-box">
                <span className="metric-label">Total SOS Alerts</span>
                <strong className="metric-value">{metrics.totalIncidents}</strong>
                <small className="metric-sub">Historical Database Logs</small>
              </div>

              <div className="metric-box alert-border">
                <span className="metric-label">Active Emergencies</span>
                <strong className="metric-value gold-text">{metrics.activeIncidents}</strong>
                <small className="metric-sub">Requires Response</small>
              </div>

              <div className="metric-box danger-border">
                <span className="metric-label">Critical Priority</span>
                <strong className="metric-value danger-text">{metrics.criticalIncidents}</strong>
                <small className="metric-sub">Life-Threatening</small>
              </div>

              <div className="metric-box info-border">
                <span className="metric-label">In-Progress / Dispatched</span>
                <strong className="metric-value warning-text">{metrics.inProgressIncidents}</strong>
                <small className="metric-sub">Units Deployed</small>
              </div>

              <div className="metric-box success-border">
                <span className="metric-label">Available Responders</span>
                <strong className="metric-value success-text">{metrics.availableResponders}</strong>
                <small className="metric-sub">Online & Ready</small>
              </div>
            </section>

            <div className="dashboard-workspace-grid">
              {/* Tactical Leaflet Map */}
              <section className="command-map-panel">
                <div className="panel-bar">
                  <div className="bar-title">
                    <MapPin size={18} className="gold-text" />
                    <h3>Live Tactical Emergency Map (Leaflet / OpenStreetMap)</h3>
                  </div>
                  <span className="chip">{geoIncidents.length} Geocoded Pins Active</span>
                </div>

                <div className="leaflet-container-wrapper">
                  <MapContainer
                    center={mapCenter}
                    zoom={mapZoom}
                    scrollWheelZoom={true}
                    className="command-leaflet-map"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <MapCenterController center={mapCenter} zoom={mapZoom} />

                    {geoIncidents.map((inc) => {
                      const color = getPriorityColor(inc.priority);
                      const isCritical = inc.priority === 'Critical';
                      const pos = [Number(inc.latitude), Number(inc.longitude)];

                      return (
                        <React.Fragment key={inc.id}>
                          {isCritical && (
                            <CircleMarker
                              center={pos}
                              radius={24}
                              pathOptions={{ color: color, fillColor: color, fillOpacity: 0.25, weight: 1 }}
                            />
                          )}
                          <CircleMarker
                            center={pos}
                            radius={isCritical ? 11 : 8}
                            pathOptions={{ color: '#ffffff', fillColor: color, fillOpacity: 0.95, weight: 2 }}
                            eventHandlers={{
                              click: () => {
                                setSelectedIncident(inc);
                                setMapCenter(pos);
                              }
                            }}
                          >
                            <Popup>
                              <div className="map-popup">
                                <span className={`badge ${inc.priority?.toLowerCase() || 'critical'}`}>
                                  {inc.priority} · Score {inc.calculated_score || 90}/100
                                </span>
                                <h4>{inc.incident_code || `SOS-2026-${inc.id}`}</h4>
                                <p className="popup-user"><strong>User:</strong> {inc.user_name || 'Citizen'}</p>
                                <p className="popup-type"><strong>Type:</strong> {inc.incident_type}</p>
                                <p className="popup-status"><strong>Status:</strong> {inc.status}</p>
                                {inc.google_maps_url && (
                                  <a
                                    href={inc.google_maps_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="popup-map-link"
                                  >
                                    Google Maps Pin <ExternalLink size={12} />
                                  </a>
                                )}
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                  <button
                                    className="small-action-btn"
                                    onClick={() => setActionModal({ incident: inc, type: 'status' })}
                                  >
                                    Update Status
                                  </button>
                                  <button
                                    className="small-action-btn"
                                    onClick={() => setActionModal({ incident: inc, type: 'dispatch' })}
                                  >
                                    Dispatch
                                  </button>
                                </div>
                              </div>
                            </Popup>
                          </CircleMarker>
                        </React.Fragment>
                      );
                    })}
                  </MapContainer>
                </div>

                <div className="map-tactical-legend">
                  <span><strong>Legend:</strong></span>
                  <span className="legend-item"><span className="legend-dot critical" /> Critical Emergency</span>
                  <span className="legend-item"><span className="legend-dot high" /> High Priority</span>
                  <span className="legend-item"><span className="legend-dot medium" /> Medium Priority</span>
                  <span className="legend-item"><span className="legend-dot responder-dot" /> Low / Resolved</span>
                  <button className="text-button" onClick={loadAllOrganisationData} style={{ marginLeft: 'auto' }}>
                    <RefreshCw size={13} /> Refresh Map
                  </button>
                </div>
              </section>

              {/* Live Incident Feed */}
              <section className="incident-feed-panel">
                <div className="panel-bar">
                  <div className="bar-title">
                    <Radio size={18} className="gold-text pulse-icon" />
                    <h3>Live Incident Feed (Socket.IO)</h3>
                  </div>
                  <div className="filter-dropdown">
                    <Filter size={13} />
                    <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                      <option value="ALL">All Priorities</option>
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                    </select>
                  </div>
                </div>

                <div className="incidents-scroll-list">
                  {filteredIncidents.length === 0 ? (
                    <div className="empty-contacts-card">
                      <ShieldCheck size={32} className="muted-icon" />
                      <h4>No Active Incidents in Queue</h4>
                      <p>All emergency cases are resolved or no reports match your filter.</p>
                    </div>
                  ) : (
                    filteredIncidents.slice(0, 15).map((inc) => (
                      <div
                        key={inc.id}
                        className={`incident-feed-card ${selectedIncident?.id === inc.id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedIncident(inc);
                          if (inc.latitude && inc.longitude) {
                            setMapCenter([Number(inc.latitude), Number(inc.longitude)]);
                            setMapZoom(14);
                          }
                        }}
                      >
                        <div className="card-top-row">
                          <code className="incident-code-pill">{inc.incident_code || `SOS-2026-${inc.id}`}</code>
                          <span className={`badge ${inc.priority?.toLowerCase() || 'critical'}`}>
                            {inc.priority} (Score: {inc.calculated_score || 95}/100)
                          </span>
                          <span className={`status-pill-badge ${inc.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                            {inc.status}
                          </span>
                        </div>

                        <div className="card-citizen-row">
                          <strong className="citizen-name">{inc.user_name || 'AegisNet Citizen'}</strong>
                          {inc.user_phone && <span className="citizen-phone">📞 {inc.user_phone}</span>}
                        </div>

                        <p className="card-description">{inc.description || 'Emergency assistance requested via 3-second SOS.'}</p>

                        <div className="card-footer-actions">
                          <small className="timestamp-text">
                            <Clock size={12} /> {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </small>

                          <div className="actions-button-group">
                            <button
                              className="secondary-btn compact-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionModal({ incident: inc, type: 'dispatch' });
                              }}
                            >
                              <Send size={13} /> Dispatch
                            </button>
                            <button
                              className="primary-btn compact-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionModal({ incident: inc, type: 'status' });
                              }}
                            >
                              Update Status
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        {/* 2. INCIDENT QUEUE TAB */}
        {activeTab === 'incidents' && (
          <section className="panel" style={{ background: 'var(--panel)', padding: 24, borderRadius: 'var(--radius-lg)' }}>
            <div className="panel-header-section">
              <div className="header-info">
                <h2>Emergency Incident Queue & Workflow Manager</h2>
                <p className="subtitle">
                  Review and transition incident statuses: <code>NEW ➔ ACKNOWLEDGED ➔ IN_PROGRESS ➔ DISPATCHED ➔ RESOLVED</code>
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="ALL">All Statuses</option>
                  <option value="NEW">New</option>
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="DISPATCHED">Dispatched</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="incidents-table-wrapper" style={{ marginTop: 16 }}>
              <table className="aegis-table">
                <thead>
                  <tr>
                    <th>Incident Code</th>
                    <th>Citizen</th>
                    <th>Distress Type</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Coordinates</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncidents.map((inc) => (
                    <tr key={inc.id}>
                      <td><code className="incident-code-pill">{inc.incident_code || `SOS-2026-${inc.id}`}</code></td>
                      <td><strong>{inc.user_name || 'Citizen'}</strong><br /><small className="muted-text">{inc.user_phone}</small></td>
                      <td>{inc.incident_type}</td>
                      <td><span className={`badge ${inc.priority?.toLowerCase() || 'critical'}`}>{inc.priority}</span></td>
                      <td><span className={`status-pill-badge ${inc.status?.toLowerCase().replace(/\s+/g, '-')}`}>{inc.status}</span></td>
                      <td>
                        {inc.latitude ? (
                          <a href={inc.google_maps_url || `https://www.google.com/maps?q=${inc.latitude},${inc.longitude}`} target="_blank" rel="noreferrer" className="map-link-btn">
                            <MapPin size={13} /> {Number(inc.latitude).toFixed(4)}, {Number(inc.longitude).toFixed(4)}
                          </a>
                        ) : 'Manual'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="small-action-btn" onClick={() => setActionModal({ incident: inc, type: 'status' })}>
                            Status
                          </button>
                          <button className="small-action-btn" onClick={() => setActionModal({ incident: inc, type: 'dispatch' })}>
                            Dispatch
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 3. RESPONDERS TAB */}
        {activeTab === 'responders' && (
          <section className="panel" style={{ background: 'var(--panel)', padding: 24, borderRadius: 'var(--radius-lg)' }}>
            <div className="panel-header-section">
              <div className="header-info">
                <h2>Authorised First Responders Roster</h2>
                <p className="subtitle">Manage first responder personnel, units, deployment agency, and live operational availability.</p>
              </div>
              <button className="primary-btn" onClick={() => setShowAddResponder(true)}>
                <UserPlus size={16} /> Add Responder Unit
              </button>
            </div>

            {showAddResponder && (
              <div className="contact-form-card" style={{ marginBottom: 20 }}>
                <h3>Register First Responder Account</h3>
                <form onSubmit={handleCreateResponder} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 14 }}>
                  <label>Full Name<input value={newRespForm.name} onChange={(e) => setNewRespForm({ ...newRespForm, name: e.target.value })} required /></label>
                  <label>Official Email<input type="email" value={newRespForm.email} onChange={(e) => setNewRespForm({ ...newRespForm, email: e.target.value })} required /></label>
                  <label>Phone<input value={newRespForm.phone} onChange={(e) => setNewRespForm({ ...newRespForm, phone: e.target.value })} required /></label>
                  <label>Unit Name<input value={newRespForm.unit_name} onChange={(e) => setNewRespForm({ ...newRespForm, unit_name: e.target.value })} required /></label>
                  <label>Agency<input value={newRespForm.agency} onChange={(e) => setNewRespForm({ ...newRespForm, agency: e.target.value })} required /></label>
                  <label>Badge Number<input value={newRespForm.badge_number} onChange={(e) => setNewRespForm({ ...newRespForm, badge_number: e.target.value })} required /></label>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 8 }}>
                    <button type="submit" className="primary-btn">Save Responder</button>
                    <button type="button" className="secondary-btn" onClick={() => setShowAddResponder(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            <div className="contacts-list">
              {responders.map((r) => (
                <div key={r.id} className="contact-card" style={{ gridTemplateColumns: '80px 1.5fr 1fr 1fr' }}>
                  <div className="priority-badge-col">
                    <span className="priority-number">{r.badge_number || 'RES'}</span>
                    <span className="priority-label">{r.responder_type || 'Police'}</span>
                  </div>
                  <div>
                    <h4 className="contact-name">{r.name}</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '2px 0 0' }}>{r.unit_name} · {r.agency}</p>
                    <small style={{ color: 'var(--gold-soft)' }}>📞 {r.phone} · {r.email}</small>
                  </div>
                  <div>
                    <span className={`status-pill-badge ${r.status === 'available' ? 'contacts-notified' : 'in-progress'}`}>
                      {r.status?.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button
                      className="small-action-btn"
                      onClick={async () => {
                        const newSt = r.status === 'available' ? 'dispatched' : 'available';
                        await organisationApi.updateResponder(r.id, { status: newSt });
                        const updated = await organisationApi.getResponders();
                        setResponders(updated.responders || []);
                      }}
                    >
                      Toggle Availability
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. EMERGENCY EMAIL NOTIFICATION LOGS (CRITICAL SPEC SECTION 6) */}
        {activeTab === 'notifications' && (
          <section className="panel" style={{ background: 'var(--panel)', padding: 24, borderRadius: 'var(--radius-lg)' }}>
            <div className="panel-header-section">
              <div className="header-info">
                <h2>Organisation Emergency Alert Email Broadcast Logs</h2>
                <p className="subtitle">
                  Audit trail of all emergency alert emails dispatched automatically to the organisation's configured notification address upon SOS triggers.
                </p>
              </div>
            </div>

            <div className="incidents-table-wrapper" style={{ marginTop: 14 }}>
              <table className="aegis-table">
                <thead>
                  <tr>
                    <th>Incident Code</th>
                    <th>Recipient Organisation Email</th>
                    <th>Email Subject</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Dispatched Timestamp</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {notifLogs.emailNotifications?.length ? (
                    notifLogs.emailNotifications.map((en) => (
                      <tr key={en.id}>
                        <td><code className="incident-code-pill">{en.incident_code || `SOS-${en.sos_id}`}</code></td>
                        <td><strong>{en.recipient_email}</strong></td>
                        <td style={{ fontSize: '0.8rem' }}>{en.subject}</td>
                        <td><span className="success-tag">{en.provider}</span></td>
                        <td>
                          <span className={`status-pill-badge ${en.status === 'sent' || en.status === 'delivered' ? 'contacts-notified' : 'in-progress'}`}>
                            {en.status?.toUpperCase()}
                          </span>
                        </td>
                        <td><small className="muted-text">{new Date(en.created_at).toLocaleString()}</small></td>
                        <td>
                          <button
                            className="small-action-btn"
                            onClick={() => {
                              setPreviewEmailHtml(en.html_body);
                              setActionModal({ type: 'email_preview' });
                            }}
                          >
                            <Eye size={13} /> View HTML
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No emergency email logs recorded yet. Trigger an SOS to generate alert emails.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 5. ORGANISATION SETTINGS TAB */}
        {activeTab === 'settings' && (
          <section className="panel" style={{ background: 'var(--panel)', padding: 28, borderRadius: 'var(--radius-lg)', maxWidth: 760 }}>
            <div className="panel-header-section">
              <div className="header-info">
                <h2>Organisation & Emergency Notification Settings</h2>
                <p className="subtitle">
                  Configure the official emergency email address that receives instant HTML alert dispatches whenever an individual triggers an SOS.
                </p>
              </div>
            </div>

            {settingsSuccess && (
              <div className="alert-box success">
                <CheckCircle2 size={16} /> <span>{settingsSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
              <label>
                Organisation Authority Name
                <input
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                  required
                />
              </label>

              <label>
                <strong>Official Emergency Notification Email Address *</strong>
                <input
                  type="email"
                  value={settingsForm.notification_email}
                  onChange={(e) => setSettingsForm({ ...settingsForm, notification_email: e.target.value })}
                  placeholder="alerts.tnsdma@aegisnet.org"
                  required
                />
                <small className="muted-text">
                  This destination receives priority emergency SOS dispatches with GPS telemetry and Google Maps links.
                </small>
              </label>

              <label>
                Official 24/7 Hotline Phone
                <input
                  value={settingsForm.phone}
                  onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                  placeholder="+91 44 2859 3990"
                />
              </label>

              <label>
                HQ Operational Address
                <textarea
                  rows={3}
                  value={settingsForm.address}
                  onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="submit" className="primary-btn" disabled={savingSettings}>
                  <Save size={16} /> {savingSettings ? 'Saving Settings...' : 'Save Organisation Configuration'}
                </button>
              </div>
            </form>
          </section>
        )}
      </main>

      {/* ACTION MODALS: STATUS, DISPATCH, EMAIL PREVIEW */}
      {actionModal && (
        <div className="modal-overlay" onClick={() => setActionModal(null)}>
          <div className="incident-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>
                  {actionModal.type === 'status'
                    ? 'Update Incident Status & Coordination Notes'
                    : actionModal.type === 'dispatch'
                    ? 'Dispatch Emergency Response Unit'
                    : 'Organisation Emergency Email Preview'}
                </h3>
                {actionModal.incident && (
                  <small className="muted-text">
                    Incident: <strong>{actionModal.incident.incident_code || `SOS-${actionModal.incident.id}`}</strong>
                  </small>
                )}
              </div>
              <button className="text-button" onClick={() => setActionModal(null)}><X size={20} /></button>
            </div>

            {actionModal.type === 'status' && (
              <form onSubmit={handleStatusSubmit} className="modal-form" style={{ padding: 20 }}>
                <label>
                  New Operational Status
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                    <option value="ACKNOWLEDGED">ACKNOWLEDGED (Confirmed by Organisation)</option>
                    <option value="IN_PROGRESS">IN_PROGRESS (Operations Underway)</option>
                    <option value="DISPATCHED">DISPATCHED (Units En Route)</option>
                    <option value="RESOLVED">RESOLVED (Threat Mitigated / Safe)</option>
                    <option value="CANCELLED">CANCELLED (Authorised Cancellation)</option>
                    <option value="REJECTED">REJECTED (False Alarm / Out of Jurisdiction)</option>
                  </select>
                </label>
                <label style={{ marginTop: 12 }}>
                  Coordination Remarks
                  <textarea
                    rows={3}
                    placeholder="Enter responder field log, resolution notes, or dispatch remarks..."
                    value={statusRemarks}
                    onChange={(e) => setStatusRemarks(e.target.value)}
                  />
                </label>
                <div className="modal-footer" style={{ marginTop: 18 }}>
                  <button type="submit" className="primary-btn" disabled={submittingAction}>
                    {submittingAction ? 'Updating...' : 'Save Status Transition'}
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => setActionModal(null)}>Cancel</button>
                </div>
              </form>
            )}

            {actionModal.type === 'dispatch' && (
              <form onSubmit={handleDispatchSubmit} className="modal-form" style={{ padding: 20 }}>
                <label>
                  Assign Responder Unit
                  <select
                    id="dispatch-responder-select"
                    value={selectedResponderId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedResponderId(val);
                      const chosen = responders.find((r) => String(r.user_id) === String(val));
                      if (chosen) {
                        setUnitDispatchedName(chosen.unit_name || chosen.name);
                      }
                    }}
                  >
                    <option value="">Select an available responder...</option>
                    {responders.map((r) => (
                      <option key={r.id} value={r.user_id}>
                        {r.name} — {r.unit_name} ({r.responder_type} · {r.status})
                      </option>
                    ))}
                  </select>
                </label>

                {/* 100% VISIBLE INTERACTIVE RESPONDER QUICK-SELECTION GRID */}
                <div className="responder-quick-picker-section">
                  <div className="picker-header-row">
                    <span className="picker-title">⚡ Available QRT & Emergency Units (Click to Select):</span>
                    <span className="picker-count">{responders.filter((r) => r.status === 'available').length} Ready</span>
                  </div>
                  <div className="responder-picker-grid">
                    {responders.map((r) => {
                      const isSelected = String(selectedResponderId) === String(r.user_id);
                      const isAvail = r.status === 'available';
                      return (
                        <div
                          key={r.id}
                          className={`responder-picker-card ${isSelected ? 'selected' : ''} ${!isAvail ? 'busy' : ''}`}
                          onClick={() => {
                            setSelectedResponderId(r.user_id);
                            setUnitDispatchedName(r.unit_name || r.name);
                          }}
                        >
                          <div className="card-top">
                            <span className="unit-badge">{r.responder_type}</span>
                            <span className={`status-pill ${r.status}`}>● {r.status}</span>
                          </div>
                          <strong className="responder-name">{r.name}</strong>
                          <div className="unit-callsign">🛡️ {r.unit_name}</div>
                          <div className="responder-phone">📞 {r.phone}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <label style={{ marginTop: 14 }}>
                  Confirmed Unit Designation
                  <input
                    value={unitDispatchedName}
                    onChange={(e) => setUnitDispatchedName(e.target.value)}
                    placeholder="Selected unit name or callsign"
                    required
                  />
                </label>
                <label style={{ marginTop: 12 }}>
                  Directives / Priority Notes
                  <textarea
                    rows={3}
                    placeholder="e.g. Code 3 Sirens. High-accuracy GPS coordinates transmitted. Proceed immediately."
                    value={dispatchRemarks}
                    onChange={(e) => setDispatchRemarks(e.target.value)}
                  />
                </label>
                <div className="modal-footer" style={{ marginTop: 18 }}>
                  <button type="submit" className="primary-btn" disabled={submittingAction}>
                    {submittingAction ? 'Dispatching...' : 'Confirm & Deploy Unit'}
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => setActionModal(null)}>Cancel</button>
                </div>
              </form>
            )}

            {actionModal.type === 'email_preview' && (
              <div style={{ padding: 18, maxHeight: '70vh', overflowY: 'auto' }}>
                <div dangerouslySetInnerHTML={{ __html: previewEmailHtml }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
