// App del bundle "artefatto": tutte le pagine sono incorporate e la navigazione usa l'hash (#nome-pagina).
(() => {
  const PAGES = __PAGES__;
  const INDEX = __INDEX__;
  const ASSETS = __ASSETS__; // immagini incorporate una sola volta: chiave = percorso, valore = data URI
  const RELEASE = '__RELEASE__';
  const SECTIONS = ['personaggi', 'luoghi', 'wiki', 'easter-egg', 'guide', 'novita'];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = document.documentElement;
  root.classList.add('js');
  try { if (localStorage.getItem('spoilers') === 'on') root.dataset.spoilers = 'on'; } catch (e) { /* storage non disponibile */ }

  const main = $('#main');
  const dlg = $('#search'), input = $('#search-input'), list = $('#search-results');
  let timer = null;
  let lastQuery = '';

  /* ---------- Router ---------- */
  function render() {
    let id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { id = ''; }
    if (id === 'main') { main.focus({ preventScroll: true }); return; } // link "Vai al contenuto"
    if (!id) id = 'home';
    const page = PAGES[id] || PAGES['404'];
    main.innerHTML = page.html;
    $$('img[data-asset]', main).forEach((img) => { const u = ASSETS[img.dataset.asset]; if (u) img.src = u; });
    if (dlg && dlg.open) dlg.close();
    window.scrollTo(0, 0);
    const sec = SECTIONS.find((s) => id === s || id.startsWith(s + '-')) || '';
    $$('.nav a').forEach((a) => (a.getAttribute('href') === '#' + sec ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    initCountdown();
    const form = $('.searchpage', main);
    if (form) {
      const q = $('#q', form);
      q.value = lastQuery;
      showResults(lastQuery);
      form.addEventListener('submit', (ev) => { ev.preventDefault(); lastQuery = q.value; showResults(lastQuery); });
    }
  }
  window.addEventListener('hashchange', render);

  /* ---------- Countdown ---------- */
  function initCountdown() {
    clearInterval(timer);
    const cd = $('#countdown', main);
    if (!cd) return;
    const target = new Date(RELEASE).getTime();
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const d = target - Date.now();
      if (!(d > 0)) {
        cd.hidden = true;
        const k = $('#hero-kicker', main);
        if (k) k.textContent = 'È uscito. Benvenuti a Leonida.';
        return false;
      }
      const s = Math.floor(d / 1000);
      $('#cd-d', cd).textContent = Math.floor(s / 86400);
      $('#cd-h', cd).textContent = pad(Math.floor((s % 86400) / 3600));
      $('#cd-m', cd).textContent = pad(Math.floor((s % 3600) / 60));
      $('#cd-s', cd).textContent = pad(s % 60);
      return true;
    };
    if (tick()) timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 1000);
  }

  /* ---------- Spoiler e filtri (delegati: il contenuto cambia a ogni pagina) ---------- */
  const tog = $('#spoiler-toggle');
  const syncTog = () => {
    if (!tog) return;
    const on = root.dataset.spoilers === 'on';
    tog.setAttribute('aria-pressed', String(on));
    const lb = $('#spoiler-label');
    if (lb) lb.textContent = on ? 'Spoiler: visibili' : 'Spoiler: nascosti';
  };
  syncTog();
  document.addEventListener('click', (ev) => {
    const tp = ev.target.closest('[data-ticker-pause]');
    if (!tp) return;
    const paused = tp.closest('.ticker').classList.toggle('is-paused');
    tp.setAttribute('aria-pressed', String(paused));
    tp.textContent = paused ? 'Riprendi' : 'Pausa';
  });
  tog && tog.addEventListener('click', () => {
    const on = root.dataset.spoilers !== 'on';
    root.dataset.spoilers = on ? 'on' : 'off';
    try { localStorage.setItem('spoilers', on ? 'on' : 'off'); } catch (e) { /* ignora */ }
    syncTog();
  });
  const reveal = (el) => { el.classList.add('is-shown'); el.removeAttribute('role'); el.removeAttribute('tabindex'); };
  main.addEventListener('click', (ev) => {
    const sp = ev.target.closest('[data-spoiler]');
    if (sp && !sp.classList.contains('is-shown') && root.dataset.spoilers !== 'on') { ev.preventDefault(); reveal(sp); return; }
    const b = ev.target.closest('[data-filter]');
    if (b) {
      const bar = b.closest('[data-filters]');
      $$('[data-filter]', bar).forEach((x) => x.classList.toggle('is-on', x === b));
      $$('[data-list] .entry', main).forEach((e) => { e.hidden = b.dataset.filter !== 'all' && e.dataset.status !== b.dataset.filter; });
    }
  }, true);
  main.addEventListener('keydown', (ev) => {
    const sp = ev.target.closest && ev.target.closest('[data-spoiler]');
    if (sp && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); reveal(sp); }
  });

  /* ---------- Ricerca ---------- */
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const search = (raw, max) => {
    const q = norm(raw.trim());
    if (!q) return [];
    const terms = q.split(/\s+/);
    return INDEX.map((d) => {
      const t = norm(d.t), s = norm(d.s);
      if (!terms.every((x) => t.includes(x) || s.includes(x))) return null;
      return { d, score: terms.reduce((n, x) => n + (t.startsWith(x) ? 5 : t.includes(x) ? 3 : 1), 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, max).map((h) => h.d);
  };
  const item = (d, i) => `<li${i === 0 ? ' class="is-active"' : ''}><a href="#${esc(d.u)}"><small>${esc(d.k)}${d.sp ? ' · spoiler' : ''}</small><strong>${esc(d.t)}</strong>${d.sp ? '' : `<em>${esc(d.s.slice(0, 150))}</em>`}</a></li>`;
  function showResults(q) {
    const box = $('#results', main);
    if (!box) return;
    if (!q.trim()) { box.innerHTML = ''; return; }
    const hits = search(q, 40);
    box.innerHTML = hits.length ? hits.map(item).join('') : '<li class="empty">Nessun risultato per questa ricerca.</li>';
  }
  const renderDialog = () => {
    if (!input.value.trim()) { list.innerHTML = '<li class="search__empty">Scrivi per cercare. Esempi: «Lucia», «Vice City», «trailer».</li>'; return; }
    const hits = search(input.value, 8);
    list.innerHTML = hits.length ? hits.map(item).join('') : '<li class="search__empty">Nessun risultato. La wiki si arricchisce dopo il lancio: riprova presto.</li>';
  };
  const open = () => { if (!dlg) return; if (!dlg.open) dlg.showModal(); input.value = ''; renderDialog(); input.focus(); };
  const openBtn = $('#search-open');
  openBtn && openBtn.addEventListener('click', open);
  document.addEventListener('click', (ev) => { if (ev.target.closest('[data-open-search]')) open(); });
  input && input.addEventListener('input', renderDialog);
  input && input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { const a = $('li.is-active a', list) || $('a', list); if (a) location.hash = a.getAttribute('href'); }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const items = $$('li', list).filter((l) => l.querySelector('a'));
      if (!items.length) return;
      const cur = items.findIndex((l) => l.classList.contains('is-active'));
      const next = (cur + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((l, i) => l.classList.toggle('is-active', i === next));
    }
  });
  dlg && dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.closest('a')) dlg.close(); });
  document.addEventListener('keydown', (ev) => {
    const typing = /input|textarea|select/i.test(document.activeElement.tagName);
    if (((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') || (ev.key === '/' && !typing)) { ev.preventDefault(); open(); }
  });

  render();
})();
