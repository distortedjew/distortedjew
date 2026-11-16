# Foto ufficiali dei personaggi

Il sito mostra una **locandina tipografica** finché non c'è una foto. Per usare una foto vera basta copiare il file, senza modificare altro:

```
gta-wiki/assets/img/characters/<slug>.jpg      (anche .webp, .png, .avif)
```

Gli slug sono quelli di `content/characters.json`: `lucia-caminos`, `jason-duval`, `cal-hampton`, `boobie-ike`, `dre-quan-priest`, `raul-bautista`, `brian-heder`, `real-dimez`, `bae-luxe-e-roxy`.

La build rileva il file da sola e lo usa nelle card, nella scheda del personaggio e nei dati strutturati. La didascalia usa `meta.json` → `imageCredit` (predefinito «© Rockstar Games»).

Opzionale: `gta-wiki/assets/img/hero.jpg` diventa lo sfondo della home.

## Specifiche
- Ritratto verticale 4:5 (consigliato 800×1000), soggetto al centro-alto.
- Max 1,8 MB per file. Il validatore blocca file più grandi, formati diversi (niente SVG) e symlink.
- Per `hero.jpg`: 1920×1080, la parte sinistra viene scurita per far leggere il testo.

## Dove trovare immagini ufficiali
Rockstar mette a disposizione video e screenshot ufficiali da scaricare e condividere nella sezione media di https://www.rockstargames.com/VI. Usale nel rispetto delle condizioni indicate lì e della policy di Rockstar sui contenuti dei fan, e indica sempre il credito.

L'agente automatico **non** scarica né aggiunge immagini: va fatto a mano, così il controllo sui diritti resta tuo.
