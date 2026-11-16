/* Caricamento delle statistiche SOLO dopo il consenso alla categoria "statistiche". */
(function () {
  'use strict';
  var root = document.getElementById('cmp-root');
  if (!root) return;
  var cfg;
  try { cfg = JSON.parse(root.getAttribute('data-cmp')); } catch (e) { return; }
  var a = cfg.analytics;
  if (!a) return;
  var loaded = false;

  function add(src, attrs) {
    var s = document.createElement('script');
    s.src = src;
    Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    document.head.appendChild(s);
  }

  function load() {
    if (loaded) return;
    loaded = true;
    if (a.provider === 'plausible') {
      add('https://plausible.io/js/script.js', { defer: '', 'data-domain': a.domain });
    } else if (a.provider === 'ga4') {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); }; // gtag richiede "arguments"
      // Google Consent Mode v2: tutto negato di default, poi aggiornato solo con il consenso
      window.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 });
      window.gtag('js', new Date());
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
      window.gtag('config', a.id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
      add('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(a.id), { async: '' });
    }
  }

  document.addEventListener('leonida:consent', function (e) { if (e.detail && e.detail.analytics) load(); });
  var c = window.LeonidaConsent && window.LeonidaConsent.get();
  if (c && c.analytics) load();
})();
