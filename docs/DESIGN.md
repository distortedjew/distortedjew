# Wisp design system

Wisp is one-tap chat with a stranger. The design has one idea: **two lights**.
A will-o'-the-wisp is a small light in the dark; a match is your light meeting
someone else's.

- **Violet is always you.** Your messages, your primary buttons, your dot.
- **Mint is always them.** Their messages, "online", the matched dot.

Never use either color as decoration. If something is violet, it's yours or
it's the main action.

## Color

Defined as CSS variables in `src/app/globals.css` (light and `.dark`).

| Token | Light | Dark | Use |
|---|---|---|---|
| `foreground` (ink) | `#1D1838` | `#EEEAFB` | Text |
| `background` (paper) | `#F4F3F9` | `#141126` | Page |
| `card` | `#FFFFFF` | `#1C1834` | Panels, inputs |
| `primary` (violet) | `#6B4EFF` | `#8C74FF` | You, main actions |
| `glow` (mint) | `#2BD4A0` | `#3BE3B0` | Them, online, live |
| `accent` | `#E7E2FF` | `#2C2650` | Hover, selected, icon tiles |
| `border` / `input` | `#DEDAEA` / `#D6D1E6` | `#2D2849` / `#3A3459` | Rules, field outlines |
| `destructive` | `#D92D20` | `#F0645A` | Delete, block, danger |

No gradients, no blurred color blobs, no glass.

## Type

- **Bricolage Grotesque**, display only. Page titles use `.type-poster`:
  weight 760, width 86%, tight tracking, balanced wrapping. The headline is
  the design, so no colored or italic accent words inside it.
- **Atkinson Hyperlegible Next** for everything else, including chat. It's
  built for legibility, which matters when many conversations are in a
  second language.
- Form fields use 16px text so phones don't zoom in on focus.
- Sentence case everywhere. No all-caps labels, no eyebrow text above
  headings.

## Shape

Radius depends on the role (`--radius-*` in `globals.css`):

| Class | Size | For |
|---|---|---|
| `rounded-md` | 10px | Menu items, small controls |
| `rounded-lg` | 14px | Inputs, selects |
| `rounded-xl` | 18px | Cards, panels |
| `rounded-2xl` | 22px | Dialogs |
| `rounded-full` | pill | Buttons, chips, the message composer |

Message bubbles are 20px with one 6px "tail" corner on the sender's side.
No drop shadows except on menus, dialogs, and things floating over video.

## Layout

- Left-aligned by default. Centered only for single-purpose states
  (searching, chat ended).
- Content width `max-w-6xl` for marketing, narrower for app pages; page
  padding `px-5 sm:px-8`.
- Structure is information: rules separate list items, numbers only mark real
  sequences ("How it works", "After you report"). Prefer plain lists and
  rules over grids of identical cards.

## Motion

One orchestrated moment: the landing hero plays a short match-and-first-messages
sequence once, and shows its final state under `prefers-reduced-motion`.
Everything else moves only in response to the person (opening a menu,
sending a message). No fade-up entrances on sections.

## Words

- Say what happens, in plain words: "Start chatting", "Report sent",
  "They left the chat".
- Buttons don't get arrows. Meta lines use commas, not middle dots.
- Errors say what went wrong and what to do ("Couldn't reach Wisp. Check your
  connection and try again."), without apologizing.
- Empty screens point to the next action.
