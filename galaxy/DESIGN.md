# PiResearch Galaxy: 3D frontend design

A research run is a living galaxy you can fly into. As the agents work, the galaxy grows.

Ground rules (from the project owner):
- `constellation/` (2D pages, server, layout) and every backend API stay unchanged. The galaxy is purely additive and lives in `galaxy/`.
- It reads the existing API only: `/api/history`, `/api/studies/<id>/{thumbnail,snapshot,node,report}`, `POST /api/questions`, `DELETE /api/studies/<id>`.
- It is served by its own small server (`galaxy/serve.py`) that serves the built bundle under `/galaxy/*` and forwards every other path (`/api/*`, plus the 2D pages `/` and `/study/*`) unchanged to the existing `constellation.serve`.

Reference for the data and the 2D behaviour: `notes/2d-frontend-spec.md` (handoff spec, outside the repo) and `constellation/index.html`.

## 1. Stack

- Vite + React 19 + TypeScript (strict), base path `/galaxy/`.
- three.js + React Three Fiber v9 + drei (CameraControls, Html, Instances).
- WebGL2 renderer. Effects are custom GLSL `shaderMaterial`s plus `@react-three/postprocessing` (Bloom, Vignette, Noise, ChromaticAberration). WebGL is chosen over WebGPU so the pmndrs postprocessing stack works reliably.
- GSAP for camera and scene timelines; Motion for DOM panel transitions.
- Tailwind v4 for the HUD. zustand for app state.
- react-markdown + remark-gfm for the report.
- Vitest for pure logic.

## 2. Coordinates

The server lays out nodes in a 2D world (px; goal near the centre; `radius` grows with tool calls). The galaxy lifts that layout and does not invent its own, so it keeps the 2D invariants: deterministic, seeded by the question, goal at the centre, agent clusters together, nothing reshuffled by status or tool-count changes.

