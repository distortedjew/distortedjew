// Banner di consenso proprio ("CMP-lite"). Compare solo se almeno una funzione che richiede consenso è attiva.
import { features, consentVersion } from './_shared.mjs';

export default function register(ctx) {
  const f = features(ctx.config);
  if (!f.consentNeeded) return; // nessun banner, nessun JS, nessun CSS

  const cfg = {
    v: consentVersion(f),
    privacy: ctx.href('privacy/'),
    cookie: ctx.href('cookie/'),
    analytics: f.analytics ? (f.provider === 'ga4'
      ? { provider: 'ga4', id: ctx.config.analytics.ga4Id }
      : { provider: 'plausible', domain: ctx.config.analytics.plausibleDomain }) : null,
    ads: f.adsLive ? { client: f.client, cmp: ctx.config.ads.cmp } : null
  };

  ctx.styles.push('ext/consent.css');
  ctx.copyFile('src/ext/consent.css');
  ctx.scripts.push('ext/consent.js');
  ctx.copyFile('src/ext/consent.js');
  // Contenitore con la configurazione pubblica (JSON in attributo: niente script inline)
  ctx.hooks.bodyEnd.push(() => `<div id="cmp-root" data-cmp="${ctx.esc(JSON.stringify(cfg))}"></div>`);
}
