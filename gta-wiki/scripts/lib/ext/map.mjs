// Estensione "Mappa": pagina /mappa/, teaser in home, voce di menu e righe di ricerca.
// Dati: content/map.json (validato da scripts/lib/validators/map.mjs). La sagoma è uno SCHEMA disegnato da noi, non una mappa ufficiale.
import fs from 'node:fs';
import path from 'node:path';

// Sagoma stilizzata dello stato (viewBox 0 0 100 100, nord in alto). Non in scala, non derivata da dati ufficiali.
const LAND = 'M6 8 L30 5 Q50 7 70 5 L94 8 Q93 18 90 26 Q88 36 90 44 Q88 52 90 60 Q88 70 84 76 Q80 82 74 85 Q70 88 64 85 Q58 80 52 80 Q46 83 40 80 Q34 76 30 70 Q26 62 26 55 Q24 48 18 44 Q11 40 8 32 Q5 20 6 8 Z';
const ISLANDS = [
  'M71 90 Q74 88 77 90 Q75 93 71 92 Z',
  'M63 92 Q67 90 69 93 Q66 96 62 95 Z',
  'M54 94 Q58 92 60 95 Q57 98 53 97 Z',
  'M46 96 Q49 94 51 97 Q48 99 45 98 Z',
  'M38 97 Q41 95 43 98 Q40 100 37 99 Z'
];
const ZONE_R = { citta: 7, arcipelago: 11, regione: 12, natura: 10 };

const escFallback = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const gridRef = (x, y) => `${'ABCDEFGHIJ'[Math.min(9, Math.floor(x / 10))]}${Math.min(9, Math.floor(y / 10)) + 1}`;
const num = (n) => Math.round(n * 100) / 100;

