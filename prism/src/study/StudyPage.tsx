// The study page (DESIGN.md §4): a full-height CoForge content page with no sidebar. Header with
// tabs (任务图 / 任务 / 报告); the map tab is the question strip over the star map, the list tab keeps
// its 44px toolbar; the detail panel slides over the map or sits beside the list.

import { ArrowLeft, Dataflow03, File06, LinkExternal01, SearchLg } from "@untitledui/icons";
import { AnimatePresence, MotionConfig } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { APP_BASE, classicStudyHref } from "../lib/api";
import { selectionHeading } from "../lib/heading";
import { useMediaQuery } from "../lib/media";
import { Button } from "../ui/Button";
import { DetailPanel, type PanelMode } from "./DetailPanel";
import { MapSkeleton, MapView } from "./MapView";
import { keyAction, listOrder, searchWithTab, stepSelection, tabFromSearch, visibleTasks } from "./model";
import { RefreshToast, RetryNotice, ShortcutsCard } from "./Notices";
import { EmptyState, LinkButton } from "./primitives";
import { QuestionStrip } from "./QuestionStrip";
import { DocSkeleton, ReportView } from "./ReportView";
import { useStudy } from "./store";
import { StudyHeader } from "./StudyHeader";
import { TaskList } from "./TaskList";
import { Toolbar } from "./Toolbar";
import { DESKTOP_QUERY, PANEL_WIDTH, useStudyUi } from "./ui";

export function StudyPage({ studyId }: { studyId: string }) {
  // The first tab is decided before the first paint.
  useState(() => {
    useStudy.getState().setTab(tabFromSearch(window.location.search) ?? "map");
    useStudyUi.setState({ popover: null, sheet: "peek", focusAgent: null });
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

  useStudyShortcuts();

  useEffect(() => {
    useStudyUi.getState().setPopover(null);
    const search = searchWithTab(window.location.search, tab, "map");
    if (search !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    }
  }, [tab]);

  // A `?tab=report` link to a study without a report falls back to the map.
  useEffect(() => {
    if (view && tab === "report" && !view.report) useStudy.getState().setTab("map");
  }, [view, tab]);

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
  const showToolbar = !missing && !noGraph && tab === "tasks";

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-primary text-primary">
        <StudyHeader studyId={studyId} taskCount={taskCount} />
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
            {tab === "map" && <QuestionStrip view={view} />}
            {showToolbar && <Toolbar />}
            <div className="relative flex min-h-0 flex-1">
              {tab === "map" && (!view ? <MapSkeleton /> : noGraph ? <MapSkeleton bare /> : <MapView view={view} rightInset={rightInset} bottomInset={bottomInset} compact={!desktop} />)}
              {tab === "tasks" && noGraph && <NoGraphState studyId={studyId} />}
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
              <ShortcutsCard raised={tab === "map" && desktop} />
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

/** Page shortcuts (model.ts keyAction): V lens · F fit · Esc · ? · 1/2/3 · ↑/↓ J/K in the list. */
function useStudyShortcuts() {
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
        { tab: study.tab, hasReport: Boolean(study.view?.report) },
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
        case "fit":
          ui.requestFit();
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
  }, []);
}
