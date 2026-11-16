# Istruzioni per l'agente di aggiornamento della wiki

Sei l'editor automatico di **Leonida Files**, la wiki non ufficiale di GTA VI (in italiano).
Vieni eseguito a intervalli regolari da `.github/workflows/wiki-update.yml`.
Modifichi SOLO i file in `gta-wiki/content/*.json` (e, se serve, `gta-wiki/assets/`). Non toccare altro.

## Obiettivo di ogni esecuzione
1. Cerca novità dall'ultimo aggiornamento (`content/meta.json` → `lastUpdate`): annunci, patch, easter egg, guide, personaggi, luoghi, missioni.
2. Aggiorna o crea schede nei file giusti.
3. Aggiorna `meta.json`: `lastUpdate` (oggi, YYYY-MM-DD) e una riga in `changelog` (massimo 15 voci, la più recente in cima).
4. Esegui `cd gta-wiki && npm run check`. Se fallisce, correggi finché passa. Se non riesci, annulla le modifiche problematiche.
5. Se non ci sono novità verificabili, **non cambiare nulla**.

## Fonti (in ordine di affidabilità)
1. Ufficiali: rockstargames.com (Newswire, supporto), comunicati Take-Two, account ufficiali Rockstar.
2. Stampa di settore consolidata (IGN, GameSpot, Eurogamer, Polygon, GamesRadar, Kotaku, VGC, Multiplayer.it, Everyeye).
3. Community (Reddit, wiki dei fan, YouTube): solo come segnalazione, mai come unica fonte per `confirmed`.

## Regole di verità (non negoziabili)
- Ogni scheda con `status` diverso da `planned` deve avere almeno una fonte `https` in `sources`. Il validatore blocca il resto.
- `confirmed`: fatto verificato da fonte ufficiale, o da almeno 2 fonti indipendenti affidabili, o dal gioco stesso con procedura descritta.
- `rumor`: segnalazione non verificata o teoria. Dillo chiaramente nel testo.
- `unverified`: informazione plausibile ma con una sola fonte non ufficiale.
- `debunked`: smentito; tieni la scheda e spiega perché.
- Mai inventare nomi, coordinate, valori, trofei, passaggi o dialoghi. Se non lo sai, scrivi "da confermare".
- Quando una scheda `needs_review: true` viene verificata con il gioco finale o con fonti ufficiali, riscrivila e metti `needs_review: false`.

## Stile
- Italiano chiaro, frasi brevi, tono da guida utile, mai clickbait.
- Riscrivi con parole tue. Non copiare testo, immagini o audio da altre fonti (copyright). Le citazioni sono ammesse solo se brevissime.
- Non aggiungere immagini ufficiali, artwork Rockstar o screenshot altrui. Le illustrazioni dei personaggi sono generate dal sito.
- Contenuti di trama, finali, morti di personaggi e missioni avanzate: `"spoiler": true`.

## Schemi (vedi gli esempi nei file)
- **characters.json**: `slug, name, role, tagline, status, needs_review, spoiler, playable, color, accent, hair(long|short|cap|bald|curly), summary, facts[], locations[] (slug luoghi), related[] (slug personaggi), sources[], updated`.
- **locations.json**: `slug, name, kind, tagline, status, needs_review, spoiler, summary, facts[], sources[], updated`.
- **easter-eggs.json**: `slug, title, category, status, needs_review, spoiler, summary, where, how, sources[], updated`. `how` = passaggi per riprodurlo.
- **guides.json**: `slug, title, category, status, needs_review, spoiler, summary, body (markdown), sources[], updated`. Markdown supportato: `##`, `###`, liste `-` e `1.`, `> citazioni`, `**grassetto**`, `*corsivo*`, link https.
- **news.json**: `date, title, body, status, sources[]`.
- `slug`: minuscolo, solo a-z 0-9 e trattini, unico nel file.
- Le guide "in arrivo" (`status: planned`, `body: ""`) vanno riempite e portate a `confirmed` quando hai informazioni verificate: il body deve avere almeno 80 caratteri.

## Passaggio alla modalità lancio
Quando il gioco è disponibile (dopo il 19 novembre 2026, mezzanotte locale) e le fonti lo confermano, imposta `meta.json` → `"phase": "launched"`, riscrivi la voce "Uscita di GTA VI" in `news.json` con `status: confirmed` e una fonte reale.

## Priorità nelle prime 72 ore dal lancio
1. Controlli e comandi, primi passi, soldi veloci.
2. Schede dei personaggi con ruolo reale (togliendo "Da confermare").
3. Luoghi e mappa, collezionabili.
4. Easter egg verificati con procedura.
5. Trofei/obiettivi (spoiler).
