// Validatore di analytics, pubblicità e dati legali. Le regole di formato sono in lib/config.mjs; qui la coerenza tra le chiavi.
export default async function validate({ err, config }) {
  const f = 'config/site.json';
  const { analytics: a, ads: d, legal: l, enabled: e } = config;
  const bad = (m) => err(f, 'monetizzazione', m);

  // Provider dichiarato ma senza identificativo: il sito resterebbe silenziosamente senza la funzione
  if (a.provider && a.provider !== 'none' && !['plausible', 'ga4'].includes(a.provider)) bad(`analytics.provider sconosciuto: "${a.provider}" (ammessi: none, plausible, ga4)`);
  if (a.provider === 'plausible' && !a.plausibleDomain) bad('analytics.provider=plausible richiede analytics.plausibleDomain');
  if (a.provider === 'ga4' && !a.ga4Id) bad('analytics.provider=ga4 richiede analytics.ga4Id (G-XXXXXXXXXX)');
  if (d.provider && d.provider !== 'none' && d.provider !== 'adsense') bad(`ads.provider sconosciuto: "${d.provider}" (ammessi: none, adsense)`);
  if (d.provider === 'adsense' && !d.adsenseClient) bad('ads.provider=adsense richiede ads.adsenseClient (ca-pub-0000000000000000)');

  if (e.ads) {
    if (d.cmp !== 'google') console.warn('⚠ ads: AdSense configurato ma ads.cmp non è "google": nessun annuncio verrà caricato (serve un CMP certificato Google per EEA/UK/CH).');
    if (!Object.values(d.slots || {}).some(Boolean)) console.warn('⚠ ads: nessuno slot configurato (ads.slots.article/home): nessun annuncio verrà mostrato.');
    if (d.allowOnPagesWithOfficialImages) console.warn('⚠ ads.allowOnPagesWithOfficialImages=true: assicurati di avere il permesso scritto di Rockstar/Take-Two (vedi docs/MONETIZATION.md).');
  } else if (d.allowOnPagesWithOfficialImages) {
    console.warn('⚠ ads.allowOnPagesWithOfficialImages=true ma la pubblicità non è attiva: il flag non ha effetto.');
  }

  // Titolare obbligatorio quando si trattano dati (config.mjs lo controlla già: qui il messaggio mirato per analytics/ads)
  if ((e.analytics || e.ads) && (!l.owner || !l.email)) bad('Con analytics o pubblicità attivi servono legal.owner e legal.email: le pagine /privacy/ e /termini/ non possono mostrare un titolare vuoto');
}
