// Configurazione del sito (config/site.json + variabili d'ambiente WIKI_*). Solo valori pubblici.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

export function loadConfig(env = process.env) {
  const f = path.join(ROOT, 'config', 'site.json');
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  c.legal ||= {}; c.analytics ||= {}; c.ads ||= {}; c.accounts ||= {}; c.newsletter ||= {};
  c.ads.slots ||= {};
  const e = (k) => (env[k] || '').trim();
  const set = (obj, key, envKey) => { if (e(envKey)) obj[key] = e(envKey); };
  set(c.legal, 'owner', 'WIKI_LEGAL_OWNER');
  set(c.legal, 'email', 'WIKI_LEGAL_EMAIL');
  set(c.analytics, 'provider', 'WIKI_ANALYTICS_PROVIDER');
  set(c.analytics, 'plausibleDomain', 'WIKI_PLAUSIBLE_DOMAIN');
  set(c.analytics, 'ga4Id', 'WIKI_GA4_ID');
  set(c.ads, 'provider', 'WIKI_ADS_PROVIDER');
  set(c.ads, 'adsenseClient', 'WIKI_ADSENSE_CLIENT');
  set(c.ads, 'cmp', 'WIKI_ADS_CMP');
  set(c.ads, 'rockstarPermissionRef', 'WIKI_ADS_ROCKSTAR_PERMISSION_REF');
  if (e('WIKI_ADS_ALLOW_OFFICIAL_IMAGES')) c.ads.allowOnPagesWithOfficialImages = e('WIKI_ADS_ALLOW_OFFICIAL_IMAGES').toLowerCase() === 'true';
  set(c.ads.slots, 'article', 'WIKI_ADSENSE_SLOT_ARTICLE');
  set(c.ads.slots, 'home', 'WIKI_ADSENSE_SLOT_HOME');
  set(c.ads.slots, 'sidebar', 'WIKI_ADSENSE_SLOT_SIDEBAR');
  set(c.accounts, 'provider', 'WIKI_ACCOUNTS_PROVIDER');
  set(c.accounts, 'supabaseUrl', 'WIKI_SUPABASE_URL');
  set(c.accounts, 'supabaseAnonKey', 'WIKI_SUPABASE_ANON_KEY');
  set(c.newsletter, 'provider', 'WIKI_NEWSLETTER_PROVIDER');
  set(c.newsletter, 'buttondownUser', 'WIKI_BUTTONDOWN_USER');
  set(c.newsletter, 'formAction', 'WIKI_NEWSLETTER_FORM_ACTION');
  set(c.newsletter, 'emailField', 'WIKI_NEWSLETTER_EMAIL_FIELD');
  // Un provider si considera attivo solo se ha davvero i suoi identificativi
  c.enabled = {
    analytics: (c.analytics.provider === 'plausible' && !!c.analytics.plausibleDomain) || (c.analytics.provider === 'ga4' && !!c.analytics.ga4Id),
    ads: c.ads.provider === 'adsense' && !!c.ads.adsenseClient,
    // 'mock' è solo per sviluppo/test: il validatore (validators/accounts.mjs) lo rifiuta con WIKI_ENV=production
    accounts: (c.accounts.provider === 'supabase' && !!c.accounts.supabaseUrl && !!c.accounts.supabaseAnonKey) || c.accounts.provider === 'mock',
    newsletter: (c.newsletter.provider === 'buttondown' && !!c.newsletter.buttondownUser) || (c.newsletter.provider === 'custom' && !!c.newsletter.formAction)
  };
  return c;
}

const PUB = /^pub-\d{10,20}$/;
const GA4 = /^G-[A-Z0-9]{6,14}$/;
const DOMAIN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;

/** Controlli di coerenza: se una funzione che tratta dati personali è attiva, servono i dati legali. */
export function validateConfig(c) {
  const errs = [];
  const https = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password; } catch { return false; } };
  if (c.analytics.provider === 'ga4' && c.analytics.ga4Id && !GA4.test(c.analytics.ga4Id)) errs.push('analytics.ga4Id non valido (formato G-XXXXXXXXXX)');
  if (c.analytics.provider === 'plausible' && c.analytics.plausibleDomain && !DOMAIN.test(c.analytics.plausibleDomain)) errs.push('analytics.plausibleDomain non valido');
  if (c.ads.provider === 'adsense' && c.ads.adsenseClient && !PUB.test(c.ads.adsenseClient.replace(/^ca-/, ''))) errs.push('ads.adsenseClient non valido (formato ca-pub-0000000000000000)');
  if (!['none', 'google'].includes(c.ads.cmp || 'none')) errs.push('ads.cmp non valido (ammessi: none, google)');
  if (c.ads.allowOnPagesWithOfficialImages && c.ads.provider === 'adsense' && !(c.ads.rockstarPermissionRef || '').trim()) errs.push('ads.allowOnPagesWithOfficialImages richiede ads.rockstarPermissionRef (riferimento al permesso scritto di Rockstar/Take-Two): vedi docs/MONETIZATION.md');
  for (const [k, v] of Object.entries(c.ads.slots || {})) if (v && !/^\d{6,20}$/.test(v)) errs.push(`ads.slots.${k} non valido (solo cifre)`);
  if (c.accounts.supabaseUrl && !https(c.accounts.supabaseUrl)) errs.push('accounts.supabaseUrl deve essere https');
  if (c.accounts.supabaseAnonKey && !/^[\w-]+\.[\w-]+\.[\w-]+$|^sb_publishable_[\w-]+$/.test(c.accounts.supabaseAnonKey)) errs.push('accounts.supabaseAnonKey non sembra una chiave pubblica valida');
  if (/service_role/i.test(JSON.stringify(c))) errs.push('NON inserire la chiave service_role: solo la chiave pubblica (anon/publishable)');
  if (c.newsletter.provider === 'custom' && c.newsletter.formAction && !https(c.newsletter.formAction)) errs.push('newsletter.formAction deve essere https');
  if (c.newsletter.buttondownUser && !/^[\w-]{2,40}$/.test(c.newsletter.buttondownUser)) errs.push('newsletter.buttondownUser non valido');
  if (c.newsletter.emailField && !/^[\w.[\]-]{1,40}$/.test(c.newsletter.emailField)) errs.push('newsletter.emailField non valido');
  const personal = c.enabled.analytics || c.enabled.ads || (c.enabled.accounts && c.accounts.provider !== 'mock') || c.enabled.newsletter;
  if (personal && (!c.legal.owner || !c.legal.email)) errs.push('Con analytics, pubblicità, account o newsletter attivi servono legal.owner e legal.email (titolare del trattamento): compila config/site.json o WIKI_LEGAL_OWNER / WIKI_LEGAL_EMAIL');
  if (c.legal.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.legal.email)) errs.push('legal.email non valida');
  return errs;
}
