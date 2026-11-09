"""Script in stile documentario animato: storia VERA, stickman con personalità, scene con camera/transizioni/sfx per Remotion."""
from .llm import gemini_json

KINDS = {"title", "narrate", "map", "timeline", "stat", "quote"}
SETTINGS = {"street", "village", "field", "forest", "sea", "mountain", "desert", "room", "castle", "lab", "cave"}
TIMES = {"dawn", "day", "dusk", "night"}
WEATHERS = {"none", "rain", "snow", "fog", "fire"}
MOODS = {"calm", "tense", "joy", "sad"}
CAMERAS = {"static", "push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "shake", "follow"}
TRANSITIONS = {"cut", "fade", "slide_left", "slide_right", "wipe", "flip", "clock"}
EMOTIONS = {"neutral", "happy", "sad", "angry", "scared", "surprised", "thinking", "smug"}
ACTIONS = {"idle", "walk", "run", "wave", "point", "shrug", "think", "cower", "celebrate"}
PROPS = {"none", "letter", "torch", "lantern", "book"}
TRAITS = {"nervous", "confident", "grumpy", "cheerful", "wise", "energetic"}
HATS = {"none", "top", "cap", "crown", "hood", "helmet", "beret"}
HAIRS = {"none", "short", "long", "messy"}
SFX = {"whoosh", "boom", "impact", "thunder", "ding", "bell", "tick", "paper", "heartbeat", "knock", "clang", "stinger"}

RULES = """REGOLE (documentario animato con stickman):
- Storie VERE e ben documentate. Niente fiction spacciata per fatti.
- ACCURATEZZA: usa solo fatti che conosci con certezza; se non sei sicuro di una data/cifra/nome, omettila o resta generico. Mai inventare citazioni:
  'quote' solo per frasi storicamente attestate.
- Tono: narratore calmo, intelligente, leggermente ironico; frasi brevi e parlate; open loop a fine capitolo.
- Hook nei primi 15 secondi: il momento più incredibile, poi 'torniamo indietro'. Niente 'in questo video'.
- Struttura: hook -> contesto -> escalation -> svolta -> conseguenze -> riflessione finale.
- Niente violenza grafica, odio, accuse a persone viventi."""

DIRECTION = """REGIA (ogni scena 'narrate' è un'inquadratura cinematografica):
- setting: street|village|field|forest|sea|mountain|desert|room|castle|lab|cave. time: dawn|day|dusk|night. weather: none|rain|snow|fog|fire.
- mood (colora luce e musica): calm|tense|joy|sad.
- camera: 'pan_left/pan_right' e 'pull_out' per scene d'apertura/establishing (cast vuoto o piccolo); 'push_in' sui momenti emotivi o rivelazioni;
  'shake' per impatti/disastri; 'follow' quando un personaggio cammina/corre; 'tilt_up/tilt_down' SOLO con cast vuoto (rivelare edifici, cielo); 'static' per dialoghi.
- cast: 0-3 personaggi dalla lista; per ognuno id, emotion (neutral|happy|sad|angry|scared|surprised|thinking|smug),
  action (idle|walk|run|wave|point|shrug|think|cower|celebrate), x (0..1 posizione), face ('l'|'r'), prop (none|letter|torch|lantern|book).
  Fai REAGIRE i personaggi in modo coerente con la loro personalità e con la scena (non lasciarli sempre 'idle/neutral').
- transition (verso QUESTA scena dalla precedente): 'cut' tra scene dello stesso luogo/momento; 'fade' per salti temporali; 'slide_left|slide_right|wipe|flip|clock'
  solo per cambi di luogo/atmosfera, con parsimonia (max 1 ogni ~6 scene).
- sfx: 0-3 effetti puntuali {name, at 0..1}: whoosh|boom|impact|thunder|ding|bell|tick|paper|heartbeat|knock|clang|stinger.
  Usali con senso (knock quando bussano, thunder con temporale, impact/boom su eventi forti, heartbeat sulla tensione, stinger su rivelazioni)."""

SCENE_SPEC = """Ogni scena è un oggetto JSON con "kind" in: narrate (illustrata: usa i campi di regia sopra + headline breve tipo "Londra, 1666"),
map (points: 2-4 luoghi), timeline (items: [{year,label}] 2-4), stat (value numero, unit, label), quote (quote, by: solo citazioni attestate), title (solo prima scena: title, subtitle).
Tutte hanno "text" (narrazione parlata, max {maxw} parole), "mood" e "transition". Alterna 'narrate' (la maggior parte) a map/timeline/stat/quote ogni 5-7 scene."""


def pick_topic(cfg: dict, history: list[dict]) -> dict:
    done = [h.get("title", "") for h in history][-80:]
    data = gemini_json(
        f"""Lingua: {cfg['language']}. Canale: {cfg['niche']}.
Proponi 8 storie VERE affascinanti e poco battute, ben documentate, adatte a ~{cfg['target_minutes']} minuti.
Per ognuna: titolo (max 70 caratteri, curiosità), logline, perché è sorprendente, 'confidence' 1-5 su quanto conosci i fatti.
NON ripetere: {done}
JSON: {{"ideas":[{{"title":"","logline":"","why":"","confidence":5}}]}}""")
    return sorted(data["ideas"], key=lambda i: -int(i.get("confidence", 0)))[0]


def make_outline(cfg: dict, topic: dict) -> dict:
    return gemini_json(
        f"""Lingua: {cfg['language']}. Storia vera: {topic}.
{RULES}
Crea l'outline in {cfg['chapters']} capitoli. Inserisci:
- 'facts': fatti chiave verificabili (data, luogo, persone, numeri) che i capitoli dovranno rispettare; 'sources': 3-5 fonti reali di riferimento.
- 'characters': 2-4 personaggi STICKMAN con PERSONALITÀ marcata e look distintivo. Per ognuno: id (slug breve), name, trait
  (nervous|confident|grumpy|cheerful|wise|energetic), hat (none|top|cap|crown|hood|helmet|beret), hatColor (#hex), hair (none|short|long|messy),
  hairColor (#hex), glasses (bool), beard (bool), mustache (bool), scarf (#hex o vuoto). Ispirati ai personaggi storici reali coinvolti.
JSON: {{"title":"","description":"3 frasi senza spoiler del finale + hashtag","tags":[""],"facts":[""],"sources":[""],
"characters":[{{"id":"","name":"","trait":"","hat":"","hatColor":"","hair":"","hairColor":"","glasses":false,"beard":false,"mustache":false,"scarf":""}}],
"chapters":[{{"title":"","beat":"","open_loop":""}}]}}""")


def write_chapter(cfg: dict, outline: dict, idx: int, prev: str) -> dict:
    n = len(outline["chapters"]); per = cfg["target_minutes"] * 150 // n
    spec = SCENE_SPEC.replace("{maxw}", str(cfg["scene_max_words"]))
    extra = ("PRIMO capitolo: inizia con una scena 'title' e poi 1-2 scene hook potentissime. " if idx == 0 else "")
    extra += ("ULTIMO capitolo: chiudi con riflessione/morale in 1-2 frasi, senza 'iscriviti' invadente." if idx == n - 1 else "Chiudi con l'open loop.")
    return gemini_json(
        f"""Lingua: {cfg['language']}. Storia: {outline['title']}. Fatti da rispettare: {outline['facts']}.
Personaggi: {outline['characters']}.
Capitolo {idx+1}/{n}: {outline['chapters'][idx]}. Finora: {prev or '(inizio)'}.
{RULES}
{DIRECTION}
{extra}
Scrivi ~{per} parole di narrazione divise in scene da 8-12 secondi.
{spec}
JSON: {{"summary":"2 frasi","scenes":[{{"kind":"narrate","text":"",...}}]}}""")


def _pick(v, allowed, default):
    return v if v in allowed else default


def sanitize_look(c: dict, i: int) -> dict:
    hexok = lambda x: isinstance(x, str) and len(x) == 7 and x.startswith("#")  # noqa: E731
    out = {"id": str(c.get("id") or f"p{i}")[:20], "name": str(c.get("name", ""))[:30],
           "trait": _pick(c.get("trait"), TRAITS, "wise"), "hat": _pick(c.get("hat"), HATS, "none"),
           "hair": _pick(c.get("hair"), HAIRS, "short"), "glasses": bool(c.get("glasses")),
           "beard": bool(c.get("beard")), "mustache": bool(c.get("mustache"))}
    for k in ("hatColor", "hairColor", "scarf"):
        if hexok(c.get(k)): out[k] = c[k]
    return out


def sanitize(scene: dict, char_ids: list[str]) -> dict | None:
    text = str(scene.get("text", "")).strip()
    if not text: return None
    kind = _pick(scene.get("kind"), KINDS, "narrate")
    out = {"kind": kind, "text": text, "mood": _pick(scene.get("mood"), MOODS, "calm"),
           "transition": _pick(scene.get("transition"), TRANSITIONS, "fade")}
    sfx = [{"name": e["name"], "at": max(0.0, min(0.95, float(e.get("at", 0.1))))} for e in scene.get("sfx", [])
           if isinstance(e, dict) and e.get("name") in SFX][:3]
    if sfx: out["sfx"] = sfx
    fallback = False
    if kind == "map":
        pts = [str(p)[:24] for p in scene.get("points", [])][:4]
        if len(pts) >= 2: out["points"] = pts
        else: fallback = True
    elif kind == "timeline":
        items = [{"year": str(i.get("year", ""))[:8], "label": str(i.get("label", ""))[:32]} for i in scene.get("items", []) if isinstance(i, dict)][:4]
        if len(items) >= 2: out["items"] = items
        else: fallback = True
    elif kind == "stat":
        try: out.update(value=float(scene["value"]), unit=str(scene.get("unit", ""))[:6], label=str(scene.get("label", ""))[:60])
        except (KeyError, TypeError, ValueError): fallback = True
    elif kind == "quote":
        if scene.get("quote"): out.update(quote=str(scene["quote"])[:200], by=str(scene.get("by", ""))[:60])
        else: fallback = True
    elif kind == "title":
        out.update(title=str(scene.get("title", ""))[:70], subtitle=str(scene.get("subtitle", ""))[:40])
    if fallback:
        out["kind"] = kind = "narrate"
    if kind == "narrate":
        cast = []
        for m in (scene.get("cast") or [])[:3]:
            if not isinstance(m, dict): continue
            cid = m.get("id") if m.get("id") in char_ids else (char_ids[0] if char_ids else "p0")
            cast.append({"id": cid, "emotion": _pick(m.get("emotion"), EMOTIONS, "neutral"), "action": _pick(m.get("action"), ACTIONS, "idle"),
                         "x": max(0.0, min(1.0, float(m.get("x", 0.5) or 0.5))), "face": _pick(m.get("face"), {"l", "r"}, "r"),
                         "prop": _pick(m.get("prop"), PROPS, "none")})
        cam = _pick(scene.get("camera"), CAMERAS, "static")
        if cast and cam in ("tilt_up", "tilt_down"): cam = "push_in"
        if any(m["action"] in ("walk", "run") for m in cast) and cam == "static": cam = "follow"
        out.update(setting=_pick(scene.get("setting"), SETTINGS, "field"), time=_pick(scene.get("time"), TIMES, "day"),
                   weather=_pick(scene.get("weather"), WEATHERS, "none"), camera=cam, cast=cast)
        if scene.get("headline"): out["headline"] = str(scene["headline"])[:48]
    return out


def build_script(cfg: dict, topic: dict) -> dict:
    outline = make_outline(cfg, topic)
    outline["characters"] = [sanitize_look(c, i) for i, c in enumerate(outline.get("characters") or [{}])]
    ids = [c["id"] for c in outline["characters"]]
    scenes, prev = [], ""
    for i in range(len(outline["chapters"])):
        ch = write_chapter(cfg, outline, i, prev)
        prev += " " + ch.get("summary", "")
        scenes += [s for s in (sanitize(x, ids) for x in ch.get("scenes", [])) if s]
    if scenes: scenes[0]["transition"] = "cut"
    outline["scenes"] = scenes
    src = "\n".join(f"- {s}" for s in outline.get("sources", []))
    outline["description"] = f"{outline['description']}\n\nFonti principali:\n{src}"
    return outline
