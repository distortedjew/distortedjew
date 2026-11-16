// Interazioni: countdown, spoiler, filtri, ricerca, reveal. Nessuna dipendenza e nessuno script inline (CSP).
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const W = { base: root.dataset.base || '/', release: root.dataset.release || '', phase: root.dataset.phase || 'prelaunch' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Preferenza spoiler (solo sul dispositivo) */
  try { if (localStorage.getItem('spoilers') === 'on') root.dataset.spoilers = 'on'; } catch (e) { /* storage non disponibile */ }

  /* Countdown verso mezzanotte locale del giorno di uscita; a zero passa alla modalità lancio. */
  const cd = $('#countdown');
  if (cd) {
    const target = new Date(W.release).getTime(); // senza fuso => ora locale dell'utente
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const d = target - Date.now();
      if (!(d > 0)) {
        cd.hidden = true;
        const k = $('#hero-kicker');
        if (k) k.textContent = 'È uscito. Benvenuti a Leonida.';
        return false;
      }
      const s = Math.floor(d / 1000);
      $('#cd-d').textContent = Math.floor(s / 86400);
      $('#cd-h').textContent = pad(Math.floor((s % 86400) / 3600));
      $('#cd-m').textContent = pad(Math.floor((s % 3600) / 60));
      $('#cd-s').textContent = pad(s % 60);
      return true;
    };
    if (tick()) { const t = setInterval(() => { if (!tick()) clearInterval(t); }, 1000); }
  }

  /* Reveal allo scroll: nasconde solo ciò che sta sotto la piega; il resto (e i crawler con viewport alto) resta visibile */
  const rev = $$('[data-reveal]');
  if (rev.length) {
    const below = rev.filter((el) => el.getBoundingClientRect().top > innerHeight * 0.95);
    rev.forEach((el) => { if (!below.includes(el)) el.classList.add('in'); });
    if ('IntersectionObserver' in window && !reduce) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
      below.forEach((el) => io.observe(el));
      setTimeout(() => below.forEach((el) => el.classList.add('in')), 6000); // rete di sicurezza
    } else below.forEach((el) => el.classList.add('in'));
  }

  /* Spoiler: interruttore globale + click sul singolo blocco */
  const tog = $('#spoiler-toggle');
  const syncTog = () => tog && tog.setAttribute('aria-pressed', String(root.dataset.spoilers === 'on'));
  syncTog();
  tog && tog.addEventListener('click', () => {
    const on = root.dataset.spoilers !== 'on';
    root.dataset.spoilers = on ? 'on' : 'off';
    try { localStorage.setItem('spoilers', on ? 'on' : 'off'); } catch (e) { /* ignora */ }
    syncTog();
  });
  $$('[data-spoiler]').forEach((el) => {
    const show = (ev) => {
      if (el.classList.contains('is-shown')) return;
      ev.preventDefault(); ev.stopPropagation();
      el.classList.add('is-shown'); el.removeAttribute('role'); el.removeAttribute('tabindex');
    };
    el.addEventListener('click', (ev) => { if (root.dataset.spoilers !== 'on') show(ev); }, true);
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') show(ev); });
  });

  /* Filtri per stato */
  const filters = $('[data-filters]');
  if (filters) {
    filters.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-filter]');
      if (!b) return;
      $$('[data-filter]', filters).forEach((x) => x.classList.toggle('is-on', x === b));
      $$('[data-list] .entry').forEach((e) => { e.hidden = b.dataset.filter !== 'all' && e.dataset.status !== b.dataset.filter; });
    });
  }

  /* Ricerca: dialog (Cmd/Ctrl+K o "/") e pagina /cerca/ */
  let index = null;
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const load = async () => {
    if (index) return index;
    try { index = await (await fetch(W.base + 'search-index.json')).json(); } catch (e) { index = []; }
    return index;
  };
  const search = async (raw, max) => {
    const q = norm(raw.trim());
    if (!q) return [];
    const terms = q.split(/\s+/);
    const data = await load();
    return data.map((d) => {
      const t = norm(d.t), s = norm(d.s);
      if (!terms.every((x) => t.includes(x) || s.includes(x))) return null;
      return { d, score: terms.reduce((n, x) => n + (t.startsWith(x) ? 5 : t.includes(x) ? 3 : 1), 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, max).map((h) => h.d);
  };
  const item = (d, i) => `<li${i === 0 ? ' class="is-active"' : ''}><a href="${esc(W.base + d.u)}"><small>${esc(d.k)}${d.sp ? ' · spoiler' : ''}</small><strong>${esc(d.t)}</strong>${d.sp ? '' : `<em>${esc(d.s.slice(0, 150))}</em>`}</a></li>`;

  const dlg = $('#search'), input = $('#search-input'), list = $('#search-results');
  const render = async () => {
    const hits = await search(input.value, 8);
    if (!input.value.trim()) { list.innerHTML = '<li class="search__empty">Scrivi per cercare. Esempi: «Lucia», «Vice City», «trailer».</li>'; return; }
    list.innerHTML = hits.length ? hits.map(item).join('') : '<li class="search__empty">Nessun risultato. La wiki si arricchisce dopo il lancio: riprova presto.</li>';
  };
  const open = () => { if (!dlg || typeof dlg.showModal !== 'function') { location.href = W.base + 'cerca/'; return; } if (!dlg.open) dlg.showModal(); input.value = ''; render(); input.focus(); };
  const openBtn = $('#search-open');
  openBtn && openBtn.addEventListener('click', open);
  $$('[data-open-search]').forEach((b) => b.addEventListener('click', open));
  input && input.addEventListener('input', render);
  input && input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { const a = $('li.is-active a', list) || $('a', list); if (a) location.href = a.href; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const items = $$('li', list).filter((l) => l.querySelector('a'));
      if (!items.length) return;
      const cur = items.findIndex((l) => l.classList.contains('is-active'));
      const next = (cur + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((l, i) => l.classList.toggle('is-active', i === next));
    }
  });
  dlg && dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
  document.addEventListener('keydown', (ev) => {
    const typing = /input|textarea|select/i.test(document.activeElement.tagName);
    if (((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') || (ev.key === '/' && !typing)) { ev.preventDefault(); open(); }
  });

  const results = $('#results');
  if (results) {
    const q = new URLSearchParams(location.search).get('q') || '';
    const box = $('#q');
    if (box) box.value = q;
    if (q) search(q, 40).then((hits) => { results.innerHTML = hits.length ? hits.map(item).join('') : '<li class="empty">Nessun risultato per questa ricerca.</li>'; });
  }
})();
