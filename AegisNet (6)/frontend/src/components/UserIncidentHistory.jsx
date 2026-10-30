import React, { useState, useEffect } from 'react';
import {
  Clock,
  MapPin,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  X,
  PhoneCall,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { sosApi } from '../services/api';

export default function UserIncidentHistory({ user }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidentDetails, setIncidentDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      setLoading(true);
      const res = await sosApi.getHistory();
      setIncidents(res.incidents || []);
    } catch (err) {
      console.warn('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }

  async function viewDetails(inc) {
    setSelectedIncident(inc);
    setLoadingDetails(true);
    try {
      const data = await sosApi.getDetails(inc.id);
      setIncidentDetails(data);
    } catch (err) {
      console.error('Failed to load incident details:', err);
    } finally {
      setLoadingDetails(false);
    }
  }

  function closeDetails() {
    setSelectedIncident(null);
    setIncidentDetails(null);
  }

  return (
    <div className="history-panel">
      <div className="panel-header-section">
        <div className="header-info">
          <div className="badge-pill">
            <Clock size={14} />
            <span>INCIDENT LOGS & RESOLUTION TRACKING</span>
          </div>
          <h2>Emergency Incident History</h2>
          <p className="subtitle">
            Timestamped audit trail of your activated SOS alerts, location logs, SMS notifications to emergency contacts, and responder assignments.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="loading-indicator">Loading emergency history...</div>
      ) : incidents.length === 0 ? (
        <div className="empty-contacts-card">
          <ShieldCheck size={36} className="muted-icon" />
          <h3>No Emergency Incidents on Record</h3>
          <p>
            You have not activated any SOS alerts yet. When an emergency is triggered, complete telemetry, location pins, and responder status updates will appear here.
          </p>
        </div>
      ) : (
        <div className="incidents-table-wrapper">
          <table className="aegis-table">
            <thead>
              <tr>
                <th>Incident ID</th>
                <th>Time & Date</th>
                <th>Distress Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Location</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc.id}>
                  <td>
                    <code className="incident-code-pill">{inc.incident_code || `SOS-2026-${inc.id}`}</code>
                  </td>
                  <td>
                    <span className="timestamp-text">
                      {new Date(inc.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </td>
                  <td>
                    <strong>{inc.incident_type || 'Emergency'}</strong>
                  </td>
                  <td>
                    <span className={`badge ${inc.priority?.toLowerCase() || 'medium'}`}>
                      {inc.priority || 'Medium'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill-badge ${inc.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                      {inc.status || 'Triggered'}
                    </span>
                  </td>
                  <td>
                    {inc.latitude != null ? (
                      <a
                        href={inc.google_maps_url || `https://www.google.com/maps?q=${inc.latitude},${inc.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="map-link-btn"
                        title="Open in Google Maps"
                      >
                        <MapPin size={13} /> {Number(inc.latitude).toFixed(3)}, {Number(inc.longitude).toFixed(3)}
                      </a>
                    ) : (
                      <span className="muted-text">Manual / Area</span>
                    )}
                  </td>
                  <td>
                    <button className="small-action-btn" onClick={() => viewDetails(inc)}>
                      View Details <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Incident Detail Modal */}
      {selectedIncident && (
        <div className="modal-overlay" onClick={closeDetails}>
          <div className="incident-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className={`badge ${selectedIncident.priority?.toLowerCase() || 'critical'}`}>
                  {selectedIncident.priority || 'Critical'} Priority
                </span>
                <h3 style={{ marginTop: 8 }}>
                  Incident {selectedIncident.incident_code || `SOS-2026-${selectedIncident.id}`}
                </h3>
                <small className="muted-text">
                  Reported on {new Date(selectedIncident.created_at).toLocaleString()}
                </small>
              </div>
              <button className="text-button" onClick={closeDetails}>
                <X size={20} />
              </button>
            </div>

            {loadingDetails ? (
              <div className="loading-indicator">Retrieving complete incident telemetry...</div>
            ) : incidentDetails ? (
              <div className="modal-body-scroll">
                {/* Status Progression Bar */}
                <div className="status-progression-box">
                  <h4>Status Progression:</h4>
                  <div className="status-flow">
                    {['Triggered', 'Received', 'Contacts Notified', 'In Progress', 'Resolved'].map(
                      (stepName, idx) => {
                        const historyItem = incidentDetails.statusHistory?.find(
                          (h) => h.status.toLowerCase() === stepName.toLowerCase()
                        );
                        const isCurrent = incidentDetails.incident?.status?.toLowerCase() === stepName.toLowerCase();
                        const isPast = historyItem != null;

                        return (
                          <div
                            key={stepName}
                            className={`flow-step ${isPast ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
                          >
                            <div className="step-circle">{isPast ? '✓' : idx + 1}</div>
                            <span className="step-name">{stepName}</span>
                            {historyItem && (
                              <small className="step-time">
                                {new Date(historyItem.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </small>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* Location & Google Maps */}
                <div className="modal-card-row">
                  <div className="modal-subcard">
                    <h4>Location Coordinates</h4>
                    <p>
                      <strong>Latitude:</strong> {incidentDetails.incident?.latitude || 'N/A'}<br />
                      <strong>Longitude:</strong> {incidentDetails.incident?.longitude || 'N/A'}<br />
                      <strong>Location:</strong> {incidentDetails.incident?.location_text || 'Standard GPS'}
                    </p>
                    {incidentDetails.incident?.google_maps_url && (
                      <a
                        href={incidentDetails.incident.google_maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="google-maps-link"
                      >
                        <MapPin size={15} /> Open Live Location in Google Maps <ExternalLink size={13} />
                      </a>
                    )}
                  </div>

                  <div className="modal-subcard">
                    <h4>AI Priority Analysis</h4>
                    <p>
                      <strong>Score:</strong> {incidentDetails.incident?.calculated_score || 95}/100<br />
                      <strong>Level:</strong> {incidentDetails.incident?.priority_level || incidentDetails.incident?.priority}<br />
                      <strong>AI Explanation:</strong> {incidentDetails.incident?.priority_explanation || 'Critical urgency triage calculated from telemetry.'}
                    </p>
                  </div>
                </div>

                {/* Notification SMS Logs */}
                <div className="modal-subcard full-width">
                  <h4>Trusted Contacts SMS Broadcast Logs</h4>
                  {incidentDetails.notifications?.length ? (
                    <div className="modal-notifications-list">
                      {incidentDetails.notifications.map((n) => (
                        <div key={n.id} className="notification-item-row">
                          <div className="notif-to">
                            <strong>{n.recipient_name}</strong> ({n.recipient_phone})
                          </div>
                          <div className="notif-status">
                            <span className="success-tag">{n.provider}</span>
                            <span className="status-text">{n.delivery_status}</span>
                          </div>
                          <div className="notif-msg">
                            <code>{n.message_body}</code>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-text">No SMS delivery records stored for this incident.</p>
                  )}
                </div>

                {/* Responder Assignment */}
                {incidentDetails.assignments?.length ? (
                  <div className="modal-subcard full-width">
                    <h4>Assigned Responders</h4>
                    {incidentDetails.assignments.map((a) => (
                      <div key={a.id} className="assignment-row">
                        <span>Unit: <strong>{a.unit_name || a.unit_dispatched}</strong> ({a.agency})</span>
                        <span>Responder: <strong>{a.responder_name}</strong></span>
                        <span>Status: <strong>{a.status}</strong></span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p>Details unavailable.</p>
            )}

            <div className="modal-footer">
              <button className="primary-btn" onClick={closeDetails}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
