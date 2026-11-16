// Newsletter con provider esterno e double opt-in (non inviamo email noi). Spenta di default.
// Provider: "buttondown" (buttondownUser) oppure "custom" (formAction https: Brevo, MailerLite, Mailchimp…).
// Con la funzione spenta questo modulo non aggiunge pagine, form, CSS, JS né host alla CSP.

/** Costruisce modulo e box della newsletter (usato anche dalla pagina account). Richiede enabled.newsletter. */
export function newsletterKit(ctx) {
  const { config, esc, href } = ctx;
  const n = config.newsletter;
  const isButtondown = n.provider === 'buttondown';
  const action = isButtondown
    ? `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(n.buttondownUser)}`
    : n.formAction;
  const emailField = isButtondown ? 'email' : (n.emailField || 'email');
  const origin = new URL(action).origin;
  const providerName = isButtondown ? 'Buttondown' : new URL(action).hostname;

  const formHtml = (key, compact) => `<form class="nl__form" action="${esc(action)}" method="post" target="_blank" rel="noopener" data-nl-form>
    <div class="nl__row">
      <label class="nl__label" for="nl-email-${key}">Indirizzo email</label>
      <input class="nl__input" id="nl-email-${key}" name="${esc(emailField)}" type="email" required autocomplete="email" inputmode="email" maxlength="254" placeholder="nome@esempio.it">
      <button class="nl__btn" type="submit">Iscrivimi</button>
    </div>
    ${isButtondown ? '<input type="hidden" value="1" name="embed">' : ''}
    <div class="nl__hp" aria-hidden="true"><label for="nl-hp-${key}">Lascia vuoto questo campo</label><input id="nl-hp-${key}" name="lf_website" type="text" tabindex="-1" autocomplete="off"></div>
    <p class="nl__consent"><input id="nl-consent-${key}" type="checkbox" required><label for="nl-consent-${key}">Acconsento a ricevere la newsletter di ${esc(ctx.meta.siteName)} e ho letto l'<a href="${href('privacy/')}" target="_blank" rel="noopener">Informativa privacy</a>.</label></p>
    ${compact ? '' : `<p class="nl__note">Doppio consenso: dopo l'invio ricevi un'email di conferma e l'iscrizione si attiva solo cliccando il link. Ogni email contiene il link per annullare l'iscrizione in qualsiasi momento. Il modulo si apre in una nuova scheda sul sito di ${esc(providerName)}, che gestisce l'invio.</p>`}
    <p class="nl__status" role="status" aria-live="polite" data-nl-status></p>
  </form>`;

  const box = (key, compact) => `<aside class="nl${compact ? ' nl--compact' : ''}" aria-labelledby="nl-title-${key}">
    <p class="eyebrow">Newsletter</p>
    <h2 class="nl__title" id="nl-title-${key}">Le novità su GTA VI, via email</h2>
    <p class="nl__lead">${compact ? 'Iscriviti per ricevere gli aggiornamenti della wiki. Doppio consenso, disiscrizione in ogni email.' : 'Un riepilogo delle novità della wiki direttamente nella tua casella. Niente spam, nessuna cadenza fissa promessa.'}</p>
    ${formHtml(key, compact)}
    ${compact ? `<p class="nl__note">Doppio consenso: confermi dal link nell'email. <a class="link" href="${href('newsletter/')}">Come funziona</a></p>` : ''}
  </aside>`;

  return { origin, providerName, formHtml, box };
}

/** Registrazioni comuni (CSP, CSS, file, link nel footer): idempotente, perché anche accounts.mjs (caricato prima) ne ha bisogno per le sue pagine. */
const done = new WeakSet();
export function setupNewsletter(ctx) {
  const kit = newsletterKit(ctx);
  if (done.has(ctx)) return kit;
  done.add(ctx);
  // La CSP consente l'invio del modulo SOLO a questo host
  ctx.csp.add('form-action', kit.origin);
  ctx.styles.push('ext/newsletter.css');
  ctx.copyFile('src/ext/newsletter.css');
  ctx.copyFile('src/ext/newsletter.js');
  ctx.hooks.footerLinks.push(['Newsletter', 'newsletter/']);
  return kit;
}

export default async function register(ctx) {
  const { config, esc, href } = ctx;
  if (!config.enabled.newsletter) return;
  const { providerName, box } = setupNewsletter(ctx);

  ctx.addSlot('home:end', () => `<section class="block nl-wrap" aria-label="Newsletter">${box('home', false)}</section>`);
  ctx.hooks.mainEnd.push((info) => (info.type === 'article' ? `<div class="nl-wrap nl-wrap--article">${box('article', true)}</div>` : ''));
  // Lo script (solo miglioramento: il modulo funziona anche senza JS) si carica dove c'è un modulo
  ctx.hooks.bodyEnd.push((info) => (info.path === '' || info.path === 'newsletter/' || info.type === 'article' ? `<script src="${href('ext/newsletter.js')}" defer></script>` : ''));

  const title = 'Newsletter di Leonida Files: novità su GTA VI via email';
  const desc = 'Iscriviti alla newsletter di Leonida Files per ricevere le novità della wiki su GTA VI. Doppio consenso, disiscrizione in ogni email, nessuno spam.';
  ctx.put('newsletter/index.html', ctx.layout({
    title, desc, section: 'newsletter', path: 'newsletter/',
    crumbs: [['Home', ''], ['Newsletter', 'newsletter/']],
    schema: [{
      '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, inLanguage: 'it',
      ...(ctx.SITE ? { url: ctx.abs('newsletter/'), isPartOf: { '@type': 'WebSite', name: ctx.meta.siteName, url: ctx.abs('') } } : {})
    }],
    body: `<article class="article prose">
  <p class="eyebrow">Resta aggiornato</p><h1 class="h1">Newsletter</h1>
  <p class="prose-lead">Leonida Files è una wiki italiana non ufficiale su Grand Theft Auto VI, in uscita il 19 novembre 2026. Con la newsletter ricevi per email le novità pubblicate sul sito: nuove schede, aggiornamenti importanti e voci smentite o confermate.</p>
  <h2>Come funziona</h2>
  <ol>
    <li>Inserisci la tua email e spunta il consenso.</li>
    <li>Si apre in una nuova scheda il modulo di ${esc(providerName)}, il servizio esterno che gestisce l'invio.</li>
    <li>Ricevi un'email di conferma: l'iscrizione è attiva solo dopo che hai cliccato il link (doppio consenso).</li>
    <li>Ogni email contiene il link per annullare l'iscrizione in qualsiasi momento.</li>
  </ol>
  <div class="nl-wrap nl-wrap--page">${box('page', false)}</div>
  <h2>Cosa riceverai</h2>
  <ul>
    <li>Un riepilogo delle novità della wiki, con link alle schede e alle fonti.</li>
    <li>Nessuna cadenza fissa: scriviamo quando c'è qualcosa di utile da dire.</li>
    <li>Nessuna cessione del tuo indirizzo a terzi: lo gestisce soltanto il servizio di invio.</li>
  </ul>
  <h2>I tuoi dati</h2>
  <p>L'indirizzo email è trattato per inviarti la newsletter, sulla base del tuo consenso, e conservato presso ${esc(providerName)} fino alla disiscrizione. Maggiori dettagli e i tuoi diritti nell'<a href="${href('privacy/')}">Informativa privacy</a>. Non occorre un account sul sito per iscriversi.</p>
  <p class="foot__small">Wiki non ufficiale fatta dai fan: non siamo affiliati a Rockstar Games o Take-Two Interactive.</p>
</article>`
  }), { prio: 0.4 });
}
