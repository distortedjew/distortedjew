// Generatore statico: legge content/*.json e produce dist/ (zero dipendenze).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist');
const BASE = ('/' + (process.env.WIKI_BASE || '/').replace(/^\/+|\/+$/g, '') + '/').replace(/^\/\/$/, '/');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

const meta = read('meta.json');
const characters = read('characters.json');
const locations = read('locations.json');
const eggs = read('easter-eggs.json');
const guides = read('guides.json');
const news = read('news.json').sort((a, b) => b.date.localeCompare(a.date));

const STATUS = {
  confirmed: ['Confermato', 'ok'],
  unverified: ['Non verificato', 'warn'],
  rumor: ['Teoria', 'rumor'],
  planned: ['In arrivo', 'plan'],
  debunked: ['Smentito', 'bad']
};

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (p = '') => BASE + p;
const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const byName = (arr, key) => Object.fromEntries(arr.map((x) => [x.slug, x]));
const locBySlug = byName(locations);
const charBySlug = byName(characters);

/* ---------- Markdown minimale (per le guide) ---------- */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" rel="noopener">$1</a>');
}
function markdown(src = '') {
  const out = [];
  for (const block of src.trim().split(/\n{2,}/)) {
    const lines = block.split('\n');
    if (/^### /.test(block)) out.push(`<h3>${inline(block.slice(4))}</h3>`);
    else if (/^## /.test(block)) out.push(`<h2>${inline(block.slice(3))}</h2>`);
    else if (lines.every((l) => /^[-*] /.test(l))) out.push('<ul>' + lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('') + '</ul>');
    else if (lines.every((l) => /^\d+\. /.test(l))) out.push('<ol>' + lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('') + '</ol>');
    else if (lines.every((l) => /^> /.test(l))) out.push(`<blockquote>${inline(lines.map((l) => l.slice(2)).join(' '))}</blockquote>`);
    else out.push(`<p>${inline(lines.join(' '))}</p>`);
  }
  return out.join('\n');
}

/* ---------- Illustrazione stilizzata dei personaggi ---------- */
function hairPath(kind, c) {
  switch (kind) {
    case 'long': return `<path d="M128 150c-8-70 40-100 82-96 52 5 74 54 66 118l-14 120-26-90-6-72-44-20-44 22-8 78-20 80z" fill="${c}"/>`;
    case 'short': return `<path d="M138 140c-4-52 28-78 72-76 44 2 66 32 60 78-24-20-60-30-132-2z" fill="${c}"/>`;
    case 'cap': return `<path d="M134 134c0-50 36-72 76-70 40 2 64 26 62 66l66 14c0 10-8 14-18 14l-104-6-82-2z" fill="${c}"/><rect x="130" y="130" width="146" height="14" rx="7" fill="${c}"/>`;
    case 'curly': return `<g fill="${c}"><circle cx="150" cy="104" r="28"/><circle cx="188" cy="82" r="30"/><circle cx="232" cy="84" r="30"/><circle cx="268" cy="108" r="28"/><circle cx="142" cy="140" r="20"/><circle cx="276" cy="142" r="20"/></g>`;
    default: return '';
  }
}
function portrait(c, size = 'card') {
  const id = 'p' + c.slug.replace(/[^a-z0-9]/g, '');
  const initials = c.name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
  return `<svg class="portrait portrait--${size}" viewBox="0 0 400 500" role="img" aria-label="Illustrazione stilizzata di ${esc(c.name)}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.color}"/><stop offset="1" stop-color="#1a0a33"/></linearGradient>
    <pattern id="${id}d" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="7" cy="7" r="2.4" fill="#0e0620" opacity=".28"/></pattern>
    <clipPath id="${id}c"><rect width="400" height="500"/></clipPath>
  </defs>
  <g clip-path="url(#${id}c)">
    <rect width="400" height="500" fill="url(#${id}g)"/>
    <rect width="400" height="500" fill="url(#${id}d)"/>
    <text x="200" y="360" text-anchor="middle" class="portrait__letters" fill="none" stroke="${c.accent}" stroke-width="3" opacity=".75">${esc(initials)}</text>
    <circle cx="300" cy="112" r="46" fill="${c.accent}" opacity=".9"/>
    <path d="M40 520c6-110 56-150 160-158 104 8 154 48 160 158z" fill="#0e0620"/>
    <path d="M40 520c6-110 56-150 160-158" fill="none" stroke="${c.accent}" stroke-width="3" opacity=".8"/>
    <rect x="178" y="296" width="46" height="70" rx="14" fill="#1b0b36"/>
    <ellipse cx="204" cy="212" rx="64" ry="78" fill="#2a1250"/>
    <ellipse cx="204" cy="212" rx="64" ry="78" fill="none" stroke="${c.accent}" stroke-width="3" opacity=".85"/>
    ${hairPath(c.hair, '#0e0620')}
  </g>
</svg>`;
}

/* ---------- Componenti ---------- */
const badge = (status) => `<span class="badge badge--${STATUS[status][1]}">${STATUS[status][0]}</span>`;
const reviewNote = (e) => (e.needs_review ? '<p class="review-note"><span aria-hidden="true">◐</span> Scheda in attesa di verifica con il gioco finale: i dettagli possono cambiare.</p>' : '');
const sources = (list) =>
  list && list.length
    ? `<aside class="sources"><h2 class="eyebrow">Fonti</h2><ul>${list.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a></li>`).join('')}</ul></aside>`
    : '';
const spoilerWrap = (e, inner) => (e.spoiler ? `<div class="spoiler" data-spoiler tabindex="0" role="button" aria-label="Contenuto con spoiler, premi per mostrare">${inner}</div>` : inner);

function charCard(c, i) {
  return `<a class="char-card" href="${href(`personaggi/${c.slug}/`)}" style="--c:${c.color};--a:${c.accent}">
    <span class="char-card__no">${String(i + 1).padStart(2, '0')}</span>
    ${portrait(c)}
    <span class="char-card__body">
      <span class="char-card__role">${esc(c.role)}${c.playable ? ' · giocabile' : ''}</span>
      <span class="char-card__name">${esc(c.name)}</span>
    </span>
  </a>`;
}

function layout({ title, desc, path: p, body, section = '' }) {
  const nav = [
    ['personaggi', 'Personaggi'],
    ['luoghi', 'Luoghi'],
    ['easter-egg', 'Easter egg'],
    ['guide', 'Guide'],
    ['novita', 'Novità']
  ];
  const full = (title ? title + ' · ' : '') + meta.siteName;
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc || meta.tagline)}">
<meta name="theme-color" content="#0e0620">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc || meta.tagline)}">
<meta property="og:type" content="website">
<link rel="icon" href="${href('favicon.svg')}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${href('style.css')}">
<script>window.WIKI={base:${JSON.stringify(BASE)},release:${JSON.stringify(meta.release.iso)},phase:${JSON.stringify(meta.phase)}};try{if(localStorage.getItem('spoilers')==='on')document.documentElement.dataset.spoilers='on'}catch(e){}</script>
<script src="${href('app.js')}" defer></script>
</head>
<body class="${section ? 'sec-' + section : ''}">
<a class="skip" href="#main">Vai al contenuto</a>
<header class="top">
  <a class="brand" href="${href()}" aria-label="${esc(meta.siteName)} – home">
    <span class="brand__vi">VI</span><span class="brand__name">${esc(meta.siteName)}</span>
  </a>
  <nav class="nav" aria-label="Principale">
    ${nav.map(([s, l]) => `<a href="${href(s + '/')}"${section === s ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
  </nav>
  <div class="top__tools">
    <button class="tool" id="spoiler-toggle" type="button" aria-pressed="false" title="Mostra o nascondi gli spoiler"><span class="tool__dot"></span>Spoiler</button>
    <button class="tool tool--search" id="search-open" type="button" aria-label="Cerca nella wiki"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Cerca</span><kbd>/</kbd></button>
  </div>
</header>
<dialog id="search" aria-label="Cerca">
  <form method="dialog" class="search__bar"><input id="search-input" type="search" placeholder="Cerca personaggi, luoghi, easter egg, guide…" autocomplete="off" aria-label="Cerca"><button class="tool" value="close">Esc</button></form>
  <ul id="search-results" class="search__results"></ul>
</dialog>
<main id="main">
${body}
</main>
<footer class="foot">
  <div class="foot__grid">
    <div>
      <p class="brand brand--foot"><span class="brand__vi">VI</span><span class="brand__name">${esc(meta.siteName)}</span></p>
      <p class="foot__small">Wiki non ufficiale fatta dai fan. Non affiliata a Rockstar Games o Take-Two Interactive. Grand Theft Auto e GTA VI sono marchi dei rispettivi proprietari.</p>
    </div>
    <div>
      <p class="eyebrow">Stato dei contenuti</p>
      <p class="foot__small">Ultimo aggiornamento: <time datetime="${meta.lastUpdate}">${fmtDate(meta.lastUpdate)}</time>.<br>Ogni scheda mostra se è confermata, una teoria o ancora da verificare, con le fonti.</p>
    </div>
  </div>
</footer>
</body>
</html>`;
}

/* ---------- Pagine ---------- */
const pages = new Map();
const put = (rel, html) => pages.set(rel, html);

const counts = {
  eggs: eggs.filter((e) => e.status !== 'planned').length,
  eggsPlanned: eggs.filter((e) => e.status === 'planned').length,
  guides: guides.filter((g) => g.status !== 'planned').length,
  guidesPlanned: guides.filter((g) => g.status === 'planned').length,
  chars: characters.length,
  verifiedChars: characters.filter((c) => !c.needs_review).length
};

// HOME
const heroLaunched = meta.phase === 'launched';
put('index.html', layout({
  title: '',
  desc: meta.tagline + '. Personaggi, luoghi, easter egg e guide, aggiornati in automatico.',
  body: `
<section class="hero" id="hero" data-phase="${meta.phase}">
  <div class="hero__sky" aria-hidden="true">
    <div class="sun"></div>
    <svg class="palms" viewBox="0 0 1440 360" preserveAspectRatio="xMidYMax slice"><g fill="#0e0620">
      <path d="M0 360V250c40-6 70 6 110 0l22-120c-30 4-60-6-80-30 30 6 56 2 78-14-14-18-40-28-70-30 38-6 64 4 80 22 6-26 24-46 56-54-12 18-14 36-8 56 22-14 48-18 78-10-28 8-48 22-58 42 22 4 40 16 52 36-24-10-46-12-66-6l-22 130c40 2 78-8 110 6V360z"/>
      <path d="M1440 360V230c-38 2-66 12-108 4l-20-130c28 6 58-2 78-26-28 4-52-2-72-18 12-16 36-24 64-24-34-8-60 2-76 20-4-24-22-42-52-48 10 16 12 34 6 52-20-12-44-14-70-6 26 6 44 18 54 36-20 2-38 12-50 30 22-8 42-8 62-2l24 140c-36 0-72-6-102 6V360z"/>
      <path d="M380 360v-60l36-4v-40l30 2v-30l26 2v-26l26 4v-40l34 2v-34l38 2v-28l32 2v110l30 2v30l40 2v60z" opacity=".92"/>
      <path d="M980 360v-90l28-2v-50l36 2v-34l40 2v-48l30 4v-32l34 2v60l28 2v74l36 2v112z" opacity=".92"/>
    </g></svg>
    <div class="grid-floor"></div>
  </div>
  <div class="hero__inner">
    <p class="eyebrow eyebrow--hero"><span class="live"></span><span id="hero-kicker">${heroLaunched ? 'È uscito. Benvenuti a Leonida.' : 'Uscita: 19 novembre 2026'}</span></p>
    <h1 class="hero__title">Tutto su<br><span class="grad">Leonida.</span></h1>
    <p class="hero__lead">La wiki italiana di GTA VI che si aggiorna da sola: personaggi, luoghi, easter egg e guide, con la fonte di ogni informazione.</p>
    <div class="countdown" id="countdown" aria-live="off" ${heroLaunched ? 'hidden' : ''}>
      <div><b id="cd-d">--</b><span>giorni</span></div>
      <div><b id="cd-h">--</b><span>ore</span></div>
      <div><b id="cd-m">--</b><span>minuti</span></div>
      <div><b id="cd-s">--</b><span>secondi</span></div>
    </div>
    <p class="hero__note">${esc(meta.release.note)}</p>
    <div class="hero__cta">
      <a class="btn btn--primary" href="${href('personaggi/')}">Incontra i personaggi</a>
      <button class="btn btn--ghost" type="button" data-open-search>Cerca nella wiki <kbd>/</kbd></button>
    </div>
  </div>
</section>

<section class="ticker" aria-label="Ultime novità">
  <div class="ticker__track">
    ${[...news.slice(0, 5), ...news.slice(0, 5)].map((n, i) => `<a href="${href('novita/')}" ${i >= 5 ? 'aria-hidden="true" tabindex="-1"' : ''}><time datetime="${n.date}">${fmtDate(n.date)}</time> ${esc(n.title)}</a>`).join('<span class="ticker__sep" aria-hidden="true">✦</span>')}
  </div>
</section>

<section class="block">
  <div class="block__head">
    <p class="eyebrow">01 · Cast</p>
    <h2 class="h2">I personaggi</h2>
    <p class="block__lead">Due protagonisti giocabili e il giro di volti che li circonda. Le schede si completano dopo il lancio.</p>
  </div>
  <div class="char-grid">${characters.map(charCard).join('')}</div>
  <p class="block__more"><a class="link" href="${href('personaggi/')}">Tutti i personaggi →</a></p>
</section>

<section class="block block--paper">
  <div class="block__head">
    <p class="eyebrow eyebrow--dark">02 · Mappa</p>
    <h2 class="h2">I luoghi di Leonida</h2>
  </div>
  <ol class="loc-list">
    ${locations.map((l, i) => `<li><a href="${href(`luoghi/${l.slug}/`)}"><span class="loc-list__n">${String(i + 1).padStart(2, '0')}</span><span class="loc-list__name">${esc(l.name)}</span><span class="loc-list__kind">${esc(l.kind)}</span><span class="loc-list__tag">${esc(l.tagline)}</span></a></li>`).join('')}
  </ol>
</section>

<section class="block">
  <div class="block__head">
    <p class="eyebrow">03 · Segreti e tutorial</p>
    <h2 class="h2">Pronti al lancio</h2>
    <p class="block__lead">Easter egg e guide vengono pubblicati solo quando sono verificati. Prima del lancio mostriamo cosa sta arrivando.</p>
  </div>
  <div class="progress-row">
    <a class="progress" href="${href('easter-egg/')}">
      <span class="progress__label">Easter egg</span>
      <span class="progress__num">${counts.eggs}<small> pubblicati</small></span>
      <span class="progress__bar"><i style="width:${Math.round((counts.eggs / Math.max(1, counts.eggs + counts.eggsPlanned)) * 100)}%"></i></span>
    </a>
    <a class="progress" href="${href('guide/')}">
      <span class="progress__label">Guide</span>
      <span class="progress__num">${counts.guides}<small> pubblicate · ${counts.guidesPlanned} in arrivo</small></span>
      <span class="progress__bar"><i style="width:${Math.round((counts.guides / Math.max(1, counts.guides + counts.guidesPlanned)) * 100)}%"></i></span>
    </a>
    <a class="progress" href="${href('personaggi/')}">
      <span class="progress__label">Schede verificate</span>
      <span class="progress__num">${counts.verifiedChars}<small> su ${counts.chars} personaggi</small></span>
      <span class="progress__bar"><i style="width:${Math.round((counts.verifiedChars / Math.max(1, counts.chars)) * 100)}%"></i></span>
    </a>
  </div>
</section>

<section class="block block--split">
  <div>
    <p class="eyebrow">04 · Come funziona</p>
    <h2 class="h2">Una wiki che si scrive da sola</h2>
    <ol class="steps">
      <li><b>Monitora.</b> Ogni ora un agente controlla Rockstar Newswire, la stampa di settore e le scoperte della community.</li>
      <li><b>Scrive e cita.</b> Redige schede originali in italiano. Niente fonte, niente pubblicazione.</li>
      <li><b>Valida e pubblica.</b> Un controllo automatico blocca schede incomplete; poi il sito si ricostruisce da solo.</li>
    </ol>
  </div>
  <div class="changelog">
    <p class="eyebrow">Ultimi aggiornamenti</p>
    <ul>${meta.changelog.slice(0, 5).map((c) => `<li><time datetime="${c.date}">${fmtDate(c.date)}</time><span>${esc(c.text)}</span></li>`).join('')}</ul>
  </div>
</section>`
}));

// PERSONAGGI
put('personaggi/index.html', layout({
  title: 'Personaggi', section: 'personaggi', desc: 'Tutti i personaggi di GTA VI: protagonisti e comprimari.',
  body: `<header class="page-head"><p class="eyebrow">Cast</p><h1 class="h1">Personaggi</h1><p class="page-head__lead">Protagonisti giocabili e volti ricorrenti. Le illustrazioni sono stilizzate e non sono materiale ufficiale.</p></header>
  <div class="char-grid char-grid--page">${characters.map(charCard).join('')}</div>`
}));
for (const c of characters) {
  const locs = c.locations.map((s) => locBySlug[s]).filter(Boolean);
  const rel = c.related.map((s) => charBySlug[s]).filter(Boolean);
  put(`personaggi/${c.slug}/index.html`, layout({
    title: c.name, section: 'personaggi', desc: c.tagline + ' ' + c.summary,
    body: `<article class="profile" style="--c:${c.color};--a:${c.accent}">
    <div class="profile__art">${portrait(c, 'big')}<p class="art-note">Illustrazione stilizzata dei fan.</p></div>
    <div class="profile__main">
      <nav class="crumbs" aria-label="Percorso"><a href="${href('personaggi/')}">Personaggi</a> / <span>${esc(c.name)}</span></nav>
      <p class="eyebrow">${esc(c.role)}${c.playable ? ' · giocabile' : ''} ${badge(c.status)}</p>
      <h1 class="h1">${esc(c.name)}</h1>
      <p class="profile__tag">${esc(c.tagline)}</p>
      ${spoilerWrap(c, `<p class="prose-lead">${esc(c.summary)}</p><h2 class="h3">Cosa sappiamo</h2><ul class="facts">${c.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`)}
      ${reviewNote(c)}
      ${locs.length ? `<h2 class="h3">Luoghi collegati</h2><p class="chips">${locs.map((l) => `<a class="chip" href="${href(`luoghi/${l.slug}/`)}">${esc(l.name)}</a>`).join('')}</p>` : ''}
      ${rel.length ? `<h2 class="h3">Personaggi correlati</h2><p class="chips">${rel.map((r) => `<a class="chip" href="${href(`personaggi/${r.slug}/`)}">${esc(r.name)}</a>`).join('')}</p>` : ''}
      ${sources(c.sources)}
      <p class="updated">Aggiornato il <time datetime="${c.updated}">${fmtDate(c.updated)}</time></p>
    </div></article>`
  }));
}

// LUOGHI
put('luoghi/index.html', layout({
  title: 'Luoghi', section: 'luoghi', desc: 'Le regioni, le città e i luoghi di Leonida in GTA VI.',
  body: `<header class="page-head"><p class="eyebrow">Mappa</p><h1 class="h1">Luoghi di Leonida</h1><p class="page-head__lead">Dalle spiagge di Vice City alle paludi di Grassrivers.</p></header>
  <div class="loc-cards">${locations.map((l, i) => `<a class="loc-card" href="${href(`luoghi/${l.slug}/`)}"><span class="loc-card__n">${String(i + 1).padStart(2, '0')}</span><span class="loc-card__kind">${esc(l.kind)}</span><span class="loc-card__name">${esc(l.name)}</span><span class="loc-card__tag">${esc(l.tagline)}</span></a>`).join('')}</div>`
}));
for (const l of locations) {
  const who = characters.filter((c) => c.locations.includes(l.slug));
  put(`luoghi/${l.slug}/index.html`, layout({
    title: l.name, section: 'luoghi', desc: l.tagline + ' ' + l.summary,
    body: `<article class="article">
    <nav class="crumbs" aria-label="Percorso"><a href="${href('luoghi/')}">Luoghi</a> / <span>${esc(l.name)}</span></nav>
    <p class="eyebrow">${esc(l.kind)} ${badge(l.status)}</p>
    <h1 class="h1">${esc(l.name)}</h1>
    <p class="profile__tag">${esc(l.tagline)}</p>
    ${spoilerWrap(l, `<p class="prose-lead">${esc(l.summary)}</p><h2 class="h3">Cosa sappiamo</h2><ul class="facts">${l.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`)}
    ${reviewNote(l)}
    ${who.length ? `<h2 class="h3">Personaggi legati a questo luogo</h2><p class="chips">${who.map((c) => `<a class="chip" href="${href(`personaggi/${c.slug}/`)}">${esc(c.name)}</a>`).join('')}</p>` : ''}
    ${sources(l.sources)}
    <p class="updated">Aggiornato il <time datetime="${l.updated}">${fmtDate(l.updated)}</time></p></article>`
  }));
}

// EASTER EGG
const eggCats = [...new Set(eggs.map((e) => e.category))];
put('easter-egg/index.html', layout({
  title: 'Easter egg', section: 'easter-egg', desc: 'Easter egg, segreti e teorie di GTA VI, ciascuno con fonte e stato di verifica.',
  body: `<header class="page-head"><p class="eyebrow">Segreti</p><h1 class="h1">Easter egg</h1><p class="page-head__lead">Ogni voce dice se è confermata o solo una teoria. Gli spoiler sono sfocati finché non li attivi.</p></header>
  <div class="filters" data-filters role="group" aria-label="Filtri">
    <button type="button" class="chip is-on" data-filter="all">Tutti</button>
    ${Object.entries(STATUS).filter(([k]) => eggs.some((e) => e.status === k)).map(([k, v]) => `<button type="button" class="chip" data-filter="${k}">${v[0]}</button>`).join('')}
  </div>
  <div class="entry-list" data-list>${eggs.map((e) => `<article class="entry" data-status="${e.status}">
    <a class="entry__link" href="${href(`easter-egg/${e.slug}/`)}">
      <p class="eyebrow">${esc(e.category)} ${badge(e.status)}${e.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p>
      <h2 class="entry__title">${esc(e.title)}</h2>
      ${spoilerWrap(e, `<p>${esc(e.summary)}</p>`)}
    </a></article>`).join('')}</div>`
}));
for (const e of eggs) {
  put(`easter-egg/${e.slug}/index.html`, layout({
    title: e.title, section: 'easter-egg', desc: e.summary,
    body: `<article class="article">
    <nav class="crumbs" aria-label="Percorso"><a href="${href('easter-egg/')}">Easter egg</a> / <span>${esc(e.title)}</span></nav>
    <p class="eyebrow">${esc(e.category)} ${badge(e.status)}${e.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p>
    <h1 class="h1">${esc(e.title)}</h1>
    ${spoilerWrap(e, `<p class="prose-lead">${esc(e.summary)}</p>${e.where ? `<dl class="dl"><div><dt>Dove</dt><dd>${esc(e.where)}</dd></div><div><dt>Come</dt><dd>${esc(e.how)}</dd></div></dl>` : ''}`)}
    ${reviewNote(e)}
    ${sources(e.sources)}
    <p class="updated">Aggiornato il <time datetime="${e.updated}">${fmtDate(e.updated)}</time></p></article>`
  }));
}

// GUIDE
put('guide/index.html', layout({
  title: 'Guide', section: 'guide', desc: 'Guide e tutorial di GTA VI: comandi, soldi, rapine, collezionabili e trofei.',
  body: `<header class="page-head"><p class="eyebrow">Tutorial</p><h1 class="h1">Guide</h1><p class="page-head__lead">Le guide vengono scritte e verificate a partire dal lancio. Quelle già pronte sono in evidenza.</p></header>
  <div class="entry-list entry-list--grid">${guides.map((g) => g.status === 'planned'
    ? `<article class="entry entry--planned"><p class="eyebrow">${esc(g.category)} ${badge('planned')}</p><h2 class="entry__title">${esc(g.title)}</h2><p>${esc(g.summary)}</p></article>`
    : `<article class="entry"><a class="entry__link" href="${href(`guide/${g.slug}/`)}"><p class="eyebrow">${esc(g.category)} ${badge(g.status)}${g.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p><h2 class="entry__title">${esc(g.title)}</h2><p>${esc(g.summary)}</p></a></article>`).join('')}</div>`
}));
for (const g of guides.filter((x) => x.status !== 'planned')) {
  put(`guide/${g.slug}/index.html`, layout({
    title: g.title, section: 'guide', desc: g.summary,
    body: `<article class="article prose">
    <nav class="crumbs" aria-label="Percorso"><a href="${href('guide/')}">Guide</a> / <span>${esc(g.title)}</span></nav>
    <p class="eyebrow">${esc(g.category)} ${badge(g.status)}${g.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p>
    <h1 class="h1">${esc(g.title)}</h1>
    ${spoilerWrap(g, markdown(g.body))}
    ${reviewNote(g)}
    ${sources(g.sources)}
    <p class="updated">Aggiornato il <time datetime="${g.updated}">${fmtDate(g.updated)}</time></p></article>`
  }));
}

// NOVITÀ
const byYear = news.reduce((m, n) => ((m[n.date.slice(0, 4)] ||= []).push(n), m), {});
put('novita/index.html', layout({
  title: 'Novità', section: 'novita', desc: 'Cronologia di GTA VI: trailer, rinvii e annunci.',
  body: `<header class="page-head"><p class="eyebrow">Cronologia</p><h1 class="h1">Novità</h1><p class="page-head__lead">Trailer, rinvii e annunci, dal più recente.</p></header>
  <div class="timeline">${Object.keys(byYear).sort().reverse().map((y) => `<section><h2 class="timeline__year">${y}</h2>${byYear[y].map((n) => `<article class="tl-item"><time datetime="${n.date}">${fmtDate(n.date)}</time><div><h3>${esc(n.title)} ${badge(n.status)}</h3><p>${esc(n.body)}</p>${(n.sources || []).map((s) => `<a class="link link--small" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join(' ')}</div></article>`).join('')}</section>`).join('')}</div>`
}));

// 404
put('404.html', layout({
  title: 'Pagina non trovata',
  body: `<header class="page-head"><p class="eyebrow">Errore 404</p><h1 class="h1">Wasted.</h1><p class="page-head__lead">Questa pagina non esiste (ancora). Torna alla <a class="link" href="${href()}">home</a> o usa la ricerca.</p></header>`
}));

/* ---------- Indice di ricerca, sitemap, favicon ---------- */
const index = [
  ...characters.map((c) => ({ t: c.name, k: 'Personaggio', u: `personaggi/${c.slug}/`, s: `${c.role}. ${c.tagline} ${c.summary}`, sp: c.spoiler })),
  ...locations.map((l) => ({ t: l.name, k: 'Luogo', u: `luoghi/${l.slug}/`, s: `${l.kind}. ${l.tagline} ${l.summary}`, sp: l.spoiler })),
  ...eggs.map((e) => ({ t: e.title, k: 'Easter egg', u: `easter-egg/${e.slug}/`, s: e.summary, sp: e.spoiler })),
  ...guides.filter((g) => g.status !== 'planned').map((g) => ({ t: g.title, k: 'Guida', u: `guide/${g.slug}/`, s: g.summary, sp: g.spoiler })),
  ...news.map((n) => ({ t: n.title, k: 'Novità', u: 'novita/', s: n.body, sp: false }))
];

fs.rmSync(OUT, { recursive: true, force: true });
for (const [rel, html] of pages) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}
fs.copyFileSync(path.join(ROOT, 'src', 'style.css'), path.join(OUT, 'style.css'));
fs.copyFileSync(path.join(ROOT, 'src', 'app.js'), path.join(OUT, 'app.js'));
fs.copyFileSync(path.join(ROOT, 'src', 'favicon.svg'), path.join(OUT, 'favicon.svg'));
if (fs.existsSync(path.join(ROOT, 'assets'))) fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'search-index.json'), JSON.stringify(index));
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n${meta.siteUrl ? `Sitemap: ${meta.siteUrl.replace(/\/$/, '')}${BASE}sitemap.xml\n` : ''}`);
if (meta.siteUrl) {
  const site = meta.siteUrl.replace(/\/$/, '');
  const urls = [...pages.keys()].filter((k) => k !== '404.html').map((k) => `${site}${BASE}${k.replace(/index\.html$/, '')}`);
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u}</loc><lastmod>${meta.lastUpdate}</lastmod></url>`).join('\n')}\n</urlset>\n`);
}
console.log(`✓ Build completata: ${pages.size} pagine in dist/ (base "${BASE}")`);
