/* Banner di consenso (CMP-lite). Nessuna dipendenza, nessun cookie: la scelta sta in localStorage con versione e scadenza a 6 mesi.
   Finché l'utente non sceglie, non parte nessuna richiesta verso host esterni. Gli altri moduli ascoltano l'evento "leonida:consent". */
(function () {
  'use strict';
  var root = document.getElementById('cmp-root');
  if (!root) return;
  var cfg;
  try { cfg = JSON.parse(root.getAttribute('data-cmp')); } catch (e) { return; }

  var KEY = 'leonida.consent';
  var SIX_MONTHS = 182 * 24 * 3600 * 1000;
  var cats = [];
  if (cfg.analytics) cats.push('analytics');
  if (cfg.ads) cats.push('ads');

  var memory = null; // se localStorage non è disponibile la scelta vale solo per questa pagina

  function readRaw() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function stored() {
    var r = readRaw() || memory;
    if (r && r.v === cfg.v && r.exp > Date.now() && r.choice) return r;
    return null;
  }
  function save(choice) {
    var prev = readRaw() || {};
    var now = new Date();
    var log = (prev.log || []).slice(-9);
    log.push({ ts: now.toISOString(), v: cfg.v, choice: choice }); // registro del consenso
    var rec = { v: cfg.v, ts: now.toISOString(), exp: now.getTime() + SIX_MONTHS, choice: choice, log: log };
    memory = rec;
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* storage non disponibile */ }
    return rec;
  }

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    [].concat(kids || []).forEach(function (c) { el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function link(href, text) { return h('a', { href: href }, text); }

  // Regione per gli annunci ai lettori di schermo (presente da subito)
  var live = h('div', { id: 'cmp-live', class: 'cmp-live', role: 'status', 'aria-live': 'polite' });
  root.appendChild(live);
  function say(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 50); }

  var box = null, lastFocus = null, modal = false, current = stored();

  function emit(choice, initial) {
    var d = { analytics: !!choice.analytics, ads: !!choice.ads, initial: !!initial };
    document.dispatchEvent(new CustomEvent('leonida:consent', { detail: d }));
  }
  window.LeonidaConsent = {
    get: function () { var s = stored(); return s ? { analytics: !!s.choice.analytics, ads: !!s.choice.ads } : null; },
    open: function () { openBanner(true); }
  };

  var DESC = {
    analytics: function () {
      return cfg.analytics.provider === 'ga4'
        ? ['Statistiche', 'Google Analytics 4 ci dice quali pagine servono. Usa cookie di Google (_ga) e può trasferire dati negli USA. Indirizzo IP anonimizzato, nessun uso pubblicitario.']
        : ['Statistiche', 'Plausible Analytics misura le visite in forma aggregata, senza cookie e senza profilare le persone.'];
    },
    ads: function () { return ['Pubblicità', 'Annunci Google AdSense a fine articolo. Google può usare cookie e identificativi per mostrarli e misurarli.']; }
  };

  function build() {
    var title = h('h2', { id: 'cmp-title', class: 'cmp__title', tabindex: '-1' }, 'La tua privacy su Leonida Files');
    var txt = h('p', { id: 'cmp-desc', class: 'cmp__text' }, [
      'Il sito funziona anche senza nulla di tutto questo. Usiamo strumenti facoltativi solo se li accetti: ',
      cats.map(function (c) { return DESC[c]()[0].toLowerCase(); }).join(' e '),
      '. Puoi cambiare idea in ogni momento da «Preferenze cookie» in fondo alla pagina. Dettagli: ',
      link(cfg.privacy, 'informativa privacy'), ' e ', link(cfg.cookie, 'cookie'), '.'
    ]);

    var fs = h('fieldset', { class: 'cmp__cats', id: 'cmp-cats', hidden: '' }, [h('legend', { class: 'cmp__legend' }, 'Scegli cosa consentire')]);
    var nec = h('label', { class: 'cmp__cat' }, [
      h('input', { type: 'checkbox', checked: '', disabled: '' }),
      h('span', {}, [h('b', {}, 'Necessari'), ' Ricordano le tue scelte (spoiler, preferenze cookie). Sempre attivi.'])
    ]);
    fs.appendChild(nec);
    var inputs = {};
    cats.forEach(function (c) {
      var d = DESC[c]();
      var i = h('input', { type: 'checkbox', id: 'cmp-' + c });
      inputs[c] = i; // nessuna casella pre-selezionata
      fs.appendChild(h('label', { class: 'cmp__cat', for: 'cmp-' + c }, [i, h('span', {}, [h('b', {}, d[0]), ' ' + d[1]])]));
    });
    var save1 = h('button', { type: 'button', class: 'cmp-btn', id: 'cmp-save', hidden: '' }, 'Salva preferenze');

    var accept = h('button', { type: 'button', class: 'cmp-btn', id: 'cmp-accept' }, 'Accetta tutto');
    var reject = h('button', { type: 'button', class: 'cmp-btn', id: 'cmp-reject' }, 'Rifiuta tutto');
    var custom = h('button', { type: 'button', class: 'cmp-btn cmp-btn--alt', id: 'cmp-custom', 'aria-expanded': 'false', 'aria-controls': 'cmp-cats' }, 'Personalizza');
    var actions = h('div', { class: 'cmp__actions' }, [accept, reject, custom, save1]);

    box = h('section', { id: 'cmp', class: 'cmp', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'cmp-title', 'aria-describedby': 'cmp-desc', tabindex: '-1', hidden: '' }, [
      h('div', { class: 'cmp__inner' }, [title, txt, fs, actions])
    ]);
    root.appendChild(box);

    function choose(choice, msg) {
      var before = current ? current.choice : {};
      current = save(choice);
      var withdrawn = cats.some(function (c) { return before[c] && !choice[c]; });
      closeBanner(true);
      say(msg);
      emit(choice, false);
      if (withdrawn) setTimeout(function () { location.reload(); }, 600); // ferma gli strumenti già caricati
    }
    function all(v) { var o = {}; cats.forEach(function (c) { o[c] = v; }); return o; }
    accept.addEventListener('click', function () { choose(all(true), 'Preferenze salvate: tutto accettato.'); });
    reject.addEventListener('click', function () { choose(all(false), 'Preferenze salvate: solo necessari.'); });
    custom.addEventListener('click', function () {
      var open = fs.hasAttribute('hidden');
      if (open) { fs.removeAttribute('hidden'); save1.removeAttribute('hidden'); fs.querySelector('input:not([disabled])').focus(); modal = true; box.setAttribute('aria-modal', 'true'); }
      else { fs.setAttribute('hidden', ''); save1.setAttribute('hidden', ''); }
      custom.setAttribute('aria-expanded', String(open));
      fit();
    });
    save1.addEventListener('click', function () {
      var o = {}; cats.forEach(function (c) { o[c] = !!inputs[c].checked; });
      choose(o, 'Preferenze salvate.');
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeBanner(true); say('Banner chiuso: nessuna scelta salvata.'); return; }
      if (e.key !== 'Tab' || !modal) return;
      // Focus trap leggero: attivo solo quando il pannello è aperto su richiesta dell'utente
      var f = [].slice.call(box.querySelectorAll('a[href],button:not([hidden]),input:not([disabled])')).filter(function (x) { return !x.closest('[hidden]'); });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    box._inputs = inputs;
  }

  // Lascia spazio sotto la pagina, così il banner non copre il contenuto finale
  function fit() {
    try { document.body.style.paddingBottom = box && !box.hasAttribute('hidden') ? box.offsetHeight + 'px' : ''; } catch (e) { /* ignora */ }
  }
  addEventListener('resize', fit);

  function openBanner(fromUser) {
    if (!box) build();
    var c = current ? current.choice : {};
    cats.forEach(function (k) { box._inputs[k].checked = !!c[k]; });
    lastFocus = fromUser ? document.activeElement : null;
    modal = !!fromUser;
    box.setAttribute('aria-modal', modal ? 'true' : 'false');
    box.removeAttribute('hidden');
    fit();
    box.querySelector('#cmp-title').focus(); // focus gestito: il titolo viene letto per primo
  }
  function closeBanner(restore) {
    if (!box) return;
    box.setAttribute('hidden', '');
    modal = false;
    fit();
    if (restore && lastFocus && document.contains(lastFocus)) lastFocus.focus();
    else if (restore) { var m = document.getElementById('main'); if (m) { m.setAttribute('tabindex', '-1'); m.focus(); } }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href$="#preferenze"], [data-consent-open]') : null;
    if (!a) return;
    e.preventDefault();
    openBanner(true);
  });
  // Se l'indirizzo è /cookie/#preferenze si apre subito
  if (location.hash === '#preferenze') setTimeout(function () { openBanner(true); }, 0);

  if (current) emit(current.choice, true); // scelta già presente e valida
  else if (location.hash !== '#preferenze') openBanner(false); // prima visita: nessun cookie wall, il banner non blocca la pagina
})();
