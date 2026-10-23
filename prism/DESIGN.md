# PiResearch Prism: a CoForge-native frontend

The third PiResearch frontend. It keeps Galaxy's star-map idea but speaks CoForge's visual
language, so it can sit inside a CoForge content card without looking foreign. Galaxy is deep space
(dark, bloom, neon); Prism is a **readable star map on CoForge's white page** (SVG + DOM, no WebGL on
the study page), with the dark theme following CoForge's own dark mode.

Ground rules (from the project owner):
- `constellation/` (2D), `galaxy/`, every backend API, the Dockerfile, Caddy and deploy config stay
  unchanged. Prism is purely additive and lives in `prism/`.
- It reads the existing API only: `/api/history`, `/api/studies/<id>/{thumbnail,snapshot,node,report}`,
  `POST /api/questions`, `DELETE /api/studies/<id>`.
- `prism/serve.py` serves the bundle under `/prism/*` and forwards every other path unchanged to the
  existing `constellation.serve` (same pattern as `galaxy/serve.py`).

## 1. Stack

Vite + React 19 + TypeScript (strict), base `/prism/`. SVG and DOM only (no WebGL): the star map
and the home minis are SVG. Motion for DOM animation. Tailwind v4. zustand. react-markdown +
remark-gfm. Vitest for pure logic. Fonts self-hosted with `@fontsource-variable` (Inter, Noto Sans SC,
JetBrains Mono): no external requests. Icons: `@untitledui/icons` (MIT), the set CoForge uses.

## 2. What makes it native (the CoForge rules we follow)

Source: the CoForge repo, `apps/web/src/styles/coforge-theme.css` and `docs/design/*.md`.

- **Tokens, not hex.** `src/styles/tokens.css` defines CoForge's semantic tokens with CoForge's values;
  components use `bg-primary`, `bg-secondary`, `text-primary/secondary/tertiary/quaternary`,
  `border-secondary`, `bg-brand-solid`, `text-brand-secondary`, `bg-terminal` etc. Canvas / SVG code reads
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

## 3. Study page: the star map (`src/study/starmap/**`)

The research is a constellation, drawn flat. It is the server's own 2D layout (the one the classic
page shows), so it stays readable; what Prism adds is CoForge styling, crisp DOM text and motion.
There is no WebGL on this page: SVG for stars and lines, DOM for text, CSS for effects.

**Layout.** Node `x`, `y`, `radius` as the server sends them, goal near the centre. A single
transform `screen = world * k + (x, y)` fits the bounding box into the map area with padding
(`fitTransform`, deterministic, capped so a one-node study is not enormous). No tilt, no
perspective, text never skewed. Pan (drag, with momentum), zoom (wheel, pinch, `+` / `−` / fit
buttons bottom-right, key `F` fits), clamped so the map can never be dragged away. Selecting a star
glides it into the area the detail panel leaves free. The fit is followed on resize until the visitor
takes the camera.

**Nodes are CoForge avatar tiles.** A rounded square (radius = size / 4) in the agent tone
(`agentTone`) with the agent's initials and CoForge's violet gradient hairline frame. Task status is
the presence-dot idiom: a small dot bottom-right with a `bg-primary` separator ring, in the task
status colours. In-progress tiles carry a thin rotating blue→lavender beam, errors a thin red ring;
unassigned tasks are a dashed `?` tile, cancelled ones desaturated. Hover lifts the tile; selection
and keyboard focus draw a brand ring. The **goal is a compact card** (`bg-primary`, gradient
hairline, `shadow-lg`): prism mark, 研究问题, the question and a thin progress bar; on crowded maps
it steps down to a one-line card, a mini card, then a pill that expands on hover (`chooseGoalTier`).

**Labels** sit beside the tiles without boxes: the title in `text-sm font-medium` over a
`text-xs text-tertiary` line `T12 · 进行中 · 7 次调用`, on a soft blurred backdrop. Live calls are a
mono `text-brand-secondary` line with a caret. Placement (`labels.ts`) is greedy by priority over
candidate spots, avoiding tiles, other labels and the goal card, falling back to a compact `T<n>`
label, then hiding. A 250ms hover or focus opens a CoForge popover card (title, status, agents,
calls, latest step, relations).

**Edges.** `parent` edges are the constellation lines: always drawn, thin, neutral, gently curved,
with a slow dash flowing toward an in-progress child. Verification edges are hidden until asked for:

| Relation | Colour (`RELATION_HEX`) | Label |
|---|---|---|
| parent (touching the active star) | neutral `#afbccb`, thicker | 子任务 / 上级任务 |
| audit / fusion | indigo | 审核 |
| support | green | 支持 |
| challenge | orange | 挑战 |
| error | red, heavier | 指出错误 |

On hover or keyboard focus of a star, its edges are drawn on with arrowheads and labels, and
unrelated stars dim. The selection keeps its edges drawn (hover adds to it). The 核验透镜 (`V`)
draws every verification edge at once and dims the rest. Edge labels slide along their curve to
avoid each other (`spreadEdgeLabels`).