export default async function register(ctx) {
  const ROOT = ctx.ROOT || path.resolve(import.meta.dirname, '..', '..', '..');
  const esc = ctx.esc || escFallback;
  const href = ctx.href || ((p = '') => (ctx.BASE || '/') + p);
  const abs = ctx.abs || (() => '');
  const meta = ctx.meta || ctx.data?.meta || {};
  const SITE = ctx.SITE || '';
  const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));
  const map = readJson('map.json');
  const locations = ctx.data?.locations || readJson('locations.json');
  const bySlug = Object.fromEntries(locations.map((l) => [l.slug, l]));

  const photoOf = (l) => {
    if (l.photo) return l.photo;
    for (const e of ['avif', 'webp', 'jpg', 'jpeg', 'png']) if (fs.existsSync(path.join(ROOT, 'assets', 'img', 'locations', `${l.slug}.${e}`))) return `assets/img/locations/${l.slug}.${e}`;
    return null;
  };
  const trunc = (s, n = 170) => { s = String(s).replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n - 1); return c.slice(0, c.lastIndexOf(' ')).replace(/[,.;:]$/, '') + '…'; };

  const pins = map.pins.map((p) => ({ ...p, loc: bySlug[p.slug] })).filter((p) => p.loc);
  const pinned = new Set(pins.map((p) => p.slug));
  const containers = (map.containers || []).map((s) => bySlug[s]).filter(Boolean);
  const unplaced = locations.filter((l) => !pinned.has(l.slug) && !(map.containers || []).includes(l.slug));
  const typeLabel = (t) => map.types[t] || t;
  const confLabel = (c) => (c === 'verified' ? 'Posizione verificata' : 'Posizione indicativa');
  const usedTypes = Object.keys(map.types).filter((t) => pins.some((p) => p.type === t));
  const nIndicative = pins.filter((p) => p.confidence !== 'verified').length;

  /* ---------- SVG ---------- */
  const labelSide = (x) => (x > 50 ? 'left' : 'right');
  const pinSvg = (p, i) => {
    const side = p.labelSide || labelSide(p.x);
    const lx = side === 'left' ? -17 : 17;
    const anchor = side === 'left' ? 'end' : 'start';
    return `<a class="pin pin--${esc(p.type)} pin--${p.confidence}" href="${href(`luoghi/${p.slug}/`)}" data-slug="${esc(p.slug)}" data-x="${p.x}" data-y="${p.y}" data-type="${esc(p.type)}" transform="translate(${p.x} ${p.y})" aria-label="${esc(p.loc.name)}, ${esc(typeLabel(p.type).toLowerCase())}, ${esc(confLabel(p.confidence).toLowerCase())}">
      <g class="pin__k" transform="scale(.14)"><g class="pin__drop pin__d${i}">
        <circle class="pin__hit" r="24"/><circle class="pin__ring" r="12"/><circle class="pin__focus" r="17"/><circle class="pin__dot" r="9"/>
        <text class="pin__label" x="${lx}" y="5" text-anchor="${anchor}">${esc(p.loc.name)}</text>
      </g></g></a>`;
  };

  const zones = pins.map((p) => `<circle class="zone zone--${esc(p.type)}${p.confidence === 'verified' ? ' zone--v' : ''}" data-zone="${esc(p.slug)}" cx="${p.x}" cy="${p.y}" r="${ZONE_R[p.type] || 9}"/>`).join('');

  const mapSvg = `<svg class="msvg" id="map-svg" viewBox="0 0 100 100" role="group" aria-labelledby="map-svg-t map-svg-d" preserveAspectRatio="xMidYMid meet">
    <title id="map-svg-t">Schema indicativo dello stato di Leonida</title>
    <desc id="map-svg-d">Sagoma stilizzata e non in scala con ${pins.length} luoghi: ${pins.map((p) => p.loc.name).join(', ')}. L'elenco completo è sotto la mappa.</desc>
    <defs>
      <pattern id="map-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" class="grid-line"/></pattern>
      <pattern id="map-waves" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><path d="M0 2 Q1 1 2 2 T4 2" fill="none" class="wave-line"/></pattern>
      <linearGradient id="map-land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b1a72"/><stop offset="1" stop-color="#5a1f7d"/></linearGradient>
    </defs>
    <rect width="100" height="100" class="sea"/>
    <rect width="100" height="100" fill="url(#map-waves)"/>
    <rect width="100" height="100" fill="url(#map-grid)"/>
    <path class="land" d="${LAND}"/>
    ${ISLANDS.map((d) => `<path class="land land--isle" d="${d}"/>`).join('')}
    <path class="coast" pathLength="1" d="${LAND}"/>
    ${ISLANDS.map((d) => `<path class="coast coast--isle" pathLength="1" d="${d}"/>`).join('')}
    <text class="state-name" x="50" y="29" text-anchor="middle" aria-hidden="true">LEONIDA</text>
    <g class="zones" aria-hidden="true">${zones}</g>
    <g class="pins">${pins.map(pinSvg).join('')}</g>
  </svg>`;

  const compass = `<svg class="mcompass" viewBox="0 0 64 72" aria-hidden="true" focusable="false"><circle cx="32" cy="42" r="23" class="c-ring"/><path d="M32 22 L37 42 L32 62 L27 42 Z" class="c-needle"/><path d="M11 42 L32 37 L53 42 L32 47 Z" class="c-cross"/><text x="32" y="12" text-anchor="middle" class="c-n">N</text></svg>`;

  /* ---------- Elenco (anche fallback senza JS) ---------- */
  const li = (l, p) => {
    const photo = photoOf(l);
    const conf = p ? p.confidence : null;
    return `<li class="mloc${p ? '' : ' mloc--unplaced'}" data-slug="${esc(l.slug)}"${p ? ` data-type="${esc(p.type)}" data-conf="${p.confidence}" data-grid="${gridRef(p.x, p.y)}"${p.source ? ` data-src="${esc(p.source)}"` : ''}` : ''} data-kind="${esc(l.kind)}" data-photo="${photo ? esc(href(photo)) : ''}" data-url="${esc(href(`luoghi/${l.slug}/`))}">
      <p class="mloc__kind">${esc(l.kind)}${p ? ` · ${esc(typeLabel(p.type))}` : ''}</p>
      <h3 class="mloc__name"><a href="${href(`luoghi/${l.slug}/`)}">${esc(l.name)}</a></h3>
      <p class="mloc__tag">${esc(l.tagline)}</p>
      <p class="mloc__sum">${esc(trunc(l.summary))}</p>
      ${p ? `<p class="mloc__pos"><span class="mbadge mbadge--${conf}">${confLabel(conf)}</span> <span class="mloc__note">${esc(p.note)}</span>${p.source ? ` <a class="link link--small" href="${esc(p.source)}" rel="noopener noreferrer nofollow" target="_blank">Fonte ↗</a>` : ''}</p>` : '<p class="mloc__pos"><span class="mbadge mbadge--none">Posizione non ancora nota</span></p>'}
    </li>`;
  };

  const placedList = pins.map((p) => li(p.loc, p)).join('');
  const unplacedList = unplaced.map((l) => li(l, null)).join('');
  const stateCards = containers.map((l) => `<p class="map-state"><strong>${esc(l.name)}</strong> (${esc(l.kind.toLowerCase())}): ${esc(l.tagline)} È il contenitore di tutte le regioni qui sopra, quindi non ha un punto sulla mappa. <a class="link" href="${href(`luoghi/${l.slug}/`)}">Scheda di ${esc(l.name)} →</a></p>`).join('');

  const chips = [`<button type="button" class="chip is-on" data-mfilter="all" aria-pressed="true">Tutti</button>`, ...usedTypes.map((t) => `<button type="button" class="chip" data-mfilter="${esc(t)}" aria-pressed="false">${esc(typeLabel(t))}</button>`)].join('');

  const legend = `<ul class="mlegend" aria-label="Legenda">
    ${usedTypes.map((t) => `<li><span class="mlegend__dot mlegend__dot--${esc(t)}" aria-hidden="true"></span>${esc(typeLabel(t))}</li>`).join('')}
    <li><span class="mlegend__dot mlegend__dot--indicative" aria-hidden="true"></span>Posizione indicativa (zona tratteggiata)</li>
    ${pins.some((p) => p.confidence === 'verified') ? '<li><span class="mlegend__dot mlegend__dot--verified" aria-hidden="true"></span>Posizione verificata</li>' : ''}
  </ul>`;

  const body = `<header class="page-head">
    <p class="eyebrow">Mappa schematica</p>
    <h1 class="h1">Mappa di Leonida</h1>
    <p class="page-head__lead">${esc(map.intro)}</p>
    <p class="map-disclaimer"><span aria-hidden="true">◐</span> ${esc(map.disclaimer)}</p>
  </header>
  <section class="map-app" id="map-app" aria-label="Mappa interattiva di Leonida" data-map-app data-credit="${esc(ctx.CREDIT || '© Rockstar Games')}">
    <div class="map-main">
      <div class="map-tools" role="group" aria-label="Strumenti della mappa">
        <div class="map-search"><label class="sr" for="map-q">Cerca un luogo sulla mappa</label><input id="map-q" type="search" placeholder="Cerca un luogo…" autocomplete="off" data-map-search></div>
        <div class="map-filters chips" role="group" aria-label="Filtra per tipo">${chips}</div>
      </div>
      <div class="map-frame">
        <div class="map-viewport" id="map-viewport" data-map-viewport tabindex="0" role="group" aria-roledescription="mappa" aria-label="Mappa di Leonida. Con la mappa attiva: più e meno per lo zoom, frecce per spostarsi, zero per ripristinare. Tra i punti ci si muove con Tab o con le frecce.">
          ${mapSvg}
        </div>
        ${compass}
        <p class="map-scale" aria-hidden="true">Schema indicativo · non in scala</p>
        <div class="map-zoom" role="group" aria-label="Zoom">
          <button type="button" class="map-btn" data-mzoom="in" aria-label="Ingrandisci">+</button>
          <button type="button" class="map-btn" data-mzoom="out" aria-label="Riduci">−</button>
          <button type="button" class="map-btn map-btn--txt" data-mzoom="reset" aria-label="Ripristina la vista">1:1</button>
        </div>
      </div>
      <p class="map-hint" data-map-hint>Ctrl + rotella o pizzico per lo zoom, trascina per spostare. <span data-map-count aria-live="polite">${pins.length} luoghi sulla mappa</span></p>
      ${legend}
    </div>
    <aside class="mpanel" id="map-panel" aria-label="Scheda del luogo selezionato" data-map-panel>
      <button type="button" class="mpanel__close" data-map-close aria-label="Chiudi la scheda">Chiudi ✕</button>
      <div class="mpanel__empty" data-map-empty>
        <p class="eyebrow">Come si usa</p>
        <p>Seleziona un punto sulla mappa per vedere tipo, descrizione, foto (se disponibile) e quanto è affidabile la sua posizione.</p>
        <p class="mpanel__small">${nIndicative === pins.length ? 'Per ora tutte le posizioni sono indicative: le confermeremo con il gioco.' : `${nIndicative} posizioni su ${pins.length} sono ancora indicative.`}</p>
      </div>
      <div class="mpanel__body" data-map-body hidden></div>
    </aside>
  </section>

  <section class="map-text">
    <h2 class="h2 map-h2">Cosa sappiamo (e cosa no)</h2>
    <p>I nomi delle regioni di Leonida vengono dai materiali ufficiali di Rockstar Games. La loro posizione, invece, non è ufficiale: le testate ricostruiscono l'ordine generale dai trailer, dagli screenshot e dai cartelli stradali, e a volte non sono d'accordo (Port Gellhorn, per esempio, è collocata sia a ovest sia a nord-ovest).</p>
    <p>Per questo ogni punto ha un'etichetta: <strong>posizione indicativa</strong> significa che la zona è plausibile ma non confermata; la zona tratteggiata attorno al punto ricorda che non conosciamo né il confine né la distanza reale. Dopo il lancio verificheremo ogni punto con il gioco e passeremo a <strong>posizione verificata</strong> solo con una fonte.</p>
    ${stateCards}
    <p class="map-updated">Dati della mappa aggiornati il <time datetime="${esc(map.updated)}">${esc(new Date(map.updated + 'T12:00:00Z').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }))}</time>. La sagoma è un disegno dello staff, non un estratto del gioco.</p>
  </section>

  <section class="map-list-sec" aria-labelledby="map-list-h">
    <h2 class="h2 map-h2" id="map-list-h">Tutti i luoghi sulla mappa</h2>
    <ul class="mlist" id="map-list" data-map-list>${placedList}</ul>
    <h2 class="h2 map-h2 map-h2--sm" id="map-unplaced-h">Posizione non ancora nota</h2>
    ${unplaced.length
      ? `<p class="map-lead">Luoghi della wiki di cui non conosciamo ancora la posizione: non li mettiamo sulla mappa finché non è verificata.</p><ul class="mlist" data-map-unplaced>${unplacedList}</ul>`
      : '<p class="map-lead">Per ora ogni luogo della wiki ha una zona indicativa. Quando aggiungeremo negozi, hotel o altri punti di cui non conosciamo la posizione, compariranno qui, non sulla mappa.</p>'}
  </section>`;

  const itemList = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Mappa di Leonida: regioni e luoghi di GTA VI', inLanguage: 'it',
    description: 'Mappa schematica e non ufficiale dello stato di Leonida con le regioni principali di GTA VI.',
    ...(SITE ? { url: abs('mappa/') } : {}),
    mainEntity: { '@type': 'ItemList', itemListElement: pins.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Place', name: p.loc.name, description: trunc(p.loc.summary, 200), ...(SITE ? { url: abs(`luoghi/${p.slug}/`) } : {}) } })) }
  };

  ctx.styles.push('ext/map.css');
  ctx.scripts.push('ext/map.js');
  ctx.copyFile('src/ext/map.css');
  ctx.copyFile('src/ext/map.js');
  ctx.nav.push(['mappa', 'Mappa']);

  ctx.put('mappa/index.html', ctx.layout({
    title: 'Mappa di Leonida: regioni e luoghi di GTA VI', section: 'mappa', path: 'mappa/',
    desc: 'Mappa interattiva e non ufficiale di Leonida, con Vice City, Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia e Mount Kalaga. Posizioni indicative, con fonti.',
    crumbs: [['Home', ''], ['Mappa', 'mappa/']],
    schema: [itemList],
    body
  }), { prio: 0.9 });

  /* ---------- Teaser in home ---------- */
  const mini = `<svg class="mmini" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect width="100" height="100" class="sea"/><rect width="100" height="100" fill="url(#mini-grid)"/><defs><pattern id="mini-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" class="grid-line"/></pattern></defs><path class="land" d="${LAND}"/>${ISLANDS.map((d) => `<path class="land land--isle" d="${d}"/>`).join('')}<path class="coast" pathLength="1" d="${LAND}"/>${pins.map((p) => `<circle class="mmini__dot mmini__dot--${esc(p.type)}" cx="${p.x}" cy="${p.y}" r="2.6"/>`).join('')}</svg>`;
  const teaser = `<section class="block map-teaser" data-reveal>
    <div class="map-teaser__grid">
      <div class="map-teaser__text">
        <p class="eyebrow">Mappa</p>
        <h2 class="h2">Esplora Leonida</h2>
        <p class="block__lead">Una mappa schematica dello stato con le sue ${pins.length} aree principali: scegli un punto per vedere la scheda e quanto è affidabile la sua posizione. Non è una mappa ufficiale e non è in scala.</p>
        <p class="block__more"><a class="btn btn--primary" href="${href('mappa/')}">Apri la mappa</a></p>
      </div>
      <a class="map-teaser__art" href="${href('mappa/')}" aria-label="Apri la mappa interattiva di Leonida">${mini}<span class="map-teaser__tag">Schema indicativo</span></a>
    </div>
  </section>`;
  ctx.addSlot('home:after-cast', () => teaser);

  /* ---------- Ricerca ---------- */
  const si = ctx.searchIndex;
  if (si && typeof si.push === 'function') {
    si.push({ t: 'Mappa di Leonida', k: 'Mappa', u: 'mappa/', s: `Mappa schematica e interattiva dello stato di Leonida: ${pins.map((p) => p.loc.name).join(', ')}. Posizioni indicative.`, sp: false });
    for (const p of pins) si.push({ t: `${p.loc.name} sulla mappa`, k: 'Mappa', u: `mappa/#${p.slug}`, s: `${confLabel(p.confidence)}. ${p.note}`, sp: false });
  }
}
