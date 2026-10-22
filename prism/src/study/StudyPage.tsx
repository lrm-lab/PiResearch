// The study page (DESIGN.md §4): a full-height CoForge content page with no sidebar. Header with
// tabs (任务图 / 任务 / 报告), the 44px toolbar for map and list, and the content area holding
// the 3D scene, the task list or the report, plus the detail panel.

import { ArrowLeft, Dataflow03, File06, LinkExternal01, SearchLg } from "@untitledui/icons";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_BASE, classicStudyHref } from "../lib/api";
import { selectionHeading } from "../lib/heading";
import { useMediaQuery } from "../lib/media";
import { hasWebGL2 } from "../lib/webgl";
import { Button } from "../ui/Button";
import { DetailPanel, type PanelMode } from "./DetailPanel";
import { MapView, NoWebglState } from "./MapView";
import { keyAction, listOrder, noWebglFlag, searchWithTab, stepSelection, tabFromSearch, visibleTasks, type StudyTab } from "./model";
import { RefreshToast, RetryNotice, ShortcutsCard } from "./Notices";
import { EmptyState, LinkButton } from "./primitives";
import { DocSkeleton, ReportView } from "./ReportView";
import { useStudy } from "./store";
import { StudyHeader } from "./StudyHeader";
import { TaskList } from "./TaskList";
import { Toolbar } from "./Toolbar";
import { DESKTOP_QUERY, PANEL_WIDTH, useStudyUi } from "./ui";

