// Validatore di account e newsletter: solo identificativi pubblici, host consentiti, niente provider demo in produzione.
// Eseguito da scripts/validate.mjs con { ROOT, load, err, data, config }.

const SB_HOSTS = /\.supabase\.(co|in)$/i;

function decodeJwtRole(key) {
  const parts = String(key).split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role || null; } catch { return null; }
}

export default async function validateAccounts({ err, config }) {
  const bad = (m) => err('config/site.json', 'accounts/newsletter', m);
  const a = config.accounts || {};
  const n = config.newsletter || {};
  const prod = process.env.WIKI_ENV === 'production';

  if (!['none', 'supabase', 'mock', ''].includes(a.provider || 'none')) bad(`accounts.provider sconosciuto: ${a.provider} (usa none, supabase o mock)`);
  if (a.provider === 'mock' && prod) bad('accounts.provider "mock" è solo per sviluppo/test e non può andare in produzione (WIKI_ENV=production). Usa "supabase".');
  if (a.provider === 'supabase') {
    if (!a.supabaseUrl) bad('accounts.supabaseUrl mancante (es. https://xxxx.supabase.co)');
    if (!a.supabaseAnonKey) bad('accounts.supabaseAnonKey mancante (chiave PUBBLICA anon/publishable)');
  }
  if (a.supabaseUrl) {
    try {
      const u = new URL(a.supabaseUrl);
      if (u.protocol !== 'https:') bad('accounts.supabaseUrl deve essere https');
      if (u.pathname !== '/' || u.search || u.hash) bad('accounts.supabaseUrl deve essere solo l\'origine (https://xxxx.supabase.co), senza percorso');
      if (!SB_HOSTS.test(u.hostname) && !a.customDomain) bad(`accounts.supabaseUrl: host non consentito (${u.hostname}). Sono ammessi *.supabase.co e *.supabase.in; per un dominio personalizzato imposta accounts.customDomain a true`);
    } catch { bad('accounts.supabaseUrl non è un URL valido'); }
  }
  if (a.supabaseAnonKey) {
    if (/service_role|secret/i.test(a.supabaseAnonKey) || /^sb_secret_/.test(a.supabaseAnonKey)) bad('accounts.supabaseAnonKey sembra una chiave SEGRETA: usa solo la chiave pubblica anon/publishable');
    const role = decodeJwtRole(a.supabaseAnonKey);
    if (role && role !== 'anon') bad(`accounts.supabaseAnonKey ha ruolo "${role}": serve la chiave con ruolo "anon" (la service_role NON va mai pubblicata)`);
  }

  if (!['none', 'buttondown', 'custom', ''].includes(n.provider || 'none')) bad(`newsletter.provider sconosciuto: ${n.provider} (usa none, buttondown o custom)`);
  if (n.provider === 'buttondown' && !n.buttondownUser) bad('newsletter.buttondownUser mancante');
  if (n.provider === 'custom') {
    if (!n.formAction) bad('newsletter.formAction mancante');
    else {
      try {
        const u = new URL(n.formAction);
        if (u.protocol !== 'https:') bad('newsletter.formAction deve essere https');
        if (/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname) || u.hostname.endsWith('.local')) bad('newsletter.formAction deve puntare a un servizio pubblico');
        if (u.username || u.password) bad('newsletter.formAction non deve contenere credenziali');
      } catch { bad('newsletter.formAction non è un URL valido'); }
    }
  }
}
