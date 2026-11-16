// Account: accedi, registrati, area account, sincronizzazione dei preferiti.
// Provider "supabase" (libreria auto-ospitata in /vendor/supabase.js, solo chiave pubblica) oppure "mock" (SOLO sviluppo).
// Regole: niente innerHTML con dati utente, niente token nei log, niente dati in query string.
(() => {
  'use strict';
  const link = document.getElementById('account-link');
  const LF = window.LF;
  if (!link || !LF) return;

  const provider = link.dataset.provider;
  const withNewsletter = link.dataset.newsletter === '1';
  const root = document.querySelector('[data-lf-page]');
  const page = root ? root.dataset.lfPage : '';
  const BASE = document.documentElement.dataset.base || '/';
  const $ = (id) => document.getElementById(id);
  const K_SYNCED = 'lf_favs_synced';
  const K_MOCK_USERS = 'lf_mock_users';
  const K_MOCK_SESSION = 'lf_mock_session';

  /* ---------- Errori e messaggi in italiano ---------- */
  class AuthError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }
  const MESSAGES = {
    invalid_credentials: 'Email o password non corretti.',
    email_not_confirmed: 'Devi ancora confermare l\'email: apri il messaggio che ti abbiamo inviato e clicca sul link. Controlla anche la cartella spam.',
    weak_password: 'La password è troppo debole: scegline una più lunga (almeno 10 caratteri).',
    rate_limit: 'Troppi tentativi ravvicinati: attendi qualche minuto e riprova.',
    network: 'Impossibile contattare il servizio: controlla la connessione a Internet e riprova.',
    expired_link: 'Il link non è valido o è scaduto. Richiedine uno nuovo.',
    misconfigured: 'Il servizio degli account non è configurato correttamente. Riprova più tardi o contatta il titolare del sito.',
    generic: 'Si è verificato un errore. Riprova tra poco.'
  };
  function normalize(e) {
    if (e instanceof AuthError) return e;
    const code = String((e && (e.code || e.error_code)) || '');
    const msg = String((e && e.message) || '');
    const status = e && e.status;
    if (/invalid_credentials/.test(code) || /invalid login credentials/i.test(msg)) return new AuthError('invalid_credentials');
    if (/email_not_confirmed/.test(code) || /email not confirmed/i.test(msg)) return new AuthError('email_not_confirmed');
    if (/weak_password/.test(code) || /password.*(weak|short|at least)/i.test(msg)) return new AuthError('weak_password');
    if (/rate_limit/.test(code) || status === 429 || /rate limit|too many/i.test(msg)) return new AuthError('rate_limit');
    if ((e && e.name === 'AuthRetryableFetchError') || /failed to fetch|networkerror|load failed|network request failed/i.test(msg) || status === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) return new AuthError('network');
    if (/otp_expired|expired|invalid.*(token|link)/i.test(code + ' ' + msg)) return new AuthError('expired_link');
    return new AuthError('generic', code || msg);
  }
  const human = (e) => MESSAGES[normalize(e).code] || MESSAGES.generic;

  /* ---------- Backend "mock" (SOLO sviluppo: utenti nel localStorage del browser) ---------- */
  function createMock() {
    const users = () => { try { return JSON.parse(localStorage.getItem(K_MOCK_USERS) || '[]'); } catch (e) { return []; } };
    const save = (u) => localStorage.setItem(K_MOCK_USERS, JSON.stringify(u));
    const sid = () => { try { return localStorage.getItem(K_MOCK_SESSION); } catch (e) { return null; } };
    const hash = async (pw, email) => {
      const data = new TextEncoder().encode('demo:' + email + ':' + pw);
      if (window.crypto && crypto.subtle) { const d = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
      return btoa(unescape(encodeURIComponent(email + pw)));
    };
    const pub = (u) => ({ id: u.id, email: u.email, created: u.created, meta: u.meta || {} });
    const me = () => users().find((u) => u.id === sid());
    const mutate = (fn) => { const all = users(); const u = all.find((x) => x.id === sid()); if (!u) throw new AuthError('invalid_credentials'); fn(u); save(all); return u; };
    const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
    return {
      async signUp(email, pw, meta) {
        await wait();
        if (pw.length < 10) throw new AuthError('weak_password');
        const all = users();
        if (!all.some((u) => u.email === email)) {
          all.push({ id: 'mock-' + Math.random().toString(36).slice(2, 10), email, hash: await hash(pw, email), confirmed: false, created: new Date().toISOString(), meta: meta || {}, favs: [] });
          save(all);
        } // se esiste già: stessa risposta, come fa il servizio reale (non rivela quali email sono registrate)
        return { needsConfirm: true };
      },
      async mockConfirm(email) { const all = users(); const u = all.find((x) => x.email === email); if (u) { u.confirmed = true; save(all); } },
      async signIn(email, pw) {
        await wait();
        const u = users().find((x) => x.email === email);
        if (!u || u.hash !== await hash(pw, email)) throw new AuthError('invalid_credentials');
        if (!u.confirmed) throw new AuthError('email_not_confirmed');
        localStorage.setItem(K_MOCK_SESSION, u.id);
        return pub(u);
      },
      async signOut() { localStorage.removeItem(K_MOCK_SESSION); },
      async getUser() { const u = me(); return u ? pub(u) : null; },
      async resetPassword() { await wait(); },
      async updatePassword(pw, email) { await wait(); const all = users(); const u = all.find((x) => x.email === email); if (u) { u.hash = await hash(pw, email); save(all); } },
      async updateMeta(obj) { mutate((u) => { u.meta = { ...(u.meta || {}), ...obj }; }); },
      async fetchFavs() { const u = me(); return (u ? u.favs : []).map((f) => ({ ...f })); },
      async upsertFavs(list) { mutate((u) => { for (const f of list) { const i = u.favs.findIndex((x) => x.url === f.url); if (i >= 0) u.favs[i] = f; else u.favs.push(f); } }); },
      async deleteFavs(urls) { mutate((u) => { u.favs = u.favs.filter((f) => !urls.includes(f.url)); }); },
      async deleteAccount() { const all = users().filter((u) => u.id !== sid()); save(all); localStorage.removeItem(K_MOCK_SESSION); return 'ok'; },
      onEvent() { /* nessun evento remoto in demo */ }
    };
  }

  /* ---------- Backend Supabase ---------- */
  function createSupabase() {
    if (!window.supabase || !window.supabase.createClient) throw new AuthError('misconfigured');
    const sb = window.supabase.createClient(link.dataset.sbUrl, link.dataset.sbKey, {
      // Il realtime non è usato: nessuna connessione WebSocket viene aperta (e la CSP non la consentirebbe)
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: page === 'login', flowType: 'implicit', storageKey: 'lf-auth' }
    });
    const must = (r) => { if (r.error) throw normalize(r.error); return r.data; };
    const toUser = (u) => (u ? { id: u.id, email: u.email, created: u.created_at, meta: u.user_metadata || {} } : null);
    return {
      async signUp(email, pw, meta) {
        const d = must(await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + BASE + 'accedi/', data: meta || {} } }));
        if (d.session) { await sb.auth.signOut(); throw new AuthError('misconfigured'); } // la conferma email dev'essere attiva sul progetto
        return { needsConfirm: true };
      },
      async signIn(email, pw) { const d = must(await sb.auth.signInWithPassword({ email, password: pw })); return toUser(d.user); },
      async signOut() { await sb.auth.signOut(); },
      async getUser() {
        const s = await sb.auth.getSession();
        if (!s.data || !s.data.session) return null;
        const r = await sb.auth.getUser();
        if (r.error) { const e = normalize(r.error); if (e.code === 'network') throw e; return null; }
        return toUser(r.data.user);
      },
      async resetPassword(email) { must(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + BASE + 'accedi/' })); },
      async updatePassword(pw) { must(await sb.auth.updateUser({ password: pw })); },
      async updateMeta(obj) { must(await sb.auth.updateUser({ data: obj })); },
      async fetchFavs() {
        const r = await sb.from('favorites').select('url,title,created_at');
        if (r.error) { if (/42P01|PGRST205|PGRST200/.test(String(r.error.code)) || /does not exist|schema cache/i.test(r.error.message || '')) throw new AuthError('no_table'); throw normalize(r.error); }
        return (r.data || []).map((f) => ({ url: f.url, title: f.title, at: Date.parse(f.created_at) || Date.now() }));
      },
      async upsertFavs(list, userId) {
        if (!list.length) return;
        must(await sb.from('favorites').upsert(list.map((f) => ({ user_id: userId, url: f.url, title: f.title, created_at: new Date(f.at).toISOString() })), { onConflict: 'user_id,url' }));
      },
      async deleteFavs(urls) { if (urls.length) must(await sb.from('favorites').delete().in('url', urls)); },
      async deleteAccount() {
        const r = await sb.rpc('delete_my_account');
        if (r.error) {
          if (/PGRST202|42883/.test(String(r.error.code)) || r.status === 404) return 'unsupported';
          throw normalize(r.error);
        }
        await sb.auth.signOut().catch(() => {});
        return 'ok';
      },
      onEvent(cb) { sb.auth.onAuthStateChange((ev, s) => cb(ev, !!s)); }
    };
  }

  let api;
  try { api = provider === 'mock' ? createMock() : createSupabase(); } catch (e) { api = null; }

  /* ---------- Spoiler: stessa chiave di app.js ---------- */
  const readSpoilers = () => { try { return localStorage.getItem('spoilers') === 'on' ? 'on' : 'off'; } catch (e) { return 'off'; } };
  const applySpoilers = (v) => {
    document.documentElement.dataset.spoilers = v;
    try { localStorage.setItem('spoilers', v); } catch (e) { /* ignora */ }
    const tog = $('spoiler-toggle'); const lb = $('spoiler-label');
    if (tog) tog.setAttribute('aria-pressed', v === 'on' ? 'true' : 'false');
    if (lb) lb.textContent = v === 'on' ? 'Spoiler: visibili' : 'Spoiler: nascosti';
  };

  /* ---------- Sincronizzazione preferiti (idempotente, un solo volo alla volta) ---------- */
  const readSynced = () => { try { return JSON.parse(localStorage.getItem(K_SYNCED) || '[]'); } catch (e) { return []; } };
  const writeSynced = (a) => { try { localStorage.setItem(K_SYNCED, JSON.stringify(a)); } catch (e) { /* ignora */ } };
  let flight = null; let again = false;
  const syncState = { text: '' };
  function setSyncText(t) { syncState.text = t; const el = $('acc-sync'); if (el) el.textContent = t; }

  async function doSync() {
    const user = await api.getUser();
    if (!user) { LF.hint(false); return null; }
    let remote;
    try { remote = await api.fetchFavs(); } catch (e) {
      if (e.code === 'no_table') { setSyncText('La sincronizzazione online non è attiva su questo sito: i preferiti restano su questo dispositivo.'); return user; }
      throw e;
    }
    const local = LF.favs(); const tomb = LF.tomb(); const synced = new Set(readSynced());
    const final = {}; const del = []; const up = [];
    for (const r of remote) {
      if (tomb[r.url] && tomb[r.url] >= r.at) del.push(r.url); // rimosso qui dopo essere stato creato: propaga la rimozione
      else final[r.url] = { t: r.title, a: r.at };
    }
    for (const [url, v] of Object.entries(local)) {
      if (final[url] || del.includes(url)) { if (final[url] && v.a < final[url].a) final[url] = { t: v.t || final[url].t, a: v.a }; continue; }
      if (synced.has(url)) continue; // c'era sul server, ora non più: rimosso da un altro dispositivo
      final[url] = v; up.push({ url, title: v.t, at: v.a });
    }
    await api.upsertFavs(up, user.id);
    await api.deleteFavs(del);
    LF.setFavs(final);
    LF.setTomb({});
    writeSynced(Object.keys(final));
    setSyncText('Preferiti sincronizzati alle ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '.');
    return user;
  }
  function sync() {
    if (!api) return Promise.resolve(null);
    if (flight) { again = true; return flight; }
    flight = doSync().catch((e) => { setSyncText(e.code === 'network' ? 'Sei offline: i preferiti si sincronizzeranno alla prossima occasione.' : 'Sincronizzazione non riuscita: riproverò più tardi.'); return null; })
      .finally(() => { flight = null; if (again) { again = false; sync(); } });
    return flight;
  }
  window.LFAuth = { sync };
  if (api) api.onEvent((ev, hasSession) => { LF.hint(hasSession); });

  if (!root || !api) {
    if (root && !api) { const s = root.querySelector('noscript'); const p = document.createElement('p'); p.className = 'lf-msg lf-msg--err'; p.setAttribute('role', 'alert'); p.textContent = MESSAGES.misconfigured; root.prepend(p); void s; }
    return;
  }

  /* ---------- Utilità UI ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const clearMsgs = (key) => { const e = $('err-' + key); const o = $('ok-' + key); if (e) e.textContent = ''; if (o) o.textContent = ''; };
  const showErr = (key, text, focusEl) => { const o = $('ok-' + key); if (o) o.textContent = ''; const e = $('err-' + key); e.textContent = text; if (focusEl) focusEl.focus(); else e.focus(); };
  const showOk = (key, text) => { const e = $('err-' + key); if (e) e.textContent = ''; $('ok-' + key).textContent = text; };
  const invalid = (input, on) => { if (on) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); };
  const resetInvalid = (form) => form.querySelectorAll('[aria-invalid]').forEach((i) => invalid(i, false));
  function busy(form, on) {
    form.setAttribute('aria-busy', on ? 'true' : 'false');
    form.querySelectorAll('button[type="submit"]').forEach((b) => { b.disabled = on; });
  }
  const goto = (rel) => { location.href = BASE + rel; };
  const val = (form, name) => form.elements[name] ? form.elements[name].value : '';

  document.querySelectorAll('[data-toggle-pw]').forEach((cb) => cb.addEventListener('change', () => {
    cb.closest('form').querySelectorAll('input[autocomplete$="password"]').forEach((i) => { i.type = cb.checked ? 'text' : 'password'; });
  }));

  // Blocco temporaneo dopo troppi tentativi falliti (la protezione vera è lato servizio)
  const fails = { n: 0, until: 0 };
  function lockLeft() { return Math.max(0, Math.ceil((fails.until - Date.now()) / 1000)); }
  function noteFail() { fails.n += 1; if (fails.n >= 5) { fails.until = Date.now() + 30000; fails.n = 0; } }

  function validatePassword(form, pwName, confirmName, key) {
    const pw = form.elements[pwName]; const cf = confirmName ? form.elements[confirmName] : null;
    if (pw.value.length < 10) { invalid(pw, true); showErr(key, 'La password deve avere almeno 10 caratteri. Una frase lunga è più sicura di una parola complicata.', pw); return false; }
    if (cf && cf.value !== pw.value) { invalid(cf, true); showErr(key, 'Le due password non coincidono.', cf); return false; }
    return true;
  }

  /* ================= PAGINA: ACCEDI ================= */
  async function initLogin() {
    const loginForm = $('login-form'); const resetForm = $('reset-form'); const newForm = $('newpass-form');
    const secs = { login: $('login-section'), reset: $('reset-section'), np: $('newpass-section') };
    const show = (k) => { for (const [n, el] of Object.entries(secs)) el.hidden = n !== k; };
    const h = location.hash || '';
    const isRecovery = /type=recovery/.test(h);
    const hashErr = /error_code=|error=/.test(h);
    if (hashErr) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ } showErr('login', MESSAGES.expired_link); }
    let mockResetEmail = '';

    if (isRecovery) { show('np'); $('np-password').focus(); }
    else {
      try { if (await api.getUser()) { if (/access_token|type=signup|type=magiclink/.test(h)) { try { sessionStorage.setItem('lf_welcome', '1'); } catch (e) { /* ignora */ } } LF.hint(true); goto('account/'); return; } } catch (e) { /* offline: mostra il modulo */ }
      LF.hint(false);
    }
    if (isRecovery) try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ }

    $('show-reset').addEventListener('click', () => { show('reset'); $('reset-email').value = loginForm.elements.email.value; $('reset-email').focus(); });
    $('hide-reset').addEventListener('click', () => { show('login'); loginForm.elements.email.focus(); });

    loginForm.addEventListener('submit', async (ev) => {
      ev.preventDefault(); clearMsgs('login'); resetInvalid(loginForm);
      const email = val(loginForm, 'email').trim().toLowerCase(); const pw = val(loginForm, 'password');
      if (!EMAIL_RE.test(email)) { invalid(loginForm.elements.email, true); return showErr('login', 'Inserisci un indirizzo email valido.', loginForm.elements.email); }
      if (!pw) { invalid(loginForm.elements.password, true); return showErr('login', 'Inserisci la password.', loginForm.elements.password); }
      if (lockLeft()) return showErr('login', 'Troppi tentativi falliti: riprova tra ' + lockLeft() + ' secondi.');
      busy(loginForm, true);
      try {
        await api.signIn(email, pw);
        LF.hint(true); fails.n = 0;
        goto('account/');
      } catch (e) {
        noteFail(); showErr('login', human(e));
        setTimeout(() => busy(loginForm, false), 1200); // piccola pausa anche dopo l'errore
        return;
      }
    });

    let resetCooldown = 0;
    resetForm.addEventListener('submit', async (ev) => {
      ev.preventDefault(); clearMsgs('reset'); resetInvalid(resetForm);
      const email = val(resetForm, 'email').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) { invalid(resetForm.elements.email, true); return showErr('reset', 'Inserisci un indirizzo email valido.', resetForm.elements.email); }
      if (Date.now() < resetCooldown) return showErr('reset', 'Hai già richiesto un link: attendi un minuto prima di richiederne un altro.');
      busy(resetForm, true);
      try {
        await api.resetPassword(email);
        resetCooldown = Date.now() + 60000; mockResetEmail = email;
        showOk('reset', 'Se esiste un account con questo indirizzo, ti abbiamo inviato un\'email con il link per scegliere una nuova password. Controlla anche lo spam.');
        if (provider === 'mock') { const b = document.createElement('button'); b.type = 'button'; b.className = 'lf-btn lf-btn--small'; b.textContent = 'Demo: apri il link ricevuto'; b.addEventListener('click', () => { show('np'); $('np-password').focus(); }); $('ok-reset').after(b); }
        setTimeout(() => busy(resetForm, false), 60000);
      } catch (e) { showErr('reset', human(e)); busy(resetForm, false); }
    });

    newForm.addEventListener('submit', async (ev) => {
      ev.preventDefault(); clearMsgs('newpass'); resetInvalid(newForm);
      if (!validatePassword(newForm, 'password', 'confirm', 'newpass')) return;
      busy(newForm, true);
      try {
        await api.updatePassword(val(newForm, 'password'), mockResetEmail);
        showOk('newpass', 'Password aggiornata.');
        if (provider === 'mock') { show('login'); showOk('login', 'Password aggiornata: ora puoi accedere.'); busy(newForm, false); return; }
        LF.hint(true); setTimeout(() => goto('account/'), 800);
      } catch (e) { showErr('newpass', human(e)); busy(newForm, false); }
    });
  }

  /* ================= PAGINA: REGISTRATI ================= */
  async function initRegister() {
    const form = $('register-form');
    try { if (await api.getUser()) { goto('account/'); return; } } catch (e) { /* ignora */ }
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault(); clearMsgs('register'); resetInvalid(form);
      const email = val(form, 'email').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) { invalid(form.elements.email, true); return showErr('register', 'Inserisci un indirizzo email valido.', form.elements.email); }
      if (!validatePassword(form, 'password', 'confirm', 'register')) return;
      if (!form.elements.terms.checked) { invalid(form.elements.terms, true); return showErr('register', 'Per registrarti devi accettare i Termini e l\'Informativa privacy.', form.elements.terms); }
      const meta = { terms_accepted_at: new Date().toISOString() };
      if (withNewsletter && form.elements.newsletter && form.elements.newsletter.checked) meta.newsletter_requested = true;
      busy(form, true);
      try {
        await api.signUp(email, val(form, 'password'), meta);
        form.reset();
        $('register-section').hidden = true;
        const v = $('verify-section'); v.hidden = false; v.focus();
        if (provider === 'mock') {
          $('mock-confirm-box').hidden = false;
          $('mock-confirm').addEventListener('click', async () => { await api.mockConfirm(email); $('mock-confirm-box').textContent = 'Email confermata (demo): ora puoi accedere.'; });
        }
      } catch (e) { showErr('register', human(e)); busy(form, false); }
    });
  }

  /* ================= PAGINA: ACCOUNT ================= */
  async function initAccount() {
    const out = $('acc-out'); const inn = $('acc-in');
    const done = () => { $('acc-loading').hidden = true; };
    let user;
    try { user = await api.getUser(); } catch (e) {
      done(); out.hidden = false; out.querySelector('.lf-card__title').textContent = 'Servizio non raggiungibile';
      out.querySelector('p').textContent = MESSAGES.network; return;
    }
    done();
    if (!user) { LF.hint(false); out.hidden = false; return; }
    LF.hint(true);
    inn.hidden = false;
    $('acc-email').textContent = user.email;
    $('acc-created').textContent = user.created ? new Date(user.created).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    try { if (sessionStorage.getItem('lf_welcome')) { sessionStorage.removeItem('lf_welcome'); showOk('acc', 'Email confermata: benvenuto!'); } } catch (e) { /* ignora */ }

    // Spoiler sincronizzati
    const spoil = $('acc-spoilers');
    const remote = user.meta && user.meta.spoilers;
    if (remote === 'on' || remote === 'off') applySpoilers(remote); else api.updateMeta({ spoilers: readSpoilers() }).catch(() => {});
    spoil.checked = readSpoilers() === 'on';
    spoil.addEventListener('change', async () => {
      const v = spoil.checked ? 'on' : 'off'; applySpoilers(v);
      try { await api.updateMeta({ spoilers: v }); showOk('acc', 'Preferenza salvata.'); } catch (e) { showErr('acc', human(e)); }
    });

    // Newsletter
    renderNewsletter(user);

    // Preferiti
    const list = $('acc-fav-list'); const empty = $('acc-fav-empty');
    function renderFavs(focusIdx) {
      const entries = Object.entries(LF.favs()).sort((a, b) => (b[1].a || 0) - (a[1].a || 0));
      list.textContent = '';
      empty.hidden = entries.length > 0;
      for (const [url, v] of entries) {
        const li = document.createElement('li');
        const a = document.createElement('a'); a.href = BASE + url; a.textContent = v.t || url;
        const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Rimuovi'; b.setAttribute('aria-label', 'Rimuovi dai preferiti: ' + (v.t || url));
        b.addEventListener('click', () => {
          const idx = Array.from(list.children).indexOf(li);
          LF.remove(url); renderFavs(idx); sync();
        });
        li.append(a, b); list.append(li);
      }
      if (typeof focusIdx === 'number') {
        const btns = list.querySelectorAll('button');
        if (btns.length) btns[Math.min(focusIdx, btns.length - 1)].focus(); else { empty.tabIndex = -1; empty.focus(); }
      }
    }
    renderFavs();
    setSyncText(syncState.text || 'Sincronizzazione in corso…');
    sync().then(() => renderFavs());

    $('acc-logout').addEventListener('click', async () => {
      const b = $('acc-logout'); b.disabled = true;
      try { await api.signOut(); } catch (e) { b.disabled = false; return showErr('acc', human(e)); }
      // Sul dispositivo non restano i dati dell'account (utile su computer condivisi): sono al sicuro nell'account
      LF.setFavs({}); LF.setTomb({}); writeSynced([]); LF.hint(false);
      inn.hidden = true; out.hidden = false; out.focus();
      out.querySelector('.lf-card__title').textContent = 'Sei uscito dall\'account';
      out.querySelector('p').textContent = 'I tuoi preferiti restano salvati nell\'account: li ritrovi al prossimo accesso.';
    });

    $('acc-export').addEventListener('click', () => {
      const data = { esportatoIl: new Date().toISOString(), email: user.email, accountCreatoIl: user.created, spoiler: readSpoilers(), preferiti: Object.entries(LF.favs()).map(([url, v]) => ({ url: BASE + url, titolo: v.t, salvatoIl: new Date(v.a).toISOString() })) };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'leonida-files-i-miei-dati.json';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });

    const del = $('delete-form');
    del.addEventListener('submit', async (ev) => {
      ev.preventDefault(); clearMsgs('del'); resetInvalid(del); $('del-fallback').hidden = true;
      const pw = val(del, 'password');
      if (!pw) { invalid(del.elements.password, true); return showErr('del', 'Inserisci la password per confermare.', del.elements.password); }
      if (!$('del-confirm').checked) return showErr('del', 'Spunta la casella per confermare di aver capito.', $('del-confirm'));
      busy(del, true);
      try {
        await api.signIn(user.email, pw); // riautenticazione
        const r = await api.deleteAccount();
        if (r === 'unsupported') { $('del-fallback').hidden = false; showErr('del', 'L\'eliminazione automatica non è disponibile: segui le istruzioni qui sotto.'); busy(del, false); return; }
        LF.setFavs({}); LF.setTomb({}); writeSynced([]); LF.hint(false);
        inn.hidden = true; out.hidden = false;
        out.querySelector('.lf-card__title').textContent = 'Account eliminato';
        out.querySelector('p').textContent = 'Abbiamo cancellato il tuo account, i preferiti online e le preferenze. Se eri iscritto alla newsletter, disiscriviti dal link in fondo a una delle email ricevute.';
        out.focus();
      } catch (e) { showErr('del', human(e)); busy(del, false); }
    });
  }

  function renderNewsletter(user) {
    if (!withNewsletter) return;
    const form = document.querySelector('.nl-wrap--account form');
    if (!form) return;
    const email = form.querySelector('input[type="email"]'); if (email) email.value = user.email;
    const meta = user.meta || {};
    const state = $('acc-nl-state'); const req = $('acc-nl-req');
    if (meta.newsletter_sent_at) state.textContent = 'Hai avviato l\'iscrizione il ' + new Date(meta.newsletter_sent_at).toLocaleDateString('it-IT') + '. Se non hai ancora cliccato il link nell\'email di conferma, l\'iscrizione non è attiva. Lo stato effettivo è gestito dal servizio di newsletter.';
    else if (meta.newsletter_requested) req.hidden = false;
    form.addEventListener('submit', () => { api.updateMeta({ newsletter_sent_at: new Date().toISOString() }).catch(() => {}); });
  }

  if (page === 'login') initLogin();
  else if (page === 'register') initRegister();
  else if (page === 'account') initAccount();
})();
