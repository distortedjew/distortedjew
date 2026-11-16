// Statistiche (Plausible o GA4 con Consent Mode v2). Spente di default; lo script esterno è iniettato da JS solo dopo il consenso.
import { features } from './_shared.mjs';

export default function register(ctx) {
  const f = features(ctx.config);
  if (!f.analytics) return;

  if (f.provider === 'plausible') {
    // https://plausible.io/js/script.js, eventi inviati a https://plausible.io/api/event
    ctx.csp.add('script-src', 'https://plausible.io');
    ctx.csp.add('connect-src', 'https://plausible.io');
  } else if (f.provider === 'ga4') {
    // Indicazioni CSP di Google per il tag (gtag.js + Analytics)
    ctx.csp.add('script-src', 'https://www.googletagmanager.com');
    ctx.csp.add('connect-src', 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com');
    ctx.csp.add('img-src', 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.googletagmanager.com');
  }
  ctx.scripts.push('ext/analytics.js');
  ctx.copyFile('src/ext/analytics.js');
}
