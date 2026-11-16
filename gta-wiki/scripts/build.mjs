// Generatore statico: legge content/*.json e produce dist/ (zero dipendenze).
import fs from 'node:fs';
import path from 'node:path';
import { SECTIONS } from './lib/sections.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

const meta = read('meta.json');
const characters = read('characters.json');
const locations = read('locations.json');
const eggs = read('easter-eggs.json');
const guides = read('guides.json');
const topics = read('topics.json');
const faq = read('faq.json');
const news = read('news.json').sort((a, b) => b.date.localeCompare(a.date));

const BASE = ('/' + (process.env.WIKI_BASE || '/').replace(/^\/+|\/+$/g, '') + '/').replace(/^\/\/$/, '/');
const SITE = (process.env.WIKI_SITE_URL || meta.siteUrl || '').replace(/\/+$/, '');
const abs = (rel = '') => (SITE ? SITE + BASE + rel : '');
const href = (p = '') => BASE + p;

const STATUS = {
  confirmed: ['Confermato', 'ok'],
  unverified: ['Non verificato', 'warn'],
  rumor: ['Teoria', 'rumor'],
  planned: ['In arrivo', 'plan'],
  debunked: ['Smentito', 'bad']
};

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const trunc = (s, n = 155) => { s = String(s).replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const cut = s.slice(0, n - 1); return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:]$/, '') + '…'; };
const bySlug = (arr) => Object.fromEntries(arr.map((x) => [x.slug, x]));
const locBySlug = bySlug(locations);
const charBySlug = bySlug(characters);
const sectionBy = bySlug(SECTIONS);
const ldJson = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

/* ---------- Foto ufficiali: auto-rilevate in assets/img/characters/<slug>.<ext> ---------- */
const IMG_EXT = ['avif', 'webp', 'jpg', 'jpeg', 'png'];
const findImg = (dirRel, slug) => {
  for (const e of IMG_EXT) if (fs.existsSync(path.join(ROOT, 'assets', 'img', dirRel, `${slug}.${e}`))) return `assets/img/${dirRel}/${slug}.${e}`;
  return null;
};
const CREDIT = meta.imageCredit || '© Rockstar Games';
for (const c of characters) c.photo = findImg('characters', c.slug);
const heroImg = ['avif', 'webp', 'jpg', 'jpeg', 'png'].map((e) => `assets/img/hero.${e}`).find((p) => fs.existsSync(path.join(ROOT, p)));

/* ---------- Markdown minimale (per le guide) ---------- */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer nofollow" target="_blank">$1</a>')
    .replace(/\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g, '<a href="$2">$1</a>');
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

/* ---------- Locandina dei personaggi: foto ufficiale se presente, altrimenti poster tipografico ---------- */
const fit = (txt, max, len) => Math.min(max, Math.floor(len / (Math.max(1, txt.length) * 0.6))); // adatta il corpo del testo alla lunghezza disponibile
function poster(c) {
  const id = 'p' + c.slug.replace(/[^a-z0-9]/g, '');
  const [first, ...rest] = c.name.replace('&', '+').split(' ');
  const last = rest.join(' ');
  return `<svg class="poster" viewBox="0 0 400 500" role="img" aria-label="Locandina tipografica di ${esc(c.name)}: foto in arrivo" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.color}"/><stop offset="1" stop-color="#170a33"/></linearGradient>
    <pattern id="${id}d" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="6" cy="6" r="2" fill="#0e0620" opacity=".3"/></pattern>
  </defs>
  <rect width="400" height="500" fill="url(#${id}g)"/>
  <rect width="400" height="500" fill="url(#${id}d)"/>
  <circle cx="290" cy="150" r="92" fill="${c.accent}" opacity=".92"/>
  <g fill="#0e0620" opacity=".9"><rect x="198" y="136" width="200" height="7"/><rect x="198" y="152" width="200" height="9"/><rect x="198" y="170" width="200" height="11"/><rect x="198" y="190" width="200" height="13"/></g>
  <text transform="translate(120 388) rotate(-90)" class="poster__first" font-size="${fit(first, 104, 330)}" fill="#fff4e3">${esc(first.toUpperCase())}</text>
  ${last ? `<text transform="translate(200 388) rotate(-90)" class="poster__last" font-size="${fit(last, 64, 300)}" fill="none" stroke="${c.accent}" stroke-width="2">${esc(last.toUpperCase())}</text>` : ''}
  <text x="380" y="34" text-anchor="end" class="poster__tag" fill="#fff4e3">FOTO IN ARRIVO</text>
</svg>`;
}
const charArt = (c, eager = false) =>
  c.photo
    ? `<img class="photo" src="${href(c.photo)}" alt="${esc(c.name)}, ritratto ufficiale" width="800" height="1000" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : poster(c);

/* ---------- Componenti ---------- */
const badge = (status) => `<span class="badge badge--${STATUS[status][1]}">${STATUS[status][0]}</span>`;
const reviewNote = (e) => (e.needs_review ? '<p class="review-note"><span aria-hidden="true">◐</span> Scheda in attesa di verifica con il gioco finale: i dettagli possono cambiare.</p>' : '');
const sources = (list) =>
  list && list.length
    ? `<aside class="sources" aria-labelledby="src-h"><h2 class="eyebrow" id="src-h">Fonti</h2><ul>${list.map((s) => `<li><a href="${esc(s.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(s.label)}</a></li>`).join('')}</ul></aside>`
    : '';
const spoilerWrap = (e, inner) => (e.spoiler ? `<div class="spoiler" data-spoiler tabindex="0" role="button" aria-label="Contenuto con spoiler: premi per mostrare">${inner}</div>` : inner);
const updated = (d) => `<p class="updated">Aggiornato il <time datetime="${d}">${fmtDate(d)}</time></p>`;
const pct5 = (n, d) => Math.round((n / Math.max(1, d)) * 20) * 5;
const crumbsHtml = (items) => `<nav class="crumbs" aria-label="Percorso">${items.map(([n, p], i) => (i < items.length - 1 ? `<a href="${href(p)}">${esc(n)}</a> / ` : `<span aria-current="page">${esc(n)}</span>`)).join('')}</nav>`;
const pager = (arr, i, base, label) => {
  const prev = arr[i - 1], next = arr[i + 1];
  if (!prev && !next) return '';
  return `<nav class="pager" aria-label="${label}">${prev ? `<a class="pager__a" href="${href(`${base}${prev.slug}/`)}" rel="prev"><small>← Precedente</small>${esc(prev.name || prev.title)}</a>` : '<span></span>'}${next ? `<a class="pager__a pager__a--next" href="${href(`${base}${next.slug}/`)}" rel="next"><small>Successivo →</small>${esc(next.name || next.title)}</a>` : ''}</nav>`;
};

function charCard(c, i) {
  return `<a class="char-card ch-${c.slug}" href="${href(`personaggi/${c.slug}/`)}">
    <span class="char-card__no">${String(i + 1).padStart(2, '0')}</span>
    <span class="char-card__art">${charArt(c)}</span>
    <span class="char-card__body">
      <span class="char-card__role">${esc(c.role)}${c.playable ? ' · giocabile' : ''}</span>
      <span class="char-card__name">${esc(c.name)}</span>
    </span>
  </a>`;
}

/* ---------- Layout con SEO, CSP e dati strutturati ---------- */
const NAV = [['personaggi', 'Personaggi'], ['luoghi', 'Luoghi'], ['wiki', 'Wiki'], ['easter-egg', 'Easter egg'], ['guide', 'Guide'], ['novita', 'Novità']];
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";
const HOME_TITLE = 'Wiki italiana di GTA VI: personaggi, luoghi, easter egg e guide';

function layout({ title, desc, path: p = '', body, section = '', crumbs = [], schema = [], type = 'website', image, noindex = false }) {
  let full = title ? `${title} · ${meta.siteName}` : HOME_TITLE;
  if (title && full.length > 62) full = title.length <= 62 ? title : trunc(title, 62); // titoli SEO entro ~60 caratteri
  const d = trunc(desc || meta.tagline);
  const url = abs(p);
  const ogImg = image || (SITE ? abs('og.png') : '');
  const ldCrumbs = crumbs.length
    ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map(([n, cp], i) => ({ '@type': 'ListItem', position: i + 1, name: n, ...(SITE ? { item: abs(cp) } : {}) })) }]
    : [];
  return `<!doctype html>
