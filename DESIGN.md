# BeeMath · Design Context

Read this before changing any UI. The values in it come from `css/style.css` (`:root`).

## Product
- **What it is:** a web app (PWA) for learning one-variable equations, built for Thai students in Mathayom 1 (ม.1, age 12–13). It plays like a game in the style of Duolingo: a learning path, XP, streaks, hearts, leagues, quests, friends and classrooms.
- **Users:**
  - Students, mostly on phones, sometimes on school Chromebooks or tablets.
  - Teachers, who use the dashboard on desktop.
- **Language:** all interface text is Thai. Math is written with the usual conventions (italic *x*, the symbols + − × ÷ =).

## Direction
- **The "Honeycomb" theme is a deliberate choice:**
  - honey colours
  - hexagons as the shape language (`clip-path: var(--hex)`) for path nodes, icons and avatars
  - the bee mascot "น้องผึ้ง"
- **Warm, friendly and playful, but not childish.** It should feel like a good learning game, not a marketing landing page.
- **Clarity of the math comes first.** Equations are large and easy to read. Animation must never get in the way of solving.

### Must keep
- Honey palette and hexagons. These are the brand identity, not decoration to remove.
- Mitr (headings) and Anuphan (body), both Thai fonts.
- *x* in italic Fraunces (`.math` / `--var`). This is the standard way to write a variable, not an "italic serif display headline".
- The bar model (yellow *x* tiles `--tile-x`, blue number tiles `--tile-n`), used throughout the lessons.

### Must avoid
- Purple or cyan gradients, dark SaaS-style themes, glowing neon accents.
- Glassmorphism, gradient text, background halos or glows.
- Bounce or elastic easing on everyday actions.
- English marketing copy or slogans.
- Em dashes in Thai copy (separate items with `·` instead).

## Unit colours
Units are told apart by honey that deepens as the course goes on, not by a rainbow: unit 1 `#FFE08A` → 2 `#FFD24D` → 3 `#FFC21A` → 4 `#F5A623` → 5 `#E8890C` → 6 `#D9730D`, all with `--ink` text. Green stays reserved for "correct / current", blue for links and selection; no purple or teal anywhere.

## Colour tokens
| Role | Token | Value |
|---|---|---|
| Page background | `--bg` | `#FFF8E6` |
| Card | `--card` | `#FFFFFF` |
| Primary (honey) | `--honey` / `--honey-dark` / `--honey-soft` / `--honey-text` | `#FFC21A` / `#E09A00` / `#FFF0C2` / `#7A4E00` |
| Text | `--ink` / `--ink-2` | `#2A1F14` / `#6B5B45` |
| Lines | `--line` / `--line-2` / `--track` | `#F0E2BF` / `#F5EBD2` / `#F3E8CC` |
| Correct / proceed | `--green` / `--green-dark` / `--green-text` / `--green-soft` | `#58C23A` / `#3E9A25` / `#2B6A17` / `#E8F8E0` |
| Secondary / links | `--blue` / `--blue-dark` / `--blue-soft` | `#2F6FED` / `#1E4FB8` / `#E3EDFF` |
| Wrong / danger | `--red` / `--red-btn` / `--red-text` / `--red-soft` | `#E5484D` / `#C9343A` / `#A3262B` / `#FFE5E5` |
| Hearts / streak | `--heart` / `--orange` / `--orange-text` | `#F0484E` / `#FF7A1A` / `#B84A00` |
| Locked | `--locked` / `--locked-dark` / `--locked-ink` | `#EAE3D4` / `#CFC6B3` / `#8C8070` |
| Variable *x* | `--var` (large: the main equation, the `x =` answer label) / `--var-text` (every other size) | `#B87A00` / `#8F5E00` |
| Bar model | `--tile-x` / `--tile-n` | `#FFD84D` / `#A9DCFF` |

Secondary shades used in more than one place (dashed answer slots, hover, row tints, soft warnings and so on) also live as tokens in `:root`, for example `--dash`, `--hover`, `--peach-soft`/`--peach-text` and `--green-zone`. CSS outside `:root` should contain no hex values except `#fff`, `#000` and the Google button's brand colours. In JS, inline styles use `var(--token)`; only content data such as units, badges, shop items, avatars and illustrations keeps its own hex values.

Text on a coloured background uses that colour's `-text` / `-ink` token, never neutral grey.
`--var` passes only the large-text threshold (3.6:1 on white). A small *x* must use `--var-text`, which is at least 4.5:1 on white, the red/green feedback sheets and honey-soft.

