import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import {
  Radio,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Clock,
  ShieldCheck,
  Send,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Users,
  Compass,
  Activity,
  Layers,
  Filter,
  X
} from 'lucide-react';
import { sosApi } from '../services/api';
import { subscribeToIncidents } from '../services/socket';

function MapCenterController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      map.flyTo(center, zoom || 13, { duration: 1.2 });
    }
  }, [map, center, zoom]);
  return null;
}

export default function ResponderDashboard({ user }) {
  const [metrics, setMetrics] = useState({
    totalAlerts: 0,
    activeIncidents: 0,
    criticalIncidents: 0,
    inProgressIncidents: 0,
    resolvedIncidents: 0
  });

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSidebarNav, setActiveSidebarNav] = useState('active'); // 'overview' | 'active' | 'map' | 'history' | 'notifications'
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [actionModal, setActionModal] = useState(null); // { incident, action: 'status' | 'dispatch' | 'ai' }
  const [dispatchUnit, setDispatchUnit] = useState('Quick Response Team 1');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [actionStatus, setActionStatus] = useState('In Progress');
  const [statusNotes, setStatusNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [mapCenter, setMapCenter] = useState([11.0168, 76.9558]); // Coimbatore / TN Default
  const [mapZoom, setMapZoom] = useState(11);
  const [toastMessage, setToastMessage] = useState('');

  // Responder's own location for distance calculation (e.g. Coimbatore center)
  const [responderLocation, setResponderLocation] = useState({ lat: 11.0168, lng: 76.9558 });

  useEffect(() => {
    loadDashboardData();

    // Subscribe to Socket.IO live emergency feed
    const unsubscribe = subscribeToIncidents((event) => {
      console.log('[Socket.IO Event Received]:', event);
      if (event.type === 'NEW_INCIDENT') {
        flashToast(`🚨 NEW EMERGENCY ALERT: ${event.data.incident_code || 'SOS'} received!`);
        // Prepend to incidents list
        setIncidents((prev) => [event.data, ...prev]);
        setMetrics((prev) => ({
          ...prev,
          totalAlerts: prev.totalAlerts + 1,
          activeIncidents: prev.activeIncidents + 1,
          criticalIncidents: event.data.priority === 'Critical' ? prev.criticalIncidents + 1 : prev.criticalIncidents
        }));
      } else if (event.type === 'STATUS_CHANGED') {
        setIncidents((prev) =>
          prev.map((inc) => (inc.id === event.data.id ? { ...inc, status: event.data.status } : inc))
        );
      } else if (event.type === 'UNIT_DISPATCHED') {
        flashToast(`Unit ${event.data.unit_dispatched} dispatched to Incident #${event.data.sos_id}`);
      }
    });

    // Try to get responder's real location if browser permits
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setResponderLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }

    return () => {
      unsubscribe();
    };
  }, []);

  function flashToast(msg) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  }

  async function loadDashboardData() {
    try {
      setLoading(true);
      const data = await sosApi.getActive();
      if (data.metrics) setMetrics(data.metrics);
      if (data.incidents) {
        setIncidents(data.incidents);
        // Focus map on first active incident with coordinates
        const firstWithCoords = data.incidents.find((i) => i.latitude != null && i.longitude != null);
        if (firstWithCoords) {
          setMapCenter([Number(firstWithCoords.latitude), Number(firstWithCoords.longitude)]);
        }
      }
    } catch (err) {
      console.error('Failed to load active incidents:', err);
    } finally {
      setLoading(false);
    }
  }

  // Haversine formula for distance calculation from responder
  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
  }

  function handleSelectIncident(inc) {
    setSelectedIncident(inc);
    if (inc.latitude != null && inc.longitude != null) {
      setMapCenter([Number(inc.latitude), Number(inc.longitude)]);
      setMapZoom(14);
    }
  }

  async function handleUpdateStatusSubmit(e) {
    e.preventDefault();
    if (!actionModal?.incident) return;
    setSubmittingAction(true);
    try {
      await sosApi.updateStatus(actionModal.incident.id, actionStatus, statusNotes);
      flashToast(`Incident #${actionModal.incident.incident_code} updated to ${actionStatus}.`);
      setActionModal(null);
      await loadDashboardData();
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
      await sosApi.dispatch(actionModal.incident.id, {
        unit_dispatched: dispatchUnit,
        notes: dispatchNotes
      });
      flashToast(`Unit ${dispatchUnit} successfully dispatched.`);
      setActionModal(null);
      await loadDashboardData();
    } catch (err) {
      alert(err.message || 'Dispatch failed');
    } finally {
      setSubmittingAction(false);
    }
  }

  // Filtered incidents
  const filteredIncidents = incidents.filter((i) => {
    if (filterPriority === 'ALL') return true;
    return i.priority?.toUpperCase() === filterPriority;
  });

  const geoIncidents = filteredIncidents.filter((i) => i.latitude != null && i.longitude != null);

  const getPriorityColor = (pri) => {
    switch (pri?.toLowerCase()) {
      case 'critical':
        return '#E05252';
      case 'high':
        return '#FF9800';
      case 'medium':
        return '#D8BC43';
      case 'low':
        return '#43B581';
      default:
        return '#D8BC43';
    }
  };

  return (
    <div className="dashboard-layout">
      {/* LEFT SIDEBAR */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <Radio size={22} className="pulse-icon gold-text" />
          <div>
            <strong>COMMAND CENTER</strong>
            <small>AEGISNET DISPATCH GRID</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${activeSidebarNav === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveSidebarNav('overview')}
          >
            <Activity size={17} /> Overview
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarNav === 'active' ? 'active' : ''}`}
            onClick={() => setActiveSidebarNav('active')}
          >
            <AlertTriangle size={17} /> Active Emergencies
            <span className="sidebar-pill">{metrics.activeIncidents}</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarNav === 'map' ? 'active' : ''}`}
            onClick={() => setActiveSidebarNav('map')}
          >
            <MapPin size={17} /> Command Map View
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarNav === 'history' ? 'active' : ''}`}
            onClick={() => setActiveSidebarNav('history')}
          >
            <Clock size={17} /> All Incident History
          </button>
        </nav>

        <div className="sidebar-responder-status">
          <div className="status-indicator-dot online" />
          <div className="status-text">
            <strong>{user?.name || 'Dispatcher Unit'}</strong>
            <small>Active Responder · Online</small>
          </div>
        </div>
      </aside>

      {/* MAIN DASHBOARD CONTENT */}
      <main className="dashboard-main-content">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="live-toast-banner">
            <Radio size={18} className="pulse-icon" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* TOP METRICS ROW */}
        <section className="metrics-row">
          <div className="metric-box">
            <span className="metric-label">Total SOS Alerts</span>
            <strong className="metric-value">{metrics.totalAlerts}</strong>
            <small className="metric-sub">Historical Database Logs</small>
          </div>

          <div className="metric-box alert-border">
            <span className="metric-label">Active Emergencies</span>
            <strong className="metric-value gold-text">{metrics.activeIncidents}</strong>
            <small className="metric-sub">Awaiting / In Coordination</small>
          </div>

          <div className="metric-box danger-border">
            <span className="metric-label">Critical Incidents</span>
            <strong className="metric-value danger-text">{metrics.criticalIncidents}</strong>
            <small className="metric-sub">Immediate Life Safety</small>
          </div>

          <div className="metric-box info-border">
            <span className="metric-label">In-Progress Dispatches</span>
            <strong className="metric-value warning-text">{metrics.inProgressIncidents}</strong>
            <small className="metric-sub">Units Deployed</small>
          </div>

          <div className="metric-box success-border">
            <span className="metric-label">Resolved Cases</span>
            <strong className="metric-value success-text">{metrics.resolvedIncidents}</strong>
            <small className="metric-sub">Successfully Closed</small>
          </div>
        </section>

        {/* WORKSPACE SPLIT: MAP PANEL & INCIDENT FEED */}
        <div className="dashboard-workspace-grid">
          {/* MAP PANEL */}
          <section className="command-map-panel">
            <div className="panel-bar">
              <div className="bar-title">
                <Compass size={18} className="gold-text" />
                <h3>Tactical Emergency Grid (Leaflet / OpenStreetMap)</h3>
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

                {/* Responder's Own Location Pin */}
                {responderLocation && (
                  <CircleMarker
                    center={[responderLocation.lat, responderLocation.lng]}
                    radius={10}
                    pathOptions={{ color: '#43B581', fillColor: '#43B581', fillOpacity: 0.9, weight: 3 }}
                  >
                    <Popup>
                      <div className="map-popup">
                        <strong>Your Responder Unit Station</strong>
                        <p>Dispatch Coordinates: {responderLocation.lat.toFixed(4)}, {responderLocation.lng.toFixed(4)}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                )}

                {/* Active Emergency Pins */}
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
                          pathOptions={{ color: color, fillColor: color, fillOpacity: 0.2, weight: 1 }}
                        />
                      )}
                      <CircleMarker
                        center={pos}
                        radius={isCritical ? 11 : 8}
                        pathOptions={{ color: '#ffffff', fillColor: color, fillOpacity: 0.95, weight: 2 }}
                        eventHandlers={{
                          click: () => handleSelectIncident(inc)
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
                            <div className="popup-actions">
                              <button
                                className="small-action-btn"
                                onClick={() => setActionModal({ incident: inc, action: 'status' })}
                              >
                                Update Status
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
              <span className="legend-item"><span className="legend-dot responder-dot" /> Your Unit Station</span>
              <button className="text-button" onClick={loadDashboardData} style={{ marginLeft: 'auto' }}>
                <RefreshCw size={13} /> Refresh Feed
              </button>
            </div>
          </section>

          {/* INCIDENT FEED & ACTIONS */}
          <section className="incident-feed-panel">
            <div className="panel-bar">
              <div className="bar-title">
                <AlertTriangle size={18} className="gold-text" />
                <h3>Live Emergency Incident Feed</h3>
              </div>
              <div className="filter-dropdown">
                <Filter size={13} />
                <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                  <option value="ALL">All Priorities</option>
                  <option value="CRITICAL">Critical Only</option>
                  <option value="HIGH">High Only</option>
                  <option value="MEDIUM">Medium Only</option>
                </select>
              </div>
            </div>

            <div className="incidents-scroll-list">
              {filteredIncidents.length === 0 ? (
                <div className="empty-contacts-card">
                  <ShieldCheck size={32} className="muted-icon" />
                  <h4>No Active Incidents In Queue</h4>
                  <p>All emergency events in this filter category have been resolved.</p>
                </div>
              ) : (
                filteredIncidents.map((inc) => {
                  const distKm = calculateDistanceKm(
                    responderLocation.lat,
                    responderLocation.lng,
                    inc.latitude,
                    inc.longitude
                  );

                  return (
                    <div
                      key={inc.id}
                      className={`incident-feed-card ${selectedIncident?.id === inc.id ? 'selected' : ''}`}
                      onClick={() => handleSelectIncident(inc)}
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
                        {distKm && <span className="distance-badge">📍 {distKm} km from unit</span>}
                      </div>

                      <p className="card-description">{inc.description || 'Immediate emergency response requested'}</p>

                      <div className="card-footer-actions">
                        <small className="timestamp-text">
                          <Clock size={12} /> {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </small>

                        <div className="actions-button-group">
                          {inc.google_maps_url && (
                            <a
                              href={inc.google_maps_url}
                              target="_blank"
                              rel="noreferrer"
                              className="icon-action-btn"
                              title="Open in Google Maps"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MapPin size={14} />
                            </a>
                          )}

                          <button
                            className="secondary-btn compact-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionModal({ incident: inc, action: 'dispatch' });
                            }}
                          >
                            <Send size={13} /> Dispatch Unit
                          </button>

                          <button
                            className="primary-btn compact-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionModal({ incident: inc, action: 'status' });
                            }}
                          >
                            Update Status
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </main>

      {/* ACTION MODAL: STATUS UPDATE OR DISPATCH */}
      {actionModal && (
        <div className="modal-overlay" onClick={() => setActionModal(null)}>
          <div className="incident-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>
                  {actionModal.action === 'dispatch' ? 'Dispatch Emergency Response Unit' : 'Update Incident Status'}
                </h3>
                <small className="muted-text">
                  Incident Code: <strong>{actionModal.incident.incident_code || `SOS-2026-${actionModal.incident.id}`}</strong>
                </small>
              </div>
              <button className="text-button" onClick={() => setActionModal(null)}>
                <X size={20} />
              </button>
            </div>

            {actionModal.action === 'status' ? (
              <form onSubmit={handleUpdateStatusSubmit} className="modal-form">
                <label>
                  New Operational Status
                  <select value={actionStatus} onChange={(e) => setActionStatus(e.target.value)}>
                    <option value="Acknowledged">Acknowledged (Responder Received)</option>
                    <option value="In Progress">In Progress (Unit En Route / Active)</option>
                    <option value="Resolved">Resolved (Threat Mitigated / Safe)</option>
                    <option value="Closed">Closed (Incident Documentation Finalized)</option>
                  </select>
                </label>

                <label>
                  Responder Status Notes
                  <textarea
                    rows={3}
                    placeholder="Enter coordination notes, medical assistance rendered, or case resolution summary..."
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                  />
                </label>

                <div className="modal-footer">
                  <button type="submit" className="primary-btn" disabled={submittingAction}>
                    {submittingAction ? 'Persisting to Database...' : 'Save Status Update'}
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => setActionModal(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleDispatchSubmit} className="modal-form">
                <label>
                  Select Dispatch Unit
                  <select value={dispatchUnit} onChange={(e) => setDispatchUnit(e.target.value)}>
                    <option value="Quick Response Team 1 (Police Patrol)">Quick Response Team 1 (Police Patrol)</option>
                    <option value="Emergency Ambulance QRT-4">Emergency Ambulance QRT-4 (Medical Services)</option>
                    <option value="Fire & Rescue Division 2">Fire & Rescue Division 2</option>
                    <option value="Community Safety Patrol Alpha">Community Safety Patrol Alpha</option>
                  </select>
                </label>

                <label>
                  Dispatch Directives / ETA Notes
                  <textarea
                    rows={3}
                    placeholder="e.g. Unit en route. Estimated time of arrival: 4 minutes. Code 3 sirens."
                    value={dispatchNotes}
                    onChange={(e) => setDispatchNotes(e.target.value)}
                  />
                </label>

                <div className="modal-footer">
                  <button type="submit" className="primary-btn" disabled={submittingAction}>
                    {submittingAction ? 'Broadcasting Dispatch...' : 'Confirm & Dispatch Unit'}
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => setActionModal(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
