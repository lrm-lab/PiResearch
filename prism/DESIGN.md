# PiResearch Prism: a CoForge-native 3D frontend

The third PiResearch frontend. It keeps the 3D spectacle of Galaxy but speaks CoForge's visual
language, so it can sit inside a CoForge content card without looking foreign. Galaxy is deep space
(dark, bloom, neon); Prism is a **lit desk diorama on CoForge's white page**, with the dark theme
following CoForge's own dark mode.

Ground rules (from the project owner):
- `constellation/` (2D), `galaxy/`, every backend API, the Dockerfile, Caddy and deploy config stay
  unchanged. Prism is purely additive and lives in `prism/`.
- It reads the existing API only: `/api/history`, `/api/studies/<id>/{thumbnail,snapshot,node,report}`,
  `POST /api/questions`, `DELETE /api/studies/<id>`.
- `prism/serve.py` serves the bundle under `/prism/*` and forwards every other path unchanged to the
  existing `constellation.serve` (same pattern as `galaxy/serve.py`).

## 1. Stack

Vite + React 19 + TypeScript (strict), base `/prism/`. three.js + React Three Fiber v9 + drei +
`@react-three/postprocessing`. Motion for DOM animation. Tailwind v4. zustand. react-markdown +
remark-gfm. Vitest for pure logic. Fonts self-hosted with `@fontsource-variable` (Inter, Noto Sans SC,
JetBrains Mono): no external requests. Icons: `@untitledui/icons` (MIT), the set CoForge uses.

## 2. What makes it native (the CoForge rules we follow)

Source: the CoForge repo, `apps/web/src/styles/coforge-theme.css` and `docs/design/*.md`.

- **Tokens, not hex.** `src/styles/tokens.css` defines CoForge's semantic tokens with CoForge's values;
  components use `bg-primary`, `bg-secondary`, `text-primary/secondary/tertiary/quaternary`,
  `border-secondary`, `bg-brand-solid`, `text-brand-secondary`, `bg-terminal` etc. Three.js code reads
  the mirrored constants in `src/lib/palette.ts`.
