// Mappa interattiva di Leonida: selezione, filtri, ricerca, zoom e spostamento. Nessuna dipendenza, nessuno script inline (CSP).
(() => {
  const app = document.querySelector('[data-map-app]');
  if (!app) return;
  const $ = (s, r = app) => r.querySelector(s);
  const $$ = (s, r = app) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vp = $('[data-map-viewport]');
  const svg = $('#map-svg');
  const stage = $('#map-stage') || svg; // palco che si ingrandisce e sposta (immagine ufficiale + pin, oppure solo lo schema)
  const pins = $$('.pin', svg);
  const zones = $$('.zone', svg);
  const panel = $('[data-map-panel]');
  const pBody = $('[data-map-body]');
  const pEmpty = $('[data-map-empty]');
  const countEl = $('[data-map-count]');
  const input = $('[data-map-search]');
  const credit = app.dataset.credit || '';
  const items = Object.fromEntries($$('#map-list .mloc', document).map((li) => [li.dataset.slug, li]));
  const MIN = 1, MAX = 4;
  const st = { z: 1, x: 0, y: 0, sel: null, type: 'all', q: '' };
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const txt = (el, sel) => { const n = el.querySelector(sel); return n ? n.textContent.trim() : ''; };
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  /* ---------- Vista: zoom e pan ---------- */
  const size = () => vp.clientWidth || 1;
  const sizeY = () => vp.clientHeight || size(); // con l'immagine ufficiale il riquadro non è quadrato
  const clamp = () => {
    const W = size();
    st.z = Math.min(MAX, Math.max(MIN, st.z));
    st.x = Math.min(0, Math.max(W * (1 - st.z), st.x));
    st.y = Math.min(0, Math.max(sizeY() * (1 - st.z), st.y));
  };
  const apply = () => {
    clamp();
    stage.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.z})`;
    const k = 100 / (size() * st.z); // 1 unità del pin = 1 px a schermo, a qualsiasi zoom
    pins.forEach((p) => p.firstElementChild.setAttribute('transform', `scale(${k.toFixed(5)})`));
    app.classList.toggle('is-zoomed', st.z > 1.001);
    const zin = $('[data-mzoom="in"]'), zout = $('[data-mzoom="out"]');
    if (zin) zin.disabled = st.z >= MAX - 0.001;
    if (zout) zout.disabled = st.z <= MIN + 0.001;
  };
  const zoomAt = (nz, cx, cy) => {
    nz = Math.min(MAX, Math.max(MIN, nz));
    const r = nz / st.z;
    st.x = cx - (cx - st.x) * r;
    st.y = cy - (cy - st.y) * r;
    st.z = nz;
    apply();
  };
  const zoomBy = (f) => { zoomAt(st.z * f, size() / 2, sizeY() / 2); };
  const reset = () => { st.z = 1; st.x = 0; st.y = 0; apply(); };
  const panBy = (dx, dy) => { st.x += dx; st.y += dy; apply(); };
  const centerOn = (slug) => {
    const p = pins.find((q) => q.dataset.slug === slug);
    if (!p || st.z <= 1.001) return;
    const W = size();
    st.x = W / 2 - (+p.dataset.x / 100) * W * st.z;
    st.y = sizeY() / 2 - (+p.dataset.y / 100) * sizeY() * st.z;
    apply();
  };
  const settle = () => { // durante il trascinamento niente transizione
    stage.classList.remove('is-moving');
  };

  $$('[data-mzoom]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.mzoom;
    if (a === 'in') zoomBy(1.5); else if (a === 'out') zoomBy(1 / 1.5); else reset();
  }));

  vp.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; // la rotella semplice continua a scorrere la pagina
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    zoomAt(st.z * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  const ptrs = new Map();
  let drag = null, pinch = null;
  vp.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.pin') && e.pointerType === 'mouse') return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: st.x, oy: st.y, moved: false };
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: st.z };
      drag = null;
    }
  });
  vp.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const r = vp.getBoundingClientRect();
      stage.classList.add('is-moving');
      zoomAt(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    if (drag && drag.id === e.pointerId && st.z > 1.001) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) { drag.moved = true; try { vp.setPointerCapture(e.pointerId); } catch (_) { /* ignora */ } stage.classList.add('is-moving'); vp.classList.add('is-dragging'); }
      st.x = drag.ox + dx; st.y = drag.oy + dy; apply();
    }
  });
  const endPtr = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && drag.id === e.pointerId) { if (drag.moved) vp.dataset.justDragged = '1'; setTimeout(() => { delete vp.dataset.justDragged; }, 60); drag = null; }
    if (!ptrs.size) { settle(); vp.classList.remove('is-dragging'); }
  };
  vp.addEventListener('pointerup', endPtr);
  vp.addEventListener('pointercancel', endPtr);

  /* ---------- Selezione e scheda ---------- */
  const visiblePins = () => pins.filter((p) => !p.classList.contains('is-hidden'));
  const fillPanel = (slug) => {
    const li = items[slug];
    pBody.textContent = '';
    if (!li) return;
    const name = txt(li, '.mloc__name');
    const conf = li.dataset.conf;
    const fig = li.dataset.photo ? (() => {
      const f = mk('figure', 'mpanel__shot');
      const im = document.createElement('img');
      im.src = li.dataset.photo; im.alt = `${name}, immagine ufficiale`; im.width = 1280; im.height = 720; im.decoding = 'async';
      f.append(im);
      if (credit) f.append(mk('figcaption', '', credit));
      return f;
    })() : null;
    if (fig) pBody.append(fig);
    pBody.append(mk('p', 'eyebrow', txt(li, '.mloc__kind')));
    const h = mk('h2', 'mpanel__name', name); h.id = 'mp-title'; h.tabIndex = -1; pBody.append(h);
    pBody.append(mk('p', 'mpanel__tag', txt(li, '.mloc__tag')));
    const pos = mk('p', 'mpanel__pos');
    pos.append(mk('span', `mbadge mbadge--${conf}`, conf === 'verified' ? 'Posizione verificata' : 'Posizione indicativa'));
    if (li.dataset.grid) pos.append(mk('span', 'mpanel__grid', `Riquadro ${li.dataset.grid} · griglia dello schema`));
    pBody.append(pos);
    const note = txt(li, '.mloc__note');
    if (note) pBody.append(mk('p', 'mpanel__note', note));
    pBody.append(mk('p', 'mpanel__sum', txt(li, '.mloc__sum')));
    const links = mk('p', 'mpanel__links');
    const a = mk('a', 'btn btn--primary', 'Apri la scheda →'); a.href = li.dataset.url; links.append(a);
    if (li.dataset.src) { const s = mk('a', 'link link--small', 'Fonte della posizione ↗'); s.href = li.dataset.src; s.target = '_blank'; s.rel = 'noopener noreferrer nofollow'; links.append(s); }
    pBody.append(links);
    pBody.classList.remove('is-in'); void pBody.offsetWidth; pBody.classList.add('is-in');
  };
  const select = (slug, opts = {}) => {
    const li = items[slug];
    if (!li || !pins.some((p) => p.dataset.slug === slug)) return;
    st.sel = slug;
    pins.forEach((p) => p.classList.toggle('is-sel', p.dataset.slug === slug));
    zones.forEach((z) => z.classList.toggle('is-sel', z.dataset.zone === slug));
    pEmpty.hidden = true; pBody.hidden = false;
    fillPanel(slug);
    app.classList.add('has-sel');
    if (!opts.keepView) { stage.classList.remove('is-moving'); centerOn(slug); }
    try { history.replaceState(null, '', '#' + slug); } catch (_) { /* ignora */ }
  };
  const deselect = (focusBack) => {
    const prev = st.sel;
    st.sel = null;
    pins.forEach((p) => p.classList.remove('is-sel'));
    zones.forEach((z) => z.classList.remove('is-sel'));
    pBody.hidden = true; pBody.textContent = ''; pEmpty.hidden = false;
    app.classList.remove('has-sel');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* ignora */ }
    if (focusBack && prev) { const p = pins.find((q) => q.dataset.slug === prev); if (p) p.focus(); }
  };

  pins.forEach((p) => {
    p.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // apri la scheda come link normale
      if (vp.dataset.justDragged) { e.preventDefault(); return; }
      e.preventDefault();
      select(p.dataset.slug);
    });
    p.addEventListener('keydown', (e) => {
      const dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
      const d = dirs[e.key];
      if (!d) return;
      e.preventDefault();
      const cx = +p.dataset.x, cy = +p.dataset.y;
      let best = null, bs = Infinity;
      for (const q of visiblePins()) {
        if (q === p) continue;
        const dx = +q.dataset.x - cx, dy = +q.dataset.y - cy;
        const along = dx * d[0] + dy * d[1];
        if (along <= 0) continue;
        const score = Math.hypot(dx, dy) + Math.abs(dx * d[1] - dy * d[0]) * 0.8;
        if (score < bs) { bs = score; best = q; }
      }
      if (best) { best.focus(); select(best.dataset.slug, { keepView: false }); }
    });
  });

  vp.addEventListener('keydown', (e) => {
    if (e.target.closest('.pin')) { if (e.key === 'Escape' && st.sel) { e.preventDefault(); deselect(true); } return; }
    const step = 48;
    const map = { '+': () => zoomBy(1.5), '=': () => zoomBy(1.5), '-': () => zoomBy(1 / 1.5), '_': () => zoomBy(1 / 1.5), 0: reset, ArrowLeft: () => panBy(step, 0), ArrowRight: () => panBy(-step, 0), ArrowUp: () => panBy(0, step), ArrowDown: () => panBy(0, -step) };
    const fn = map[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.sel && !/input|textarea/i.test(document.activeElement.tagName)) deselect(true); });
  const close = $('[data-map-close]');
  close && close.addEventListener('click', () => deselect(true));
  // un tocco sullo sfondo della mappa chiude la scheda
  vp.addEventListener('click', (e) => { if (!e.target.closest('.pin') && !vp.dataset.justDragged && st.sel) deselect(false); });

  /* ---------- Filtri e ricerca ---------- */
  const refresh = () => {
    const q = norm(st.q.trim());
    let shown = 0, hits = 0;
    for (const p of pins) {
      const li = items[p.dataset.slug];
      const typeOk = st.type === 'all' || p.dataset.type === st.type;
      const match = !!q && norm(`${txt(li, '.mloc__name')} ${li.dataset.kind} ${txt(li, '.mloc__tag')} ${txt(li, '.mloc__sum')}`).includes(q);
      p.classList.toggle('is-hidden', !typeOk);
      p.classList.toggle('is-dim', typeOk && !!q && !match);
      p.classList.toggle('is-hit', typeOk && match);
      zones.find((z) => z.dataset.zone === p.dataset.slug)?.classList.toggle('is-hidden', !typeOk);
      if (typeOk) { shown++; if (match) hits++; }
    }
    $$('#map-list .mloc', document).forEach((li) => {
      const typeOk = st.type === 'all' || li.dataset.type === st.type;
      li.hidden = !typeOk;
    });
    if (st.sel && pins.find((p) => p.dataset.slug === st.sel)?.classList.contains('is-hidden')) deselect(false);
    if (countEl) countEl.textContent = q ? (hits ? `${hits} ${hits === 1 ? 'risultato' : 'risultati'} evidenziati` : 'Nessun luogo trovato') : (st.type === 'all' ? `${shown} luoghi sulla mappa` : `${shown} di ${pins.length} luoghi`);
  };
  $$('[data-mfilter]').forEach((b) => b.addEventListener('click', () => {
    st.type = b.dataset.mfilter;
    $$('[data-mfilter]').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); });
    refresh();
  }));
  input && input.addEventListener('input', () => { st.q = input.value; refresh(); });
  input && input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const hit = pins.find((p) => p.classList.contains('is-hit')); if (hit) select(hit.dataset.slug); }
  });

  /* ---------- Avvio ---------- */
  apply();
  if (typeof ResizeObserver === 'function') new ResizeObserver(apply).observe(vp); else addEventListener('resize', apply);
  const fromHash = () => { const s = decodeURIComponent(location.hash.slice(1)); if (s && items[s] && pins.some((p) => p.dataset.slug === s)) select(s, { keepView: true }); };
  fromHash();
  addEventListener('hashchange', fromHash);
  if (reduce) app.classList.add('is-calm');
})();
