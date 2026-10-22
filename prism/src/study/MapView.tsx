// 任务图 tab: the 3D scene fills the area; small overlays sit on top (zoom group bottom-right, a
// keyboard hint bottom-left, the lens pill top-centre). Overlay wrappers ignore the pointer so
// orbit/drag reach the canvas; only the controls themselves take clicks.

import { Keyboard01, Maximize02, Minus, Plus, Rows01, LinkExternal01, Monitor04 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense } from "react";
import { classicStudyHref } from "../lib/api";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { EASE_OUT, EmptyState, Kbd, LinkButton, Tooltip } from "./primitives";
import { useStudy } from "./store";
import { LensPill } from "./LensPill";
import { useStudyUi } from "./ui";

const StudyScene = lazy(() => import("../scene/StudyScene"));

export function MapView({
  active,
  rightInset,
  bottomInset,
}: {
  active: boolean;
  rightInset: number;
  bottomInset: number;
}) {
  return (
    <div
      className={cx("absolute inset-0 overflow-hidden", !active && "invisible")}
      aria-hidden={!active || undefined}
      inert={!active || undefined}
    >
      <Suspense fallback={<ScenePlaceholder />}>
        <StudyScene rightInset={rightInset} bottomInset={bottomInset} />
      </Suspense>
      <MapOverlays rightInset={rightInset} bottomInset={bottomInset} />
    </div>
  );
}

/** While the scene chunk loads: the page colour with the desk's dot grid fading in. */
function ScenePlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-primary">
      <span
        aria-hidden="true"
        className="absolute inset-0 animate-pulse [background-image:radial-gradient(var(--color-border-secondary)_1px,transparent_1.3px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]"
      />
      <span className="relative text-sm text-tertiary" role="status">
        正在搭建任务图
      </span>
    </div>
  );
}

function MapOverlays({ rightInset, bottomInset }: { rightInset: number; bottomInset: number }) {
  const emitCamera = useStudy((state) => state.emitCamera);
  const hasView = useStudy((state) => Boolean(state.view?.ok));
  const lens = useStudy((state) => state.lens);
  const toggleLens = useStudy((state) => state.toggleLens);
  const helpOpen = useStudyUi((state) => state.popover === "help");
  const togglePopover = useStudyUi((state) => state.togglePopover);
  if (!hasView) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute inset-x-0 top-3 flex justify-center px-4" style={{ paddingRight: rightInset ? rightInset + 16 : undefined }}>
        <AnimatePresence>{lens && <LensPill key="lens" onClose={toggleLens} floating />}</AnimatePresence>
      </div>

      <motion.div
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl bg-primary shadow-lg ring-1 ring-border-secondary"
        initial={false}
        animate={{ right: 16 + rightInset, bottom: 16 + bottomInset }}
        transition={{ type: "spring", stiffness: 420, damping: 42 }}
        role="group"
        aria-label="视角"
      >
        <ZoomButton label="放大" icon={Plus} onClick={() => emitCamera({ kind: "zoom", step: 1 })} />
        <span className="mx-2 h-px bg-[var(--color-border-secondary)]" aria-hidden="true" />
        <ZoomButton label="缩小" icon={Minus} onClick={() => emitCamera({ kind: "zoom", step: -1 })} />
        <span className="mx-2 h-px bg-[var(--color-border-secondary)]" aria-hidden="true" />
        <ZoomButton label="回到全景" shortcut="R" icon={Maximize02} onClick={() => emitCamera({ kind: "overview" })} />
      </motion.div>

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6, ease: EASE_OUT }}
        onClick={() => togglePopover("help")}
        aria-expanded={helpOpen}
        aria-haspopup="dialog"
        aria-keyshortcuts="?"
        data-help-trigger
        className={cx(
          "pointer-events-auto absolute bottom-4 left-4 hidden items-center gap-2 rounded-lg bg-primary/85 px-2.5 py-1.5 text-xs text-tertiary shadow-xs ring-1 ring-border-secondary backdrop-blur-sm outline-none transition hover:text-secondary focus-visible:outline-2 focus-visible:outline-focus-ring lg:flex",
          helpOpen && "text-secondary",
        )}
      >
        <Keyboard01 aria-hidden="true" className="size-4" />
        拖动旋转 · 滚轮缩放 · 右键平移
        <span className="text-quaternary">·</span>
        <span className="inline-flex items-center gap-1">
          <Kbd>?</Kbd> 快捷键
        </span>
      </motion.button>
    </div>
  );
}

function ZoomButton({
  label,
  shortcut,
  icon: Icon,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: typeof Plus;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} shortcut={shortcut} side="left">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex size-9 items-center justify-center text-fg-tertiary outline-none transition hover:bg-primary_hover hover:text-fg-secondary focus-visible:bg-primary_hover focus-visible:text-fg-secondary active:scale-95"
      >
        <Icon aria-hidden="true" className="size-5" />
      </button>
    </Tooltip>
  );
}

/** No WebGL2 (or `?nowebgl=1`): explain, and offer the list and the 2D page. */
export function NoWebglState({ studyId }: { studyId: string }) {
  const setTab = useStudy((state) => state.setTab);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center py-16">
      <EmptyState
        icon={Monitor04}
        title="这台设备显示不了 3D 任务图"
        description="浏览器没有开启 WebGL2。任务列表和报告不受影响，也可以打开经典的平面视图。"
      >
        <LinkButton href={classicStudyHref(studyId)} icon={LinkExternal01}>
          经典视图
        </LinkButton>
        <Button color="primary" iconLeading={Rows01} onClick={() => setTab("tasks")}>
          查看任务列表
        </Button>
      </EmptyState>
    </div>
  );
}
