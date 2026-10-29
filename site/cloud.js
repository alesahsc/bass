/* Supabase REST client. Only public project keys belong in cloud-config.js. */
(() => {
  const $ = id => document.getElementById(id);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  let config = read('bassCloudConfig', window.BASS_CLOUD || {});
  // Sessions intentionally expire on closing the tab; passwords are never stored.
  let session; try { session = JSON.parse(sessionStorage.getItem('bassCloudSession')); } catch {}
  let busy = false, timer;
  let pending = read('bassCloudPending', {});
  let last = Object.fromEntries(SONGS.map(s => [s.id, JSON.stringify(state[s.id])]));
  const status = text => { $('cloudStatus').textContent = text; };
  const configured = () => config.url && config.key;
  function rememberSession(value) {
    session = value;
    if (value) sessionStorage.setItem('bassCloudSession', JSON.stringify(value));
    else sessionStorage.removeItem('bassCloudSession');
    $('cloudLogin').hidden = !!value;
    $('cloudLogin').style.display = value ? 'none' : 'flex';
    $('signOutBtn').hidden = !value;
  }
  async function request(path, options = {}, authenticated = true) {
    const response = await fetch(config.url + path, {
      ...options,
      headers: { apikey: config.key, 'Content-Type': 'application/json',
        ...(authenticated ? {Authorization: 'Bearer ' + session.access_token} : {}), ...options.headers }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.msg || body?.message || body?.error_description || 'Cloud request failed (' + response.status + ')');
    return body;
  }
  async function refresh() {
    if (!session) return;
    if (session.expires_at * 1000 > Date.now() + 60000) return;
    const next = await request('/auth/v1/token?grant_type=refresh_token', {method:'POST', body:JSON.stringify({refresh_token:session.refresh_token})}, false);
    rememberSession(next);
  }
  function capture() {
    for (const song of SONGS) {
      const value = JSON.stringify(state[song.id]);
      if (value !== last[song.id]) { pending[song.id] = state[song.id]; last[song.id] = value; }
    }
    localStorage.setItem('bassCloudPending', JSON.stringify(pending));
  }
  window.queueCloudSave = () => { capture(); clearTimeout(timer); timer = setTimeout(sync, 500); };
  async function sync() {
    if (!configured() || !session || busy) return;
    busy = true; status('Syncing…');
    try {
      await refresh();
      const snapshot = JSON.parse(JSON.stringify(pending));
      const rows = Object.entries(snapshot).map(([id, progress]) => ({ user_id:session.user.id, song_id:Number(id), progress }));
      if (rows.length) {
        await request('/rest/v1/practice_progress?on_conflict=user_id,song_id', {method:'POST', headers:{Prefer:'resolution=merge-duplicates,return=minimal'}, body:JSON.stringify(rows)});
        for (const [id, value] of Object.entries(snapshot)) if (JSON.stringify(pending[id]) === JSON.stringify(value)) delete pending[id];
        localStorage.setItem('bassCloudPending', JSON.stringify(pending));
      }
      // Do not replace notes while the user is typing.
      if (!document.activeElement?.matches('.notes')) {
        const cloud = await request('/rest/v1/practice_progress?select=song_id,progress');
        for (const row of cloud) if (state[row.song_id] && !pending[row.song_id]) state[row.song_id] = Object.assign(defaultSongState(SONGS.find(s => s.id === row.song_id)), row.progress);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        last = Object.fromEntries(SONGS.map(s => [s.id, JSON.stringify(state[s.id])]));
        render();
      }
      status(Object.keys(pending).length ? 'Changes waiting to sync' : 'Synced · ' + session.user.email);
    } catch (error) { status('Sync paused: ' + error.message + '. Your changes remain in this browser.'); }
    finally { busy = false; }
  }
  $('cloudSettingsBtn').onclick = () => { $('cloudSettings').hidden = !$('cloudSettings').hidden; };
  $('projectUrl').value = config.url || ''; $('projectKey').value = config.key || '';
  $('cloudSettings').onsubmit = event => {
    event.preventDefault();
    const url = $('projectUrl').value.trim().replace(/\/$/, ''), key = $('projectKey').value.trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) return status('Use your HTTPS Supabase project URL.');
    let role = ''; try { role = JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role; } catch {}
    if (key.startsWith('sb_secret_') || role === 'service_role') return status('Secret keys cannot be used here. Enter the public publishable key.');
    config = {url, key}; localStorage.setItem('bassCloudConfig', JSON.stringify(config));
    rememberSession(null); $('cloudSettings').hidden = true; status('Connection saved. Sign in to sync.');
  };
  $('cloudLogin').onsubmit = async event => {
    event.preventDefault();
    if (!configured()) { $('cloudSettings').hidden = false; return status('Set up your cloud connection first.'); }
    const signup = event.submitter === $('signUpBtn');
    status(signup ? 'Creating account…' : 'Signing in…');
    try {
      const result = await request(signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', {method:'POST', body:JSON.stringify({email:$('email').value.trim(), password:$('password').value})}, false);
      $('password').value = '';
      if (!result.access_token) return status('Check your email to confirm your account, then sign in.');
      const previous = localStorage.getItem('bassCloudUser');
      if (previous && previous !== result.user.id) { rememberSession(null); return status('This browser contains another account’s progress. Use a separate browser profile for another account.'); }
      localStorage.setItem('bassCloudUser', result.user.id);
      rememberSession(result);
      // Seed a new cloud account from the uploaded data / local progress only once.
      const existing = await request('/rest/v1/practice_progress?select=song_id&limit=1');
      if (!existing.length) { pending = JSON.parse(JSON.stringify(state)); localStorage.setItem('bassCloudPending', JSON.stringify(pending)); }
      await sync();
    } catch (error) { status(error.message); }
  };
  $('signOutBtn').onclick = async () => {
    if (busy || Object.keys(pending).length) { await sync(); if (busy || Object.keys(pending).length) return status('Wait for changes to sync before signing out.'); }
    const token = session?.access_token;
    rememberSession(null); status('Signed out. Browser backup retained.');
    if (token && configured()) fetch(config.url + '/auth/v1/logout', {method:'POST', headers:{apikey:config.key, Authorization:'Bearer '+token}}).catch(() => {});
  };
  window.addEventListener('online', sync);
  window.addEventListener('focus', sync);
  setInterval(sync, 30000);
  rememberSession(session);
  status(configured() ? 'Sign in to sync your progress.' : 'Set up cloud settings to sync across devices.');
  sync();
})();
