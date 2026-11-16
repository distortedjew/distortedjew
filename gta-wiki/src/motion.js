// Movimento: progresso di scroll, parallax, comparsa a cascata, tilt delle card, contatori.
// Tutto rispetta prefers-reduced-motion. Nessuna dipendenza, nessuno script inline (CSP).
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Progresso di lettura e parallax dell'hero (un solo listener, throttled con rAF)
  const bar = document.querySelector('.scrollbar i');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = window.scrollY;
    const max = Math.max(1, root.scrollHeight - innerHeight);
    if (bar) bar.style.setProperty('--p', String(Math.min(1, y / max)));
    if (!reduce && y < 1400) root.style.setProperty('--py', String(Math.round(y)));
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // Comparsa a cascata delle griglie
  const grids = $$('.char-grid, .sec-grid, .gallery, .news-row, .progress-row, .loc-cards, .entry-list, .faq, .steps');
  grids.forEach((g) => { g.classList.add('stagger'); [...g.children].forEach((c, i) => c.style.setProperty('--i', String(Math.min(i, 12)))); });
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    grids.forEach((g) => io.observe(g));
    setTimeout(() => grids.forEach((g) => g.classList.add('in')), 6000); // rete di sicurezza
  } else grids.forEach((g) => g.classList.add('in'));

  // Contatori che salgono quando diventano visibili
  const counters = $$('[data-count]');
  const run = (el) => {
    const to = Number(el.dataset.count) || 0;
    if (reduce || to === 0) { el.textContent = String(to); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
    el.textContent = '0';
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    const co = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { run(e.target); co.unobserve(e.target); } }), { threshold: 0.6 });
    counters.forEach((c) => co.observe(c));
  }

  // Inclinazione delle card del cast (solo mouse)
  if (!reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('.char-card').forEach((card) => {
      card.addEventListener('pointermove', (ev) => {
        const r = card.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5;
        const y = (ev.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-y * 9).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
  }
})();
