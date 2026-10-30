import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getOfflineQueue, flushOfflineQueue } from '../services/api';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncedNotice, setSyncedNotice] = useState('');

  useEffect(() => {
    updateCount();

    function handleOnline() {
      setIsOnline(true);
      autoSync();
    }

    function handleOffline() {
      setIsOnline(false);
      updateCount();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  function updateCount() {
    setPendingCount(getOfflineQueue().length);
  }

  async function autoSync() {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    setSyncing(true);
    try {
      const res = await flushOfflineQueue();
      setSyncedNotice(`Synchronized ${res.synced} offline emergency records to backend.`);
      updateCount();
      setTimeout(() => setSyncedNotice(''), 4000);
    } catch (err) {
      console.warn('Auto sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }

  if (isOnline && pendingCount === 0 && !syncedNotice) {
    return null; // Don't show when normal online with no pending queue
  }

  return (
    <div className={`network-banner ${!isOnline ? 'offline' : 'syncing'}`}>
      <div className="banner-content">
        {!isOnline ? (
          <>
            <WifiOff size={16} />
            <span>
              <strong>Network Disconnected (Offline Protection Active):</strong> Any SOS activated now will be securely queued on your device and auto-dispatched with idempotency when connection restores.
            </span>
            {pendingCount > 0 && <span className="pending-pill">{pendingCount} Queued</span>}
          </>
        ) : syncedNotice ? (
          <>
            <CheckCircle2 size={16} className="success-icon" />
            <span>{syncedNotice}</span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <Wifi size={16} />
            <span>Connection restored. {pendingCount} offline event(s) waiting to sync.</span>
            <button
              type="button"
              className="sync-now-btn"
              onClick={autoSync}
              disabled={syncing}
            >
              <RefreshCw size={13} className={syncing ? 'spinning-icon' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
