// Account (Supabase Auth, o "mock" solo per sviluppo), Preferiti e sezione privacy "Account e newsletter".
// Spento di default: senza configurazione non genera pagine, non carica JS/CSS e non allarga la CSP.
import { setupNewsletter } from './newsletter.mjs';

export default async function register(ctx) {
  const { config, esc, href } = ctx;
  const accountsOn = config.enabled.accounts;
  const newsletterOn = config.enabled.newsletter;
  if (!accountsOn && !newsletterOn) return;

  const provider = config.accounts.provider;
  const mock = accountsOn && provider === 'mock';
  if (mock && process.env.WIKI_ENV === 'production') throw new Error('accounts.provider "mock" non può essere usato in produzione (WIKI_ENV=production)');

  const owner = config.legal.owner || 'il titolare del sito';
  const contact = config.legal.email ? `<a href="mailto:${esc(config.legal.email)}">${esc(config.legal.email)}</a>` : 'l\'indirizzo di contatto indicato nella pagina Informazioni';
  const sbHost = accountsOn && !mock ? new URL(config.accounts.supabaseUrl).hostname : '';
  const nl = newsletterOn ? setupNewsletter(ctx) : null;

  /* ---------- Sezione dell'informativa privacy (mostrata da /privacy/) ---------- */
  ctx.legalSections.push({
    id: 'account',
    title: 'Account e newsletter',
    html: () => {
      const out = [];
      if (accountsOn) {
        out.push(`<h3>Account e preferiti</h3>
<p>La creazione di un account è facoltativa: tutta la wiki si legge senza registrarsi. Se crei un account, ${esc(owner)} tratta come titolare i seguenti dati.</p>
<ul>
<li><strong>Indirizzo email</strong> e <strong>password</strong>. La password non è mai visibile al titolare: è conservata dal fornitore del servizio di autenticazione solo in forma di hash.</li>
<li><strong>Preferiti</strong> (indirizzo e titolo delle pagine che salvi) e <strong>preferenza sugli spoiler</strong>, per sincronizzarli tra i tuoi dispositivi.</li>
<li><strong>Data di creazione e di ultimo accesso</strong> dell'account e la registrazione dell'accettazione di Termini e Informativa.${newsletterOn ? ' Se lo spunti, anche la tua richiesta di ricevere la newsletter.' : ''}</li>
<li><strong>Dati tecnici di sicurezza</strong> (per esempio indirizzo IP e orario delle richieste di accesso) trattati dal fornitore per prevenire abusi.</li>
</ul>
<p><strong>Finalità e base giuridica.</strong> Fornirti l'account e la sincronizzazione dei preferiti che hai richiesto (esecuzione del servizio, art. 6.1.b GDPR); garantire la sicurezza del servizio e prevenire abusi (legittimo interesse, art. 6.1.f).</p>
<p><strong>Conservazione.</strong> Fino a quando non elimini l'account da <a href="${href('account/')}">Account</a> → «Elimina il mio account»: l'eliminazione cancella email, preferiti e preferenze. Copie tecniche e log presso il fornitore possono permanere per il breve periodo previsto dal fornitore stesso.</p>
<p><strong>Responsabile del trattamento.</strong> ${mock ? 'Modalità demo: i dati restano solo nel tuo browser.' : `Supabase (autenticazione e database, host <code>${esc(sbHost)}</code>). Il fornitore può trattare i dati anche fuori dallo Spazio economico europeo, con le garanzie previste dai suoi accordi sul trattamento dei dati (per esempio clausole contrattuali standard).`}</p>
<p><strong>Dati salvati nel tuo browser.</strong> Il sito non usa cookie. I preferiti e la preferenza sugli spoiler sono salvati nel <em>local storage</em> del browser anche senza account; se accedi, nello stesso spazio è conservato il token di sessione, che viene rimosso quando esci. Cancellando i dati del sito dal browser li rimuovi.</p>`);
      }
      if (newsletterOn) {
        out.push(`<h3>Newsletter</h3>
<p>Se ti iscrivi alla newsletter, il tuo indirizzo email e il tuo consenso sono trattati da ${esc(owner)} come titolare, tramite il servizio esterno <strong>${esc(nl.providerName)}</strong> (responsabile del trattamento), che invia le email e gestisce l'iscrizione. Il modulo si apre sul sito del fornitore, che può trattare i dati anche fuori dallo Spazio economico europeo con le garanzie previste dai suoi accordi.</p>
<p><strong>Finalità e base giuridica.</strong> Inviarti le novità della wiki, sulla base del tuo consenso (art. 6.1.a GDPR). L'iscrizione usa il doppio consenso: è attiva solo dopo che confermi dal link ricevuto per email. Puoi revocare il consenso in qualsiasi momento dal link di disiscrizione presente in ogni email, senza conseguenze.</p>
<p><strong>Conservazione.</strong> Fino alla disiscrizione. Per la cancellazione completa dei dati scrivi a ${contact}.</p>`);
      }
      out.push(`<h3>I tuoi diritti</h3>
<p>Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità dei dati e opporti al trattamento, oltre a revocare un consenso già dato. Dall'area <a href="${href('account/')}">Account</a> puoi scaricare e cancellare i tuoi dati in autonomia; per qualsiasi altra richiesta scrivi a ${contact}. Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">garanteprivacy.it</a>).</p>`);
      return out.join('\n');
    }
  });

  if (newsletterOn && !accountsOn) return; // la sezione privacy sopra vale anche per la sola newsletter
  if (!accountsOn) return;

  /* ---------- Account + preferiti ---------- */
  ctx.styles.push('ext/auth.css', 'ext/favorites.css');
  ctx.scripts.push('ext/favorites.js');
  ctx.copyFile('src/ext/auth.css');
  ctx.copyFile('src/ext/favorites.css');
  ctx.copyFile('src/ext/favorites.js');
  ctx.copyFile('src/ext/auth.js');
  if (!mock) {
    ctx.copyFile('src/vendor/supabase.js');
    ctx.copyFile('src/vendor/LICENSE-supabase.txt');
    // Solo l'host del progetto Supabase. Nessun wss: il realtime non è usato né caricato.
    ctx.csp.add('connect-src', new URL(config.accounts.supabaseUrl).origin);
  }

  const ACCOUNT_PATHS = ['accedi/', 'registrati/', 'account/'];
  const termsLinks = `<a href="${href('termini/')}" target="_blank" rel="noopener">Termini</a> e l'<a href="${href('privacy/')}" target="_blank" rel="noopener">Informativa privacy</a>`;
  const cfgAttrs = `data-provider="${esc(provider)}"${mock ? '' : ` data-sb-url="${esc(config.accounts.supabaseUrl)}" data-sb-key="${esc(config.accounts.supabaseAnonKey)}"`} data-newsletter="${newsletterOn ? '1' : '0'}"`;

  ctx.hooks.headerTools.push(() => `<a class="tool tool--account" id="account-link" href="${href('accedi/')}" data-login="${href('accedi/')}" data-account="${href('account/')}" data-vendor="${mock ? '' : href('vendor/supabase.js')}" data-auth="${href('ext/auth.js')}" ${cfgAttrs}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/></svg><span id="account-label">Accedi</span></a>`);

  // Pulsante "Salva" sulle pagine articolo (nascosto finché non parte il JS: senza JS non avrebbe effetto)
  const plain = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  ctx.hooks.mainEnd.push((info) => {
    if (info.type !== 'article' || !info.path) return '';
    const h1 = (info.body || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const title = h1 ? plain(h1[1]) : plain(info.path);
    return `<div class="lf-fav" hidden><button class="lf-fav__btn" type="button" aria-pressed="false" data-fav-url="${esc(info.path)}" data-fav-title="${esc(title)}"><svg class="lf-fav__star" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg><span class="lf-fav__label">Salva</span></button><span class="lf-fav__note" role="status" aria-live="polite"></span></div>`;
  });

  // Carica libreria e logica di autenticazione solo nelle pagine account
  ctx.hooks.bodyEnd.push((info) => {
    const parts = [];
    if (mock) parts.push('<div class="lf-demo" role="status"><strong>MODALITÀ DEMO:</strong> non usare in produzione. Gli account sono finti e restano solo in questo browser.</div>');
    if (ACCOUNT_PATHS.includes(info.path)) {
      if (!mock) parts.push(`<script src="${href('vendor/supabase.js')}" defer></script>`);
      parts.push(`<script src="${href('ext/auth.js')}" defer></script>`);
      if (newsletterOn && info.path === 'account/') parts.push(`<script src="${href('ext/newsletter.js')}" defer></script>`);
    }
    return parts.join('\n');
  });

  const field = (id, label, attrs, hint = '') => `<div class="lf-field"><label for="${id}">${label}</label><input id="${id}" ${attrs}>${hint ? `<p class="lf-hint" id="${id}-hint">${hint}</p>` : ''}</div>`;
  const showPw = (id) => `<p class="lf-check"><input type="checkbox" id="${id}" data-toggle-pw><label for="${id}">Mostra la password</label></p>`;
  const msgs = (key) => `<p class="lf-msg lf-msg--err" id="err-${key}" role="alert" tabindex="-1"></p><p class="lf-msg lf-msg--ok" id="ok-${key}" role="status"></p>`;
  const noscript = '<noscript><p class="lf-msg lf-msg--err">Per usare l\'account serve JavaScript attivo nel browser.</p></noscript>';
  const head = (eyebrow, h1, lead) => `<header class="page-head"><p class="eyebrow">${eyebrow}</p><h1 class="h1">${h1}</h1><p class="page-head__lead">${lead}</p></header>`;
  const pwHint = 'Almeno 10 caratteri. Una frase lunga è meglio di una parola complicata.';
  const common = { noindex: true, section: 'account' };
  const lastmod = ctx.meta.lastUpdate;

  // ACCEDI
  ctx.put('accedi/index.html', ctx.layout({
    ...common, title: 'Accedi', path: 'accedi/',
    desc: 'Accedi al tuo account di Leonida Files per salvare i preferiti e sincronizzare le preferenze sugli spoiler tra i tuoi dispositivi.',
    crumbs: [['Home', ''], ['Accedi', 'accedi/']],
    body: `${head('Account', 'Accedi', 'L\'account è facoltativo: serve solo per sincronizzare preferiti e preferenze. La wiki si legge anche senza.')}
<div class="lf-wrap" data-lf-page="login">${noscript}
  <section class="lf-card" id="login-section" aria-labelledby="login-title">
    <h2 class="lf-card__title" id="login-title">Entra con la tua email</h2>
    <form class="lf-form" id="login-form" method="post" data-lf-form novalidate>
      ${field('login-email', 'Email', 'name="email" type="email" required autocomplete="email" inputmode="email" maxlength="254"')}
      ${field('login-password', 'Password', 'name="password" type="password" required autocomplete="current-password" maxlength="200"')}
      ${showPw('login-show')}
      <button class="lf-btn" type="submit">Accedi</button>
    </form>
    ${msgs('login')}
    <p class="lf-links"><button class="lf-linkbtn" type="button" id="show-reset">Password dimenticata?</button> · <a href="${href('registrati/')}">Crea un account</a></p>
  </section>
  <section class="lf-card" id="reset-section" aria-labelledby="reset-title" hidden>
    <h2 class="lf-card__title" id="reset-title">Reimposta la password</h2>
    <p>Inserisci la tua email: se esiste un account riceverai un link per scegliere una nuova password.</p>
    <form class="lf-form" id="reset-form" method="post" data-lf-form novalidate>
      ${field('reset-email', 'Email', 'name="email" type="email" required autocomplete="email" inputmode="email" maxlength="254"')}
      <button class="lf-btn" type="submit">Invia il link</button>
    </form>
    ${msgs('reset')}
    <p class="lf-links"><button class="lf-linkbtn" type="button" id="hide-reset">Torna all'accesso</button></p>
  </section>
  <section class="lf-card" id="newpass-section" aria-labelledby="newpass-title" hidden>
    <h2 class="lf-card__title" id="newpass-title">Scegli una nuova password</h2>
    <form class="lf-form" id="newpass-form" method="post" data-lf-form novalidate>
      ${field('np-password', 'Nuova password', 'name="password" type="password" required autocomplete="new-password" minlength="10" maxlength="200" aria-describedby="np-password-hint"', pwHint)}
      ${field('np-confirm', 'Ripeti la nuova password', 'name="confirm" type="password" required autocomplete="new-password" minlength="10" maxlength="200"')}
      ${showPw('np-show')}
      <button class="lf-btn" type="submit">Salva la nuova password</button>
    </form>
    ${msgs('newpass')}
  </section>
</div>`
  }), { skipSitemap: true });

  // REGISTRATI
  ctx.put('registrati/index.html', ctx.layout({
    ...common, title: 'Registrati', path: 'registrati/',
    desc: 'Crea un account gratuito su Leonida Files per salvare i preferiti e sincronizzare le preferenze. Serve confermare l\'email dal messaggio che ricevi.',
    crumbs: [['Home', ''], ['Registrati', 'registrati/']],
    body: `${head('Account', 'Registrati', 'Un account gratuito per salvare le pagine preferite e sincronizzare le preferenze tra i dispositivi.')}
<div class="lf-wrap" data-lf-page="register">${noscript}
  <section class="lf-card" id="register-section" aria-labelledby="register-title">
    <h2 class="lf-card__title" id="register-title">Crea il tuo account</h2>
    <form class="lf-form" id="register-form" method="post" data-lf-form novalidate>
      ${field('reg-email', 'Email', 'name="email" type="email" required autocomplete="email" inputmode="email" maxlength="254"')}
      ${field('reg-password', 'Password', 'name="password" type="password" required autocomplete="new-password" minlength="10" maxlength="200" aria-describedby="reg-password-hint"', pwHint)}
      ${field('reg-confirm', 'Ripeti la password', 'name="confirm" type="password" required autocomplete="new-password" minlength="10" maxlength="200"')}
      ${showPw('reg-show')}
      <p class="lf-check"><input type="checkbox" id="reg-terms" name="terms" required><label for="reg-terms">Accetto i ${termsLinks}. (obbligatorio)</label></p>
      ${newsletterOn ? `<p class="lf-check"><input type="checkbox" id="reg-newsletter" name="newsletter"><label for="reg-newsletter">Voglio ricevere la newsletter con le novità su GTA VI. (facoltativo) Dopo la conferma dell'account potrai completare l'iscrizione, con doppio consenso, dalla pagina Account.</label></p>` : ''}
      <button class="lf-btn" type="submit">Crea l'account</button>
    </form>
    ${msgs('register')}
    <p class="lf-links">Hai già un account? <a href="${href('accedi/')}">Accedi</a></p>
  </section>
  <section class="lf-card" id="verify-section" aria-labelledby="verify-title" hidden tabindex="-1">
    <h2 class="lf-card__title" id="verify-title">Controlla la tua posta</h2>
    <p>Ti abbiamo inviato un'email di conferma. <strong>L'account si attiva solo dopo che hai cliccato il link</strong> nel messaggio: finché non confermi, non potrai accedere.</p>
    <p>Non la trovi? Guarda nella cartella spam o riprova tra qualche minuto. Se l'indirizzo era già registrato non riceverai un nuovo messaggio: prova ad <a href="${href('accedi/')}">accedere</a> o a reimpostare la password.</p>
    <p class="lf-demo-only" id="mock-confirm-box" hidden>Modalità demo: nessuna email è stata inviata davvero. <button class="lf-btn lf-btn--small" type="button" id="mock-confirm">Simula la conferma dell'email</button></p>
  </section>
</div>`
  }), { skipSitemap: true });

  // ACCOUNT
  ctx.put('account/index.html', ctx.layout({
    ...common, title: 'Il tuo account', path: 'account/',
    desc: 'Gestisci il tuo account di Leonida Files: preferiti, preferenza sugli spoiler, newsletter, esportazione dei dati ed eliminazione dell\'account.',
    crumbs: [['Home', ''], ['Account', 'account/']],
    body: `${head('Account', 'Il tuo account', 'Profilo, preferiti e preferenze.')}
<div class="lf-wrap lf-wrap--wide" data-lf-page="account" data-base="${esc(href(''))}">${noscript}
  <p class="lf-msg" id="acc-loading" role="status">Caricamento in corso…</p>
  <section class="lf-card" id="acc-out" hidden tabindex="-1"><h2 class="lf-card__title">Non hai effettuato l'accesso</h2><p><a class="lf-btn" href="${href('accedi/')}">Accedi</a> oppure <a href="${href('registrati/')}">crea un account</a>. I preferiti salvati su questo dispositivo restano disponibili anche senza accesso.</p></section>
  <div id="acc-in" hidden>
    <section class="lf-card" aria-labelledby="acc-profile-title"><h2 class="lf-card__title" id="acc-profile-title">Profilo</h2>
      <dl class="lf-dl"><dt>Email</dt><dd id="acc-email"></dd><dt>Account creato il</dt><dd id="acc-created"></dd></dl>
      <p class="lf-sync" id="acc-sync" role="status"></p>
      <button class="lf-btn lf-btn--ghost" type="button" id="acc-logout">Esci</button>
      ${msgs('acc')}
    </section>
    <section class="lf-card" aria-labelledby="acc-pref-title"><h2 class="lf-card__title" id="acc-pref-title">Preferenze</h2>
      <p class="lf-check"><input type="checkbox" id="acc-spoilers"><label for="acc-spoilers">Mostra gli spoiler (sincronizzato tra i tuoi dispositivi)</label></p>
    </section>
    <section class="lf-card" aria-labelledby="acc-fav-title"><h2 class="lf-card__title" id="acc-fav-title">Preferiti</h2>
      <p class="lf-empty" id="acc-fav-empty" hidden>Non hai ancora salvato nulla. Apri una scheda e premi «Salva».</p>
      <ul class="lf-favlist" id="acc-fav-list"></ul>
    </section>
    <section class="lf-card" aria-labelledby="acc-nl-title"><h2 class="lf-card__title" id="acc-nl-title">Newsletter</h2>
      ${newsletterOn ? `<p id="acc-nl-state">La newsletter è gestita da ${esc(nl.providerName)}, un servizio esterno: questo sito non conosce lo stato effettivo della tua iscrizione.</p>
      <p class="lf-hint" id="acc-nl-req" hidden>Hai chiesto di ricevere la newsletter al momento della registrazione: completa l'iscrizione qui sotto (serve poi confermare dal link nell'email).</p>
      <div class="nl-wrap nl-wrap--account">${nl.formHtml('acc', false)}</div>` : '<p>La newsletter non è attiva su questo sito.</p>'}
    </section>
    <section class="lf-card" aria-labelledby="acc-data-title"><h2 class="lf-card__title" id="acc-data-title">I tuoi dati</h2>
      <p>Puoi scaricare una copia dei dati del tuo account (email, preferiti, preferenze) in formato JSON.</p>
      <button class="lf-btn lf-btn--ghost" type="button" id="acc-export">Scarica i miei dati</button>
    </section>
    <section class="lf-card lf-card--danger" aria-labelledby="acc-del-title"><h2 class="lf-card__title" id="acc-del-title">Elimina il mio account</h2>
      <p>L'eliminazione è <strong>definitiva</strong>: cancelliamo il tuo account, i preferiti salvati online e le preferenze. I preferiti presenti solo su questo dispositivo restano nel browser. Se sei iscritto alla newsletter, la disiscrizione si fa dal link in fondo a ogni email.</p>
      <form class="lf-form" id="delete-form" method="post" data-lf-form novalidate>
        ${field('del-password', 'Conferma con la tua password', 'name="password" type="password" required autocomplete="current-password" maxlength="200"')}
        <p class="lf-check"><input type="checkbox" id="del-confirm" required><label for="del-confirm">Ho capito che l'operazione non si può annullare.</label></p>
        <button class="lf-btn lf-btn--danger" type="submit">Elimina definitivamente il mio account</button>
      </form>
      ${msgs('del')}
      <p class="lf-hint" id="del-fallback" hidden>L'eliminazione automatica non è disponibile su questo sito. Scrivi a ${config.legal.email ? `<a href="mailto:${esc(config.legal.email)}?subject=${encodeURIComponent('Eliminazione account')}">${esc(config.legal.email)}</a>` : 'l\'indirizzo di contatto indicato nella pagina Informazioni'} dall'indirizzo con cui ti sei registrato: cancelliamo l'account e i dati associati.</p>
    </section>
  </div>
</div>`
  }), { skipSitemap: true });
}
