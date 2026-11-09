"""Script in stile 'fern': documentario animato su una storia VERA, con scene strutturate per Remotion."""
from .llm import gemini_json

KINDS = {"title", "narrate", "map", "timeline", "stat", "quote"}
SETTINGS = {"city", "countryside", "sea", "mountain", "desert", "interior"}
MOODS = {"calm", "tense", "joy", "sad"}

RULES = """REGOLE (documentario animato stile fern):
- Storie VERE e ben documentate (persone, eventi, scoperte, misteri storici). Niente fiction, niente leggende spacciate per fatti.
- ACCURATEZZA: usa solo fatti che conosci con certezza. Se non sei sicuro di una data/cifra/nome, omettila o resta generico. Mai inventare citazioni:
  usa 'quote' solo per frasi storicamente attestate.
- Tono: narratore calmo, intelligente, leggermente ironico; frasi brevi; una domanda aperta a fine capitolo.
- Hook nei primi 15 secondi: il momento più incredibile della storia, poi 'torniamo indietro'. Niente 'in questo video'.
- Struttura: hook -> contesto -> escalation -> svolta -> conseguenze -> riflessione finale.
- Rispetto: niente violenza grafica, niente odio, niente accuse a persone viventi."""

SCENE_SPEC = """Ogni scena è un oggetto JSON con "kind" in:
 - "narrate": scena illustrata. Campi: setting (city|countryside|sea|mountain|desert|interior), night (bool), mood (calm|tense|joy|sad),
   people (0-3), headline (luogo/data breve, es. "Londra, 1666").
 - "map": campo points (2-4 nomi di luoghi in ordine di viaggio).
 - "timeline": campo items [{"year":"1666","label":"breve"}] (2-4 elementi).
 - "stat": campi value (numero), unit (stringa, anche vuota), label.
 - "quote": campi quote, by (solo citazioni storiche attestate).
 - "title": solo nel primo capitolo, campi title, subtitle.
Tutte hanno "text" = narrazione parlata della scena (max {maxw} parole). Alterna 'narrate' (la maggior parte) a map/timeline/stat/quote
ogni 4-6 scene per variare il ritmo visivo."""


def pick_topic(cfg: dict, history: list[dict]) -> dict:
    done = [h.get("title", "") for h in history][-80:]
    data = gemini_json(
        f"""Lingua: {cfg['language']}. Canale: {cfg['niche']}.
Proponi 8 storie VERE affascinanti e poco battute, ben documentate, adatte a ~{cfg['target_minutes']} minuti.
Per ognuna: titolo (max 70 caratteri, curiosità), logline, perché è sorprendente, e 'confidence' 1-5 su quanto conosci i fatti.
NON ripetere: {done}
JSON: {{"ideas":[{{"title":"","logline":"","why":"","confidence":5}}]}}""")
    ideas = sorted(data["ideas"], key=lambda i: -int(i.get("confidence", 0)))
    return ideas[0]


def make_outline(cfg: dict, topic: dict) -> dict:
    return gemini_json(
        f"""Lingua: {cfg['language']}. Storia vera: {topic}.
{RULES}
Crea l'outline in {cfg['chapters']} capitoli. Inserisci 'facts': elenco dei fatti chiave verificabili (data, luogo, persone, numeri) che
i capitoli dovranno rispettare, e 'sources': 3-5 fonti reali di riferimento (libri/enciclopedie/archivi) per la descrizione.
JSON: {{"title":"","description":"3 frasi senza spoiler del finale + hashtag","tags":[""],"facts":[""],"sources":[""],
"chapters":[{{"title":"","beat":"","open_loop":""}}]}}""")


def write_chapter(cfg: dict, outline: dict, idx: int, prev: str) -> dict:
    n = len(outline["chapters"]); per = cfg["target_minutes"] * 150 // n
    spec = SCENE_SPEC.replace("{maxw}", str(cfg["scene_max_words"]))
    extra = ("PRIMO capitolo: inizia con una scena 'title' e poi 1-2 scene hook potentissime. " if idx == 0 else "")
    extra += ("ULTIMO capitolo: chiudi con riflessione/morale in 1-2 frasi, senza 'iscriviti' invadente." if idx == n - 1
              else "Chiudi con l'open loop.")
    return gemini_json(
        f"""Lingua: {cfg['language']}. Storia: {outline['title']}. Fatti da rispettare: {outline['facts']}.
Capitolo {idx+1}/{n}: {outline['chapters'][idx]}. Finora: {prev or '(inizio)'}.
{RULES}
{extra}
Scrivi ~{per} parole di narrazione divise in scene (8-12 secondi ciascuna).
{spec}
JSON: {{"summary":"2 frasi","scenes":[{{"kind":"narrate","text":"",...}}]}}""")


def sanitize(scene: dict) -> dict | None:
    text = str(scene.get("text", "")).strip()
    if not text:
        return None
    kind = scene.get("kind") if scene.get("kind") in KINDS else "narrate"
    out = {"kind": kind, "text": text}
    if kind == "narrate":
        out["setting"] = scene.get("setting") if scene.get("setting") in SETTINGS else "countryside"
        out["mood"] = scene.get("mood") if scene.get("mood") in MOODS else "calm"
        out["night"] = bool(scene.get("night", False))
        out["people"] = max(0, min(3, int(scene.get("people", 1) or 0)))
        if scene.get("headline"):
            out["headline"] = str(scene["headline"])[:48]
    elif kind == "map":
        pts = [str(p)[:24] for p in scene.get("points", [])][:4]
        if len(pts) < 2:
            out["kind"], out["setting"], out["mood"], out["people"] = "narrate", "countryside", "calm", 1
        else:
            out["points"] = pts
    elif kind == "timeline":
        items = [{"year": str(i.get("year", ""))[:8], "label": str(i.get("label", ""))[:32]}
                 for i in scene.get("items", []) if isinstance(i, dict)][:4]
        if len(items) < 2:
            out["kind"], out["setting"], out["mood"], out["people"] = "narrate", "city", "calm", 1
        else:
            out["items"] = items
    elif kind == "stat":
        try:
            out.update(value=float(scene["value"]), unit=str(scene.get("unit", ""))[:6], label=str(scene.get("label", ""))[:60])
        except (KeyError, TypeError, ValueError):
            out["kind"], out["setting"], out["mood"], out["people"] = "narrate", "city", "calm", 1
    elif kind == "quote":
        if not scene.get("quote"):
            out["kind"], out["setting"], out["mood"], out["people"] = "narrate", "interior", "calm", 1
        else:
            out.update(quote=str(scene["quote"])[:200], by=str(scene.get("by", ""))[:60])
    elif kind == "title":
        out.update(title=str(scene.get("title", ""))[:70], subtitle=str(scene.get("subtitle", ""))[:40])
    return out


def build_script(cfg: dict, topic: dict) -> dict:
    outline = make_outline(cfg, topic)
    scenes, prev = [], ""
    for i in range(len(outline["chapters"])):
        ch = write_chapter(cfg, outline, i, prev)
        prev += " " + ch.get("summary", "")
        scenes += [s for s in (sanitize(x) for x in ch.get("scenes", [])) if s]
    outline["scenes"] = scenes
    src = "\n".join(f"- {s}" for s in outline.get("sources", []))
    outline["description"] = f"{outline['description']}\n\nFonti principali:\n{src}"
    return outline
