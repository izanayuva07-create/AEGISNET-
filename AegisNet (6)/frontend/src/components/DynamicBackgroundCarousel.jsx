import React, { useState, useEffect } from 'react';
import { Sparkles, Play, Pause, Layers, Eye } from 'lucide-react';

export const AI_BACKGROUND_STREAMS = [
  {
    id: 'cyber-shield',
    url: '/aegis_ai_cyber_shield.jpg',
    tag: 'AI STREAM 01',
    title: 'METROPOLITAN CYBER SHIELD',
    subtitle: 'Hexagonal Defense Dome & Orbital Telemetry Mesh',
    badge: 'AI DEFENSE GRID'
  },
  {
    id: 'tactical-command',
    url: '/aegis_ai_tactical_command.jpg',
    tag: 'AI STREAM 02',
    title: '360° CRISIS OPERATIONS COMMAND',
    subtitle: 'Multi-Agency Incident Radar & Leaflet Tactical GIS Grid',
    badge: 'COMMAND RADAR'
  },
  {
    id: 'satellite-mesh',
    url: '/aegis_ai_satellite_mesh.jpg',
    tag: 'AI STREAM 03',
    title: 'ORBITAL LEO SATELLITE CONSTELLATION',
    subtitle: 'Global Low-Earth Orbit Telemetry & Quantum SOS Relay',
    badge: 'ORBITAL MESH'
  },
  {
    id: 'rapid-response',
    url: '/aegis_ai_rapid_response.jpg',
    tag: 'AI STREAM 04',
    title: 'RAPID RESPONSE CONVOY & GIS ROUTING',
    subtitle: 'Autonomous Waypoint Interception & City Emergency Fleet',
    badge: 'TACTICAL DISPATCH'
  }
];

export default function DynamicBackgroundCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [vibrancyMode, setVibrancyMode] = useState('vivid'); // 'vivid' | 'balanced' | 'ambient'
  const [showDrawer, setShowDrawer] = useState(false);

  // Preload images once on mount
  useEffect(() => {
    AI_BACKGROUND_STREAMS.forEach((item) => {
      const img = new Image();
      img.src = item.url;
    });
  }, []);

  // Cinematic 6-second rotation interval (pausable)
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % AI_BACKGROUND_STREAMS.length);
    }, 6000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const activeStream = AI_BACKGROUND_STREAMS[currentIndex];

  function cycleVibrancy() {
    setVibrancyMode((prev) => {
      if (prev === 'vivid') return 'balanced';
      if (prev === 'balanced') return 'ambient';
      return 'vivid';
    });
  }

  return (
    <div className="dynamic-background-container" aria-hidden="true">
      {/* Layered AI Background Slides with 1.2s crossfade + subtle slow zoom */}
      {AI_BACKGROUND_STREAMS.map((item, idx) => (
        <div
          key={item.url}
          className={`dynamic-bg-slide ${idx === currentIndex ? 'active' : ''}`}
          style={{ backgroundImage: `url(${item.url})` }}
        />
      ))}

      {/* Dark Obsidian & Gold Radial Gradient Overlays with dynamic vibrancy */}
      <div className={`dynamic-bg-dark-overlay mode-${vibrancyMode}`} />
      <div className="dynamic-bg-vignette" />

      {/* Interactive AI Background HUD Controller at Bottom Right */}
      <div className="dynamic-bg-hud-ticker">
        {/* Pulsing AI Indicator */}
        <div className="ticker-pulse-dot" title="Live AI Video Telemetry Active" />

        {/* AI Background Info Text */}
        <div className="ticker-text-block">
          <div className="ticker-badge-row">
            <span className="ticker-ai-chip">
              <Sparkles size={10} /> AI GENERATED
            </span>
            <span className="ticker-tag">{activeStream.tag}</span>
          </div>
          <span className="ticker-stream-title">{activeStream.title}</span>
          <span className="ticker-stream-sub">{activeStream.subtitle}</span>
        </div>

        {/* Stream Dots / Quick Selector */}
        <div className="ticker-dots-row">
          {AI_BACKGROUND_STREAMS.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`ticker-dot ${i === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(i)}
              title={`Switch to ${item.title}`}
              aria-label={`Switch to ${item.title}`}
            />
          ))}
        </div>

        {/* Play / Pause Toggle Button */}
        <button
          type="button"
          className="ticker-action-btn"
          onClick={() => setIsPaused((prev) => !prev)}
          title={isPaused ? 'Resume auto-rotation' : 'Pause on this background'}
          aria-label={isPaused ? 'Resume auto-rotation' : 'Pause on this background'}
        >
          {isPaused ? <Play size={12} /> : <Pause size={12} />}
        </button>

        {/* Vibrancy Mode Toggle Button */}
        <button
          type="button"
          className="ticker-action-btn"
          onClick={cycleVibrancy}
          title={`Vibrancy: ${vibrancyMode.toUpperCase()} (Click to toggle Vivid / Balanced / Ambient)`}
          aria-label="Toggle background vibrancy mode"
        >
          <Eye size={12} />
          <span className="vibrancy-label">{vibrancyMode}</span>
        </button>

        {/* Visual Gallery Drawer Toggle */}
        <button
          type="button"
          className={`ticker-action-btn ${showDrawer ? 'active' : ''}`}
          onClick={() => setShowDrawer((prev) => !prev)}
          title="Open AI Background Gallery Drawer"
          aria-label="Toggle AI Background Gallery Drawer"
        >
          <Layers size={12} />
        </button>
      </div>

      {/* Visual Gallery Drawer Modal / Flyout */}
      {showDrawer && (
        <div className="ai-bg-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="ai-bg-drawer-header">
            <div className="ai-bg-drawer-title">
              <Sparkles size={14} className="gold-text" />
              <span>AegisNet AI Background Canvas</span>
            </div>
            <button
              type="button"
              className="ai-bg-drawer-close"
              onClick={() => setShowDrawer(false)}
            >
              ✕
            </button>
          </div>
          <p className="ai-bg-drawer-hint">
            Select an AI-synthesized emergency defense background stream:
          </p>
          <div className="ai-bg-grid">
            {AI_BACKGROUND_STREAMS.map((item, idx) => (
              <div
                key={item.id}
                className={`ai-bg-thumb-card ${idx === currentIndex ? 'selected' : ''}`}
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsPaused(true);
                }}
              >
                <div
                  className="ai-bg-thumb-img"
                  style={{ backgroundImage: `url(${item.url})` }}
                />
                <div className="ai-bg-thumb-meta">
                  <div className="ai-bg-thumb-tag">{item.tag}</div>
                  <strong className="ai-bg-thumb-title">{item.title}</strong>
                  <span className="ai-bg-thumb-badge">{item.badge}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

