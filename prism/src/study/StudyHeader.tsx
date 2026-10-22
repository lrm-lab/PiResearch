// Study page header (DESIGN.md §4): back, the question, phase + progress meta, centred tabs, and
// the map actions (verification lens, recentre) plus the 2D page link.

import { ArrowLeft, Dataflow03, File06, LinkExternal01, Maximize02, Rows01, SearchRefraction } from "@untitledui/icons";
import { goalActivity, phaseLabel, progress } from "../lib/activity";
import { APP_BASE, classicStudyHref } from "../lib/api";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { PageHeader } from "../ui/PageHeader";
import type { StudyTab } from "./model";
import { LinkButton, Skeleton, Tooltip } from "./primitives";
import { useStudy } from "./store";
import { StudyTabs, type StudyTabItem } from "./StudyTabs";

export function StudyHeader({
  studyId,
  mapAvailable,
  taskCount,
}: {
  studyId: string;
  mapAvailable: boolean;
  taskCount: number;
}) {
  const view = useStudy((state) => state.view);
  const loadState = useStudy((state) => state.loadState);
  const errorKind = useStudy((state) => state.errorKind);
  const tab = useStudy((state) => state.tab);
  const setTab = useStudy((state) => state.setTab);
  const lens = useStudy((state) => state.lens);
  const toggleLens = useStudy((state) => state.toggleLens);
  const emitCamera = useStudy((state) => state.emitCamera);

  const back = (
    <LinkButton href={APP_BASE} color="tertiary" icon={ArrowLeft} iconOnly className="-ml-2">
      返回研究列表
    </LinkButton>
  );

  if (!view && loadState === "error" && errorKind === "missing") {
    return <PageHeader leading={back} title="找不到这项研究" />;
  }

  const question = view?.ok ? (view.goal?.title ?? "").trim() : "";
  const title = view ? (
    <span
      title={question || undefined}
      className="block truncate @3xl:max-w-[calc(50cqw-14rem)] @6xl:max-w-[calc(50cqw-25.5rem)]"
    >
      {question || "这份运行没有任务图"}
    </span>
  ) : (
    <Skeleton className="h-5 w-[min(22rem,50vw)]" />
  );

  const hasReport = Boolean(view?.report);
  const items: StudyTabItem<StudyTab>[] = [
    { id: "map", label: "任务图", icon: Dataflow03, hint: "3D 任务图", shortcut: "1" },
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

  const mapActions = tab === "map" && mapAvailable && Boolean(view?.ok);
  const lensUsable = tab !== "report" && Boolean(view?.ok);

  return (
    <PageHeader
      leading={back}
      title={title}
      meta={view?.ok ? <StudyMeta /> : undefined}
      tabs={<StudyTabs items={items} value={tab} onChange={setTab} label="研究视图" />}
      actions={
        <>
          <Tooltip label={lens ? "关闭核验透镜" : "核验透镜：突出审核、支持、挑战和错误"} shortcut="V" align="end">
            <Button
              color="secondary"
              iconLeading={SearchRefraction}
              aria-label="核验透镜"
              aria-pressed={lens}
              aria-keyshortcuts="V"
              disabled={!lensUsable}
              onClick={toggleLens}
              className={cx(lens && "bg-brand-primary! text-brand-secondary! ring-brand-300! dark:ring-brand-700!")}
            />
          </Tooltip>
          <Tooltip label="回到全景" shortcut="R" align="end">
            <Button
              color="secondary"
              iconLeading={Maximize02}
              aria-label="回到全景"
              aria-keyshortcuts="R"
              disabled={!mapActions}
              onClick={() => emitCamera({ kind: "overview" })}
            />
          </Tooltip>
          <LinkButton href={classicStudyHref(studyId)} icon={LinkExternal01} className="max-sm:w-9 max-sm:px-0" aria-label="经典视图">
            <span className="max-sm:sr-only">经典视图</span>
          </LinkButton>
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
