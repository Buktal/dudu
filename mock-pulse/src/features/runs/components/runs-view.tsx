import {
  CheckCircle2Icon,
  FileTextIcon,
  HistoryIcon,
  ListFilterIcon,
  SquareIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { Notice } from "@/components/notice";
import {
  ResourceFilters,
  ResourceLibrary,
} from "@/components/resource-library";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { formatDateTime } from "@/lib/time";
import { setView } from "@/stores/app-slice";
import type { RunRecord } from "../model";
import { filterRuns, paginateRuns, runStatus, selectedRun } from "../selectors";
import { selectRun, setFilters, setPage } from "../stores/runs-slice";
import { RunPersistenceNotice } from "./run-persistence-notice";
import { RunStepDetail } from "./run-step-detail";
import {
  RunLanes,
  RunSummary,
  recordLanes,
  StatusBadge,
} from "./run-visualization";

const SOURCES = [
  { value: "all", label: "全部来源" },
  { value: "direct", label: "单条事件" },
  { value: "scenario", label: "平台剧本" },
  { value: "plan", label: "执行编排" },
];
type Outcome = "all" | "passed" | "failed" | "cancelled";

export function RunsView() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.runs);
  const [detail, setDetail] = useState<number | null>(null);
  const [source, setSource] = useState("all");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const rows = filterRuns(state.items, state.filters.query).filter(
    (item) =>
      (source === "all" || item.source === source) &&
      (outcome === "all" ||
        (outcome === "cancelled"
          ? item.cancelled
          : !item.cancelled && runStatus(item) === outcome)),
  );
  const page = paginateRuns(rows, state.page);
  const run = selectedRun(state);
  const title =
    run?.planName ||
    run?.scenarioName ||
    run?.steps[0]?.eventName ||
    "运行记录";
  const lanes = run ? recordLanes(run) : [];
  const statusOf = (record: RunRecord) =>
    record.cancelled
      ? "cancelled"
      : runStatus(record) === "passed"
        ? "success"
        : "failed";
  return (
    <ResourceWorkspace
      viewId="runs"
      libraryLabel="运行记录"
      library={(close) => (
        <ResourceLibrary
          title="运行记录"
          singular="运行"
          total={state.items.length}
          query={state.filters.query}
          onQuery={(query) => dispatch(setFilters({ query }))}
          filters={
            <>
              <Select
                items={SOURCES}
                value={source}
                onValueChange={(value) => {
                  if (value) {
                    setSource(value);
                    dispatch(setPage(1));
                  }
                }}
              >
                <SelectTrigger className="w-full" aria-label="运行来源筛选">
                  <ListFilterIcon />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {SOURCES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <ResourceFilters
                value={outcome}
                label="运行结果筛选"
                options={[
                  { value: "all", label: "全部" },
                  { value: "passed", label: "通过" },
                  { value: "failed", label: "失败" },
                  { value: "cancelled", label: "停止" },
                ]}
                onChange={(value) => {
                  setOutcome(value);
                  dispatch(setPage(1));
                }}
              />
            </>
          }
          entries={page.items.map((item) => ({
            id: item.id,
            name:
              item.planName ||
              item.scenarioName ||
              item.steps[0]?.eventName ||
              "运行记录",
            icon: item.cancelled ? (
              <SquareIcon />
            ) : runStatus(item) === "passed" ? (
              <CheckCircle2Icon className="text-success" />
            ) : (
              <XCircleIcon className="text-destructive" />
            ),
            description: `${formatDateTime(item.startedAt)} · ${item.cancelled ? "已停止" : runStatus(item) === "passed" ? "已通过" : "未通过"}`,
          }))}
          selectedId={run?.id ?? null}
          onSelect={(id) => {
            close();
            dispatch(selectRun(id));
            setDetail(null);
          }}
          page={page.page}
          pages={page.pages}
          filteredTotal={page.total}
          onPage={(value) => dispatch(setPage(value))}
          onClear={() => {
            setSource("all");
            setOutcome("all");
            dispatch(setFilters({ query: "" }));
          }}
        />
      )}
    >
      {run ? (
        <>
          <header className="flex shrink-0 flex-col gap-4 border-b bg-card px-5 py-5 lg:px-7 lg:py-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <HistoryIcon className="size-4" />
              <span>
                {SOURCES.find((item) => item.value === run.source)?.label} /
                运行记录
              </span>
              <span className="flex-1" />
              <StatusBadge status={statusOf(run)} />
            </div>
            <h1 className="font-heading text-xl font-semibold tracking-tight wrap-anywhere lg:text-2xl">
              {title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <time dateTime={run.startedAt}>
                {formatDateTime(run.startedAt)}
              </time>
              <span className="min-w-0 truncate font-mono" title={run.id}>
                {run.id}
              </span>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto bg-background/50 p-5 lg:p-7">
            <RunPersistenceNotice runId={run.id} />
            {run.cancelled ? (
              <Notice className="mb-4">
                <SquareIcon className="size-4" />
                <span>已停止运行；已发出的请求仍保留实际回执。</span>
              </Notice>
            ) : null}
            <RunSummary
              lanes={lanes}
              mode={run.mode ?? "serial"}
              title="运行结果"
              source={run.source}
              cancelled={run.cancelled}
            />
            {run.source === "plan" ? (
              <RunLanes lanes={lanes} mode={run.mode ?? "serial"} />
            ) : null}
            <section className="mt-6 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">事件与回执</h2>
                <Badge variant="outline">{run.steps.length}</Badge>
              </div>
              <ItemGroup>
                {run.steps.map((step, index) => (
                  <Item
                    variant="outline"
                    size="sm"
                    // biome-ignore lint/suspicious/noArrayIndexKey: 运行记录快照顺序固定，位置区分重复事件。
                    key={`${index}-${step.eventId}`}
                  >
                    <ItemMedia>
                      <ChannelMark channel={step.channel} />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle>
                        <span className="font-mono text-xs text-muted-foreground">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {step.eventName}
                      </ItemTitle>
                      <ItemDescription>
                        {step.laneName || run.scenarioName || "单条事件"} ·{" "}
                        {step.skipped
                          ? "未发送"
                          : `HTTP ${step.receipt.status || "无响应"} · ${step.receipt.elapsedMs} ms`}
                      </ItemDescription>
                      {!step.verdict.passed && !step.skipped ? (
                        <ItemDescription>{step.verdict.reason}</ItemDescription>
                      ) : null}
                    </ItemContent>
                    <ItemActions>
                      <StatusBadge
                        status={
                          step.skipped
                            ? "skipped"
                            : step.verdict.passed
                              ? "success"
                              : "failed"
                        }
                      />
                      {!step.skipped ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDetail(index)}
                        >
                          查看快照
                        </Button>
                      ) : null}
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </section>
          </div>
          <footer className="shrink-0 border-t bg-card px-5 py-3 text-xs text-muted-foreground lg:px-7">
            运行记录保存发送时的参数与回执，后续编辑不会改变这些快照。
          </footer>
        </>
      ) : (
        <Empty className="min-h-60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>运行之后，回到这里看结果</EmptyTitle>
            <EmptyDescription>
              每次运行都保留当时的参数快照、执行顺序和 HTTP 回执。
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="secondary"
            onClick={() => dispatch(setView("events"))}
          >
            <FileTextIcon data-icon="inline-start" />
            去调试一条事件
          </Button>
        </Empty>
      )}
      {run && detail !== null && run.steps[detail] ? (
        <WorkspaceDialog
          key={`${run.id}-${detail}`}
          open
          wide
          title={run.steps[detail].eventName}
          description="本次发送的参数和回执快照。"
          onClose={() => setDetail(null)}
        >
          <RunStepDetail step={run.steps[detail]} />
        </WorkspaceDialog>
      ) : null}
    </ResourceWorkspace>
  );
}
