// Galleria delle immagini ufficiali (/galleria/), teaser in home e pagina dei trailer (/trailer/).
// Dati: content/gallery.json. Le immagini sono tutte ospitate in assets/img/ (nessuna risorsa esterna).
import fs from 'node:fs';
import path from 'node:path';

export const TAGS = [
  ['personaggi', 'Personaggi'],
  ['luoghi', 'Luoghi'],
  ['veicoli', 'Veicoli'],
  ['armi', 'Armi'],
  ['edizioni', 'Edizioni'],
  ['arte', 'Arte']
];

// Miniature per il teaser in home (file in assets/img/gallery/thumbs/<nome>.jpg, generate da queste immagini)
export const TEASER = [
  'vice-city-notte-ruota', 'jason-moto-inseguimento', 'lucia-polizia-notte', 'grotti-cheetah-fari',
  'grassrivers-alligatore', 'leonida-keys-barche', 'boobie-ike-dre-quan', 'vintage-pack-porto'
];

const ROCKSTAR = 'https://www.rockstargames.com/VI';
// Trailer ufficiali. Date e durate: pagine ufficiali di Rockstar (rockstargames.com/VI/trailer-1, /trailer-2, /launch-trailer, /pre-load-now, /videos/rk721912).
export const TRAILERS = [
  { id: 'pre-load', name: 'Pre-Load Now', date: '2026-11-10', dur: '0:30', iso: 'PT30S', poster: 'img/gallery/pre-load-poster.jpg', url: `${ROCKSTAR}/pre-load-now`, alt: 'Illustrazione ufficiale: Jason e Lucia armati su un balcone sopra lo skyline di una città al crepuscolo.', text: 'Il breve annuncio che segnala il via al precaricamento per chi ha prenotato il gioco, in vista del 19 novembre.' },
  { id: 'launch', name: 'Trailer di lancio', date: '2026-10-15', dur: '1:29', iso: 'PT1M29S', poster: 'img/gallery/launch-trailer-poster.jpg', url: `${ROCKSTAR}/launch-trailer`, alt: 'Illustrazione ufficiale: Jason in piedi e Lucia seduta sul cofano di un\'auto rossa, tra palme e grattacieli rosa.', text: 'Il trailer di lancio, con il debutto di «Flower in a Hurricane» dei compositori della colonna sonora originale Justice feat. Tame Impala, SZA e King Gizzard & The Lizard Wizard.' },
  { id: 'extended-look', name: 'An Extended Look', date: '2026-08-27', dur: '', poster: 'img/gallery/an-extended-look-poster.jpg', url: 'https://www.rockstargames.com/videos/rk721912', alt: 'Illustrazione ufficiale: Jason e Lucia con il volto in parte coperto da una bandana davanti a una stazione di servizio al tramonto.', text: 'Uno sguardo esteso, ripreso interamente da filmati di gioco su PlayStation 5, sull\'evoluzione più grande e immersiva della serie.' },
  { id: 'trailer-2', name: 'Trailer 2', date: '2025-05-06', dur: '2:47', iso: 'PT2M47S', poster: 'img/gallery/trailer-2-poster.jpg', top: true, url: `${ROCKSTAR}/trailer-2`, alt: 'Illustrazione ufficiale verticale: Jason con la pistola puntata e Lucia al suo fianco davanti allo skyline di Vice City.', text: 'Jason e Lucia sanno da sempre che il banco è truccato contro di loro: quando un colpo facile va storto, si ritrovano nel lato più oscuro del posto più soleggiato d\'America, al centro di una cospirazione criminale che attraversa lo stato di Leonida.' },
  { id: 'trailer-1', name: 'Trailer 1', date: '2023-12-04', dur: '1:31', iso: 'PT1M31S', poster: 'img/gallery/trailer-1-poster.jpg', top: true, url: `${ROCKSTAR}/trailer-1`, alt: 'Illustrazione ufficiale verticale: Lucia e Jason posano davanti a un\'auto con palme e grattacieli sullo sfondo.', text: 'Il primo trailer di Grand Theft Auto VI: lo stato di Leonida, con le strade al neon di Vice City e dintorni.' }
];

