# Design system — "Evidence ledger"

The product is a research instrument for everyday decisions. The visual idea is a
**ledger**: white paper, pale-blue ruling, and stamped verdicts. Light blue and white
are the brand colours requested by the client.

## Colour tokens (`src/app/globals.css`)

| Token | Hex | Role |
| --- | --- | --- |
| `paper` | `#FFFFFF` | Page and reading surfaces |
| `mist` | `#F3F8FC` | Rails, wells, inactive surfaces |
| `rule` | `#D6E7F5` | Borders, ledger rules, dividers |
| `sky` | `#7CC0EC` | Brand light blue: fills, bars, highlights, focus |
| `sky-soft` | `#E4F2FC` | Selected rows, chips, hover wash |
| `cobalt` | `#1667A8` | Links and interactive text (AA on white) |
| `ink` | `#0E2236` | Primary text (navy ink, not grey-black) |
| `slate` | `#4D6378` | Secondary text |

Verdict colours (used only for verification states): supported `#1F8A6E`,
partial `#B7791F`, unsupported `#6B7A8A`, contradicted `#C2453D`, each with a soft tint.

## Type

- **Public Sans** — UI and headings. Civic, plain, trustworthy.
- **Source Serif 4** — quoted evidence and recommendation prose; quotes from sources
  are always serif italic so the eye separates *what a source said* from *what the AI says*.
- Monospace only where the data is literally machine data (hashes in the audit log).

Scale (rem): 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25 / 3.

## Principles

1. Rules, not boxes: lists of evidence are ruled rows, not stacks of identical cards.
2. Radius has hierarchy: panels 14px, controls 10px, chips fully round, ledger rows 0.
3. Shadows are rare and only for floating layers (popovers, drawers).
4. Sentence case everywhere; no all-caps eyebrows, no arrows appended to buttons.
5. Motion answers actions: re-ranking animates when weights change; research progress
   reveals rows as they are verified. No decorative entrance animations.
6. Every number has provenance one click away.
7. Accessible by default: visible focus ring (sky), 4.5:1 text contrast, reduced motion respected.
