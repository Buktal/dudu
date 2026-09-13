import { useState } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { ResourceLibrary } from "@/components/resource-library";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { StudioButton, StudioDialog } from "@/components/studio-controls";
import { StudioIcon } from "@/components/studio-icon";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { channelById } from "@/lib/channels";
import { formatDateTime } from "@/lib/time";
import { setView } from "@/stores/app-slice";
import { runStatus } from "../selectors";
import { selectRun } from "../stores/runs-slice";
import { RunPersistenceNotice } from "./run-persistence-notice";
import { RunStepDetail } from "./run-step-detail";
import {
  RunLanes,
  RunSummary,
  recordLanes,
  StatusBadge,
} from "./run-visualization";

export function RunsView() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.runs);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<number | null>(null);
  const all = [...state.items].reverse();
  const rows = all.filter((run) =>
    query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((word) =>
        `${run.id} ${run.planName ?? ""} ${run.scenarioName ?? ""} ${runStatus(run) === "passed" ? "成功 通过" : "失败 未通过"} ${run.steps.map((step) => `${step.eventName} ${channelById(step.channel)?.name}`).join(" ")}`
          .toLowerCase()
          .includes(word),
      ),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const currentPage = Math.min(page, pages);
  const run = all.find((item) => item.id === state.selectedId) ?? all[0];
  const title =
    run?.planName ||
    run?.scenarioName ||
    run?.steps[0]?.eventName ||
    "运行记录";
  const lanes = run ? recordLanes(run) : [];
  return (
    <ResourceWorkspace
      viewId="runs"
      libraryLabel="运行记录"
      library={(close) => (
        <ResourceLibrary
          title="运行记录"
          singular="运行"
          total={all.length}
          query={query}
          onQuery={(value) => {
            setQuery(value);
            setPage(1);
          }}
          entries={rows
            .slice((currentPage - 1) * 10, currentPage * 10)
            .map((item) => ({
              id: item.id,
              name:
                item.planName ||
                item.scenarioName ||
                item.steps[0]?.eventName ||
                "运行记录",
              channel:
                item.source === "plan" ? undefined : item.steps[0]?.channel,
              icon: <StudioIcon name="history" />,
              description: `${formatDateTime(item.startedAt)} · ${item.cancelled ? "已停止" : runStatus(item) === "passed" ? "已通过" : "未通过"}`,
            }))}
          selectedId={run?.id ?? null}
          onSelect={(id) => {
            close();
            dispatch(selectRun(id));
            setDetail(null);
          }}
          page={currentPage}
          pages={pages}
          filteredTotal={rows.length}
          onPage={setPage}
        />
      )}
    >
      {run ? (
        <>
          <header className="entity-head">
            <div className="entity-kicker">
              <StudioIcon name="history" />
              <span>运行记录</span>
              <span className="grow" />
              <StatusBadge
                status={
                  run.cancelled
                    ? "cancelled"
                    : runStatus(run) === "passed"
                      ? "success"
                      : "failed"
                }
              />
            </div>
            <h1 className="history-title">{title}</h1>
            <p className="history-meta">
              {formatDateTime(run.startedAt)} · {run.id}
            </p>
          </header>
          <div className="editor-scroll">
            <RunPersistenceNotice runId={run.id} />
            {run.cancelled ? (
              <div className="info-line">
                <StudioIcon name="stop" />
                <span>已停止运行；已发出的请求仍保留实际回执。</span>
              </div>
            ) : null}
            <RunSummary
              lanes={lanes}
              mode={run.mode ?? "serial"}
              onOpen={() => dispatch(selectRun(run.id))}
            />
            <RunLanes lanes={lanes} mode={run.mode ?? "serial"} />
            <section className="run-detail-section">
              <h3 className="section-title">事件与回执</h3>
              {run.steps.map((step, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 运行记录的步骤快照顺序不可变，位置区分重复事件。
                <div className="history-row" key={`${index}-${step.eventId}`}>
                  <ChannelMark channel={step.channel} small />
                  <div className="grow">
                    <h3>{step.eventName}</h3>
                    <p>
                      {step.laneName || run.scenarioName || "单条事件"} ·{" "}
                      {step.skipped
                        ? "尚未发送"
                        : `HTTP ${step.receipt.status || "超时"} · ${step.receipt.elapsedMs} ms`}
                    </p>
                  </div>
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
                    <StudioButton
                      small
                      tone="quiet"
                      onClick={() => setDetail(index)}
                    >
                      查看快照
                    </StudioButton>
                  ) : null}
                </div>
              ))}
            </section>
          </div>
        </>
      ) : (
        <div className="empty workspace-empty">
          <StudioIcon name="history" />
          <h3>运行之后，回到这里看结果</h3>
          <p>每次运行都保留当时的参数快照、执行顺序和 HTTP 回执。</p>
          <StudioButton tone="soft" onClick={() => dispatch(setView("events"))}>
            <StudioIcon name="event" />
            去调试一条事件
          </StudioButton>
        </div>
      )}
      {run && detail !== null && run.steps[detail] ? (
        <StudioDialog
          open
          wide
          title={run.steps[detail].eventName}
          description="本次发送的参数和回执快照，后续编辑不会改变这些内容。"
          onClose={() => setDetail(null)}
        >
          <RunStepDetail step={run.steps[detail]} />
        </StudioDialog>
      ) : null}
    </ResourceWorkspace>
  );
}