<html lang="it" data-base="${esc(BASE)}" data-release="${esc(meta.release.iso)}" data-phase="${esc(meta.phase)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(full)}</title>
<meta name="description" content="${esc(d)}">
<meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'}">
<meta name="author" content="${esc(meta.siteName)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0e0620">
${url && !noindex ? `<link rel="canonical" href="${esc(url)}">` : ''}
<meta property="og:site_name" content="${esc(meta.siteName)}">
<meta property="og:locale" content="it_IT">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(d)}">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
${ogImg ? `<meta property="og:image" content="${esc(ogImg)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(meta.siteName)} – ${esc(meta.tagline)}">` : ''}
<meta name="twitter:card" content="${ogImg ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(full)}">
<meta name="twitter:description" content="${esc(d)}">
${ogImg ? `<meta name="twitter:image" content="${esc(ogImg)}">` : ''}
<link rel="icon" href="${href('favicon.svg')}" type="image/svg+xml">
<link rel="icon" href="${href('icon-192.png')}" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${href('icon-180.png')}">
<link rel="manifest" href="${href('manifest.webmanifest')}">
<link rel="alternate" type="application/atom+xml" title="${esc(meta.siteName)} – Novità" href="${href('feed.xml')}">
<link rel="preload" href="${href('fonts/big-shoulders-display-latin-900-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${href('fonts/instrument-sans-latin-400-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${href('style.css')}">
<link rel="stylesheet" href="${href('theme.css')}">
<script src="${href('app.js')}" defer></script>
${[...schema, ...ldCrumbs].map(ldJson).join('\n')}
</head>
<body class="${section ? 'sec-' + section : ''}">
<a class="skip" href="#main">Vai al contenuto</a>
<header class="top">
  <a class="brand" href="${href()}" aria-label="${esc(meta.siteName)} – home">
    <span class="brand__vi">VI</span><span class="brand__name">${esc(meta.siteName)}</span>
  </a>
  <nav class="nav" aria-label="Principale">
    ${NAV.map(([s, l]) => `<a href="${href(s + '/')}"${section === s ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
  </nav>
  <div class="top__tools">
    <button class="tool" id="spoiler-toggle" type="button" aria-pressed="false" title="Mostra o nascondi gli spoiler"><span class="tool__dot"></span>Spoiler</button>
    <button class="tool tool--search" id="search-open" type="button" aria-label="Cerca nella wiki"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Cerca</span><kbd>/</kbd></button>
  </div>
</header>
<dialog id="search" aria-label="Cerca nella wiki">
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
      <p class="foot__small">Wiki non ufficiale fatta dai fan. Non affiliata a Rockstar Games o Take-Two Interactive. Grand Theft Auto e GTA VI sono marchi dei rispettivi proprietari. Le immagini ufficiali, se presenti, sono ${esc(CREDIT)}.</p>
    </div>
    <nav aria-label="Sezioni">
      <p class="eyebrow">Esplora</p>
      <ul class="foot__links">${NAV.map(([s, l]) => `<li><a href="${href(s + '/')}">${l}</a></li>`).join('')}<li><a href="${href('faq/')}">FAQ</a></li></ul>
    </nav>
    <nav aria-label="Informazioni">
      <p class="eyebrow">Il progetto</p>
      <ul class="foot__links"><li><a href="${href('informazioni/')}">Informazioni e metodo</a></li><li><a href="${href('informazioni/#privacy')}">Privacy</a></li><li><a href="${href('feed.xml')}">Feed Atom</a></li><li><a href="${href('cerca/')}">Cerca</a></li></ul>
      <p class="foot__small">Aggiornato il <time datetime="${meta.lastUpdate}">${fmtDate(meta.lastUpdate)}</time></p>
    </nav>
  </div>
</footer>
</body>
</html>`;
}

/* ---------- Pagine ---------- */
const pages = new Map();
const urls = []; // per la sitemap
const put = (rel, html, opts = {}) => {
  pages.set(rel, html);
  if (!opts.skipSitemap) urls.push({ rel: rel.replace(/index\.html$/, ''), lastmod: opts.lastmod || meta.lastUpdate, prio: opts.prio });
};

const counts = {
  eggs: eggs.filter((e) => e.status !== 'planned').length,
  eggsPlanned: eggs.filter((e) => e.status === 'planned').length,
  guides: guides.filter((g) => g.status !== 'planned').length,
  guidesPlanned: guides.filter((g) => g.status === 'planned').length,
  chars: characters.length,
  verifiedChars: characters.filter((c) => !c.needs_review).length,
  topics: topics.filter((t) => t.status !== 'planned').length,
  topicsPlanned: topics.filter((t) => t.status === 'planned').length
};
const heroLaunched = meta.phase === 'launched';

const videoGameLd = {
  '@context': 'https://schema.org', '@type': 'VideoGame', name: 'Grand Theft Auto VI',
  genre: ['Azione', 'Avventura'], gamePlatform: ['PlayStation 5', 'Xbox Series X|S'],
  datePublished: meta.release.iso.slice(0, 10), inLanguage: 'it',
  publisher: { '@type': 'Organization', name: 'Rockstar Games' },
  description: 'Jason e Lucia a Vice City e nello stato di Leonida: personaggi, luoghi e guide in questa wiki non ufficiale.'
};
const websiteLd = {
  '@context': 'https://schema.org', '@type': 'WebSite', name: meta.siteName, alternateName: 'Leonida Files – Wiki GTA VI', inLanguage: 'it', description: meta.tagline,
  ...(SITE ? { url: abs(), potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: abs('cerca/') + '?q={search_term_string}' }, 'query-input': 'required name=search_term_string' } } : {})
};

