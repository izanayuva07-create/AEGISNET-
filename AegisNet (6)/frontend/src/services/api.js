// AegisNet API Service with JWT authentication and offline fallback queue

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api/v1';

export function getToken() {
  return localStorage.getItem('aegisnet_token') || '';
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('aegisnet_token', token);
  } else {
    localStorage.removeItem('aegisnet_token');
  }
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('aegisnet_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem('aegisnet_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('aegisnet_user');
  }
}

// Request wrapper with automatic Bearer token injection
export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }

    return data;
  } catch (err) {
    // Check if network failed for offline SOS submission queue
    if (!navigator.onLine && endpoint === '/sos/trigger') {
      console.warn('[Offline Mode] Network unavailable. Enqueuing SOS payload to offline queue.');
      enqueueOfflineSos(options.body ? JSON.parse(options.body) : {});
      return {
        ok: true,
        offline: true,
        message: 'SOS preserved in offline storage. It will synchronize automatically when connection is restored.',
        incident: {
          id: 'OFFLINE-' + Date.now(),
          incident_code: 'OFFLINE-QUEUED',
          status: 'Offline Queued'
        }
      };
    }
    throw err;
  }
}

// Offline Queue Management
export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem('aegisnet_offline_queue');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineSos(payload) {
  const queue = getOfflineQueue();
  const enriched = {
    ...payload,
    enqueued_at: new Date().toISOString(),
    idempotency_key: payload.idempotency_key || `offline-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  };
  queue.push(enriched);
  localStorage.setItem('aegisnet_offline_queue', JSON.stringify(queue));
  return enriched;
}

export async function flushOfflineQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0 };

  try {
    const res = await apiRequest('/offline-sync', {
      method: 'POST',
      body: JSON.stringify({ events: queue })
    });
    localStorage.removeItem('aegisnet_offline_queue');
    return { synced: queue.length, result: res };
  } catch (err) {
    console.error('Failed to flush offline queue:', err);
    throw err;
  }
}

// Grouped API Endpoints
export const authApi = {
  register: (data) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: () => apiRequest('/auth/profile'),
  updateProfile: (data) => apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify(data) })
};

export const contactsApi = {
  getAll: () => apiRequest('/contacts'),
  add: (contact) => apiRequest('/contacts', { method: 'POST', body: JSON.stringify(contact) }),
  update: (id, contact) => apiRequest(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(contact) }),
  delete: (id) => apiRequest(`/contacts/${id}`, { method: 'DELETE' })
};

export const sosApi = {
  trigger: (payload) => apiRequest('/sos/trigger', { method: 'POST', body: JSON.stringify(payload) }),
  getActive: () => apiRequest('/sos/active'),
  getHistory: () => apiRequest('/sos/history'),
  getDetails: (id) => apiRequest(`/sos/${id}`),
  updateStatus: (id, status, notes) => apiRequest(`/sos/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes })
  }),
  dispatch: (id, data) => apiRequest(`/sos/${id}/dispatch`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  geocode: (body) => apiRequest('/geocode', { method: 'POST', body: JSON.stringify(body) })
};

export const organisationApi = {
  register: (data) => apiRequest('/organisation/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => apiRequest('/organisation/login', { method: 'POST', body: JSON.stringify(data) }),
  getDashboard: () => apiRequest('/organisation/dashboard'),
  getIncidents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/organisation/incidents${q ? '?' + q : ''}`);
  },
  getIncidentDetails: (id) => apiRequest(`/organisation/incidents/${id}`),
  updateStatus: (id, status, remarks) => apiRequest(`/organisation/incidents/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, remarks })
  }),
  assignResponder: (id, data) => apiRequest(`/organisation/incidents/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getResponders: () => apiRequest('/organisation/responders'),
  addResponder: (data) => apiRequest('/organisation/responders', { method: 'POST', body: JSON.stringify(data) }),
  updateResponder: (id, data) => apiRequest(`/organisation/responders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteResponder: (id) => apiRequest(`/organisation/responders/${id}`, { method: 'DELETE' }),
  getSettings: () => apiRequest('/organisation/settings'),
  updateSettings: (data) => apiRequest('/organisation/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getNotificationLogs: () => apiRequest('/organisation/notification-logs')
};
