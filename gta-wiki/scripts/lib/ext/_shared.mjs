// Utilità condivise da consent/analytics/ads/legal (il prefisso "_" evita che il loader lo tratti come estensione).
import fs from 'node:fs';
import path from 'node:path';

/** Quali funzioni sono davvero attive, derivate dalla configurazione pubblica. */
export function features(config) {
  const a = config.analytics || {};
  const d = config.ads || {};
  const analytics = !!config.enabled.analytics;
  const adsEnabled = !!config.enabled.ads;
  // Gli annunci partono SOLO con un CMP certificato Google configurato (scelta prudente: vedi docs/MONETIZATION.md).
  const adsLive = adsEnabled && d.cmp === 'google';
  const pub = String(d.adsenseClient || '').replace(/^ca-/, '');
  return {
    analytics, provider: a.provider,
    adsEnabled, adsLive, pub, client: pub ? 'ca-' + pub : '',
    consentNeeded: analytics || adsLive,
    personal: analytics || adsEnabled || !!config.enabled.accounts || !!config.enabled.newsletter
  };
}

/** Versione del consenso: cambia quando cambiano le funzioni che richiedono consenso, così il banner torna a chiedere. */
export function consentVersion(f) {
  return ['1', f.analytics ? f.provider : '-', f.adsLive ? 'ads' : '-'].join('.');
}

/** True se nel sito ci sono immagini ufficiali (assets/img/**): la home le usa per hero e galleria. */
export function siteHasOfficialImages(ROOT) {
  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).some((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(avif|webp|jpe?g|png)$/i.test(e.name))) : false);
  return walk(path.join(ROOT, 'assets', 'img'));
}