export function StudyPage({ studyId }: { studyId: string }) {
  const mapAvailable = useMemo(() => hasWebGL2() && !noWebglFlag(window.location.search), []);
  const defaultTab: StudyTab = mapAvailable ? "map" : "tasks";
  // The first tab is decided before the first paint, so a no-WebGL page never mounts the scene.
  useState(() => {
    useStudy.getState().setTab(tabFromSearch(window.location.search) ?? defaultTab);
    useStudyUi.setState({ popover: null, sheet: "peek" });
    return null;
  });

  useEffect(() => useStudy.getState().startStudy(studyId), [studyId]);

  const view = useStudy((state) => state.view);
  const loadState = useStudy((state) => state.loadState);
  const error = useStudy((state) => state.error);
  const errorKind = useStudy((state) => state.errorKind);
  const tab = useStudy((state) => state.tab);
  const hasSelection = useStudy((state) => state.selectedId !== null);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [mapVisited, setMapVisited] = useState(tab === "map");

  useStudyShortcuts(mapAvailable);

  useEffect(() => {
    if (tab === "map") setMapVisited(true);
    useStudyUi.getState().setPopover(null);
    const search = searchWithTab(window.location.search, tab, defaultTab);
    if (search !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    }
  }, [tab, defaultTab]);

  // A `?tab=report` link to a study without a report falls back to the default tab.
  useEffect(() => {
    if (view && tab === "report" && !view.report) useStudy.getState().setTab(defaultTab);
  }, [view, tab, defaultTab]);

  const question = view?.ok ? (view.goal?.title ?? "").trim() : "";
  useEffect(() => {
    const previous = document.title;
    if (question) document.title = `${selectionHeading(question, true)} · PiResearch`;
    return () => {
      document.title = previous;
    };
  }, [question]);

  const onSheetHeight = useCallback((height: number) => setSheetHeight(height), []);

  const missing = !view && loadState === "error" && errorKind === "missing";
  const retrying = !view && loadState === "error" && errorKind === "retry";
  const noGraph = Boolean(view && !view.ok);
  const taskCount = view ? view.nodes.filter((node) => !node.goal).length : 0;

  const panelMode: PanelMode = !desktop ? "sheet" : tab === "tasks" ? "column" : "overlay";
  const rightInset = desktop && hasSelection && tab === "map" ? PANEL_WIDTH : 0;
  const bottomInset = !desktop && hasSelection && tab === "map" ? sheetHeight : 0;
  const showToolbar = !missing && !noGraph && tab !== "report";

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-primary text-primary">
        <StudyHeader studyId={studyId} mapAvailable={mapAvailable} taskCount={taskCount} />
        <AnimatePresence initial={false}>{retrying && <RetryNotice key="retry" message={error ?? ""} />}</AnimatePresence>

        {missing ? (
          <main className="flex min-h-0 flex-1 items-center justify-center py-16">
            <EmptyState icon={SearchLg} role="alert" title="找不到这项研究" description={error || "这条链接指向的研究不存在，可能已被删除。"}>
              <LinkButton href={APP_BASE} icon={ArrowLeft}>
                返回研究列表
              </LinkButton>
            </EmptyState>
          </main>
        ) : (
          <main className="relative flex min-h-0 flex-1 flex-col">
            {showToolbar && <Toolbar />}
            <div className="relative flex min-h-0 flex-1">
              {mapAvailable && mapVisited && !noGraph && (
                <MapView active={tab === "map"} rightInset={rightInset} bottomInset={bottomInset} />
              )}
              {tab === "map" && (
                <AnimatePresence>
                  {!view && mapAvailable && (
                    <motion.div
                      key="map-loading"
                      exit={{ opacity: 0, transition: { duration: 0.4 } }}
                      className="absolute inset-0 z-20 flex items-center justify-center bg-primary"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 animate-pulse [background-image:radial-gradient(var(--color-border-secondary)_1px,transparent_1.3px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]"
                      />
                      <span className="relative text-sm text-tertiary" role="status">
                        正在读取研究
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
              {tab === "map" && !mapAvailable && <NoWebglState studyId={studyId} />}
              {tab !== "report" && noGraph && <NoGraphState studyId={studyId} />}
              {tab === "tasks" && !noGraph && (
                <div className="relative flex min-h-0 flex-1">
                  <TaskList narrow={desktop && hasSelection} />
                  {desktop && <DetailPanel mode="column" />}
                </div>
              )}
              {tab === "report" &&
                (view ? (
                  <ReportView studyId={studyId} />
                ) : (
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <DocSkeleton />
                  </div>
                ))}
              {tab === "map" && desktop && !noGraph && <DetailPanel mode="overlay" />}
              {tab !== "report" && !desktop && !noGraph && <DetailPanel mode={panelMode} onSheetHeight={onSheetHeight} />}
              <ShortcutsCard raised={tab === "map" && desktop && mapAvailable} />
            </div>
          </main>
        )}
        <RefreshToast />
      </div>
    </MotionConfig>
  );
}

function NoGraphState({ studyId }: { studyId: string }) {
  const message = useStudy((state) => state.view?.message);
  const hasReport = useStudy((state) => Boolean(state.view?.report));
  const setTab = useStudy((state) => state.setTab);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-primary py-16">
      <EmptyState icon={Dataflow03} role="status" title="这份运行没有任务图" description={message || "这次运行没有留下可以展示的任务。"}>
        <LinkButton href={classicStudyHref(studyId)} icon={LinkExternal01}>
          经典视图
        </LinkButton>
        {hasReport && (
          <Button color="primary" iconLeading={File06} onClick={() => setTab("report")}>
            阅读报告
          </Button>
        )}
      </EmptyState>
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/** Page shortcuts (model.ts keyAction): V lens · F goal · R overview · Esc · ? · 1/2/3 · ↑/↓ J/K. */
function useStudyShortcuts(mapAvailable: boolean) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const study = useStudy.getState();
      const ui = useStudyUi.getState();
      const action = keyAction(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          isComposing: event.isComposing,
          repeat: event.repeat,
          defaultPrevented: event.defaultPrevented,
          typing: isTyping(event.target),
        },
        { tab: study.tab, hasReport: Boolean(study.view?.report), mapAvailable },
      );
      if (!action) return;
      switch (action.kind) {
        case "escape":
          if (ui.popover) ui.setPopover(null);
          else if (study.selectedId) study.select(null);
          else return;
          break;
        case "help":
          ui.togglePopover("help");
          break;
        case "lens":
          if (!study.view?.ok) return;
          study.toggleLens();
          break;
        case "core":
          study.emitCamera({ kind: "core" });
          break;
        case "overview":
          study.emitCamera({ kind: "overview" });
          break;
        case "tab":
          study.setTab(action.tab);
          break;
        case "step": {
          // Arrow keys inside the panel (terminal, long lists) keep scrolling it.
          if (event.target instanceof Element && event.target.closest("aside, [role=log]")) return;
          const order = listOrder(visibleTasks(study.view, study.hiddenAgents));
          const next = stepSelection(order, study.selectedId, action.delta);
          if (!next) return;
          study.select(next);
          break;
        }
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapAvailable]);
}
