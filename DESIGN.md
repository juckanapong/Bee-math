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

Text on a coloured background uses that colour's `-text` / `-ink` token, never neutral grey.
`--var` passes only the large-text threshold (3.6:1 on white). A small *x* must use `--var-text`, which is at least 4.5:1 on white, the red/green feedback sheets and honey-soft.

## Type
- **Headings:** `--head` (Mitr 500/600).
- **Body:** `--body` (Anuphan 400–700), base 16px, line-height 1.5. Thai needs more line height than Latin script.
- **Main sizes in use:**
  - 13 / 14 / 15 / 16 / 18 / 22 / 26 / 32px
  - equation (`.eq-big`) about 40px
- Settings let users enlarge text (`.text-l`, `.text-xl`). New UI must still work at those sizes.

## Shape and depth
- **Hexagons:** path nodes, icons, avatars, badges.
- **Main radius scale:**
  - 14px: buttons, inputs, small cards
  - 18–22px: cards
  - 28px: top of sheets and the answer bar
  - 999px: pills and chips
- **Buttons:** a thicker bottom border (`border-bottom: 4px`) gives a pressable feel, as in a game.
- **Shadows:** keep them few and soft.

## Motion
- **Entrance animations** run only when the scene changes (`#app[data-enter]`, `sceneKey()`), never on every render.
- **Respect reduced motion:** both `prefers-reduced-motion` and the in-app setting (`.reduce-motion`).

## Layout
- **Breakpoints:**
  - below 700px: phone, bottom tab bar
  - 700–1099px: side nav
  - 1100px and up: side nav plus right rail
- **Phone width:** side gutter 16px, no horizontal page scroll.

## Copy
- Short, friendly, speaks directly to the student (for example "ผิดได้ เรียนรู้ได้"). Encourages without talking down.
- Number errors must be correct. Math in explanations is generated from the question's own numbers, never invented.

## Known debt (from documenting, not yet fixed)
- **Corner radii:** 10 different values (3–28px); should be reduced to the scale above.
- **Font sizes:** 16 different values, including 11–12px (in chips, small labels, some captions). Check their readability on phones.
