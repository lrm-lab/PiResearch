// Study page header (DESIGN.md §4): back, the question, phase + progress meta, centred tabs, and
// export and the Galaxy / Prism / 2D and theme controls.

import { ArrowLeft, Dataflow03, File06, Rows01 } from "@untitledui/icons";
import { goalActivity, phaseLabel, progress } from "../lib/activity";
import { APP_BASE } from "../lib/api";
import { cx } from "../ui/cx";
import { HeaderControls } from "../ui/HeaderControls";
import { PageHeader } from "../ui/PageHeader";
import { Wordmark } from "../ui/Wordmark";
import { ExportMenu } from "./ExportMenu";
import type { StudyTab } from "./model";
import { LinkButton, Skeleton } from "./primitives";
import { useStudy } from "./store";
import { StudyTabs, type StudyTabItem } from "./StudyTabs";

export function StudyHeader({
  studyId,
  taskCount,
}: {
  studyId: string;
  taskCount: number;
}) {
  const view = useStudy((state) => state.view);
  const loadState = useStudy((state) => state.loadState);
  const errorKind = useStudy((state) => state.errorKind);
  const tab = useStudy((state) => state.tab);
  const setTab = useStudy((state) => state.setTab);

  const back = (
    <>
      <LinkButton href={APP_BASE} color="tertiary" icon={ArrowLeft} iconOnly className="-ml-2">
        返回研究列表
      </LinkButton>
      <Wordmark />
    </>
  );

  if (!view && loadState === "error" && errorKind === "missing") {
    return <PageHeader leading={back} title="找不到这项研究" actions={<HeaderControls studyId={studyId} />} />;
  }

  const question = view?.ok ? (view.goal?.title ?? "").trim() : "";
  const title = view ? (
    <span
      title={question || undefined}
      className="block truncate @3xl:max-w-[calc(50cqw-14rem)] @6xl:max-w-[calc(50cqw-25.5rem)]"
    >
      {question || (view.running === false ? "这份运行没有任务图" : "正在等待派发任务")}
    </span>
  ) : (
    <Skeleton className="h-5 w-[min(22rem,50vw)]" />
  );

  const hasReport = Boolean(view?.report);
  const items: StudyTabItem<StudyTab>[] = [
    { id: "map", label: "任务图", icon: Dataflow03, hint: "星图：任务与它们的关系", shortcut: "1" },
    { id: "tasks", label: "任务", icon: Rows01, badge: view ? taskCount : undefined, hint: "任务列表", shortcut: "2" },
    {
      id: "report",
      label: "报告",
      icon: File06,
      disabled: !hasReport,
      hint: hasReport ? "研究报告" : view ? "这份运行还没有报告" : "正在读取",
      shortcut: "3",
    },
  ];

  return (
    <PageHeader
      leading={back}
      title={title}
      meta={view?.ok ? <StudyMeta /> : undefined}
      tabs={<StudyTabs items={items} value={tab} onChange={setTab} label="研究视图" />}
      actions={
        <>
          <ExportMenu />
          <HeaderControls studyId={studyId} />
        </>
      }
    />
  );
}

/** "● 调研中 · 15/30 已完成". Planning and finalising shimmer; a running study gets a live dot. */
function StudyMeta() {
  const view = useStudy((state) => state.view);
  const activity = goalActivity(view);
  const running = view?.running === true;
  const { resolved, total } = progress(view);
  return (
    <span className="inline-flex items-center gap-2 @3xl:@max-6xl:hidden" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-1.5">
        {running && !activity && (
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-status-progress opacity-60 motion-reduce:hidden" />
            <span className="relative size-2 rounded-full bg-status-progress" />
          </span>
        )}
        <span className={cx(activity && "prism-shimmer text-brand-secondary")}>{phaseLabel(view)}</span>
      </span>
      <span aria-hidden="true" className="text-quaternary">
        ·
      </span>
      <span className="tabular">
        {resolved}/{total} 已完成
      </span>
    </span>
  );
}
