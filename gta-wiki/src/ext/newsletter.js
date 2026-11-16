// Newsletter: miglioramento del modulo (funziona anche senza JS). Nessun dato viene inviato da questo script:
// l'invio è un normale POST del modulo verso il provider, in una nuova scheda.
(() => {
  'use strict';
  document.querySelectorAll('[data-nl-form]').forEach((form) => {
    const status = form.querySelector('[data-nl-status]');
    const btn = form.querySelector('button[type="submit"]');
    const say = (t) => { if (status) status.textContent = t; };
    form.addEventListener('submit', (ev) => {
      const hp = form.querySelector('input[name="lf_website"]');
      if (hp && hp.value) { ev.preventDefault(); return; } // honeypot compilato: è un bot
      const email = form.querySelector('input[type="email"]');
      if (email && !email.checkValidity()) { ev.preventDefault(); say('Inserisci un indirizzo email valido.'); email.focus(); return; }
      const consent = form.querySelector('input[type="checkbox"]');
      if (consent && !consent.checked) { ev.preventDefault(); say('Per iscriverti devi dare il consenso.'); consent.focus(); return; }
      say('Si è aperta una nuova scheda: segui le istruzioni e conferma dal link che riceverai per email.');
      if (btn) { btn.disabled = true; setTimeout(() => { btn.disabled = false; }, 8000); } // evita invii ripetuti
    });
  });
})();
