// Pubblicità Google AdSense: spenta di default, mai su pagine con immagini ufficiali Rockstar (salvo permesso documentato),
// caricata solo dopo il consenso e solo con un CMP certificato Google configurato (ads.cmp = "google").
import { features, siteHasOfficialImages } from './_shared.mjs';

// Pagine dove non si mostrano mai annunci (legali, ricerca, account, contenuti che usano materiale ufficiale per natura)
const BLOCKED = /^(privacy|cookie|termini|cerca|account|accedi|login|registrati|profilo|newsletter|galleria|trailer|mappa|preferenze)(\/|$)/;
// Immagini ufficiali Rockstar nel corpo della pagina
const OFFICIAL_IMG = /assets\/img\/|class="[^"]*\b(shot|photo|thumb|gallery|gallery__item|hero--photo)\b/;

export default function register(ctx) {
  const f = features(ctx.config);
  const d = ctx.config.ads;
  if (!f.adsEnabled) return;

  // ads.txt (richiesto da AdSense; deve stare nella radice del dominio: vedi docs/MONETIZATION.md)
  ctx.files.set('ads.txt', `google.com, ${f.pub}, DIRECT, f08c47fec0942fa0\n`);

  if (!f.adsLive) {
    console.warn('⚠ Pubblicità NON attiva: AdSense è configurato ma manca ads.cmp="google" (CMP certificato Google). Nessun annuncio sarà caricato.');
    return;
  }
  const allowOfficial = !!d.allowOnPagesWithOfficialImages;
  console.warn(`⚠ Pubblicità ATTIVA (AdSense ${f.pub}). Rockstar consente l'uso del proprio materiale solo senza scopo commerciale.`);
  if (allowOfficial) console.warn(`⚠ allowOnPagesWithOfficialImages=true: annunci anche su pagine con immagini Rockstar. Permesso dichiarato: "${d.rockstarPermissionRef || 'NESSUNO'}".`);
  else console.warn('  Annunci esclusi da pagine con immagini ufficiali, home con foto, galleria/trailer/mappa, legali, ricerca, 404 e account.');

  // CSP: soltanto con la funzione attiva (elenco ufficiale AdSense/Funding Choices, da riverificare in produzione)
  ctx.csp.add('script-src', 'https://pagead2.googlesyndication.com', 'https://partner.googleadservices.com', 'https://tpc.googlesyndication.com', 'https://www.googletagservices.com', 'https://fundingchoicesmessages.google.com');
  ctx.csp.add('connect-src', 'https://pagead2.googlesyndication.com', 'https://fundingchoicesmessages.google.com', 'https://*.g.doubleclick.net', 'https://ep1.adtrafficquality.google', 'https://*.adtrafficquality.google');
  ctx.csp.add('img-src', 'https://pagead2.googlesyndication.com', 'https://*.googlesyndication.com', 'https://*.g.doubleclick.net', 'https://*.adtrafficquality.google');
  ctx.csp.add('frame-src', 'https://googleads.g.doubleclick.net', 'https://tpc.googlesyndication.com', 'https://*.safeframe.googlesyndication.com', 'https://fundingchoicesmessages.google.com');

  ctx.styles.push('ext/ads.css');
  ctx.copyFile('src/ext/ads.css');
  ctx.scripts.push('ext/ads.js');
  ctx.copyFile('src/ext/ads.js');

  const unit = (slot, where) => `<aside class="ad" data-ad-slot="${ctx.esc(slot)}" data-ad-where="${where}" aria-label="Pubblicità" hidden><p class="ad__label">Pubblicità</p><div class="ad__box"></div></aside>`;
  const slots = d.slots || {};

  // Fine articolo (solo pagine di tipo "article", indicizzabili, senza immagini ufficiali)
  if (slots.article) {
    ctx.hooks.mainEnd.push(({ path: p, type, noindex, body }) => {
      if (type !== 'article' || noindex || BLOCKED.test(p || '')) return '';
      if (!allowOfficial && OFFICIAL_IMG.test(body || '')) return '';
      return unit(slots.article, 'article');
    });
  }
  // Home: solo se il sito non usa immagini ufficiali (l'hero e la galleria della home sono foto Rockstar)
  if (slots.home && (allowOfficial || !siteHasOfficialImages(ctx.ROOT))) {
    ctx.addSlot('home:end', () => unit(slots.home, 'home'));
  }
}
