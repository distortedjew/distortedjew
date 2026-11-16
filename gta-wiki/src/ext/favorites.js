// Preferiti + stato del pulsante account nell'header. Caricato in tutte le pagine quando gli account sono attivi.
// I preferiti stanno nel localStorage di chi legge; se l'utente è loggato vengono sincronizzati da auth.js
// (libreria e logica di login si caricano solo quando servono). Nessun dato personale finisce in query string.
(() => {
  'use strict';
  const K_FAVS = 'lf_favs';      // { "<percorso>": { t: titolo, a: timestamp } }
  const K_DEL = 'lf_favs_del';   // { "<percorso>": timestamp }  rimozioni da propagare al server
  const K_HINT = 'lf_hint';      // "1" se esiste una sessione (solo un suggerimento per la UI: la verità sta in auth.js)

  const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { /* ignora */ } });

  const LF = window.LF = {
    favs: () => read(K_FAVS),
    tomb: () => read(K_DEL),
    setFavs: (o) => { write(K_FAVS, o); emit(); },
    setTomb: (o) => { write(K_DEL, o); },
    isFav: (u) => Object.prototype.hasOwnProperty.call(read(K_FAVS), u),
    add(u, t) { const f = read(K_FAVS); f[u] = { t: String(t || u).slice(0, 200), a: Date.now() }; const d = read(K_DEL); delete d[u]; write(K_FAVS, f); write(K_DEL, d); emit(); },
    remove(u) { const f = read(K_FAVS); delete f[u]; const d = read(K_DEL); d[u] = Date.now(); write(K_FAVS, f); write(K_DEL, d); emit(); },
    hint: (on) => { try { if (on) localStorage.setItem(K_HINT, '1'); else localStorage.removeItem(K_HINT); } catch (e) { /* ignora */ } syncHeader(); },
    hasHint: () => { try { return localStorage.getItem(K_HINT) === '1'; } catch (e) { return false; } },
    onChange: (f) => listeners.push(f),
    syncHeader: () => syncHeader()
  };

  /* ---- Pulsante Accedi / Account ---- */
  const link = document.getElementById('account-link');
  function syncHeader() {
    if (!link) return;
    const inn = LF.hasHint();
    link.dataset.in = inn ? '1' : '0';
    link.setAttribute('href', inn ? link.dataset.account : link.dataset.login);
    const lb = document.getElementById('account-label');
    if (lb) lb.textContent = inn ? 'Account' : 'Accedi';
    link.setAttribute('aria-label', inn ? 'Il tuo account' : 'Accedi o registrati');
  }
  syncHeader();

  /* ---- Caricamento pigro di libreria + auth.js (solo per sincronizzare dopo un click, se loggati) ---- */
  let authLoading = null;
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('caricamento fallito')); document.head.appendChild(s); });
  function ensureAuth() {
    if (window.LFAuth) return Promise.resolve(window.LFAuth);
    if (!link) return Promise.reject(new Error('account non attivo'));
    authLoading ||= (link.dataset.vendor ? loadScript(link.dataset.vendor) : Promise.resolve()).then(() => loadScript(link.dataset.auth)).then(() => window.LFAuth);
    return authLoading;
  }
  let timer = 0;
  function scheduleSync() {
    if (!LF.hasHint()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { ensureAuth().then((a) => a && a.sync && a.sync()).catch(() => { /* offline: riproverà alla prossima azione o in Account */ }); }, 600);
  }
  LF.scheduleSync = scheduleSync;

  /* ---- Pulsante "Salva" nelle pagine articolo ---- */
  const wrap = document.querySelector('.lf-fav');
  const btn = wrap && wrap.querySelector('.lf-fav__btn');
  if (btn) {
    const note = wrap.querySelector('.lf-fav__note');
    const label = btn.querySelector('.lf-fav__label');
    const url = btn.dataset.favUrl;
    const title = btn.dataset.favTitle;
    const paint = () => {
      const on = LF.isFav(url);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (label) label.textContent = on ? 'Salvato' : 'Salva';
    };
    paint();
    wrap.hidden = false;
    // Sotto il titolo, così si vede senza scorrere
    const h1 = document.querySelector('main h1');
    if (h1 && h1.parentElement && h1.parentElement.tagName !== 'BODY') { wrap.classList.add('lf-fav--top'); h1.insertAdjacentElement('afterend', wrap); }
    btn.addEventListener('click', () => {
      if (LF.isFav(url)) { LF.remove(url); if (note) note.textContent = 'Rimosso dai preferiti.'; }
      else { LF.add(url, title); if (note) note.textContent = LF.hasHint() ? 'Salvato nei preferiti: lo sincronizzo con il tuo account.' : 'Salvato nei preferiti di questo dispositivo. Accedi per sincronizzarli.'; }
      paint();
      scheduleSync();
    });
    window.addEventListener('storage', (e) => { if (e.key === K_FAVS) paint(); });
  }
})();
