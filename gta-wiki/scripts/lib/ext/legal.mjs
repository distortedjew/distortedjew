// Pagine legali: /privacy/, /cookie/, /termini/. I testi si adattano alle funzioni ATTIVE (config.enabled.*).
// Sono un modello informativo, non una consulenza legale: vedi docs/MONETIZATION.md.
import { features, consentVersion } from './_shared.mjs';

const UPDATED = '2026-11-16';
const GARANTE = 'https://www.garanteprivacy.it';

export default function register(ctx) {
  const { config, esc, href } = ctx;
  const f = features(config);
  const L = config.legal || {};
  const ga4 = f.analytics && f.provider === 'ga4';
  const plausible = f.analytics && f.provider === 'plausible';
  const acc = !!config.enabled.accounts;
  const nl = !!config.enabled.newsletter;

  const missing = (key) => `<span class="badge badge--bad legal-missing">Dato mancante: ${key}</span>`;
  const owner = L.owner ? esc(L.owner) : missing('legal.owner');
  const email = L.email ? `<a href="mailto:${esc(L.email)}">${esc(L.email)}</a>` : missing('legal.email');
  const ext = (url, label) => `<a href="${url}" rel="noopener noreferrer nofollow" target="_blank">${esc(label)}</a>`;
  const prefLink = f.consentNeeded ? ` Puoi cambiare o revocare le scelte in ogni momento da <a href="${href('cookie/#preferenze')}" data-consent-open>«Preferenze cookie»</a> nel footer.` : '';

  /* ---------- Footer ---------- */
  ctx.hooks.footerLinks.push(['Informativa privacy', 'privacy/'], ['Cookie', 'cookie/'], ['Termini d’uso', 'termini/']);
  if (f.consentNeeded) ctx.hooks.footerLinks.push(['Preferenze cookie', 'cookie/#preferenze']);

  /* ---------- CSS solo sulle pagine legali ---------- */
  ctx.copyFile('src/ext/legal.css');
  const LEGAL_PATHS = new Set(['privacy/', 'cookie/', 'termini/']);
  ctx.hooks.head.push(({ path: p }) => (LEGAL_PATHS.has(p) ? `<link rel="stylesheet" href="${href('ext/legal.css')}">` : ''));
  // Pulsante «Gestisci preferenze» sulla pagina cookie: serve il JS del banner
  const manageBtn = f.consentNeeded
    ? `<p><button class="btn btn--primary" type="button" data-consent-open>Gestisci le preferenze cookie</button></p>`
    : '';

  /* ---------- Sezioni dell'informativa ---------- */
  const core1 = [
    {
      id: 'titolare', title: 'Titolare del trattamento',
      html: () => `<p>Il titolare del trattamento è <strong>${owner}</strong> (${esc(L.country || 'Italia')}). Per qualsiasi richiesta sui tuoi dati scrivi a ${email}.</p>
      <p>Leonida Files è una wiki non ufficiale su Grand Theft Auto VI, ${f.adsLive ? 'che si sostiene anche con la pubblicità (solo se la accetti)' : 'senza pubblicità'}, non affiliata a Rockstar Games o Take-Two Interactive.</p>`
    },
    {
      id: 'dati', title: 'Quali dati trattiamo',
      html: () => `<ul>
        <li><strong>Dati di navigazione.</strong> Come ogni sito, il server che ospita le pagine (al momento GitHub Pages, di GitHub, Inc.) può registrare indirizzo IP, data e ora, pagina richiesta e browser nei propri registri tecnici. Non li vediamo né li colleghiamo a te.</li>
        <li><strong>Preferenze sul tuo dispositivo.</strong> La scelta sugli spoiler${f.consentNeeded ? ' e le tue scelte sui consensi (versione e data)' : ''} restano nel <em>localStorage</em> del tuo browser e non vengono inviate a nessuno.</li>
        ${plausible ? '<li><strong>Statistiche (Plausible Analytics), solo con consenso.</strong> Pagine visitate, sito di provenienza, tipo di browser e sistema, Paese dedotto dall’IP. Plausible non usa cookie e, secondo la sua documentazione, non conserva l’indirizzo IP né costruisce profili individuali.</li>' : ''}
        ${ga4 ? '<li><strong>Statistiche (Google Analytics 4), solo con consenso.</strong> Identificativi online tramite cookie (<code>_ga</code>), pagine visitate, interazioni, informazioni sul dispositivo e posizione approssimativa. L’anonimizzazione dell’IP è attiva e le funzioni pubblicitarie di Google Analytics (Google Signals, personalizzazione) sono disattivate.</li>' : ''}
        ${f.adsLive ? '<li><strong>Pubblicità (Google AdSense), solo con consenso.</strong> Indirizzo IP, identificativi di cookie o del dispositivo, dati del browser e interazioni con gli annunci, raccolti da Google e dai suoi partner per mostrare e misurare gli annunci.</li>' : ''}
        ${acc ? '<li><strong>Account.</strong> Se crei un account: e-mail, credenziali gestite dal fornitore dell’autenticazione e i dati che scegli di inserire.</li>' : ''}
        ${nl ? '<li><strong>Newsletter.</strong> Se ti iscrivi: il tuo indirizzo e-mail e la data di iscrizione.</li>' : ''}
      </ul>${f.personal ? '' : '<p>Il sito non usa cookie, strumenti di tracciamento, pubblicità né risorse da servizi esterni: non raccogliamo dati personali con funzioni nostre.</p>'}`
    },
    {
      id: 'finalita', title: 'Finalità e basi giuridiche',
      html: () => `<ul>
        <li><strong>Funzionamento e sicurezza del sito</strong> (registri tecnici dell’hosting): legittimo interesse, art. 6.1.f GDPR.</li>
        <li><strong>Preferenze tecniche${f.consentNeeded ? ' e registro dei consensi' : ''}</strong>: necessarie al servizio richiesto; strumenti strettamente necessari ai sensi dell’art. 122 del Codice privacy (D.Lgs. 196/2003).</li>
        ${f.analytics ? '<li><strong>Statistiche sull’uso del sito</strong>, per capire quali contenuti servono: consenso, art. 6.1.a GDPR e art. 122 Codice privacy. Revocabile quando vuoi.</li>' : ''}
        ${f.adsLive ? '<li><strong>Pubblicità</strong>, per sostenere le spese del sito: consenso, art. 6.1.a GDPR e art. 122 Codice privacy. Revocabile quando vuoi.</li>' : ''}
        ${acc ? '<li><strong>Gestione dell’account</strong>: esecuzione del servizio che richiedi, art. 6.1.b GDPR.</li>' : ''}
        ${nl ? '<li><strong>Invio della newsletter</strong>: consenso, art. 6.1.a GDPR.</li>' : ''}
      </ul>${prefLink ? `<p>${prefLink.trim()}</p>` : ''}`
    },
    {
      id: 'conservazione', title: 'Per quanto tempo conserviamo i dati',
      html: () => `<ul>
        <li>Registri tecnici dell’hosting: secondo le regole del fornitore.</li>
        <li>Preferenze nel browser: finché non le cancelli${f.consentNeeded ? '. La scelta sui consensi scade dopo 6 mesi, poi ti viene chiesta di nuovo' : ''}.</li>
        ${plausible ? '<li>Statistiche Plausible: dati aggregati, senza identificativi personali.</li>' : ''}
        ${ga4 ? '<li>Statistiche Google Analytics: per il periodo impostato nella proprietà GA4 (al massimo 14 mesi); i cookie <code>_ga</code> durano fino a 2 anni.</li>' : ''}
        ${f.adsLive ? '<li>Pubblicità: i dati sono conservati da Google secondo le proprie regole; i cookie hanno durata decisa da Google.</li>' : ''}
        ${acc ? '<li>Account: fino alla cancellazione dell’account.</li>' : ''}
        ${nl ? '<li>Newsletter: fino alla cancellazione dell’iscrizione.</li>' : ''}
      </ul>`
    },
    {
      id: 'destinatari', title: 'A chi comunichiamo i dati',
      html: () => `<p>Non vendiamo i tuoi dati. Possono trattarli, per le sole finalità indicate, questi fornitori:</p><ul>
        <li><strong>GitHub, Inc.</strong>: hosting delle pagine.</li>
        ${plausible ? `<li><strong>Plausible Insights OÜ</strong> (Estonia): statistiche, come responsabile del trattamento. ${ext('https://plausible.io/privacy', 'Informativa Plausible')}.</li>` : ''}
        ${ga4 ? `<li><strong>Google Ireland Limited / Google LLC</strong>: statistiche (Google Analytics 4). ${ext('https://policies.google.com/privacy', 'Informativa Google')}.</li>` : ''}
        ${f.adsLive ? `<li><strong>Google Ireland Limited / Google LLC</strong>: pubblicità (AdSense) e messaggio di consenso (Privacy e messaggi). Per gli annunci Google agisce di norma come titolare autonomo. ${ext('https://policies.google.com/technologies/ads', 'Come Google usa i dati per gli annunci')}.</li>` : ''}
      </ul>`
    },
    {
      id: 'trasferimenti', title: 'Trasferimenti fuori dall’Unione europea',
      html: () => `<p>Alcuni fornitori hanno sede o infrastrutture negli Stati Uniti${ga4 || f.adsLive ? ': in particolare Google LLC per ' + [ga4 && 'Google Analytics', f.adsLive && 'la pubblicità'].filter(Boolean).join(' e ') : ' (GitHub, per l’hosting)'}. I trasferimenti avvengono sulla base delle garanzie previste dal GDPR, come la decisione di adeguatezza sul Data Privacy Framework UE-USA o le clausole contrattuali standard.${ga4 || f.adsLive ? ' Con le statistiche e la pubblicità disattivate (impostazione predefinita) non viene inviato nulla a Google.' : ''}</p>`
    }
  ];
  const core2 = [
    {
      id: 'diritti', title: 'I tuoi diritti',
      html: () => `<p>Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporti al trattamento (artt. 15-22 GDPR), e revocare in ogni momento un consenso già dato senza pregiudicare i trattamenti precedenti.${prefLink} Per esercitare i diritti scrivi a ${email}.</p>`
    },
    {
      id: 'reclamo', title: 'Reclamo al Garante',
      html: () => `<p>Se ritieni che il trattamento violi la normativa puoi proporre reclamo al Garante per la protezione dei dati personali (${ext(GARANTE, 'garanteprivacy.it')}) o rivolgerti all’autorità giudiziaria.</p>`
    },
    {
      id: 'modifiche', title: 'Aggiornamenti di questa informativa',
      html: () => `<p>Ultimo aggiornamento: <time datetime="${UPDATED}">${ctx.fmtDate(UPDATED)}</time>. Se cambiano le funzioni attive (per esempio statistiche o pubblicità), aggiorniamo questa pagina e ti chiediamo di nuovo il consenso.</p>`
    }
  ];

  /* ---------- Rendering lazy: tutte le estensioni (anche quelle caricate dopo questa) hanno già aggiunto le loro sezioni ---------- */
  const privacyPage = () => {
    const extra = [...ctx.legalSections].sort((a, b) => String(a.title).localeCompare(String(b.title), 'it'));
    const all = [...core1, ...extra, ...core2];
    const toc = `<nav class="legal-toc" aria-label="Indice dell’informativa"><ol>${all.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.title)}</a></li>`).join('')}</ol></nav>`;
    return ctx.layout({
      title: 'Informativa sulla privacy', section: 'info', path: 'privacy/',
      desc: 'Informativa privacy di Leonida Files: titolare, dati trattati, basi giuridiche, conservazione, fornitori, trasferimenti extra-UE e diritti, in base alle funzioni attive.',
      crumbs: [['Home', ''], ['Privacy', 'privacy/']],
      body: `<article class="article prose legal">
        <p class="eyebrow">Informazioni legali</p><h1 class="h1">Informativa sulla privacy</h1>
        <p class="prose-lead">Ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 (GDPR). Questa pagina descrive solo le funzioni oggi attive su questo sito.</p>
        ${toc}
        ${all.map((s) => `<section aria-labelledby="${esc(s.id)}"><h2 id="${esc(s.id)}">${esc(s.title)}</h2>${s.html()}</section>`).join('\n')}
      </article>`
    });
  };

  /* ---------- Cookie ---------- */
  const rows = [
    ['spoilers', 'localStorage', 'Ricorda se mostrare o nascondere gli spoiler.', 'Fino alla cancellazione', 'Prima parte', 'Necessario']
  ];
  if (f.consentNeeded) rows.push(['leonida.consent', 'localStorage', 'Registra le tue scelte sui consensi (versione, data e ora).', '6 mesi', 'Prima parte', 'Necessario']);
  if (plausible) rows.push(['Nessun cookie', 'Script plausible.io', 'Misura le visite in forma aggregata, senza cookie né identificativi nel browser.', '—', 'Plausible Insights OÜ', 'Statistiche']);
  if (ga4) rows.push(['_ga', 'Cookie', 'Distingue gli utenti in modo anonimo per le statistiche.', '2 anni', 'Google', 'Statistiche'], ['_ga_<ID>', 'Cookie', 'Mantiene lo stato della sessione di Google Analytics.', '2 anni', 'Google', 'Statistiche']);
  if (f.adsLive) rows.push(['__gads, __gpi, IDE e simili', 'Cookie', 'Mostrano e misurano gli annunci, limitano le ripetizioni, prevengono le frodi.', 'Decisa da Google', 'Google', 'Pubblicità'], ['Messaggio di consenso Google', 'Cookie / localStorage', 'Memorizza la scelta fatta nel messaggio «Privacy e messaggi».', 'Decisa da Google', 'Google', 'Necessario per gli annunci']);
  const cookiePage = () => ctx.layout({
    title: 'Cookie e strumenti di memorizzazione', section: 'info', path: 'cookie/',
    desc: 'Elenco di cookie e dati salvati nel browser da Leonida Files: nome, finalità, durata e terza parte, generato dalle funzioni attive del sito.',
    crumbs: [['Home', ''], ['Cookie', 'cookie/']],
    body: `<article class="article prose legal">
      <p class="eyebrow">Informazioni legali</p><h1 class="h1">Cookie</h1>
      <p class="prose-lead">${f.consentNeeded ? 'Gli strumenti facoltativi partono solo se li accetti. Questa tabella elenca tutto ciò che il sito può salvare nel tuo browser.' : 'Questo sito non usa cookie e non carica strumenti di terze parti: salva nel browser solo la tua scelta sugli spoiler.'}</p>
      <h2 id="preferenze">Le tue preferenze</h2>
      ${f.consentNeeded ? `<p>Statistiche${f.adsLive ? ' e pubblicità' : ''} sono spente finché non le accetti. Puoi cambiare idea in ogni momento.</p>${manageBtn}<noscript><p>La gestione delle preferenze richiede JavaScript. Senza JavaScript nessuno strumento facoltativo viene caricato.</p></noscript>` : '<p>Non ci sono scelte da fare: nessuno strumento facoltativo è attivo.</p>'}
      <h2 id="tabella">Cosa viene salvato</h2>
      <div class="legal-table-wrap"><table class="legal-table"><thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">Finalità</th><th scope="col">Durata</th><th scope="col">Terza parte</th><th scope="col">Categoria</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>${['Nome', 'Tipo', 'Finalità', 'Durata', 'Terza parte', 'Categoria'].map((h, i) => `<${i === 0 ? 'th scope="row"' : 'td'} data-label="${h}">${esc(r[i])}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('\n')}
      </tbody></table></div>
      <p>Le durate dei cookie di terze parti sono quelle dichiarate dai fornitori e possono cambiare${ga4 || f.adsLive ? `; consulta ${ext('https://policies.google.com/technologies/cookies', 'l’elenco di Google')}` : ''}. Altri dettagli nell’<a href="${href('privacy/')}">informativa privacy</a>.</p>
      ${f.consentNeeded ? `<p class="legal-small">Versione del consenso: <code>${esc(consentVersion(f))}</code>.</p>` : ''}
    </article>`
  });

  /* ---------- Termini ---------- */
  const termsPage = () => ctx.layout({
    title: 'Termini e condizioni d’uso', section: 'info', path: 'termini/',
    desc: 'Condizioni d’uso di Leonida Files: wiki non ufficiale di GTA VI, marchi, uso delle immagini ufficiali, limiti di responsabilità e regole per l’account.',
    crumbs: [['Home', ''], ['Termini', 'termini/']],
    body: `<article class="article prose legal">
      <p class="eyebrow">Informazioni legali</p><h1 class="h1">Termini d’uso</h1>
      <p class="prose-lead">Usando Leonida Files accetti queste condizioni. Sono scritte in modo semplice: se qualcosa non ti è chiaro, scrivi a ${email}.</p>
      <h2 id="chi-siamo">Chi gestisce il sito</h2>
      <p>Il sito è gestito da <strong>${owner}</strong> (${esc(L.country || 'Italia')}), contatto ${email}.</p>
      <h2 id="non-ufficiale">Sito non ufficiale</h2>
      <p>Leonida Files è un progetto di fan. <strong>Non è affiliato, sponsorizzato o approvato da Rockstar Games o Take-Two Interactive.</strong> Grand Theft Auto, GTA, Vice City, Rockstar Games e gli altri nomi e loghi citati sono marchi dei rispettivi proprietari e sono usati solo per identificare il gioco, a scopo informativo.</p>
      <h2 id="immagini">Immagini e materiale ufficiale</h2>
      <p>Le immagini ufficiali, quando presenti, sono © Rockstar Games e restano di proprietà dei titolari. Sono mostrate a scopo informativo, senza scopo commerciale, e non sono concesse in licenza a chi visita il sito: per riusarle rivolgiti ai titolari. Se sei titolare dei diritti e vuoi una modifica o una rimozione, scrivi a ${email} o apri una segnalazione sul repository.</p>
      ${f.adsLive ? '<p>Per rispettare la politica di Rockstar sull’uso del proprio materiale, per impostazione predefinita non mostriamo annunci nelle pagine che contengono immagini ufficiali.</p>' : ''}
      <h2 id="contenuti">Testi e contenuti</h2>
      <p>I testi della wiki sono redatti con parole proprie a partire da fonti citate in ogni scheda. Per riutilizzi oltre la semplice citazione con link alla pagina, chiedi prima il permesso.</p>
      <h2 id="accuratezza">Accuratezza delle informazioni</h2>
      <p>Il gioco non è ancora uscito per tutti i dettagli e molte informazioni possono cambiare. Ogni scheda mostra uno stato di verifica, ma i contenuti sono forniti «così come sono», senza garanzie di completezza o aggiornamento. Alcune pagine contengono spoiler.</p>
      <h2 id="link">Link esterni</h2>
      <p>Il sito rimanda a fonti di terzi: non controlliamo né siamo responsabili dei loro contenuti.</p>
      <h2 id="account">Account${acc ? '' : ' (quando sarà disponibile)'}</h2>
      ${acc ? '<p>Se crei un account sei responsabile di custodire le credenziali e di fornire dati veritieri; puoi chiederne la cancellazione in ogni momento. Possiamo sospendere o chiudere gli account usati in modo abusivo o illecito. Non pubblicare contenuti illeciti o che violano diritti altrui.</p>' : '<p>Al momento il sito non offre account. Se verrà introdotto, queste condizioni saranno aggiornate prima dell’attivazione, con le regole su credenziali, contenuti e cancellazione.</p>'}
      <h2 id="uso-corretto">Uso corretto</h2>
      <p>Non usare il sito per attività illecite, per sovraccaricarlo, per cercare di aggirarne le protezioni o per copiarne in massa i contenuti.</p>
      <h2 id="responsabilita">Limiti di responsabilità</h2>
      <p>Nei limiti consentiti dalla legge, il gestore non risponde di danni derivanti dall’uso del sito o dall’affidamento sulle informazioni pubblicate. Restano ferme le tutele inderogabili previste per i consumatori.</p>
      <h2 id="legge">Legge applicabile</h2>
      <p>Si applica la legge italiana. Per i consumatori resta fermo il foro del luogo di residenza o domicilio.</p>
      <h2 id="modifiche">Modifiche</h2>
      <p>Possiamo aggiornare questi termini: la data in fondo indica l’ultima revisione. Ultimo aggiornamento: <time datetime="${UPDATED}">${ctx.fmtDate(UPDATED)}</time>. Vedi anche l’<a href="${href('privacy/')}">informativa privacy</a> e la pagina <a href="${href('cookie/')}">cookie</a>.</p>
    </article>`
  });

  // Le pagine si costruiscono quando tutte le estensioni hanno finito di registrarsi: la home è la prima pagina del core
  // che usa layout() dopo il caricamento delle estensioni, quindi il suo hook "head" è il primo punto sicuro.
  let built = false;
  ctx.hooks.head.push(({ path: p }) => {
    if (built || p !== '') return '';
    built = true;
    ctx.put('privacy/index.html', privacyPage(), { prio: 0.3 });
    ctx.put('cookie/index.html', cookiePage(), { prio: 0.3 });
    ctx.put('termini/index.html', termsPage(), { prio: 0.3 });
    return '';
  });
}
