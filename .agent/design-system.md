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

## UI components (as built)

- **Tokens** live in `src/app/globals.css` (`:root` variables + `@theme inline`), giving utilities such as
  `bg-paper`, `bg-mist`, `border-rule`, `text-ink`, `text-slate`, `bg-sky`, `bg-sky-soft`, `text-cobalt`,
  `rounded-panel` (14px), `rounded-control` (10px), `shadow-float`, and verdict colours `text-supported`,
  `bg-partial-soft`, etc. Helper classes: `.ledger-paper` (pale-blue ruling), `.hatch` (no-evidence cells),
  `mark.quote-mark` (quote highlight), `.weight-slider`, `.prose-chat`, `.skeleton`.
- Use arbitrary sizes (`text-[0.8125rem]`) rather than custom `text-*` size tokens inside `cn()`:
  tailwind-merge cannot tell custom size tokens from colours and would drop one of them.
- `src/components/ui/`: `button` (Button, ButtonLink, IconButton, `buttonClass`), `stamp` (verdict Stamp,
  StatusDot/StatusPill, Badge), `meter` (Meter, Gauge, ReliabilityInline), `tabs` (keyboard-navigable
  TabList/TabPanel), `drawer` (focus-trapped side drawer, Escape closes), `slider`, `notice` (Notice,
  SetupNotice, ApiErrorNotice which handles `not_configured`), `media` (Favicon, OptionThumb with lettered
  fallback for arbitrary-domain images), `skeleton`, `tooltip`.
- `src/components/shell/`: AppShell (rail + mobile drawer, `MotionConfig reducedMotion="user"`), AppData
  context (decision list + `/api/system`), Rail, Wordmark/LogoMark, SettingsView.
- `src/components/home/`: QuestionComposer (ruled composer + example chips), HowItWorks (5 steps).
- `src/components/workspace/`: `use-workspace.ts` (bundle loading, messaging, NDJSON research stream,
  debounced weight persistence, polling while a server run is active), `live-state.ts` (pipeline event
  reducer + stage copy), `dossier-context.tsx` (lookups, client-side `rankOptions`, drawer target),
  `chips.tsx` (ClaimChip/SourceChip for `[C:id]`/`[S:id]` citations), `conversation/*` (markdown with
  citation chips, follow-up question cards, composer), `dossier/*` (brief card, live research view with
  stepper + verification ledger, tabs Overview/Compare/Evidence/Sources/Conflicts & gaps/Audit, detail drawer).
- Typed API helpers and the NDJSON reader: `src/lib/client/api.ts`.
