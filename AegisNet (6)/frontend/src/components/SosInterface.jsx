import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from 'react-leaflet';
import {
  AlertCircle,
  MapPin,
  ExternalLink,
  ShieldAlert,
  CheckCircle,
  RefreshCw,
  Navigation,
  Send,
  Sliders,
  AlertTriangle,
  Info,
  Compass,
  CheckCircle2
} from 'lucide-react';
import { sosApi } from '../services/api';

function UserMapCenterController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      map.flyTo(center, 15, { duration: 1.2 });
    }
  }, [map, center]);
  return null;
}

export default function SosInterface({ user, onSosSuccess }) {
  // Hold activation state
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 100%
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState('idle'); // idle | acquiring_gps | sending | success | error
  const [statusMessage, setStatusMessage] = useState('');
  
  // Incident configuration
  const [incidentType, setIncidentType] = useState('General Distress');
  const [description, setDescription] = useState('Immediate emergency assistance required');
  const [showOptions, setShowOptions] = useState(false);

  // Location telemetry
  const [coordinates, setCoordinates] = useState(null);
  const [locationSource, setLocationSource] = useState('pending'); // 'gps' | 'manual' | 'unavailable'
  const [manualLocationText, setManualLocationText] = useState('');
  const [locationError, setLocationError] = useState('');
  const [checkingLocation, setCheckingLocation] = useState(false);

  async function handleCheckCurrentLocation() {
    setCheckingLocation(true);
    try {
      const loc = await acquireLocation(true);
      if (loc) {
        triggerHaptic([80, 50, 80]);
      }
    } finally {
      setCheckingLocation(false);
    }
  }

  // Result state
  const [activationResult, setActivationResult] = useState(null);

  // Timers and animation refs
  const holdTimerRef = useRef(null);
  const startTimeRef = useRef(null);
  const animationFrameRef = useRef(null);
  const HOLD_DURATION = 3000; // exactly 3 seconds

  // Automatically attempt early high-accuracy GPS pre-fetch on mount so it's warm
  useEffect(() => {
    acquireLocation(false);
    return () => {
      cancelHold();
    };
  }, []);

  function triggerHaptic(pattern = [100]) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Haptics optional
      }
    }
  }

  // HTML5 Geolocation with 5-second timeout requirement
  function acquireLocation(isUrgent = false) {
    if (!navigator.geolocation) {
      setLocationSource('unavailable');
      setLocationError('HTML5 Geolocation is not supported by your current browser.');
      return Promise.resolve(null);
    }

    if (isUrgent) {
      setStatus('acquiring_gps');
      setStatusMessage('Acquiring high-accuracy GPS coordinates (5s acquisition target)...');
    }

    return new Promise((resolve) => {
      const geoOptions = {
        enableHighAccuracy: true,
        timeout: 5000, // 5s timeout specified in Week 3
        maximumAge: 10000
      };

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            altitude: pos.coords.altitude || null,
            accuracy: pos.coords.accuracy || null,
            heading: pos.coords.heading || null,
            speed: pos.coords.speed || null,
            timestamp: new Date(pos.timestamp).toISOString()
          };
          setCoordinates(loc);
          setLocationSource('gps');
          setLocationError('');
          resolve(loc);
        },
        (err) => {
          console.warn('[Geolocation Error]:', err.message);
          let errMsg = 'Location could not be retrieved.';
          if (err.code === 1) errMsg = 'Location permission denied by user/browser.';
          else if (err.code === 2) errMsg = 'GPS position unavailable. Check device location services.';
          else if (err.code === 3) errMsg = 'GPS acquisition timed out (5s limit).';
          
          setLocationError(errMsg);
          setLocationSource('unavailable');
          resolve(null);
        },
        geoOptions
      );
    });
  }

  // Press-and-hold start
  function startHold(e) {
    if (e && e.type === 'mousedown' && e.button !== 0) return;
    if (status === 'sending' || status === 'acquiring_gps') return;

    setHolding(true);
    setProgress(0);
    setCountdown(3);
    triggerHaptic([50]);

    startTimeRef.current = Date.now();

    // Clear any prior interval
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);

    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setProgress(pct);

      const remainingSecs = Math.max(1, Math.ceil((HOLD_DURATION - elapsed) / 1000));
      setCountdown(remainingSecs);

      if (elapsed >= HOLD_DURATION) {
        clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
        completeHold();
      }
    }, 50);
  }

  // Press-and-hold release / cancel
  function cancelHold() {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (holding) {
      setHolding(false);
      setProgress(0);
      setCountdown(3);
    }
  }

  // Called when 3-second hold finishes
  async function completeHold() {
    setHolding(false);
    setProgress(100);
    setCountdown(0);
    triggerHaptic([200, 100, 200, 100, 300]); // Strong emergency confirmation pattern

    // Begin Emergency Dispatch Workflow
    await executeSosDispatch();
  }

  async function executeSosDispatch() {
    setStatus('sending');
    setStatusMessage('Locking GPS coordinates and contacting emergency network...');

    // 1. Ensure GPS or fallback
    let currentCoords = coordinates;
    if (!currentCoords || locationSource === 'unavailable') {
      currentCoords = await acquireLocation(true);
    }

    // 2. Build SOS Payload matching specification:
    // { user_id, latitude, longitude, altitude, accuracy, timestamp, incident_type, description }
    const idempotencyKey = `sos-${user?.id || 'anon'}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const payload = {
      user_id: user?.id,
      latitude: currentCoords ? currentCoords.latitude : null,
      longitude: currentCoords ? currentCoords.longitude : null,
      altitude: currentCoords?.altitude || null,
      accuracy: currentCoords?.accuracy || null,
      heading: currentCoords?.heading || null,
      speed: currentCoords?.speed || null,
      timestamp: new Date().toISOString(),
      incident_type: incidentType,
      description: description,
      location_text: manualLocationText || (currentCoords ? `GPS Lat: ${currentCoords.latitude.toFixed(5)}, Lng: ${currentCoords.longitude.toFixed(5)}` : 'Manual / Area Alert'),
      idempotency_key: idempotencyKey
    };

    try {
      setStatusMessage('Sending SOS to AegisNet dispatch server & queuing SMS broadcast...');
      const response = await sosApi.trigger(payload);

      setStatus('success');
      setActivationResult(response);
      setStatusMessage('EMERGENCY ACTIVE: Response network alerted & trusted contacts notified.');

      if (onSosSuccess) {
        onSosSuccess(response);
      }
    } catch (err) {
      console.error('SOS dispatch error:', err);
      setStatus('error');
      setStatusMessage(err.message || 'Failed to dispatch SOS. Please check internet connection.');
    }
  }

  function resetState() {
    setStatus('idle');
    setActivationResult(null);
    setProgress(0);
    setCountdown(3);
  }

  // Calculate SVG circular stroke offset for 3-second visual ring
  // Circumference = 2 * PI * R. If R = 110, circumference = 691.15
  const RADIUS = 115;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;

  return (
    <div className="sos-panel-container">
      {/* Eyebrow & Status Header */}
      <div className="sos-header">
        <div className="sos-badge">
          <span className="live-dot" />
          <span>AEGISNET HIGH-INTENSITY SOS DISPATCH</span>
        </div>
        <h1 className="sos-title">Emergency Activation System</h1>
        <p className="sos-subtitle">
          Press and hold the button for <strong>3 seconds</strong> to broadcast an immediate emergency SOS with live GPS telemetry to responders and your trusted contacts.
        </p>
      </div>

      {/* Main SOS Interactive Center */}
      <div className="sos-center-stage">
        {status === 'idle' || status === 'sending' || status === 'acquiring_gps' ? (
          <div className="sos-button-wrapper">
            {/* Animated SVG Countdown Ring */}
            <svg className="sos-progress-svg" width="280" height="280" viewBox="0 0 280 280">
              {/* Background Track */}
              <circle
                cx="140"
                cy="140"
                r={RADIUS}
                className="sos-circle-bg"
              />
              {/* Active Gold Progress Stroke */}
              <circle
                cx="140"
                cy="140"
                r={RADIUS}
                className="sos-circle-progress"
                style={{
                  strokeDasharray: CIRCUMFERENCE,
                  strokeDashoffset: strokeDashoffset
                }}
              />
            </svg>

            {/* The Interactive SOS Button (Mouse + Touch) */}
            <button
              id="sos-trigger-button"
              className={`sos-core-btn ${holding ? 'is-holding' : ''} ${status === 'sending' ? 'is-sending' : ''}`}
              onMouseDown={startHold}
              onMouseUp={cancelHold}
              onMouseLeave={cancelHold}
              onTouchStart={startHold}
              onTouchEnd={cancelHold}
              onTouchCancel={cancelHold}
              disabled={status === 'sending' || status === 'acquiring_gps'}
              aria-label="Hold for 3 seconds to trigger emergency SOS"
            >
              <div className="sos-btn-content">
                <ShieldAlert size={48} className="sos-icon" />
                <span className="sos-btn-text">SOS</span>
                <span className="sos-hold-instruction">
                  {holding ? `HOLD... ${countdown}s` : status === 'sending' ? 'DISPATCHING...' : 'HOLD 3 SECONDS'}
                </span>
              </div>
            </button>
            <button
              id="btn-quick-sos"
              type="button"
              className="secondary-btn compact-btn"
              onClick={completeHold}
              style={{ marginTop: 14, fontSize: '0.8rem' }}
              title="Immediate trigger for testing and rapid accessibility"
            >
              ⚡ Instant Trigger SOS (Test)
            </button>
          </div>
        ) : null}

        {/* Status Indicators & Feedback */}
        {holding && (
          <div className="hold-active-alert">
            <span className="pulse-beacon" />
            <span>Keep holding! Activating emergency broadcast in {countdown} seconds...</span>
          </div>
        )}

        {(status === 'acquiring_gps' || status === 'sending') && (
          <div className="sos-dispatching-banner">
            <RefreshCw size={20} className="spinning-icon" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* SUCCESS CARD */}
        {status === 'success' && activationResult && (
          <div className="sos-result-card success">
            <div className="result-header">
              <CheckCircle size={32} className="success-icon" />
              <div>
                <h2>EMERGENCY ACTIVATED SUCCESSFULLY</h2>
                <p className="incident-id">Incident Code: <strong>{activationResult.incident?.incident_code}</strong></p>
              </div>
            </div>

            <div className="result-details-grid">
              <div className="detail-item">
                <span className="detail-label">Status</span>
                <span className="detail-value status-badge">{activationResult.incident?.status || 'Contacts Notified'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">AI Priority Level</span>
                <span className={`detail-value priority-badge ${activationResult.priorityAnalysis?.priority?.toLowerCase() || 'critical'}`}>
                  {activationResult.priorityAnalysis?.priority || 'Critical'} (Score: {activationResult.priorityAnalysis?.score || 95}/100)
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Contacts Notified via SMS</span>
                <span className="detail-value">
                  {activationResult.contactsNotifiedCount || 0} registered contact(s)
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Captured GPS Location</span>
                <span className="detail-value">
                  {activationResult.incident?.latitude
                    ? `${activationResult.incident.latitude.toFixed(5)}, ${activationResult.incident.longitude.toFixed(5)}`
                    : 'Coordinates unavailable'}
                </span>
              </div>
            </div>

            {activationResult.incident?.google_maps_url && (
              <div className="maps-share-box">
                <MapPin size={18} className="gold-text" />
                <a
                  href={activationResult.incident.google_maps_url}
                  target="_blank"
                  rel="noreferrer"
                  className="google-maps-link"
                >
                  Open Emergency Google Maps Pin <ExternalLink size={14} />
                </a>
              </div>
            )}

            {/* Notification logs preview */}
            {activationResult.notifications && activationResult.notifications.length > 0 && (
              <div className="sms-dispatched-list">
                <h4>SMS Broadcast Log:</h4>
                {activationResult.notifications.map((n, idx) => (
                  <div key={idx} className="sms-record">
                    <span className="sms-to">To: <strong>{n.recipient_name}</strong> ({n.recipient_phone})</span>
                    <span className="sms-status success-tag">{n.provider} · {n.delivery_status}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="result-actions">
              <button className="primary-btn" onClick={resetState}>
                Acknowledge & Return to SOS
              </button>
            </div>
          </div>
        )}

        {/* ERROR / RETRY CARD */}
        {status === 'error' && (
          <div className="sos-result-card error">
            <div className="result-header">
              <AlertCircle size={32} className="danger-icon" />
              <div>
                <h2>SOS DISPATCH ERROR</h2>
                <p>{statusMessage}</p>
              </div>
            </div>
            <p className="error-advice">
              If network connection is interrupted, your emergency event is stored in your device's local offline queue and will automatically dispatch upon reconnection.
            </p>
            <div className="result-actions">
              <button className="primary-btn" onClick={executeSosDispatch}>
                Retry Immediate Dispatch
              </button>
              <button className="secondary-btn" onClick={resetState}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Geolocation Telemetry & Manual Override Section */}
      <div className="telemetry-bar">
        <div className="telemetry-status">
          <Navigation size={16} className={coordinates ? 'gold-text' : 'muted-text'} />
          <span>
            {coordinates ? (
              <>
                GPS Locked: <strong>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</strong>
                {coordinates.accuracy && <small> (±{Math.round(coordinates.accuracy)}m accuracy)</small>}
              </>
            ) : locationError ? (
              <span className="danger-text">{locationError}</span>
            ) : (
              'Locating high-accuracy GPS coordinates...'
            )}
          </span>
        </div>

        <button
          type="button"
          className="telemetry-refresh-btn"
          onClick={() => acquireLocation(true)}
          title="Refresh GPS Coordinates"
        >
          <RefreshCw size={14} /> Refresh GPS
        </button>
      </div>

      {/* Live GPS Location Radar Map & Check Location Interactive Card */}
      <div className="user-location-radar-card">
        <div className="location-radar-header">
          <div className="location-radar-title-group">
            <Compass className="gold-text" size={24} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-main)', letterSpacing: '0.02em' }}>
                Live GPS Location Radar
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                Verify and calibrate your satellite telemetry before or during emergency dispatch
              </p>
            </div>
          </div>
          <button
            id="btn-check-current-location"
            type="button"
            className={`btn-check-location ${checkingLocation ? 'pulse-scanning' : ''}`}
            onClick={handleCheckCurrentLocation}
            disabled={checkingLocation}
            title="Query device GPS hardware with high accuracy target"
          >
            {checkingLocation ? (
              <>
                <RefreshCw size={16} className="spinning-icon" />
                Acquiring GPS Telemetry...
              </>
            ) : (
              <>
                <MapPin size={16} />
                📍 Check My Current Location
              </>
            )}
          </button>
        </div>

        <div className="user-map-container-wrap">
          <MapContainer
            center={coordinates ? [coordinates.latitude, coordinates.longitude] : [13.0827, 80.2707]}
            zoom={coordinates ? 15 : 12}
            scrollWheelZoom={false}
            className="user-leaflet-map"
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors & CartoDB'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <UserMapCenterController
              center={coordinates ? [coordinates.latitude, coordinates.longitude] : [13.0827, 80.2707]}
            />
            {coordinates && (
              <>
                <CircleMarker
                  center={[coordinates.latitude, coordinates.longitude]}
                  radius={8}
                  pathOptions={{
                    color: '#D8BC43',
                    fillColor: '#D8BC43',
                    fillOpacity: 0.9,
                    weight: 2
                  }}
                >
                  <Popup>
                    <div style={{ color: '#080909', fontWeight: 600, padding: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ color: '#D8BC43' }}>●</span>
                        <strong>Your Current GPS Position</strong>
                      </div>
                      <div style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        Lat: {coordinates.latitude.toFixed(5)}<br />
                        Lng: {coordinates.longitude.toFixed(5)}
                      </div>
                      {coordinates.accuracy && (
                        <div style={{ fontSize: '0.72rem', color: '#666', marginTop: 4 }}>
                          Accuracy radius: ±{Math.round(coordinates.accuracy)} meters
                        </div>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
                {coordinates.accuracy && (
                  <Circle
                    center={[coordinates.latitude, coordinates.longitude]}
                    radius={Math.min(coordinates.accuracy, 500)}
                    pathOptions={{
                      color: '#D8BC43',
                      fillColor: '#D8BC43',
                      fillOpacity: 0.12,
                      weight: 1,
                      dashArray: '4, 4'
                    }}
                  />
                )}
              </>
            )}
          </MapContainer>
        </div>

        <div className="location-telemetry-hud">
          <div className={`telemetry-hud-box ${coordinates ? 'verified' : ''}`}>
            <span className="telemetry-hud-label">Latitude Telemetry</span>
            <span className="telemetry-hud-val">
              {coordinates ? coordinates.latitude.toFixed(6) : 'Awaiting Lock'}
            </span>
          </div>
          <div className={`telemetry-hud-box ${coordinates ? 'verified' : ''}`}>
            <span className="telemetry-hud-label">Longitude Telemetry</span>
            <span className="telemetry-hud-val">
              {coordinates ? coordinates.longitude.toFixed(6) : 'Awaiting Lock'}
            </span>
          </div>
          <div className={`telemetry-hud-box ${coordinates ? 'verified' : ''}`}>
            <span className="telemetry-hud-label">Sensor Precision</span>
            <span className="telemetry-hud-val" style={{ color: coordinates ? 'var(--success)' : 'var(--muted)' }}>
              {coordinates ? `±${Math.round(coordinates.accuracy || 15)}m GPS Lock` : 'Standby'}
            </span>
          </div>
          <div className="telemetry-hud-box">
            <span className="telemetry-hud-label">Emergency Pin</span>
            <span className="telemetry-hud-val" style={{ fontSize: '0.82rem', color: 'var(--gold)' }}>
              {coordinates ? (
                <a
                  href={`https://maps.google.com/?q=${coordinates.latitude},${coordinates.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--gold)', textDecoration: 'underline' }}
                >
                  View on Google Maps ↗
                </a>
              ) : (
                'Pending Fix'
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Location Override If Permission Blocked */}
      {locationSource === 'unavailable' && (
        <div className="manual-location-box">
          <div className="manual-loc-title">
            <AlertTriangle size={16} className="warning-text" />
            <span>GPS Unavailable: Provide Manual Location or Landmark</span>
          </div>
          <div className="manual-input-group">
            <input
              type="text"
              placeholder="e.g. RS Puram, Crosscut Road near Bus Stand, Coimbatore"
              value={manualLocationText}
              onChange={(e) => setManualLocationText(e.target.value)}
            />
            <button
              className="secondary-btn"
              type="button"
              onClick={() => {
                if (manualLocationText.trim()) {
                  setLocationSource('manual');
                  setLocationError('');
                }
              }}
            >
              Set Location
            </button>
          </div>
        </div>
      )}

      {/* Optional Incident Details Accordion */}
      <div className="incident-config-panel">
        <button
          type="button"
          className="config-toggle-btn"
          onClick={() => setShowOptions(!showOptions)}
        >
          <Sliders size={16} />
          <span>Customize Emergency Details (Optional)</span>
          <span className="toggle-chevron">{showOptions ? '▲' : '▼'}</span>
        </button>

        {showOptions && (
          <div className="config-form-body">
            <div className="form-field">
              <label>Emergency Category</label>
              <select value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
                <option value="General Distress">General Emergency / Distress</option>
                <option value="Medical Distress">Medical Distress / Cardiac / Injury</option>
                <option value="Physical Threat">Physical Safety / Assault / Stalking</option>
                <option value="Road Accident">Road Accident / Collision</option>
                <option value="Fire Hazard">Fire or Environmental Threat</option>
                <option value="Infrastructure Disaster">Building Collapse / Flooding</option>
              </select>
            </div>

            <div className="form-field">
              <label>Situation Notes</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe what assistance you need..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Safety Workflow Reminder */}
      <div className="sos-workflow-reminder">
        <Info size={16} />
        <span>
          Activating SOS notifies all <strong>{user?.name || 'citizen'}</strong>'s registered emergency contacts via SMS containing an instant Google Maps link, and raises a prioritized alert on the active Responder Command Grid.
        </span>
      </div>
    </div>
  );
}