## Type
- **Headings:** `--head` (Mitr 500/600). Digits 0–9 in this stack come from `BeeDigits`, an Anuphan digits-only subset in `fonts/` (Mitr's zero has a slash and reads as Ø in equations). Never set equations or numbers in Mitr directly.
- **Body:** `--body` (Anuphan 400–700), base 16px, line-height 1.5. Thai needs more line height than Latin script.
- **Main sizes in use:**
  - 13 / 14 / 15 / 16 / 18 / 20 / 22 / 24 / 28 / 32px (13px is the floor), plus 40 and 46px for display
  - equation (`.eq-big`) up to 40px, scaled down with the viewport (`min(40px, 10.5vw)`, smaller under `.text-l`/`.text-xl` because those zoom the block)
- Settings let users enlarge text (`.text-l`, `.text-xl`). New UI must still work at those sizes.

## Shape and depth
- **Hexagons:** path nodes, icons, badges, and every avatar (leaderboard, friends, teacher table, profile). No circular avatars.
- **Radius scale** (tokens in `:root`, do not write px):
  - `--r-xs` 6px and `--r-sm` 10px: small parts such as slots, calendar cells and tags
  - `--r-md` 14px: buttons, inputs, small cards
  - `--r-lg` 18px and `--r-xl` 22px: cards
  - `--r-sheet` 28px: top of sheets and the answer bar
  - `--r-pill`: pills and chips
  - Only 2–4px for tiny details (confetti, speech-bubble tails, kbd)
- **Buttons:** a thicker bottom border (`border-bottom: 4px`) gives a pressable feel, as in a game.
- **Shadows:** keep them few and soft.

## Motion
- **Entrance animations** run only when the scene changes (`#app[data-enter]`, `sceneKey()`), never on every render.
- **No endless decoration:** loops are only allowed on things that show live state, such as the glow around the current node, the low-time timer or a chest that can be opened. Decorative effects run a few times and stop (the progress-bar shine runs twice, the streak flame three times).
  - Exception, asked for by the product owner: the 3D bee on the Learn path and in the profile avatar keeps moving (bob, sway, look around, flapping) after its intro. It draws at most 30 frames a second, skips frames while off screen, stops with the tab hidden, and is gone under reduced motion or with 3D turned off.
- **Respect reduced motion:** both `prefers-reduced-motion` and the in-app setting (`.reduce-motion`).
- **3D** (`js/fx3d.js`, three.js loaded on demand), two kinds that never share a renderer: *celebrations* at moments worth celebrating (a correct answer, finishing a lesson or test, a streak milestone, a league result, opening a chest), and *page scenes*, one per page (the current path node and the bee beside it on Learn, the bee in the profile avatar, the flame on the Streak page). Page scenes play an intro when the page opens (or when the current node changes), then hold still; re-renders move the still frame along; tapping the path bee makes it flip once. The 2D elements stay in the DOM underneath (faded, still tappable), so taps and screen readers behave the same. Each scene plays once for 1–3.5s, then stops drawing (the last frame stays, or the floating stage is removed). Same look as the 2D brand: toon shading with dark outlines, hexagons point-up, the honey palette, the round front-facing bee. Off under reduced motion, without WebGL, on low-memory devices, or when the user turns off "เอฟเฟกต์ 3 มิติ" in Settings; the 2D version stays as the fallback.

## Layout
- **Breakpoints:**
  - below 700px: phone, bottom tab bar
  - 700–1099px: side nav
  - 1100px and up: side nav plus right rail
- **Phone width:** side gutter 16px, no horizontal page scroll.

## Screens that must feel authored, not templated
- **Practice:** one coach card where the bee names the weakest topic with a real sample equation and one button; other options are secondary rows; topics fold away. No grid of identical tiles.
- **Wrong answers:** the headline names the likely mistake from the student's number (`wrongNote()` in `js/app.js`); "เกือบแล้ว" only when off by 1.
- **Out of hearts:** say what was solved, point to the topic to review, never send a struggling learner to the shop.
- **Teacher dashboard:** a sentence about today and "what to reteach" with sample equations, not KPI tiles; its own side nav without student game items.
- **Lesson complete:** celebrate the math first. Show the hardest equation the student just solved (`L.best`), then the stats as one quiet row with hairline dividers, then rewards. Confetti stays in the hero band and never crosses the headline.
- **Learn path:** only the bee speaks at the current node (`nudge()`), and its line tells the student what to do. No second "start" tag.
- **Badges:** one system called "เหรียญตรา" with five levelled badges (`LEVEL_BADGES`) plus three one-time special badges (`BADGES`). The result screen announces both new badges and level-ups.

## Copy
- Short, friendly, speaks directly to the student (for example "ผิดได้ เรียนรู้ได้"). Encourages without talking down.
- Number errors must be correct. Math in explanations is generated from the question's own numbers, never invented.
- One idea per caption. Do not chain clauses with " · "; that separator is only for short metadata such as "บทที่ 2 · บวกและลบ". Long rules belong behind a `<details>` (see the shop).
- No engineer words in student-facing copy: say "บันทึก" or "ไม่มีอินเทอร์เน็ต", not "ซิงก์", "คลาวด์", "เซิร์ฟเวอร์" or "ออฟไลน์".
- Keep a number with its unit (`.nowrap`), e.g. "8 ชม." or "50 น้ำหวาน".

## Loading
- Fraunces is requested only for a–z (`&text=`), because it is used only for italic variables.
- Supabase loads immediately only for people who have signed in before or are returning from sign-in. Guests load it when the browser is idle, or as soon as they open a page that needs an account.

## Sound
- **Sound effects** are synthesised (`js/sounds.js`, no files) and follow Settings › เสียงประกอบ and the volume slider.
- **Music** (`audio/bgm.m4a`, AAC ~96 kbps, looped) starts on the first tap (browser autoplay rules), plays at 35% of the volume slider, drops to about half that during questions, and pauses when the app is hidden. The music chip next to hearts toggles it; Settings › เพลงประกอบ is the same switch.