- `X = (x - goal.x) / 100`, `Z = (y - goal.y) / 100`.
- `Y` (disc thickness) = `-0.35 * (depth - 1) + 0.9 * (hash(goalTitle | clusterKey) - 0.5) + 0.25 * (hash(id) - 0.5)` for tasks, and 0 for the goal. `depth` is the parent-edge depth from the goal (1 for the goal's children). `clusterKey` is the node's first agent, or its id when it has no agent. `hash` is a stable FNV-1a in [0,1).
- Body radius `R = 0.12 + 0.0045 * radius` world units (goal: `0.55 + 0.004 * radius`).
- These values come from one pure function (`lib/space.ts`). Its outputs depend only on `id`, `x`, `y`, `radius`, parent edges and the goal title.

## 3. Visual language

Background: deep space `#05060a`. A far nebula shell (back-side sphere, fbm noise in indigo `#1b1f4a` / teal `#0d3b3f`, very low luminance), two star layers with parallax, and a slow dust spiral of about 18k points around the core in the disc plane (density falls off with radius, two log-spiral arms, rotates at 0.01 rad/s).

Agent tones (same keys as the 2D API `tone`): origin/cyan `#48d3e4`, green `#58d69a`, violet `#aa8cff`, amber `#f4c56a`, blue `#6d9cff`, teal `#7ddec8`, pending `#9eb0c2`.

Bodies by status:

| Status | Body | Motion |
|---|---|---|
| goal | Core star: plasma fbm surface shader in white→tone, fresnel corona sprite, point light. Strongest bloom. | Surface flows. When `goalActivity` gives `planning`/`finalizing`, an equatorial ring of light orbits it. |
| `open` | Dim protostar: soft noise nebula sprite in the tone colour at 35% alpha, tiny core. | Slow breathing (6 s). |
| `in_progress` | Accretion vortex: planet with a swirling spiral shader, a thin tilted particle disc, rim light in the tone colour. | Disc spins; brightness pulses at 1.6 s. |
| `resolved` | Stable star: smooth glowing sphere with a soft corona. | Gentle twinkle. |
| `cancelled` | Cooled ember: desaturated grey, low emissive, faint cracks. | None. |
| error | Any task targeted by an `error` edge and not yet `resolved` gets a red `#ff5a6a` flickering rim on top of its status look. | Flicker at 0.9 s. |

Tool-call satellites: each task gets `min(step_count, 48)` tiny instanced particles on 2–3 tilted orbits around it; more calls means denser orbits. Live calls (`node.live`) are brighter comets with short trails, each with a small label chip (`【执行】calc ratio.py`). `【思考】` shows as a slow-blinking comet with no chip.

Relations (edges `{from,to,relation}`), drawn as light:

| Relation | Look |
|---|---|
| `parent` | Thin curved gravity line (quadratic arc lifted toward +Y), tone colour at 30%, a faint flow pulse from parent to child. |
| `audit` / `fusion` | Cyan scanning beam: straight line with a bright segment sweeping from reviewer to target every 2.4 s. |
| `support` | Gold `#f4c56a` filament: solid, glowing, slight shimmer. |
| `challenge` | Comet arc: high arc in violet, a particle travels along it with a trail. |
| `error` | Red `#ff5a6a` jagged line (noise-displaced), pulsing. |

Post-processing: Bloom (mipmap blur, threshold about 0.6), Vignette, film grain scaled by pixel brightness (so empty space stays clean), ChromaticAberration toward the edges. Quality tiers: `high` (everything, 18k dust, DPR up to 2), `low` (no CA or grain, half bloom resolution, 6k dust, DPR 1). `auto` starts high and drops to low when the average frame time is over 22 ms for 3 s.

Typography: system fonts only. The question uses `"Songti SC","STSong","Noto Serif SC",serif`. UI uses `Inter,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif`. Tool labels use `ui-monospace,"SF Mono",Menlo,monospace`.

## 4. Interaction

- Camera: drei `CameraControls`. Orbit, zoom, pan; damping on. Idle auto-rotate at 0.04 rad/s around the core, stopping on any input and resuming after 8 s.
- Intro (first load): the camera starts far and steep and glides into the overview in 1.8 s.
- Select (click a body or its label, Enter on a focused label): the camera flies to frame the body (1.1 s, eased), the selected body brightens, its relations stay full strength, and everything else dims to 35%. The detail panel opens. Click empty space or press Esc to clear.
- Hover: the label pops up and the node's relations brighten.
- 核验透镜 (verification lens, toggle `V`): only `audit/support/challenge/error` edges and their endpoints stay lit; `parent` edges and other bodies dim.
- Keys: Tab/Shift+Tab move through node labels in id order. `F` or 回到主节点 flies back to the core. `R` resets the overview.
- Labels: every body has a DOM label (drei `Html`) that is a real `<button>` with `aria-label` "title，状态，N 次工具调用" (the goal: "R 项任务已完成，共 N 项"). Labels shrink with distance. Every ~120 ms they are decluttered in screen space by priority (goal > selected > hovered/focused > in progress or error > hub > others): a label overlapping a higher-priority one fades out and ignores the pointer, but stays in the DOM and in Tab order, and shows when focused. More labels appear as the camera moves closer.

## 5. HUD (DOM over the canvas)

Glass panels: `rgba(12,14,24,.55)` with `backdrop-filter: blur(18px) saturate(140%)`, a 1px hairline `rgba(255,255,255,.08)`, and an animated conic glow border on the active panel.

- Top bar: `PiResearch` brand (links to `/galaxy/`), the question (serif, one line, ellipsis), a phase chip (调研中 / 拆解问题中 / 整理报告中 / 汇总结果中 / 已结束), progress `已完成 R / N`, and buttons 报告 · 核验透镜 · 画质.
- Legend (bottom left): relation glyphs 子节点 审核 支持 挑战 错误, each a small animated swatch.
- Detail panel (right, 380px; a bottom sheet of `min(56dvh,480px)` at ≤900px): kicker 研究主问题/研究任务, heading (`selectionHeading`), a collapsible 完整问题/完整内容 pane with the character count, 状态, Agent, 备注, 子任务 (each clickable to fly there), 工具步骤 as a vertical signal trace (tool glyph, label, hint, detail, error in red, `×count` badge). Live calls pulse at the top of the trace.
- Report: 报告 starts a "landing": the camera dives into the core (0.9 s), the canvas fades to white, and a warm paper reader (`#f5f0e6`, ink `#1d1c1a`) rises in. Markdown supports GFM tables in horizontal scroll regions with sticky headers. Esc or × lands back in space.
- Empty or missing graph: the core shows alone with the message from the API (`没有星图` …). The galaxy never infers relations from trajectories.

All Chinese strings follow the 2D inventory (spec section 4.11).

## 6. Data and polling (same model as 2D)

- The study id comes from the URL: `/galaxy/study/<id>` (ids contain slashes), so the API prefix is `/api/studies/<id>`.
- Snapshot polling: `cache: "no-store"`, `If-None-Match` from the last ETag, 15 s timeout. The next poll is after `min(15000, 1000 * 2^failures)` ms. Polling stops once `running === false`, pauses while `document.hidden`, and refreshes on `visibilitychange`/`pageshow`. An unchanged `revision` skips the update.
- `/node?id=` is fetched only when a node is selected, and cached by `steps_revision`. A mismatch forces one snapshot refresh.
- The home page uses `/api/history?compact=1` and `/thumbnail` only.

## 7. Motion and accessibility

- `prefers-reduced-motion`: no intro flight, no auto-rotate, instant camera cuts, no comet trails or pulses, dust frozen, panel transitions are fades only.
- No WebGL: show a notice and a link to the 2D page `/study/<id>` on the main server.
- Panels and controls are keyboard reachable, with `focus-visible` rings. The detail panel is `<aside aria-label="节点详情">`. The report is `role=dialog aria-modal` with a focus trap.

## 8. Phases

1. Study page (this phase): scene, HUD, detail panel, report reader, polling, standalone server, and a minimal home list.
2. 3D home: each study a small floating galaxy, built from `/thumbnail`; the composer launches a new star and the camera flies into it in the same scene.
3. Optional, needs an owner decision: richer verification evidence, which would require API additions.
