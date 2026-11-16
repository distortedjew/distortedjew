# Statistiche, consenso, pubblicità e pagine legali

Tutto è **spento di default**: senza configurazione il sito non carica né contiene nulla di esterno, non mostra banner e non usa cookie. Le funzioni si accendono con variabili pubbliche di GitHub (mai segreti).

> I testi di `/privacy/`, `/cookie/` e `/termini/` sono un modello generato dalle funzioni attive. **Non sono consulenza legale**: fai rivedere i testi da un professionista prima di attivare statistiche o pubblicità.

## 1. Come si configura
GitHub → Settings → Secrets and variables → Actions → **Variables** (non Secrets). Il workflow `wiki-deploy.yml` le passa a build e audit. In locale puoi usare le stesse variabili d'ambiente o le chiavi in `config/site.json`.

| Variabile | Significato |
|---|---|
| `WIKI_LEGAL_OWNER`, `WIKI_LEGAL_EMAIL` | Titolare del trattamento e contatto. **Obbligatori** se è attiva una qualunque funzione che tratta dati: la validazione fallisce se mancano |
| `WIKI_ANALYTICS_PROVIDER` | `plausible` o `ga4` (vuoto = spento) |
| `WIKI_PLAUSIBLE_DOMAIN` | Dominio registrato su Plausible, es. `esempio.it` |
| `WIKI_GA4_ID` | ID di misurazione, es. `G-XXXXXXXXXX` |
| `WIKI_ADS_PROVIDER` | `adsense` (vuoto = spento) |
| `WIKI_ADSENSE_CLIENT` | `ca-pub-0000000000000000` |
| `WIKI_ADSENSE_SLOT_ARTICLE`, `WIKI_ADSENSE_SLOT_HOME` | ID numerici dei blocchi annunci |
| `WIKI_ADS_CMP` | `google` quando hai attivato il CMP Google (vedi sotto). Senza questo **nessun annuncio viene caricato** |
| `WIKI_ADS_ALLOW_OFFICIAL_IMAGES`, `WIKI_ADS_ROCKSTAR_PERMISSION_REF` | Vedi «Perché niente annunci con immagini Rockstar» |

## 2. Statistiche
**Plausible** (consigliato, senza cookie): crea il sito su plausible.io, imposta `WIKI_ANALYTICS_PROVIDER=plausible` e `WIKI_PLAUSIBLE_DOMAIN`. Lo script `https://plausible.io/js/script.js` con `data-domain` viene aggiunto da JavaScript solo dopo il consenso.

**GA4**: crea una proprietà, imposta `WIKI_ANALYTICS_PROVIDER=ga4` e `WIKI_GA4_ID`. Si usa Google Consent Mode v2: `analytics_storage`, `ad_storage`, `ad_user_data` e `ad_personalization` partono `denied`, `analytics_storage` passa a `granted` solo dopo il consenso; `anonymize_ip` attivo, Google Signals e personalizzazione disattivati. In GA4 imposta anche la conservazione dei dati (max 14 mesi). Aggiorna l'informativa se cambi impostazioni.

La CSP del sito si allarga **solo** con la funzione attiva (`ctx.csp.add`). Gli host sono quelli indicati nelle guide ufficiali di Plausible e Google per CSP; riverificali dopo il primo deploy guardando la console del browser.

## 3. Banner di consenso
Compare solo se c'è almeno una funzione che richiede consenso. «Accetta tutto» e «Rifiuta tutto» hanno la stessa evidenza, nessuna casella è preselezionata, il sito resta usabile senza scegliere. La scelta sta in `localStorage` (`leonida.consent`) con versione e scadenza a 6 mesi e un piccolo registro (data, versione, scelta). Cambiando provider la versione cambia e il banner torna a chiedere. Si riapre da «Preferenze cookie» nel footer. Se togli un consenso la pagina si ricarica per fermare gli strumenti già caricati.