export default async function register(ctx) {
  const { esc, href, abs, put, layout, ldJson, CREDIT, SITE } = ctx;
  const file = path.join(ctx.ROOT, 'content', 'gallery.json');
  if (!fs.existsSync(file)) return;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = raw.map((g) => ({ ...g, id: path.basename(g.file, path.extname(g.file)) }));
  if (!items.length) return;
  const tagLabel = Object.fromEntries(TAGS);

  ctx.styles.push('ext/gallery.css');
  ctx.scripts.push('ext/gallery.js');
  ctx.copyFile('src/ext/gallery.css');
  ctx.copyFile('src/ext/gallery.js');
  ctx.nav.push(['galleria', 'Galleria']);
  ctx.hooks.footerLinks.push(['Trailer ufficiali', 'trailer/']);

  /* ---------- /galleria/ ---------- */
  const counts = Object.fromEntries(TAGS.map(([k]) => [k, items.filter((i) => i.tags.includes(k)).length]));
  const lead = items.find((i) => i.w === 1280 && i.h === 720) || items[0];
  const figure = (g, n) => {
    const tags = g.tags.map((t) => tagLabel[t]).filter(Boolean).join(', ');
    return `<li class="g-cell"><a class="g-item" href="${href('assets/' + g.file)}" id="img-${esc(g.id)}" data-id="${esc(g.id)}" data-tags="${esc(g.tags.join(' '))}" data-title="${esc(g.title)}" data-caption="${esc(g.caption || '')}" data-source="${esc(g.source)}"${g.link ? ` data-link="${esc(href(g.link))}"` : ''} aria-label="${esc(g.title)}: apri a schermo intero">
<img src="${href('assets/' + g.file)}" alt="${esc(g.alt)}" width="${g.w}" height="${g.h}" ${n < 4 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
<span class="g-item__cap"><b>${esc(g.title)}</b><small>${esc(tags)}</small></span></a></li>`;
  };
  const filters = `<div class="g-filters" role="group" aria-label="Filtra per categoria" data-gfilters>
<button type="button" class="chip g-chip is-on" data-gfilter="all" aria-pressed="true">Tutte <span>${items.length}</span></button>
${TAGS.filter(([k]) => counts[k]).map(([k, l]) => `<button type="button" class="chip g-chip" data-gfilter="${k}" aria-pressed="false">${l} <span>${counts[k]}</span></button>`).join('')}
</div>`;
  const ld = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Galleria ufficiale di GTA VI', inLanguage: 'it',
    description: 'Immagini ufficiali di Grand Theft Auto VI: personaggi, luoghi, veicoli, armi ed edizioni.',
    mainEntity: { '@type': 'ItemList', numberOfItems: items.length, itemListElement: items.slice(0, 50).map((g, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'ImageObject', name: g.title, description: g.alt, ...(SITE ? { contentUrl: abs('assets/' + g.file) } : {}), creditText: CREDIT, creator: { '@type': 'Organization', name: 'Rockstar Games' } } })) }
  }];
  put('galleria/index.html', layout({
    title: 'Galleria: immagini ufficiali di GTA VI',
    desc: `${items.length} immagini ufficiali di GTA VI: Jason e Lucia, Vice City e Leonida, veicoli, armi ed edizioni. Filtra per categoria e apri a schermo intero.`,
    path: 'galleria/', section: 'galleria', prio: 0.8,
    crumbs: [['Home', ''], ['Galleria', 'galleria/']],
    schema: ld,
    image: SITE ? abs('assets/' + lead.file) : undefined,
    body: `<header class="page-head"><p class="eyebrow">Immagini ufficiali</p><h1 class="h1">Galleria</h1>
<p class="page-head__lead">${items.length} immagini pubblicate da Rockstar Games: artwork, screenshot e scene dei personaggi di GTA VI. Ogni foto ha una descrizione, il link alla fonte e, dove c'è, alla scheda della wiki. Per i video ufficiali vai alla <a class="link" href="${href('trailer/')}">pagina dei trailer</a>.</p></header>
<section class="g-wrap" aria-label="Immagini">
${filters}
<p class="g-status" role="status" aria-live="polite" data-gstatus></p>
<ul class="g-grid" data-ggrid data-credit="${esc(CREDIT)}">
${items.map(figure).join('\n')}
</ul>
<p class="g-note">Immagini: ${esc(CREDIT)}, usate come pubblicate da Rockstar nelle sue pagine ufficiali. Sito non ufficiale e non affiliato.</p>
</section>`
  }), { prio: 0.8 });

  /* ---------- Teaser in home ---------- */
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const teaser = TEASER.map((id) => byId[id]).filter(Boolean);
  if (teaser.length >= 4) {
    ctx.addSlot('home:after-gallery', () => `<section class="block g-teaser" data-reveal aria-labelledby="g-teaser-h">
  <div class="block__head">
    <p class="eyebrow">Immagini ufficiali</p>
    <h2 class="h2" id="g-teaser-h">La galleria</h2>
    <p class="block__lead">${items.length} immagini ufficiali di Jason, Lucia, Vice City e Leonida, con filtri e schermo intero.</p>
  </div>
  <ul class="g-strip">${teaser.map((g) => `<li><a href="${href(`galleria/#img-${g.id}`)}" aria-label="${esc(g.title)}: apri nella galleria"><img src="${href(`assets/img/gallery/thumbs/${g.id}.jpg`)}" alt="${esc(g.alt)}" width="480" height="${Math.round(480 * g.h / g.w)}" loading="lazy" decoding="async"></a></li>`).join('')}</ul>
  <p class="block__more"><a class="btn btn--ghost" href="${href('galleria/')}">Apri la galleria</a> <a class="link" href="${href('trailer/')}">Trailer ufficiali</a></p>
</section>`);
  }

  /* ---------- Ricerca ---------- */
  ctx.searchIndex.push({ t: 'Galleria immagini ufficiali', k: 'Galleria', u: 'galleria/', s: 'Tutte le immagini ufficiali di GTA VI: personaggi, luoghi, veicoli, armi, edizioni, artwork.', sp: false });
  ctx.searchIndex.push({ t: 'Trailer ufficiali', k: 'Galleria', u: 'trailer/', s: 'Trailer 1, Trailer 2, An Extended Look, trailer di lancio e Pre-Load Now con date e link ufficiali.', sp: false });
  for (const g of items) ctx.searchIndex.push({ t: g.title, k: 'Galleria', u: `galleria/#img-${g.id}`, s: `${g.caption || ''} ${g.alt}`.trim(), sp: false });

  /* ---------- /trailer/ ---------- */
  const dt = (iso) => ctx.fmtDate(iso);
  const card = (t) => `<li class="tr-card">
<a class="tr-card__img${t.top ? ' tr-card__img--top' : ''}" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer nofollow" aria-label="Guarda ${esc(t.name)} su rockstargames.com (si apre in una nuova scheda)"><img src="${href('assets/' + t.poster)}" alt="${esc(t.alt)}" width="1280" height="720" loading="lazy" decoding="async"><span class="tr-card__play" aria-hidden="true"></span></a>
<div class="tr-card__body"><p class="eyebrow">${esc(dt(t.date))}${t.dur ? ` · ${esc(t.dur)}` : ''}</p>
<h2 class="tr-card__title">${esc(t.name)}</h2>
<p>${esc(t.text)}</p>
<p><a class="btn btn--ghost" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer nofollow">Guarda su rockstargames.com <span aria-hidden="true">↗</span></a></p></div></li>`;
  const trLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Trailer ufficiali di Grand Theft Auto VI', inLanguage: 'it', numberOfItems: TRAILERS.length,
    itemListElement: TRAILERS.map((t, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: { '@type': 'VideoObject', name: `Grand Theft Auto VI: ${t.name}`, description: t.text, uploadDate: t.date, url: t.url, ...(t.iso ? { duration: t.iso } : {}), ...(SITE ? { thumbnailUrl: abs('assets/' + t.poster) } : {}), publisher: { '@type': 'Organization', name: 'Rockstar Games' } }
    }))
  }];
  put('trailer/index.html', layout({
    title: 'Trailer ufficiali di GTA VI: date e link',
    desc: 'Tutti i trailer ufficiali di GTA VI con data di uscita: Trailer 1 (2023), Trailer 2 (2025), An Extended Look, trailer di lancio e Pre-Load Now.',
    path: 'trailer/', section: 'galleria', prio: 0.7,
    crumbs: [['Home', ''], ['Galleria', 'galleria/'], ['Trailer', 'trailer/']],
    schema: trLd,
    image: SITE ? abs('assets/' + TRAILERS[1].poster) : undefined,
    body: `<header class="page-head"><p class="eyebrow">Video ufficiali</p><h1 class="h1">Trailer</h1>
<p class="page-head__lead">I trailer di Grand Theft Auto VI in ordine dal più recente. Per rispettare la privacy non incorporiamo alcun video: ogni scheda apre la pagina ufficiale di Rockstar Games in una nuova scheda. Date e durate vengono dalle pagine ufficiali. Altre immagini nella <a class="link" href="${href('galleria/')}">galleria</a>.</p></header>
<ol class="tr-list">${TRAILERS.map(card).join('')}</ol>
<p class="g-note g-note--page">Locandine: ${esc(CREDIT)}. Il gioco esce il 19 novembre 2026. Fonte: <a class="link" href="${ROCKSTAR}" target="_blank" rel="noopener noreferrer nofollow">rockstargames.com/VI</a>.</p>`
  }), { prio: 0.7 });
}