- **Theme follows the host.** `.dark-mode` on `<html>` (CoForge's class). Source order: `?theme=`,
  then a parent `postMessage({type:"coforge:theme", theme})`, then `prefers-color-scheme`
  (`src/lib/theme.ts`, `useTheme()`). There is no theme toggle in Prism.
- **No own sidebar.** The host has one. Every page is a CoForge content page: a 48px `PageHeader`
  (title left, tabs centred on the bottom border, actions right), content fills the rest.
- **Brand violet `#5d36dc` only** for selection, focus, links and the one primary action per surface.
  Status is semantic, decoration is grey.
- **Task status = CoForge task colours** (`src/lib/status.ts`): open → todo orange, in_progress →
  blue, resolved → done green, cancelled → closed grey; an incoming `error` edge → red. Drawn with
  CoForge's ring icon (`StatusIcon`): empty / half / full+check / full+cross.
- **Agents = CoForge avatars**: rounded squares on the six avatar tones (`--color-agent-1…6`) with the
  violet gradient hairline frame (`AgentAvatar`). The API `tone` key maps to a tone index
  (`agentTone()`).
- **Type**: Inter / Noto Sans SC / JetBrains Mono, only the eight steps (`text-xs … text-display-md`).
  Timestamps and counts get `tabular`. Code, tool calls and identifiers use `font-mono`.
- **Shapes**: buttons `rounded-lg` (36px `sm` default), cards `rounded-xl border-secondary shadow-xs`,
  brand panels `rounded-3xl`. No card islands for page-level panels; 1px `border-secondary` dividers.
- **Terminal blocks stay dark in both themes** (`bg-terminal`, traffic-light header), like the
  CoForge landing page.
- **Cool effects come from CoForge's own vocabulary**: the landing page's Prism animated gradient
  (`#0a0912 / #5d36dc / #c5bafe`), magicui's border beam, spell's shimmer text and blur reveal, the
  typing terminal. CSS versions are in `src/styles/effects.css` (`.prism-beam`, `.prism-shimmer`,
  `.prism-caret`, `.prism-avatar`).

Shared primitives (`src/ui/`): `Button`, `Badge`, `StatusIcon`, `AgentAvatar`, `Tabs`, `PageHeader`,
`cx`. Use them; do not restyle them per page.

## 3. Study page: the desk diorama (`src/scene/**`)

The research is a miniature model on a desk, seen from above at an angle, lit like a product render.

**Ground.** An infinite plane in `bg-primary`, with a faint dot grid (`border-secondary` dots) and a
soft radial tint under the centre (light `#f3f1ff`, dark `#21183b`), fading into fog of exactly the
page colour, so the desk has **no horizon and no edge**: it melts into the page.

**Layout.** The server's 2D layout (`x`, `y`, `radius`, goal near the centre) is lifted onto the
desk: `X = (x - goal.x) * s`, `Z = (y - goal.y) * s`. One scale `s` per snapshot, chosen from the
minimum pairwise centre distance so the widest card never overlaps a neighbour (≥ 15% gap), clamped.
Positions depend only on the snapshot, never on status, so nothing reshuffles while a run progresses.

**Goal = a glass prism.** A triangular glass prism at the origin (transmission material with
chromatic aberration) refracting a violet/lavender environment, slowly turning. From it, **spectrum
rays** fan out across the desk to each agent's hub card, white at the prism turning into that agent's
tone: the question is white light split into agents. While the run is planning or finalising
(`goalActivity`), light pulses through the prism and along the rays. Above it floats the question as
a CoForge card (DOM: `text-sm font-semibold`, phase chip with shimmer).

**Tasks = 3D CoForge cards.** Thin rounded slabs, the top face drawn on a canvas texture in CoForge
type: status ring + label, title (two lines), the agent avatar tile, `N 次调用` in mono. Under each
card a **stack of paper sheets** whose height grows with `step_count` (instanced). By status:

| Status | Card |
|---|---|
| open | Ghost: translucent, dashed outline, resting on the desk |
| in_progress | Floats above the desk and bobs; a **border beam** (blue → lavender) travels its edge |
| resolved | Rests, crisp, soft contact shadow |
| cancelled | Greyed, sunk, slightly tilted |
| error (incoming error edge, not resolved) | Red edge glow, small shake every few seconds |

Live tool calls float above their card as small dark terminal chips (`【执行】calc ratio.py`, mono,
typed with a caret); `【思考】` shows as a shimmering "正在想下一步".

**Relations** are drawn on the desk as flat light ribbons; verification relations get semantic colour:

| Relation | Look |
|---|---|
| parent | Thin neutral `#afbccb` curve; dashes flow toward a child that is in progress |
| audit / fusion | Indigo, dotted, a bright scan sweeping from reviewer to target |
| support | Green, solid, a travelling glow |
| challenge | Orange arch lifted off the desk, a bead travelling along it |
| error | Red, jagged, pulsing |

**Light & post.** Light theme: soft key light + hemisphere, contact shadows, ambient occlusion, a
gentle tilt-shift blur toward the top/bottom edges (the miniature look), SMAA. No bloom on white.
Dark theme: same scene, cards in `#171717` with luminous edges, mild bloom on beams/rays.
Quality `auto` drops AO / tilt-shift / bloom and DPR when frames are slow.

**Motion.** Intro: camera eases down from above; cards drop onto the desk in id order with a spring
and a ripple on landing, sheets fan in, relations draw on, the prism fades in last with a glint.
Hover lifts a card and highlights its relations. Click selects (brand-violet outline) and the camera
glides to frame it, offset for the detail panel. A new task drops in with a ripple; a status change
**flips the card** to reveal its new face. Idle: a very slow orbit drift that stops on interaction.
Reduced motion: no drift/bob/beam animation, transitions are instant.

**Camera.** Narrow FOV (~30°) for a near-isometric diorama; orbit with damping, polar angle limited
(looking down 35°–70°), zoom limits, right-drag pans. Keys: F goal, R overview, V lens, Esc deselect.

## 4. Study page chrome (`src/study/**`)

- **Header**: back button → `/prism/`, the question as the title, meta = phase + `R/N 已完成`. Tabs
  centred: 任务图 (3D) / 任务 (list, with count) / 报告 (disabled until a report exists). Actions:
  verification-lens toggle, recentre, `经典视图` (2D page).
- **Toolbar** (44px, map and list): agent filter chips (avatar + name, toggles), status counters
  (ring icon + count), relation legend popover.
- **Detail panel**: CoForge slideout, 400px on the right (`bg-primary border-l border-secondary
  shadow-xl`, spring in). Header: status ring + title + close. Facts as CoForge field rows (label
  `text-tertiary` left, value right): 状态, 负责 (avatar + name), 工具调用, 关联 (relation chips that
  select the linked task), 子任务. 备注 as prose. **工具步骤 as a dark terminal**: one line per step
  (`$ 【查询】…`, hint dimmed, detail expandable, errors red), live calls typed at the bottom with a
  caret. The goal's panel: the question, phase, a segmented progress bar in status colours, the agent
  roster, a button to the report.
- **任务 tab**: CoForge Activity-style full-width rows grouped by status (sticky group headers): ring
  icon, title, agent avatar + name, relation badges, call count in mono. Selecting a row opens the same
  detail panel; at `lg` the list narrows to a 35rem column.
- **报告 tab**: CoForge document typography, centred `max-w-3xl`, sticky table of contents on wide
  screens, a thin brand reading-progress bar, tables with `border-secondary` and `bg-secondary`
  headers. `react-markdown` loads lazily.
- **States**: skeleton while loading; missing-study empty state; refresh-failed toast (CoForge toast:
  white card, `shadow-lg`); no WebGL → the 任务 tab is the default and the map tab explains why.
- **Mobile** (< `lg`): tabs drop to a second header row, the detail panel becomes a bottom sheet.

## 5. Home (`src/home/**`)

- **Header**: `深度研究` + meta `N 项进行中`.
- **Hero**: a `rounded-3xl` brand panel with the CoForge landing gradient (WebGL2, paused under
  reduced motion; dark in both themes, like the landing page). Eyebrow in shimmer, a two-line
  blur-reveal headline, and the **composer**: a Slack-style rounded box (text on top, toolbar below,
  hint `⏎ 发送 · ⇧⏎ 换行` on the left, the page's one primary button `开始研究` on the right). The
  placeholder types example questions.
- **Studies**: sections 进行中 / 已完成 as a grid of CoForge cards. Each card's top is a live **3D
  mini-diorama** of its thumbnail (all minis share one WebGL canvas through drei `View`): small slabs
  in status colours on a dotted desk, thin relation lines, a tiny prism. Hover tilts the mini and
  lifts the card; running studies carry a border beam. Below: title, status badge, `R/N` and the time
  in mono. Hover shows a delete icon button.
- **Submit**: the primary button loads; on success a ghost card **crystallises out of the hero** and
  flies into the first grid slot, then the page navigates (cross-document view transition).
- **Delete**: CoForge confirm dialog (featured icon + grey description, `primary-destructive`
  confirm with loading). On success the card dissolves and the grid reflows.
- **Empty / error**: CoForge empty state with example questions as chips; inline error banner.

## 6. URL flags (dev server only, as in Galaxy)

`?mockSubmit=1|error|network`, `?mockDelete=1|error`, `?mockEmpty=1`, `?navigate=0`, plus `?nowebgl=1`
(production too) and `?theme=light|dark` (production too).

## 7. Embedding in CoForge

Load `/prism/?theme=<light|dark>` in an iframe inside a CoForge content card and post
`{type: "coforge:theme", theme}` when the user switches theme. The page fills the iframe
(`h-full`), has no sidebar of its own and matches CoForge's tokens, type and radii.