## 4. Pubblicità (Google AdSense)
### Approvazione AdSense
Serve un sito con contenuti originali e utili, pagine legali (già presenti), navigazione chiara e traffico reale. Il sito deve avere un dominio proprio: AdSense non approva volentieri sottodomini condivisi, e **`ads.txt` va servito nella radice del dominio**. Su GitHub Pages in un percorso `/repo/` il file generato in `dist/ads.txt` non è alla radice: usa un dominio personalizzato. Il file (`google.com, pub-XXXX, DIRECT, f08c47fec0942fa0`) è generato solo con AdSense configurato.

### Perché gli annunci sono spenti sulle pagine con immagini Rockstar
La policy di Rockstar sull'uso del proprio materiale protetto da copyright ammette l'uso dei contenuti solo **senza scopo commerciale**: guadagnare con pagine che mostrano immagini Rockstar è fuori policy. Per questo, per impostazione predefinita (`ads.allowOnPagesWithOfficialImages = false`):
- nessun annuncio in pagine il cui corpo contiene immagini ufficiali (`assets/img/`, classi `shot`, `photo`, `thumb`, `gallery`, `hero--photo`);
- nessun annuncio nella home se il sito contiene foto ufficiali (hero e galleria), né in galleria, trailer, mappa, pagine legali, ricerca, 404, account;
- annunci solo a fine articolo (e in home solo senza foto), con etichetta «Pubblicità», spazio riservato e caricamento lazy.

Con le immagini attuali restano idonee poche pagine (guide, easter egg senza foto, alcuni luoghi/voci). Il build stampa un avviso quando gli annunci sono attivi.

**Chiedere il permesso:** scrivi a Take-Two (copyright@take2games.com) descrivendo il sito e chiedendo autorizzazione scritta all'uso commerciale delle immagini. Solo se la ottieni imposta `WIKI_ADS_ALLOW_OFFICIAL_IMAGES=true` **e** `WIKI_ADS_ROCKSTAR_PERMISSION_REF` con un riferimento (data/numero della risposta): senza riferimento la validazione fallisce.

### CMP certificato Google (EEA, Regno Unito, Svizzera)
Google richiede, per gli utenti di questi territori, un CMP certificato (Google «Privacy e messaggi»/Funding Choices o un CMP terzo certificato). Non abbiamo potuto consultare le pagine Google in fase di sviluppo, quindi il comportamento è il più prudente: **gli annunci si caricano solo se `WIKI_ADS_CMP=google`** e solo dopo il consenso alla categoria «pubblicità» del nostro banner; il sito non sa dove si trova l'utente, quindi senza CMP non carica nulla per nessuno.
Per attivarlo: in AdSense/Google Privacy e messaggi crea il messaggio per EEA/UK/CH, pubblica, poi imposta `WIKI_ADS_CMP=google`. Lo script del messaggio (`fundingchoicesmessages.google.com`) e AdSense si caricano da JS solo dopo il consenso. Conseguenza: un utente UE può vedere, dopo il nostro consenso, anche il messaggio Google. **Da verificare** sui documenti Google correnti: gli snippet aggiuntivi consigliati per il CMP (frame di segnalazione, gestione errori) e l'elenco host della CSP.

## 5. Pagine legali
`/privacy/` (titolare, dati, basi giuridiche, conservazione, fornitori, trasferimenti extra-UE con GA4/AdSense, diritti, reclamo al Garante; include le sezioni registrate dalle altre estensioni in `ctx.legalSections`), `/cookie/` (tabella generata dalle funzioni attive), `/termini/` (fan site non ufficiale, marchi, immagini, responsabilità, account). Se `legal.owner` o `legal.email` mancano, la pagina mostra un'etichetta «Dato mancante» e la validazione fallisce quando serve un titolare.

## 6. Checklist di conformità
1. Compila titolare ed e-mail; fai rivedere i testi legali.
2. Attiva solo ciò che serve e aggiorna l'informativa se cambi fornitore.
3. Per la pubblicità: CMP Google attivo, `ads.txt` alla radice, nessun annuncio su pagine con immagini Rockstar senza permesso scritto.
4. Dopo il deploy: apri il sito in una finestra privata, verifica nella scheda Rete che **prima** della scelta non parta nessuna richiesta esterna, e che dopo «Rifiuta tutto» continui a non partirne.
