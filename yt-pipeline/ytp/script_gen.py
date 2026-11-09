"""Genera idea, outline e script a scene. Le regole nel prompt vengono dall'analisi in docs/ANALISI.md."""
from .llm import gemini_json

STORY_RULES = """REGOLE DI STORYTELLING (conflict arc):
- Primi 15 secondi: HOOK forte (un momento di tensione/mistero/emozione, NON un saluto, NON 'in questo video').
- Struttura: hook -> ascesa -> conflitto -> caduta/crisi -> rimonta -> colpo di scena -> payoff emotivo con morale.
- Un solo protagonista chiaro con un desiderio concreto; ostacoli crescenti; open loop (domande che restano aperte) a fine capitolo.
- Frasi brevi, parlate, ritmo variato; niente elenchi; niente meta-commenti.
- Contenuto originale, adatto a tutti, senza violenza grafica, odio, politica reale o persone reali."""


def pick_topic(cfg: dict, history: list[dict]) -> dict:
    done = [h.get("title", "") for h in history][-60:]
    data = gemini_json(
        f"""Sei un autore di storie virali per YouTube in lingua '{cfg['language']}'.
Nicchia: {cfg['niche']}.
Proponi 8 idee ORIGINALI di storia lunga (~{cfg['target_minutes']} minuti). Per ciascuna: titolo cliccabile (max 70 caratteri,
curiosità/emozione, niente clickbait falso), logline di una frase, protagonista.
NON ripetere questi titoli già fatti: {done}
Rispondi JSON: {{"ideas":[{{"title":"","logline":"","protagonist":""}}]}}""")
    ideas = data["ideas"]
    if not ideas:
        raise RuntimeError("Nessuna idea generata")
    return ideas[0]


def make_outline(cfg: dict, topic: dict) -> dict:
    return gemini_json(
        f"""Lingua: {cfg['language']}. Idea: {topic}.
{STORY_RULES}
Crea l'outline di una storia in {cfg['chapters']} capitoli. Definisci anche i PERSONAGGI con una descrizione VISIVA fissa
(età, capelli, vestiti, tratti) in inglese, riusata identica in ogni immagine per mantenere coerenza.
Rispondi JSON: {{"title":"","description":"(3 frasi + hashtag, senza spoiler del finale)","tags":["..."],
"characters":[{{"name":"","visual":""}}],
"chapters":[{{"title":"","beat":"cosa succede","open_loop":"domanda lasciata aperta"}}]}}""")


def write_chapter(cfg: dict, outline: dict, idx: int, prev_summary: str) -> dict:
    n_chap = len(outline["chapters"])
    words_total = cfg["target_minutes"] * 150
    per_chap = words_total // n_chap
    ch = outline["chapters"][idx]
    hook_note = ("Questo è il PRIMO capitolo: i primi 2 scene sono l'HOOK potentissimo." if idx == 0 else "")
    end_note = ("Questo è l'ULTIMO capitolo: chiudi con colpo di scena, payoff emotivo e morale in 1 frase; "
                "nessun 'iscriviti' invadente." if idx == n_chap - 1 else "Chiudi con l'open loop.")
    return gemini_json(
        f"""Lingua: {cfg['language']}. Storia: {outline['title']}. Personaggi: {outline['characters']}.
Capitolo {idx+1}/{n_chap}: {ch}. Riassunto finora: {prev_summary or '(inizio)'}.
{STORY_RULES}
{hook_note} {end_note}
Scrivi circa {per_chap} parole di NARRAZIONE parlata, divise in scene da MAX {cfg['scene_max_words']} parole ciascuna
(ogni scena = un'immagine, circa 8-12 secondi di voce). Per ogni scena dai un prompt immagine IN INGLESE: azione, luogo,
inquadratura (close-up/wide/over-the-shoulder), emozione, luce. NON descrivere l'aspetto dei personaggi (lo aggiungo io);
indica in "characters" i nomi presenti.
Rispondi JSON: {{"summary":"riassunto 2 frasi","scenes":[{{"narration":"","image_prompt":"","characters":["nome"]}}]}}""")


def build_script(cfg: dict, topic: dict) -> dict:
    outline = make_outline(cfg, topic)
    scenes, summary = [], ""
    for i in range(len(outline["chapters"])):
        ch = write_chapter(cfg, outline, i, summary)
        summary += " " + ch.get("summary", "")
        for s in ch["scenes"]:
            s["chapter"] = i
            scenes.append(s)
    outline["scenes"] = scenes
    return outline


def full_image_prompt(cfg: dict, outline: dict, scene: dict) -> str:
    visuals = {c["name"]: c["visual"] for c in outline.get("characters", [])}
    chars = "; ".join(f"{n}: {visuals[n]}" for n in scene.get("characters", []) if n in visuals)
    return f"{scene['image_prompt']}. {chars}. Style: {cfg['visual_style']}"