// HOME
put('index.html', layout({
  title: '', path: '', prio: 1,
  desc: 'La wiki italiana di GTA VI: personaggi, luoghi, easter egg, veicoli, armi e guide. Ogni scheda ha le fonti e si aggiorna in automatico dopo il lancio.',
  schema: [websiteLd, videoGameLd],
  image: SITE ? abs('og.png') : '',
  body: `
<section class="hero${heroImg ? ' hero--photo' : ''}" id="hero" data-phase="${meta.phase}">
  <div class="hero__sky" aria-hidden="true">
    ${heroImg ? `<img class="hero__photo" src="${href(heroImg)}" alt="" width="1920" height="1080" fetchpriority="high" decoding="async">` : '<div class="sun"></div><div class="vi-big">VI</div>'}
    <svg class="palms" viewBox="0 0 1440 360" preserveAspectRatio="xMidYMax slice"><g fill="#0e0620">
      <path d="M0 360V250c40-6 70 6 110 0l22-120c-30 4-60-6-80-30 30 6 56 2 78-14-14-18-40-28-70-30 38-6 64 4 80 22 6-26 24-46 56-54-12 18-14 36-8 56 22-14 48-18 78-10-28 8-48 22-58 42 22 4 40 16 52 36-24-10-46-12-66-6l-22 130c40 2 78-8 110 6V360z"/>
      <path d="M1440 360V230c-38 2-66 12-108 4l-20-130c28 6 58-2 78-26-28 4-52-2-72-18 12-16 36-24 64-24-34-8-60 2-76 20-4-24-22-42-52-48 10 16 12 34 6 52-20-12-44-14-70-6 26 6 44 18 54 36-20 2-38 12-50 30 22-8 42-8 62-2l24 140c-36 0-72-6-102 6V360z"/>
      <path d="M380 360v-60l36-4v-40l30 2v-30l26 2v-26l26 4v-40l34 2v-34l38 2v-28l32 2v110l30 2v30l40 2v60z" opacity=".92"/>
      <path d="M980 360v-90l28-2v-50l36 2v-34l40 2v-48l30 4v-32l34 2v60l28 2v74l36 2v112z" opacity=".92"/>
    </g></svg>
    <div class="grid-floor"></div>
  </div>
  <div class="hero__inner">
    <p class="eyebrow eyebrow--hero rise" data-d="0"><span class="live"></span><span id="hero-kicker">${heroLaunched ? 'È uscito. Benvenuti a Leonida.' : 'Uscita: 19 novembre 2026'}</span></p>
    <h1 class="hero__title"><span class="rise" data-d="1">Tutto su</span><br><span class="grad rise" data-d="2">Leonida.</span></h1>
    <p class="hero__lead rise" data-d="3">La wiki italiana di GTA VI che si aggiorna da sola: personaggi, luoghi, easter egg e guide, con la fonte di ogni informazione.</p>
    <div class="countdown rise" data-d="4" id="countdown" ${heroLaunched ? 'hidden' : ''}>
      <div><b id="cd-d">--</b><span>giorni</span></div>
      <div><b id="cd-h">--</b><span>ore</span></div>
      <div><b id="cd-m">--</b><span>minuti</span></div>
      <div><b id="cd-s">--</b><span>secondi</span></div>
    </div>
    <p class="hero__note rise" data-d="4">${esc(meta.release.note)}</p>
    <div class="hero__cta rise" data-d="5">
      <a class="btn btn--primary" href="${href('personaggi/')}">Incontra i personaggi</a>
      <button class="btn btn--ghost" type="button" data-open-search>Cerca nella wiki <kbd>/</kbd></button>
    </div>
  </div>
  <div class="sticker" aria-hidden="true"><b>19</b><span>nov<br>2026</span></div>
</section>

<section class="ticker" aria-label="Ultime novità">
  <div class="ticker__track">
    ${[...news.slice(0, 5), ...news.slice(0, 5)].map((n, i) => `<a href="${href('novita/')}" ${i >= 5 ? 'aria-hidden="true" tabindex="-1"' : ''}><time datetime="${n.date}">${fmtDate(n.date)}</time> ${esc(n.title)}</a>`).join('<span class="ticker__sep" aria-hidden="true">✦</span>')}
  </div>
</section>

<section class="block quote-block" data-reveal>
  <p class="eyebrow">La storia in breve</p>
  <blockquote class="pull">«Jason e Lucia sanno da sempre che il banco è truccato. Quando un colpo facile va male, finiscono nel lato <em>più oscuro</em> del posto <em>più soleggiato</em> d'America.»</blockquote>
  <p class="pull__src">Dalla descrizione ufficiale di Rockstar Games, traduzione libera. <a class="link" href="${href('wiki/storia/premessa-della-storia/')}">La premessa completa →</a></p>
</section>

<section class="block" data-reveal>
  <div class="block__head">
    <p class="eyebrow">01 · Cast</p>
    <h2 class="h2">I personaggi</h2>
    <p class="block__lead">Due protagonisti giocabili e il giro di volti che li circonda. Le schede si completano dopo il lancio.</p>
  </div>
  <div class="char-grid">${characters.map(charCard).join('')}</div>
  <p class="block__more"><a class="link" href="${href('personaggi/')}">Tutti i personaggi →</a></p>
</section>

<section class="block block--paper" data-reveal>
  <div class="block__head">
    <p class="eyebrow eyebrow--dark">02 · Mappa</p>
    <h2 class="h2">I luoghi di Leonida</h2>
  </div>
  <ol class="loc-list">
    ${locations.map((l, i) => `<li><a href="${href(`luoghi/${l.slug}/`)}"><span class="loc-list__n">${String(i + 1).padStart(2, '0')}</span><span class="loc-list__name">${esc(l.name)}</span><span class="loc-list__kind">${esc(l.kind)}</span><span class="loc-list__tag">${esc(l.tagline)}</span></a></li>`).join('')}
  </ol>
</section>

<section class="block" data-reveal>
  <div class="block__head">
    <p class="eyebrow">03 · Enciclopedia</p>
    <h2 class="h2">Tutto il resto</h2>
    <p class="block__lead">Veicoli, armi, negozi, musica, edizioni. Le voci verificate sono già qui, le altre si aggiungono dal lancio.</p>
  </div>
  <div class="sec-grid">
    ${SECTIONS.map((s, i) => {
      const t = topics.filter((x) => x.section === s.slug);
      const ok = t.filter((x) => x.status !== 'planned').length;
      return `<a class="sec-card" href="${href(`wiki/${s.slug}/`)}"><span class="sec-card__n">${String(i + 1).padStart(2, '0')}</span><span class="sec-card__name">${esc(s.label)}</span><span class="sec-card__meta">${ok} ${ok === 1 ? 'voce' : 'voci'}${t.length - ok ? ` · ${t.length - ok} in arrivo` : ''}</span></a>`;
    }).join('')}
  </div>
</section>

<section class="block" data-reveal>
  <div class="block__head">
    <p class="eyebrow">04 · Segreti e tutorial</p>
    <h2 class="h2">Pronti al lancio</h2>
    <p class="block__lead">Easter egg e guide vengono pubblicati solo quando sono verificati. Prima del lancio mostriamo cosa sta arrivando.</p>
  </div>
  <div class="progress-row">
    <a class="progress" href="${href('easter-egg/')}">
      <span class="progress__label">Easter egg</span>
      <span class="progress__num">${counts.eggs}<small> pubblicati</small></span>
      <span class="progress__bar" aria-hidden="true"><i class="w${pct5(counts.eggs, counts.eggs + counts.eggsPlanned)}"></i></span>
    </a>
    <a class="progress" href="${href('guide/')}">
      <span class="progress__label">Guide</span>
      <span class="progress__num">${counts.guides}<small> pubblicate · ${counts.guidesPlanned} in arrivo</small></span>
      <span class="progress__bar" aria-hidden="true"><i class="w${pct5(counts.guides, counts.guides + counts.guidesPlanned)}"></i></span>
    </a>
    <a class="progress" href="${href('personaggi/')}">
      <span class="progress__label">Schede verificate</span>
      <span class="progress__num">${counts.verifiedChars}<small> su ${counts.chars} personaggi</small></span>
      <span class="progress__bar" aria-hidden="true"><i class="w${pct5(counts.verifiedChars, counts.chars)}"></i></span>
    </a>
  </div>
</section>

<section class="block" data-reveal>
  <div class="block__head"><p class="eyebrow">05 · Cronologia</p><h2 class="h2">Ultime novità</h2></div>
  <div class="news-row">
    ${news.slice(0, 3).map((n) => `<article class="news-card"><time datetime="${n.date}">${fmtDate(n.date)}</time><h3>${esc(n.title)}</h3><p>${esc(trunc(n.body, 130))}</p></article>`).join('')}
  </div>
  <p class="block__more"><a class="link" href="${href('novita/')}">Tutta la cronologia →</a></p>
</section>

<section class="block block--split" data-reveal>
  <div>
    <p class="eyebrow">06 · Come funziona</p>
    <h2 class="h2">Una wiki che si scrive da sola</h2>
    <ol class="steps">
      <li><b>Monitora.</b> Ogni ora un agente controlla Rockstar Newswire, la stampa di settore e le scoperte della community.</li>
      <li><b>Scrive e cita.</b> Redige schede originali in italiano. Niente fonte, niente pubblicazione.</li>
      <li><b>Valida e pubblica.</b> Un controllo automatico blocca schede incomplete; poi il sito si ricostruisce da solo.</li>
    </ol>
    <p class="block__more"><a class="link" href="${href('informazioni/')}">Metodo editoriale e fonti →</a></p>
  </div>
  <div class="changelog">
    <p class="eyebrow">Ultimi aggiornamenti</p>
    <ul>${meta.changelog.slice(0, 5).map((c) => `<li><time datetime="${c.date}">${fmtDate(c.date)}</time><span>${esc(c.text)}</span></li>`).join('')}</ul>
  </div>
</section>

<section class="block" data-reveal>
  <div class="block__head"><p class="eyebrow">07 · Domande frequenti</p><h2 class="h2">Le basi</h2></div>
  <div class="faq">${faq.slice(0, 4).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
  <p class="block__more"><a class="link" href="${href('faq/')}">Tutte le domande →</a></p>
</section>`
}), { prio: 1 });

