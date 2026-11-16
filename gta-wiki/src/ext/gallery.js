// Galleria: filtri per categoria, animazioni d'ingresso e lightbox accessibile. Nessuna dipendenza, nessuno script inline (CSP).
(() => {
  const grid = document.querySelector('[data-ggrid]');
  if (!grid) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cells = $$('.g-cell', grid);
  const status = $('[data-gstatus]');
  const filters = $('[data-gfilters]');
  const credit = grid.dataset.credit || '';
  let current = 'all';

  /* ---- Filtri ---- */
  const labelOf = (b) => (b.firstChild ? b.firstChild.textContent.trim() : b.textContent.trim());
  function applyFilter(tag, announce = true) {
    current = tag;
    let n = 0;
    cells.forEach((c) => {
      const on = tag === 'all' || $('.g-item', c).dataset.tags.split(' ').includes(tag);
      c.hidden = !on;
      if (on) { n++; c.classList.add('in'); }
    });
    if (filters) $$('[data-gfilter]', filters).forEach((b) => { const on = b.dataset.gfilter === tag; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (status && announce) status.textContent = `${n} ${n === 1 ? 'immagine' : 'immagini'}${tag === 'all' ? '' : ` nella categoria «${labelOf($(`[data-gfilter="${tag}"]`, filters))}»`}.`;
    if (announce) try { history.replaceState(null, '', tag === 'all' ? location.pathname + location.search : '#' + tag); } catch (e) { /* ok */ }
  }
  if (filters) {
    filters.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-gfilter]');
      if (b) applyFilter(b.dataset.gfilter);
    });
  }

  /* ---- Animazione d'ingresso ---- */
  if ('IntersectionObserver' in window && !reduce) {
    grid.classList.add('g-anim');
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -4% 0px', threshold: 0.05 });
    cells.forEach((c) => io.observe(c));
  }

  /* ---- Lightbox ---- */
  const dlg = document.createElement('dialog');
  dlg.className = 'lb';
  dlg.setAttribute('aria-label', 'Immagine a schermo intero');
  dlg.innerHTML = '<div class="lb__stage"><p class="lb__count" aria-live="polite"></p>' +
    '<button type="button" class="lb__btn lb__close" aria-label="Chiudi">×</button>' +
    '<button type="button" class="lb__btn lb__prev" aria-label="Immagine precedente">‹</button>' +
    '<img class="lb__img" alt="" decoding="async">' +
    '<button type="button" class="lb__btn lb__next" aria-label="Immagine successiva">›</button></div>' +
    '<div class="lb__cap"><h2 class="lb__title"></h2><p class="lb__text"></p><p class="lb__meta"></p></div>';
  document.body.appendChild(dlg);
  const img = $('.lb__img', dlg), titleEl = $('.lb__title', dlg), textEl = $('.lb__text', dlg), metaEl = $('.lb__meta', dlg), countEl = $('.lb__count', dlg);
  let list = [], idx = 0, opener = null;
  const visible = () => $$('.g-item', grid).filter((a) => !a.closest('.g-cell').hidden);
  const preload = (a) => { if (a) { const i = new Image(); i.src = a.href; } };

  function show(i, swap = true) {
    idx = (i + list.length) % list.length;
    const a = list[idx], thumb = $('img', a);
    img.classList.remove('is-swap');
    img.src = a.href;
    img.alt = thumb.alt;
    img.width = thumb.width; img.height = thumb.height;
    if (swap && !reduce) { void img.offsetWidth; img.classList.add('is-swap'); }
    titleEl.textContent = a.dataset.title;
    textEl.textContent = a.dataset.caption;
    countEl.textContent = `${idx + 1} / ${list.length}`;
    metaEl.textContent = '';
    const cr = document.createElement('span'); cr.textContent = credit; metaEl.appendChild(cr);
    if (a.dataset.source) {
      const s = document.createElement('a'); s.href = a.dataset.source; s.target = '_blank'; s.rel = 'noopener noreferrer nofollow'; s.textContent = 'Fonte: pagina ufficiale ↗'; metaEl.appendChild(s);
    }
    if (a.dataset.link) {
      const l = document.createElement('a'); l.href = a.dataset.link; l.textContent = 'Vai alla scheda'; metaEl.appendChild(l);
    }
    const multi = list.length > 1;
    $('.lb__prev', dlg).hidden = !multi; $('.lb__next', dlg).hidden = !multi;
    preload(list[(idx + 1) % list.length]); preload(list[(idx - 1 + list.length) % list.length]);
    try { history.replaceState(null, '', '#img-' + a.dataset.id); } catch (e) { /* ok */ }
  }
  function open(a) {
    list = visible();
    if (!list.includes(a)) { applyFilter('all', false); list = visible(); }
    opener = a;
    show(list.indexOf(a), false);
    if (!dlg.open) { dlg.showModal(); document.documentElement.classList.add('lb-open'); }
    $('.lb__close', dlg).focus();
  }
  function close() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => {
    document.documentElement.classList.remove('lb-open');
    try { history.replaceState(null, '', current === 'all' ? location.pathname + location.search : '#' + current); } catch (e) { /* ok */ }
    if (opener) { const o = list[idx] && document.contains(list[idx]) ? list[idx] : opener; o.focus({ preventScroll: false }); }
  });

  grid.addEventListener('click', (ev) => {
    const a = ev.target.closest('.g-item');
    if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
    ev.preventDefault();
    open(a);
  });
  $('.lb__close', dlg).addEventListener('click', close);
  $('.lb__prev', dlg).addEventListener('click', () => show(idx - 1));
  $('.lb__next', dlg).addEventListener('click', () => show(idx + 1));
  // Click sullo sfondo (fuori da immagine, didascalia e pulsanti) chiude
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.classList.contains('lb__stage')) close(); });
  dlg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); show(idx + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(idx - 1); }
    else if (ev.key === 'Home') { ev.preventDefault(); show(0); }
    else if (ev.key === 'End') { ev.preventDefault(); show(list.length - 1); }
    else if (ev.key === 'Tab') {
      // Focus trap esplicito (oltre a quello nativo del <dialog> modale)
      const f = $$('button:not([hidden]), a[href]', dlg);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });
  // Swipe
  let x0 = null, y0 = 0;
  const stage = $('.lb__stage', dlg);
  stage.addEventListener('pointerdown', (ev) => { if (ev.pointerType === 'mouse') return; x0 = ev.clientX; y0 = ev.clientY; });
  stage.addEventListener('pointerup', (ev) => {
    if (x0 === null) return;
    const dx = ev.clientX - x0, dy = ev.clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(idx + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { x0 = null; });

  /* ---- Stato iniziale da hash: #categoria oppure #img-<id> (anche dalla ricerca e dalla home) ---- */
  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    if (h.startsWith('img-')) {
      const a = document.getElementById(h);
      if (a && a.classList.contains('g-item')) { a.closest('.g-cell').classList.add('in'); open(a); }
    } else if (filters && $(`[data-gfilter="${h}"]`, filters)) applyFilter(h, false);
  }
  fromHash();
  addEventListener('hashchange', fromHash);
})();
