# Loadout — video design system

Derived from the product brand (.impeccable.md): industrial workbench, dark variant.

## Colors

| Token | Hex | Use |
|---|---|---|
| bg | `#1B1916` | scene background (warm charcoal, never pure black) |
| bg-raised | `#26221C` | panels, cards |
| bg-sunken | `#14120E` | recessed areas, code |
| ink | `#ECE7DF` | primary text |
| ink-soft | `#A8A195` | secondary text |
| ink-faint | `#6E695F` | labels, dimmed chips |
| line | `#3A352D` | rules, borders |
| accent | `#E8662B` | safety orange — focal hits, numerals, fills |
| accent-deep | `#C8511A` | accent shading, gradients with accent |
| accent-wash | `#3A2417` | orange-tinted dark panels |
| ok | `#6FAE7E` | success ticks |

## Typography

- **IBM Plex Sans** — the voice. Weight contrast 300 vs 700 (extreme). Display tracking -0.03em.
- **IBM Plex Mono** — the data voice: paths, counts, SHAs, metadata. 400/500 only.
- Tension: engineered humanist sans (statements) vs terminal mono (machine truth) — the product's own register.

## Motion personality

Precise, fast, confident — dev-tool energy. Eases: expo.out / power4.out for stamps, power2.out for body, sine for ambient. No bounce/elastic.

## Don'ts

- No pure black/white, no blue/purple gradients, no glassmorphism, no neon glow walls
- Orange is the only saturated color on screen
- No rounded-blob shapes — corners are 4–10px, workbench-tight