// PERSONAGGI
put('personaggi/index.html', layout({
  title: 'Personaggi di GTA VI: Lucia, Jason e tutto il cast', section: 'personaggi', path: 'personaggi/',
  desc: 'Tutti i personaggi di GTA VI: Lucia Caminos, Jason Duval, Cal Hampton, Boobie Ike, Dre\'Quan Priest e gli altri volti del cast, con fonti e stato di verifica.',
  crumbs: [['Home', ''], ['Personaggi', 'personaggi/']],
  schema: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Personaggi di GTA VI', inLanguage: 'it', mainEntity: { '@type': 'ItemList', itemListElement: characters.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, ...(SITE ? { url: abs(`personaggi/${c.slug}/`) } : {}) })) } }],
  body: `<header class="page-head"><p class="eyebrow">Cast</p><h1 class="h1">Personaggi</h1><p class="page-head__lead">Protagonisti giocabili e volti ricorrenti.${characters.some((c) => c.photo) ? ` Immagini ufficiali: ${esc(CREDIT)}.` : ' Le foto ufficiali arriveranno con il lancio: per ora vedi le locandine tipografiche.'}</p></header>
  <div class="char-grid char-grid--page">${characters.map(charCard).join('')}</div>`
}), { prio: 0.9 });
characters.forEach((c, i) => {
  const locs = c.locations.map((s) => locBySlug[s]).filter(Boolean);
  const rel = c.related.map((s) => charBySlug[s]).filter(Boolean);
  const p = `personaggi/${c.slug}/`;
  put(`${p}index.html`, layout({
    title: `${c.name}: chi è, ruolo e storia in GTA VI`, section: 'personaggi', path: p, type: 'article',
    desc: `${c.name} in GTA VI: ${c.tagline} ${c.summary}`,
    crumbs: [['Home', ''], ['Personaggi', 'personaggi/'], [c.name, p]],
    schema: [{ '@context': 'https://schema.org', '@type': 'Article', headline: `${c.name} in GTA VI`, description: trunc(c.summary), inLanguage: 'it', dateModified: c.updated, datePublished: c.updated, author: { '@type': 'Organization', name: meta.siteName }, publisher: { '@type': 'Organization', name: meta.siteName }, about: { '@type': 'Thing', name: c.name, description: 'Personaggio di Grand Theft Auto VI' }, ...(c.photo && SITE ? { image: abs(c.photo) } : {}), ...(SITE ? { mainEntityOfPage: abs(p) } : {}) }],
    image: c.photo && SITE ? abs(c.photo) : undefined,
    body: `<article class="profile ch-${c.slug}">
    <div class="profile__art"><figure class="frame">${charArt(c, true)}</figure><p class="art-note">${c.photo ? esc(CREDIT) : 'Locandina tipografica: la foto ufficiale arriverà presto.'}</p></div>
    <div class="profile__main">
      ${crumbsHtml([['Personaggi', 'personaggi/'], [c.name, p]])}
      <p class="eyebrow">${esc(c.role)}${c.playable ? ' · giocabile' : ''} ${badge(c.status)}</p>
      <h1 class="h1">${esc(c.name)}</h1>
      <p class="profile__tag">${esc(c.tagline)}</p>
      ${spoilerWrap(c, `<p class="prose-lead">${esc(c.summary)}</p><h2 class="h3">Cosa sappiamo</h2><ul class="facts">${c.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`)}
      ${reviewNote(c)}
      ${locs.length ? `<h2 class="h3">Luoghi collegati</h2><p class="chips">${locs.map((l) => `<a class="chip" href="${href(`luoghi/${l.slug}/`)}">${esc(l.name)}</a>`).join('')}</p>` : ''}
      ${rel.length ? `<h2 class="h3">Personaggi correlati</h2><p class="chips">${rel.map((r) => `<a class="chip" href="${href(`personaggi/${r.slug}/`)}">${esc(r.name)}</a>`).join('')}</p>` : ''}
      ${sources(c.sources)}
      ${updated(c.updated)}
      ${pager(characters, i, 'personaggi/', 'Altri personaggi')}
    </div></article>`
  }), { lastmod: c.updated });
});

// LUOGHI
put('luoghi/index.html', layout({
  title: 'Luoghi e mappa di Leonida in GTA VI', section: 'luoghi', path: 'luoghi/',
  desc: 'Vice City, Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia e Mount Kalaga: tutte le regioni e i luoghi di Leonida in GTA VI.',
  crumbs: [['Home', ''], ['Luoghi', 'luoghi/']],
  body: `<header class="page-head"><p class="eyebrow">Mappa</p><h1 class="h1">Luoghi di Leonida</h1><p class="page-head__lead">Dalle spiagge di Vice City alle paludi di Grassrivers.</p></header>
  <div class="loc-cards">${locations.map((l, i) => `<a class="loc-card" href="${href(`luoghi/${l.slug}/`)}"><span class="loc-card__n">${String(i + 1).padStart(2, '0')}</span><span class="loc-card__kind">${esc(l.kind)}</span><span class="loc-card__name">${esc(l.name)}</span><span class="loc-card__tag">${esc(l.tagline)}</span></a>`).join('')}</div>`
}), { prio: 0.9 });
locations.forEach((l, i) => {
  const who = characters.filter((c) => c.locations.includes(l.slug));
  const p = `luoghi/${l.slug}/`;
  put(`${p}index.html`, layout({
    title: `${l.name} in GTA VI: ${l.kind.toLowerCase()} di Leonida`, section: 'luoghi', path: p, type: 'article',
    desc: `${l.name} (${l.kind.toLowerCase()}) in GTA VI: ${l.tagline} ${l.summary}`,
    crumbs: [['Home', ''], ['Luoghi', 'luoghi/'], [l.name, p]],
    schema: [{ '@context': 'https://schema.org', '@type': 'Article', headline: `${l.name} in GTA VI`, description: trunc(l.summary), inLanguage: 'it', dateModified: l.updated, datePublished: l.updated, author: { '@type': 'Organization', name: meta.siteName }, publisher: { '@type': 'Organization', name: meta.siteName }, ...(SITE ? { mainEntityOfPage: abs(p) } : {}) }],
    body: `<article class="article">
    ${crumbsHtml([['Luoghi', 'luoghi/'], [l.name, p]])}
    <p class="eyebrow">${esc(l.kind)} ${badge(l.status)}</p>
    <h1 class="h1">${esc(l.name)}</h1>
    <p class="profile__tag">${esc(l.tagline)}</p>
    ${spoilerWrap(l, `<p class="prose-lead">${esc(l.summary)}</p><h2 class="h3">Cosa sappiamo</h2><ul class="facts">${l.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`)}
    ${reviewNote(l)}
    ${who.length ? `<h2 class="h3">Personaggi legati a questo luogo</h2><p class="chips">${who.map((c) => `<a class="chip" href="${href(`personaggi/${c.slug}/`)}">${esc(c.name)}</a>`).join('')}</p>` : ''}
    ${sources(l.sources)}${updated(l.updated)}${pager(locations, i, 'luoghi/', 'Altri luoghi')}</article>`
  }), { lastmod: l.updated });
});

// WIKI (veicoli, armi, ecc.)
put('wiki/index.html', layout({
  title: 'Wiki di GTA VI: veicoli, armi, negozi, radio ed edizioni', section: 'wiki', path: 'wiki/',
  desc: 'L\'enciclopedia di GTA VI: storia e missioni, veicoli, armi, negozi e attività, radio e musica, edizioni e bonus.',
  crumbs: [['Home', ''], ['Wiki', 'wiki/']],
  body: `<header class="page-head"><p class="eyebrow">Enciclopedia</p><h1 class="h1">Wiki</h1><p class="page-head__lead">Tutto ciò che non è un personaggio o un luogo, in sei sezioni. Le voci «in arrivo» vengono scritte dopo il lancio.</p></header>
  <div class="sec-grid sec-grid--page">${SECTIONS.map((s, i) => { const t = topics.filter((x) => x.section === s.slug); const ok = t.filter((x) => x.status !== 'planned').length; return `<a class="sec-card" href="${href(`wiki/${s.slug}/`)}"><span class="sec-card__n">${String(i + 1).padStart(2, '0')}</span><span class="sec-card__name">${esc(s.label)}</span><span class="sec-card__desc">${esc(s.desc)}</span><span class="sec-card__meta">${ok} ${ok === 1 ? 'voce' : 'voci'}${t.length - ok ? ` · ${t.length - ok} in arrivo` : ''}</span></a>`; }).join('')}</div>`
}), { prio: 0.8 });
for (const s of SECTIONS) {
  const list = topics.filter((t) => t.section === s.slug);
  const p = `wiki/${s.slug}/`;
  put(`${p}index.html`, layout({
    title: `${s.label} in GTA VI`, section: 'wiki', path: p, desc: `${s.desc} Voci con fonti e stato di verifica, aggiornate dopo il lancio di GTA VI.`,
    crumbs: [['Home', ''], ['Wiki', 'wiki/'], [s.label, p]],
    body: `<header class="page-head">${crumbsHtml([['Wiki', 'wiki/'], [s.label, p]])}<p class="eyebrow">Wiki</p><h1 class="h1">${esc(s.label)}</h1><p class="page-head__lead">${esc(s.desc)}</p></header>
    <div class="entry-list entry-list--grid">${list.length ? list.map((t) => t.status === 'planned'
      ? `<article class="entry entry--planned"><p class="eyebrow">${badge('planned')}</p><h2 class="entry__title">${esc(t.title)}</h2><p>${esc(t.summary)}</p></article>`
      : `<article class="entry"><a class="entry__link" href="${href(`${p}${t.slug}/`)}"><p class="eyebrow">${badge(t.status)}${t.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p><h2 class="entry__title">${esc(t.title)}</h2>${spoilerWrap(t, `<p>${esc(t.tagline)}</p>`)}</a></article>`).join('') : '<p class="empty">Nessuna voce ancora: la sezione si popola dopo il lancio.</p>'}</div>`
  }), { prio: 0.7 });
  list.filter((t) => t.status !== 'planned').forEach((t, i, arr) => {
    const tp = `${p}${t.slug}/`;
    put(`${tp}index.html`, layout({
      title: `${t.title}: ${s.label.toLowerCase()} di GTA VI`, section: 'wiki', path: tp, type: 'article',
      desc: `${t.title}: ${t.tagline} ${t.summary}`,
      crumbs: [['Home', ''], ['Wiki', 'wiki/'], [s.label, p], [t.title, tp]],
      schema: [{ '@context': 'https://schema.org', '@type': 'Article', headline: `${t.title} in GTA VI`, description: trunc(t.summary), inLanguage: 'it', dateModified: t.updated, datePublished: t.updated, author: { '@type': 'Organization', name: meta.siteName }, publisher: { '@type': 'Organization', name: meta.siteName }, ...(SITE ? { mainEntityOfPage: abs(tp) } : {}) }],
      body: `<article class="article">
      ${crumbsHtml([['Wiki', 'wiki/'], [s.label, p], [t.title, tp]])}
      <p class="eyebrow">${esc(s.label)} ${badge(t.status)}${t.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p>
      <h1 class="h1">${esc(t.title)}</h1>
      <p class="profile__tag">${esc(t.tagline)}</p>
      ${spoilerWrap(t, `<p class="prose-lead">${esc(t.summary)}</p>${t.facts.length ? `<h2 class="h3">Cosa sappiamo</h2><ul class="facts">${t.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}`)}
      ${reviewNote(t)}${sources(t.sources)}${updated(t.updated)}${pager(arr.map((x) => ({ ...x, name: x.title })), i, p, `Altre voci: ${s.label}`)}</article>`
    }), { lastmod: t.updated });
  });
}

// EASTER EGG
put('easter-egg/index.html', layout({
  title: 'Easter egg e segreti di GTA VI', section: 'easter-egg', path: 'easter-egg/',
  desc: 'Easter egg, segreti e teorie di GTA VI, ciascuno con luogo, procedura, fonte e stato di verifica (confermato, teoria, smentito).',
  crumbs: [['Home', ''], ['Easter egg', 'easter-egg/']],
  body: `<header class="page-head"><p class="eyebrow">Segreti</p><h1 class="h1">Easter egg</h1><p class="page-head__lead">Ogni voce dice se è confermata o solo una teoria. Gli spoiler sono sfocati finché non li attivi.</p></header>
  <div class="filters" data-filters role="group" aria-label="Filtra per stato">
    <button type="button" class="chip is-on" data-filter="all">Tutti</button>
    ${Object.entries(STATUS).filter(([k]) => eggs.some((e) => e.status === k)).map(([k, v]) => `<button type="button" class="chip" data-filter="${k}">${v[0]}</button>`).join('')}
  </div>
  <div class="entry-list" data-list>${eggs.map((e) => `<article class="entry" data-status="${e.status}">
    <a class="entry__link" href="${href(`easter-egg/${e.slug}/`)}">
      <p class="eyebrow">${esc(e.category)} ${badge(e.status)}${e.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p>
      <h2 class="entry__title">${esc(e.title)}</h2>
      ${spoilerWrap(e, `<p>${esc(e.summary)}</p>`)}
    </a></article>`).join('')}</div>`
}), { prio: 0.8 });
eggs.forEach((e, i) => {
  const p = `easter-egg/${e.slug}/`;
  put(`${p}index.html`, layout({
    title: `${e.title}: easter egg di GTA VI`, section: 'easter-egg', path: p, type: 'article', desc: e.summary,
    crumbs: [['Home', ''], ['Easter egg', 'easter-egg/'], [e.title, p]],
    schema: [{ '@context': 'https://schema.org', '@type': 'Article', headline: e.title, description: trunc(e.summary), inLanguage: 'it', dateModified: e.updated, datePublished: e.updated, author: { '@type': 'Organization', name: meta.siteName }, publisher: { '@type': 'Organization', name: meta.siteName }, ...(SITE ? { mainEntityOfPage: abs(p) } : {}) }],
    body: `<article class="article">
    ${crumbsHtml([['Easter egg', 'easter-egg/'], [e.title, p]])}
    <p class="eyebrow">${esc(e.category)} ${badge(e.status)}${e.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p>
    <h1 class="h1">${esc(e.title)}</h1>
    ${spoilerWrap(e, `<p class="prose-lead">${esc(e.summary)}</p>${e.where ? `<dl class="dl"><div><dt>Dove</dt><dd>${esc(e.where)}</dd></div><div><dt>Come</dt><dd>${esc(e.how)}</dd></div></dl>` : ''}`)}
    ${reviewNote(e)}${sources(e.sources)}${updated(e.updated)}${pager(eggs.map((x) => ({ ...x, name: x.title })), i, 'easter-egg/', 'Altri easter egg')}</article>`
  }), { lastmod: e.updated });
});

// GUIDE
put('guide/index.html', layout({
  title: 'Guide e tutorial di GTA VI', section: 'guide', path: 'guide/',
  desc: 'Guide e tutorial di GTA VI: primi passi, comandi, soldi veloci, rapine, collezionabili e trofei. Scritte e verificate a partire dal lancio.',
  crumbs: [['Home', ''], ['Guide', 'guide/']],
  body: `<header class="page-head"><p class="eyebrow">Tutorial</p><h1 class="h1">Guide</h1><p class="page-head__lead">Le guide vengono scritte e verificate a partire dal lancio. Quelle già pronte sono in evidenza.</p></header>
  <div class="entry-list entry-list--grid">${guides.map((g) => g.status === 'planned'
    ? `<article class="entry entry--planned"><p class="eyebrow">${esc(g.category)} ${badge('planned')}</p><h2 class="entry__title">${esc(g.title)}</h2><p>${esc(g.summary)}</p></article>`
    : `<article class="entry"><a class="entry__link" href="${href(`guide/${g.slug}/`)}"><p class="eyebrow">${esc(g.category)} ${badge(g.status)}${g.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p><h2 class="entry__title">${esc(g.title)}</h2><p>${esc(g.summary)}</p></a></article>`).join('')}</div>`
}), { prio: 0.8 });
const liveGuides = guides.filter((x) => x.status !== 'planned');
liveGuides.forEach((g, i) => {
  const p = `guide/${g.slug}/`;
  put(`${p}index.html`, layout({
    title: `${g.title}: guida a GTA VI`, section: 'guide', path: p, type: 'article', desc: g.summary,
    crumbs: [['Home', ''], ['Guide', 'guide/'], [g.title, p]],
    schema: [{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: trunc(g.summary), inLanguage: 'it', dateModified: g.updated, datePublished: g.updated, author: { '@type': 'Organization', name: meta.siteName }, publisher: { '@type': 'Organization', name: meta.siteName }, ...(SITE ? { mainEntityOfPage: abs(p) } : {}) }],
    body: `<article class="article prose">
    ${crumbsHtml([['Guide', 'guide/'], [g.title, p]])}
    <p class="eyebrow">${esc(g.category)} ${badge(g.status)}${g.spoiler ? ' <span class="badge badge--spoiler">Spoiler</span>' : ''}</p>
    <h1 class="h1">${esc(g.title)}</h1>
    ${spoilerWrap(g, markdown(g.body))}
    ${reviewNote(g)}${sources(g.sources)}${updated(g.updated)}${pager(liveGuides.map((x) => ({ ...x, name: x.title })), i, 'guide/', 'Altre guide')}</article>`
  }), { lastmod: g.updated });
});

// NOVITÀ
const byYear = news.reduce((m, n) => ((m[n.date.slice(0, 4)] ||= []).push(n), m), {});
put('novita/index.html', layout({
  title: 'Novità e cronologia di GTA VI: trailer, rinvii e annunci', section: 'novita', path: 'novita/',
  desc: 'La cronologia di GTA VI: Trailer 1 e 2, i due rinvii, la data del 19 novembre 2026, il precaricamento e gli annunci ufficiali.',
  crumbs: [['Home', ''], ['Novità', 'novita/']],
  body: `<header class="page-head"><p class="eyebrow">Cronologia</p><h1 class="h1">Novità</h1><p class="page-head__lead">Trailer, rinvii e annunci, dal più recente. <a class="link" href="${href('feed.xml')}">Iscriviti al feed Atom</a>.</p></header>
  <div class="timeline">${Object.keys(byYear).sort().reverse().map((y) => `<section><h2 class="timeline__year">${y}</h2>${byYear[y].map((n) => `<article class="tl-item"><time datetime="${n.date}">${fmtDate(n.date)}</time><div><h3>${esc(n.title)} ${badge(n.status)}</h3><p>${esc(n.body)}</p>${(n.sources || []).map((s) => `<a class="link link--small" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.label)} ↗</a>`).join(' ')}</div></article>`).join('')}</section>`).join('')}</div>`
}), { prio: 0.8 });

// FAQ
put('faq/index.html', layout({
  title: 'Domande frequenti su GTA VI: data, piattaforme, edizioni', section: 'faq', path: 'faq/',
  desc: 'Risposte rapide su GTA VI: quando esce, su quali piattaforme, precaricamento, protagonisti, ambientazione, edizioni e modalità online.',
  crumbs: [['Home', ''], ['FAQ', 'faq/']],
  schema: [{ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'it', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }],
  body: `<header class="page-head"><p class="eyebrow">FAQ</p><h1 class="h1">Domande frequenti</h1><p class="page-head__lead">Le risposte con la fonte. Se qualcosa cambia, l'agente aggiorna la pagina.</p></header>
  <div class="faq faq--page">${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p><p class="faq__src">${f.sources.map((s) => `<a class="link link--small" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.label)} ↗</a>`).join(' ')}</p></details>`).join('')}</div>`
}), { prio: 0.7 });

// INFORMAZIONI
put('informazioni/index.html', layout({
  title: 'Informazioni, metodo editoriale, privacy e sicurezza', section: 'info', path: 'informazioni/',
  desc: 'Come funziona Leonida Files: wiki non ufficiale di GTA VI, metodo editoriale, stati di verifica, fonti, privacy senza cookie e segnalazione di errori o vulnerabilità.',
  crumbs: [['Home', ''], ['Informazioni', 'informazioni/']],
  body: `<article class="article prose">
  <p class="eyebrow">Il progetto</p><h1 class="h1">Informazioni</h1>
  <h2>Cos'è Leonida Files</h2>
  <p>Una wiki italiana, non ufficiale e senza scopo di lucro, dedicata a Grand Theft Auto VI. Non è affiliata a Rockstar Games o Take-Two Interactive. Marchi e opere appartengono ai rispettivi proprietari.</p>
  <h2>Metodo editoriale</h2>
  <p>Un agente automatico controlla periodicamente fonti ufficiali e stampa di settore, riscrive le informazioni con parole proprie e le pubblica solo se superano un controllo automatico. Ogni scheda mostra uno stato:</p>
  <ul><li><strong>Confermato</strong>: fonte ufficiale o più fonti affidabili indipendenti.</li><li><strong>Non verificato</strong>: plausibile, ma con una sola fonte non ufficiale.</li><li><strong>Teoria</strong>: ipotesi o voce non verificata.</li><li><strong>Smentito</strong>: era una voce, ora è stata smentita.</li><li><strong>In arrivo</strong>: voce pianificata, non ancora scritta.</li></ul>
  <p>Una scheda con l'avviso «in attesa di verifica» può contenere dettagli ancora da confermare con il gioco finale.</p>
  <h2>Segnala un errore</h2>
  <p>Hai trovato un'informazione sbagliata o una fonte migliore? <a href="https://github.com/distortedjew/distortedjew/issues/new" target="_blank" rel="noopener noreferrer">Apri una segnalazione su GitHub</a>.</p>
  <h2 id="privacy">Privacy</h2>
  <p>Il sito non usa cookie, non usa strumenti di tracciamento né pubblicità e non carica risorse da servizi esterni (anche i font sono ospitati qui). Nel tuo browser viene salvata solo la preferenza sugli spoiler, e solo sul tuo dispositivo.</p>
  <h2>Sicurezza</h2>
  <p>Il sito è statico, senza account né moduli. Se pensi di aver trovato una vulnerabilità, segnalala in modo riservato dalla <a href="https://github.com/distortedjew/distortedjew/security/advisories/new" target="_blank" rel="noopener noreferrer">pagina di sicurezza del repository</a>; trovi i riferimenti anche in <a href="${href('.well-known/security.txt')}">security.txt</a>.</p>
  <h2>Immagini</h2>
  <p>Le immagini ufficiali dei personaggi, quando presenti, sono materiale ${esc(CREDIT)}, usato a scopo informativo da fan. Se sei titolare dei diritti e vuoi una modifica, scrivici tramite la segnalazione GitHub.</p>
  </article>`
}), { prio: 0.4 });

// CERCA
put('cerca/index.html', layout({
  title: 'Cerca nella wiki', section: 'cerca', path: 'cerca/', noindex: true,
  desc: 'Cerca personaggi, luoghi, easter egg e guide di GTA VI.',
  body: `<header class="page-head"><p class="eyebrow">Ricerca</p><h1 class="h1">Cerca</h1>
  <form class="searchpage" action="${href('cerca/')}" method="get" role="search"><label class="sr" for="q">Termine di ricerca</label><input id="q" name="q" type="search" placeholder="Es. Lucia, Vice City, trailer…" autocomplete="off"><button class="btn btn--primary" type="submit">Cerca</button></form></header>
  <ul id="results" class="results"></ul><noscript><p class="empty">La ricerca richiede JavaScript. Usa le sezioni dal menu.</p></noscript>`
}), { skipSitemap: true });

// 404
put('404.html', layout({
  title: 'Pagina non trovata', noindex: true, desc: 'Questa pagina non esiste. Torna alla home di Leonida Files, la wiki italiana non ufficiale di GTA VI.',
  body: `<header class="page-head"><p class="eyebrow">Errore 404</p><h1 class="h1">Wasted.</h1><p class="page-head__lead">Questa pagina non esiste (ancora). Torna alla <a class="link" href="${href()}">home</a>, guarda le <a class="link" href="${href('wiki/')}">sezioni della wiki</a> o usa la ricerca.</p></header>`
}), { skipSitemap: true });

/* ---------- File generati ---------- */
const searchIndex = [
  ...characters.map((c) => ({ t: c.name, k: 'Personaggio', u: `personaggi/${c.slug}/`, s: `${c.role}. ${c.tagline} ${c.summary}`, sp: c.spoiler })),
  ...locations.map((l) => ({ t: l.name, k: 'Luogo', u: `luoghi/${l.slug}/`, s: `${l.kind}. ${l.tagline} ${l.summary}`, sp: l.spoiler })),
  ...topics.filter((t) => t.status !== 'planned').map((t) => ({ t: t.title, k: sectionBy[t.section].short, u: `wiki/${t.section}/${t.slug}/`, s: `${t.tagline} ${t.summary}`, sp: t.spoiler })),
  ...eggs.filter((e) => e.status !== 'planned').map((e) => ({ t: e.title, k: 'Easter egg', u: `easter-egg/${e.slug}/`, s: e.summary, sp: e.spoiler })),
  ...guides.filter((g) => g.status !== 'planned').map((g) => ({ t: g.title, k: 'Guida', u: `guide/${g.slug}/`, s: g.summary, sp: g.spoiler })),
  ...faq.map((f) => ({ t: f.q, k: 'FAQ', u: 'faq/', s: f.a, sp: false })),
  ...news.map((n) => ({ t: n.title, k: 'Novità', u: 'novita/', s: n.body, sp: false }))
];

const theme = characters.map((c) => `.ch-${c.slug}{--c:${c.color};--a:${c.accent}}`).join('\n');
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const feedHref = (rel) => (SITE ? abs(rel) : href(rel));
const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="it">
<title>${xml(meta.siteName)} – Novità</title>
<subtitle>${xml(meta.tagline)}</subtitle>
<id>${xml(feedHref(''))}</id>
<link rel="self" href="${xml(feedHref('feed.xml'))}"/>
<link href="${xml(feedHref('novita/'))}"/>
<updated>${meta.lastUpdate}T12:00:00Z</updated>
${news.slice(0, 30).map((n, i) => `<entry><title>${xml(n.title)}</title><id>tag:leonida-files,${n.date}:${i}</id><link href="${xml(feedHref('novita/'))}"/><updated>${n.date}T12:00:00Z</updated><summary>${xml(n.body)}</summary></entry>`).join('\n')}
</feed>
`;

const manifest = { name: meta.siteName, short_name: 'Leonida', description: meta.tagline, lang: 'it', start_url: BASE, scope: BASE, display: 'standalone', background_color: '#0e0620', theme_color: '#0e0620', icons: [{ src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png' }, { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] };

const headers = `/*
  Content-Security-Policy: ${CSP}; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=604800
`;
const securityTxt = `Contact: https://github.com/distortedjew/distortedjew/security/advisories/new
Expires: 2027-11-16T00:00:00.000Z
Preferred-Languages: it, en
${SITE ? `Canonical: ${SITE}${BASE}.well-known/security.txt\n` : ''}`;

fs.rmSync(OUT, { recursive: true, force: true });
for (const [rel, html] of pages) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}
const copy = (rel, to = rel) => { fs.mkdirSync(path.dirname(path.join(OUT, to)), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'src', rel), path.join(OUT, to)); };
for (const f of ['style.css', 'app.js', 'favicon.svg', 'og.png', 'icon-180.png', 'icon-192.png', 'icon-512.png']) copy(f);
fs.cpSync(path.join(ROOT, 'src', 'fonts'), path.join(OUT, 'fonts'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'assets'))) fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true }); fs.writeFileSync(path.join(OUT, rel), s); };
w('theme.css', theme + '\n');
w('search-index.json', JSON.stringify(searchIndex));
w('feed.xml', feed);
w('manifest.webmanifest', JSON.stringify(manifest));
w('_headers', headers);
w('.well-known/security.txt', securityTxt);
w('robots.txt', `User-agent: *\nAllow: /\nDisallow: ${BASE}cerca/\n${SITE ? `\nSitemap: ${SITE}${BASE}sitemap.xml\n` : ''}`);
if (SITE) {
  w('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${xml(SITE + BASE + u.rel)}</loc><lastmod>${u.lastmod}</lastmod>${u.prio ? `<priority>${u.prio}</priority>` : ''}</url>`).join('\n')}\n</urlset>\n`);
}
console.log(`✓ Build completata: ${pages.size} pagine in dist/ (base "${BASE}"${SITE ? `, sito ${SITE}` : ', senza canonical: imposta WIKI_SITE_URL o meta.siteUrl'})`);