**Backdrop and motion.** Plain `bg-primary` with one soft violet glow behind the goal, CoForge's
sidebar gradient as a faint wash and a 24px dot grid that moves with the map and fades toward the
edges (a few specks in dark only). Parent lines are 1px hairlines with a 1px dot moving toward
in-progress children; the active star's lines turn into a violet gradient. Intro: tiles fade in from
0.96 by parent depth while lines draw on; status dots cross-fade. Everything eases with
`--ease-out-quint`; reduced motion makes it static.

**Keyboard.** Stars are a roving tab stop: arrows move to the nearest star in that direction
(`nav.ts`), Enter selects, Esc clears, `V` lens, `F` fit, `1` / `2` / `3` tabs, `?` help. Shortcuts
are ignored while typing, composing, or with a modifier held.

## 4. Study page chrome (`src/study/**`)

- **Header**: back button → `/prism/`, the question as the title, meta = phase + `R/N 已完成`. Tabs
  centred: 任务图 (star map) / 任务 (list, with count) / 报告 (disabled until a report exists).
  Actions: verification-lens toggle, export, the Galaxy / Prism / 2D switcher and theme.
- **Question strip** (任务图 tab, under the header): the full question clamped to two lines with
  展开; the phase chip; a segmented progress bar in status colours; the agent roster (avatars,
  hovering one lights its stars) with the count; one plain-language line
  (`summaryLine`: "6 个智能体在研究 · 15/30 已完成 · 2 处有错误 · 5 个工具调用进行中"); a secondary
  阅读报告 button when a report exists; and a small animated prism mark (SVG), the only remnant of the
  old glass prism.
- **Map overlays**: lens pill (top centre), zoom / fit group (bottom-right, moves with the panel or
  sheet), legend of the five status rings plus a one-line interaction hint (bottom-left).
- **Detail panel**: CoForge slideout, 400px on the right over the map (`bg-primary border-l
  border-secondary shadow-xl`, spring in). Header: status ring + title + close. Facts as CoForge field
  rows: 状态, 负责 (avatar + name), 工具调用, 关联 (relation chips that select the linked task),
  子任务. 备注 as prose. **工具步骤 as a dark terminal**: one line per step, live calls typed at the
  bottom with a caret. The goal's panel: the question, phase, progress bar, agent roster, report button.
- **任务 tab**: CoForge Activity-style full-width rows grouped by status under sticky headers, with
  the 44px toolbar (agent filter chips, status counters, legend). At `lg` the list narrows to a
  35rem column beside the panel.
- **报告 tab**: CoForge document typography, centred `max-w-3xl`, sticky table of contents on wide
  screens, a thin brand reading-progress bar, tables with `border-secondary` and `bg-secondary`
  headers. `react-markdown` loads lazily.
- **States**: loading (skeleton strip over a faint sky); missing study (empty state); a run with no
  graph yet ("正在等待派发任务", the strip alone over an empty sky); a goal-only or one-node study (the
  goal star centred with a hint); refresh-failed toast (CoForge toast: white card, `shadow-lg`).
  There is no WebGL branch on this page.
- **Mobile** (< `lg`): tabs drop to a second header row; the same map with pinch zoom starting
  fit-to-screen and compact `T<n>` chips; the detail panel becomes a bottom sheet and the selected
  star is centred above it.

## 5. Home (`src/home/**`)

A CoForge content page, no hero or slogan before the content (CoForge's task-first rule).

- **Header**: `深度研究` + meta `N 项进行中`; right: the Galaxy/Prism/2D switcher, the theme toggle
  and a secondary `新研究` that focuses the composer.
- **Composer**: CoForge's message-composer shape: one `rounded-xl` box, text on top, a toolbar
  below with the mono hint `⏎ 发送 · ⇧⏎ 换行` and the page's one primary button `开始研究`. Focus
  deepens the border; no coloured glow. The placeholder types example questions.
- **Toolbar**: tabs 全部 / 进行中 / 已完成 / 未完成 with counts, and a title search.
- **Studies**: a wrapping grid of CoForge cards. Each card's top is an SVG mini star map of its
  thumbnail (agent-tone tiles with status dots, the goal as a violet tile, hairline parent edges on
  a faint dot grid); below: title, status badge, a thin status-coloured progress bar with `R/N`, and
  the time in mono. Running studies carry a thin border beam; delete appears on hover or focus.
- **Submit**: the new card inserts at the top of the grid, then the page opens the study.
- **Delete**: CoForge confirm dialog (featured icon + grey description, `primary-destructive`
  confirm with loading); the card fades out and the grid reflows.
- **Empty / error**: CoForge empty state with example questions as chips; inline error banner.

No page uses WebGL any more.

## 6. URL flags (dev server only, as in Galaxy)

`?mockSubmit=1|error|network`, `?mockDelete=1|error`, `?mockEmpty=1`, `?navigate=0`, plus
`?theme=light|dark` (production too).

## 7. Embedding in CoForge

Load `/prism/?theme=<light|dark>` in an iframe inside a CoForge content card and post
`{type: "coforge:theme", theme}` when the user switches theme. The page fills the iframe
(`h-full`), has no sidebar of its own and matches CoForge's tokens, type and radii.
