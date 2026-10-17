// Small Supabase Auth and PostgREST client surface used by the Wealth Manager.
// Keeping this to fetch avoids pulling a large SDK into the hackathon bundle.
const url = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const sessionKey = url ? `velora-supabase-session:${new URL(url).hostname}` : '';

export const supabaseConfigured = Boolean(url && anonKey);
let currentSession = null;
let sessionTimer = null;
let refreshPending = null;
const listeners = new Set();

function authError(message) { return { message: typeof message === 'string' ? message : 'Supabase request failed.' }; }
function saveSession(session) {
  currentSession = session;
  if (!supabaseConfigured) return;
  try {
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
  } catch { /* Session remains active in memory for this tab. */ }
  if (sessionTimer) clearTimeout(sessionTimer);
  if (session?.expires_at) {
    sessionTimer = setTimeout(() => { void refreshSession(); }, Math.max(1000, (session.expires_at - Math.floor(Date.now() / 1000) - 60) * 1000));
  }
}
function emit(event, session) {
  saveSession(session);
  for (const callback of listeners) callback(event, session);
}
function storedSession() {
  if (currentSession) return currentSession;
  try { currentSession = JSON.parse(localStorage.getItem(sessionKey) || 'null'); }
  catch { currentSession = null; }
  return currentSession;
}
async function authRequest(path, body, accessToken) {
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.msg || payload.message || payload.error_description || payload.error || 'Authentication failed.');
  return payload;
}
function normalizeSession(payload) {
  if (!payload?.access_token || !payload?.refresh_token || !payload?.user) return null;
  return { access_token: payload.access_token, refresh_token: payload.refresh_token, token_type: payload.token_type || 'bearer', expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600), user: payload.user };
}
async function refreshSession() {
  if (refreshPending) return refreshPending;
  const existing = storedSession();
  if (!existing?.refresh_token) return null;
  refreshPending = (async () => {
    try {
      const payload = await authRequest('token?grant_type=refresh_token', { refresh_token: existing.refresh_token });
      const next = normalizeSession(payload);
      emit('TOKEN_REFRESHED', next);
      return next;
    } catch {
      emit('SIGNED_OUT', null);
      return null;
    } finally { refreshPending = null; }
  })();
  return refreshPending;
}
async function getValidSession() {
  const existing = storedSession();
  if (!existing) return null;
  if (existing.expires_at > Math.floor(Date.now() / 1000) + 60) return existing;
  return refreshSession();
}
async function databaseRequest(table, method, params, row) {
  const session = await getValidSession();
  if (!session?.access_token) return { data: null, error: authError('Sign in to access your saved simulation.') };
  const endpoint = new URL(`${url}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params || {})) endpoint.searchParams.set(key, value);
  const response = await fetch(endpoint, { method, headers: {
    apikey: anonKey,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    ...(method === 'POST' ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : { Accept: 'application/json' }),
  }, ...(row ? { body: JSON.stringify(row) } : {}) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return { data: null, error: authError(payload.message || payload.details || 'Database request failed.') };
  }
  if (method === 'POST') return { data: null, error: null };
  const payload = await response.json().catch(() => []);
  return { data: Array.isArray(payload) ? payload[0] || null : payload, error: null };
}

export const supabase = supabaseConfigured ? {
  auth: {
    async getSession() {
      try { return { data: { session: await getValidSession() }, error: null }; }
      catch (error) { return { data: { session: null }, error: authError(error.message) }; }
    },
    onAuthStateChange(callback) {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
    async signUp({ email, password }) {
      try {
        const payload = await authRequest('signup', { email, password });
        const session = normalizeSession(payload);
        if (session) emit('SIGNED_IN', session);
        return { data: { session, user: payload.user || session?.user || null }, error: null };
      } catch (error) { return { data: { session: null, user: null }, error: authError(error.message) }; }
    },
    async signInWithPassword({ email, password }) {
      try {
        const payload = await authRequest('token?grant_type=password', { email, password });
        const session = normalizeSession(payload);
        if (!session) throw new Error('Supabase did not return a sign-in session.');
        emit('SIGNED_IN', session);
        return { data: { session, user: session.user }, error: null };
      } catch (error) { return { data: { session: null, user: null }, error: authError(error.message) }; }
    },
    async signOut() {
      const session = await getValidSession();
      try { if (session?.access_token) await authRequest('logout', {}, session.access_token); }
      catch { /* Clear this browser session even if the remote token already expired. */ }
      emit('SIGNED_OUT', null);
      return { error: null };
    },
  },
  from(table) {
    return {
      select(columns) {
        const params = { select: columns };
        return { eq(column, value) { params[column] = `eq.${value}`; return { maybeSingle: () => databaseRequest(table, 'GET', params) }; } };
      },
      upsert(row, options = {}) {
        return databaseRequest(table, 'POST', options.onConflict ? { on_conflict: options.onConflict } : {}, row);
      },
    };
  },
} : null;
