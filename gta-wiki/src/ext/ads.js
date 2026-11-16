/* Annunci AdSense: partono SOLO dopo il consenso alla categoria "pubblicità", con CMP Google configurato, in modo lazy. */
(function () {
  'use strict';
  var root = document.getElementById('cmp-root');
  if (!root) return;
  var cfg;
  try { cfg = JSON.parse(root.getAttribute('data-cmp')); } catch (e) { return; }
  var ads = cfg.ads;
  if (!ads || ads.cmp !== 'google') return; // senza CMP certificato Google non si carica nulla
  var units = [].slice.call(document.querySelectorAll('.ad[data-ad-slot]'));
  if (!units.length) return;
  var started = false, scriptsLoaded = false;

  function add(src, attrs) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    document.head.appendChild(s);
  }
  function loadScripts() {
    if (scriptsLoaded) return;
    scriptsLoaded = true;
    var pub = ads.client.replace(/^ca-/, '');
    add('https://fundingchoicesmessages.google.com/i/' + encodeURIComponent(pub) + '?ts=' + Date.now()); // messaggio CMP Google (Privacy e messaggi)
    add('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(ads.client), { crossorigin: 'anonymous' });
  }
  function fill(u) {
    if (u.getAttribute('data-ad-done')) return;
    u.setAttribute('data-ad-done', '1');
    loadScripts();
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.setAttribute('data-ad-client', ads.client);
    ins.setAttribute('data-ad-slot', u.getAttribute('data-ad-slot'));
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    u.querySelector('.ad__box').appendChild(ins);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
  function start() {
    if (started) return;
    started = true;
    units.forEach(function (u) { u.removeAttribute('hidden'); }); // spazio riservato (min-height) solo da ora
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); fill(en.target); } });
      }, { rootMargin: '300px 0px' });
      units.forEach(function (u) { io.observe(u); });
    } // senza IntersectionObserver: nessun annuncio (scelta prudente)
  }

  document.addEventListener('leonida:consent', function (e) { if (e.detail && e.detail.ads) start(); });
  var c = window.LeonidaConsent && window.LeonidaConsent.get();
  if (c && c.ads) start();
})();
