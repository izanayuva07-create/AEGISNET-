// AegisNet Socket.IO Client Service for Real-Time Responder Updates
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://127.0.0.1:5000';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500
    });

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected to AegisNet dispatch core:', socket.id);
      socket.emit('join_responders');
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.warn('[Socket.IO] Connection warning:', error.message);
    });
  }

  return socket;
}

export function subscribeToIncidents(callback) {
  const s = getSocket();
  const onNewSos = (incident) => callback({ type: 'NEW_INCIDENT', data: incident });
  const onStatusChange = (update) => callback({ type: 'STATUS_CHANGED', data: update });
  const onUnitDispatched = (dispatch) => callback({ type: 'UNIT_DISPATCHED', data: dispatch });

  s.on('new_sos_incident', onNewSos);
  s.on('incident_status_changed', onStatusChange);
  s.on('unit_dispatched', onUnitDispatched);

  return () => {
    s.off('new_sos_incident', onNewSos);
    s.off('incident_status_changed', onStatusChange);
    s.off('unit_dispatched', onUnitDispatched);
  };
}
