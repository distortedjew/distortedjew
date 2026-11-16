// Interazioni: countdown, spoiler, filtri, ricerca. Nessuna dipendenza.
(() => {
  const W = window.WIKI || { base: '/', release: '', phase: 'prelaunch' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Countdown verso mezzanotte locale del giorno di uscita; a zero passa alla modalità lancio. */
  const cd = $('#countdown');
  if (cd) {
    const target = new Date(W.release).getTime(); // senza fuso => ora locale dell'utente
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const d = target - Date.now();
      if (d <= 0) {
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

  /* Spoiler: interruttore globale + click sul singolo blocco */
  const root = document.documentElement;
  const tog = $('#spoiler-toggle');
  const syncTog = () => tog && tog.setAttribute('aria-pressed', String(root.dataset.spoilers === 'on'));
  syncTog();
  tog && tog.addEventListener('click', () => {
    const on = root.dataset.spoilers !== 'on';
    root.dataset.spoilers = on ? 'on' : 'off';
    try { localStorage.setItem('spoilers', on ? 'on' : 'off'); } catch (e) {}
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

  /* Ricerca (Cmd/Ctrl+K oppure "/") */
  const dlg = $('#search');
  const input = $('#search-input');
  const list = $('#search-results');
  let index = null;
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const load = async () => {
    if (index) return index;
    try { index = await (await fetch(W.base + 'search-index.json')).json(); } catch (e) { index = []; }
    return index;
  };
  const render = async () => {
    const q = norm(input.value.trim());
    const data = await load();
    if (!q) { list.innerHTML = '<li class="search__empty">Scrivi per cercare. Esempi: «Lucia», «Vice City», «trailer».</li>'; return; }
    const terms = q.split(/\s+/);
    const hits = data.map((d) => {
      const t = norm(d.t), s = norm(d.s);
      if (!terms.every((x) => t.includes(x) || s.includes(x))) return null;
      return { d, score: terms.reduce((n, x) => n + (t.startsWith(x) ? 5 : t.includes(x) ? 3 : 1), 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 8);
    list.innerHTML = hits.length
      ? hits.map(({ d }, i) => `<li class="${i === 0 ? 'is-active' : ''}"><a href="${W.base}${d.u}"><small>${d.k}${d.sp ? ' · spoiler' : ''}</small><strong>${esc(d.t)}</strong>${d.sp ? '' : `<em>${esc(d.s)}</em>`}</a></li>`).join('')
      : '<li class="search__empty">Nessun risultato. La wiki si arricchisce dopo il lancio: riprova presto.</li>';
  };
  const open = () => { if (!dlg) return; if (!dlg.open) dlg.showModal(); input.value = ''; render(); input.focus(); };
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
})();
