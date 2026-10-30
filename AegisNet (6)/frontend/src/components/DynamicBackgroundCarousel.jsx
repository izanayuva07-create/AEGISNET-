import React, { useState, useEffect } from 'react';

const BACKGROUND_STREAMS = [
  {
    url: '/bg_satellite_constellation.jpg',
    title: 'STREAM 01 // ORBITAL LEO SATELLITE MESH',
    subtitle: 'Global Low-Earth Orbit Telemetry Relay Active'
  },
  {
    url: '/bg_tactical_dispatch.jpg',
    title: 'STREAM 02 // TACTICAL RAPID RESPONSE GRID',
    subtitle: 'Autonomous GIS Navigation & Vector Routing'
  },
  {
    url: '/bg_disaster_coordination.jpg',
    title: 'STREAM 03 // 360° CRISIS OPERATIONS RADAR',
    subtitle: 'State Disaster Management & Multi-Agency Command'
  },
  {
    url: '/bg_cyber_shield_matrix.jpg',
    title: 'STREAM 04 // METROPOLITAN CYBER SHIELD',
    subtitle: 'Encrypted Citizen Protection & Coordinate Matrix'
  }
];

export default function DynamicBackgroundCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Rotate images every 2 seconds (2000ms)
  useEffect(() => {
    // Preload all 4 images on mount
    BACKGROUND_STREAMS.forEach((item) => {
      const img = new Image();
      img.src = item.url;
    });

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % BACKGROUND_STREAMS.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const activeStream = BACKGROUND_STREAMS[currentIndex];

  return (
    <div className="dynamic-background-container" aria-hidden="true">
      {/* 4 Layered Background Slides with 0.8s crossfade transition */}
      {BACKGROUND_STREAMS.map((item, idx) => (
        <div
          key={item.url}
          className={`dynamic-bg-slide ${idx === currentIndex ? 'active' : ''}`}
          style={{ backgroundImage: `url(${item.url})` }}
        />
      ))}

      {/* Dark Obsidian & Gold Radial Gradient Overlays for Maximum Readability */}
      <div className="dynamic-bg-dark-overlay" />
      <div className="dynamic-bg-vignette" />

      {/* Subtle Stream HUD Ticker at Bottom Right */}
      <div className="dynamic-bg-hud-ticker">
        <div className="ticker-pulse-dot" />
        <div className="ticker-text-block">
          <span className="ticker-stream-title">{activeStream.title}</span>
          <span className="ticker-stream-sub">{activeStream.subtitle}</span>
        </div>
        <div className="ticker-dots-row">
          {BACKGROUND_STREAMS.map((_, i) => (
            <span
              key={i}
              className={`ticker-dot ${i === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
