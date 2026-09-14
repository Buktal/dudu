import {
  ChevronDownIcon,
  HistoryIcon,
  InfoIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";
import { setView } from "@/stores/app-slice";
import { lastRunFor } from "../selectors";
import { type LiveRunKind, selectLiveRunFor } from "../stores/live";
import { selectRun, stopRun } from "../stores/runs-slice";
import { isRunBusy, isStoppingRun } from "../stores/session";
import { RunPersistenceNotice } from "./run-persistence-notice";
import {
  liveLanes,
  RunLanes,
  RunSummary,
  recordLanes,
} from "./run-visualization";

/**
 * 运行区编排（剧本/编排编辑器共用的运行块，单一出口）：
 * - RunButton：头部「运行 / 停止」按钮三元组（variant / disabled / 文案阶梯）；
 * - RunConnectionNotice：连接未就绪的「前往平台连接」指引；
 * - RunSection：持久化告警 + 编辑表单 + 可展开的运行摘要与轨道。
 *   运行时自动展开，最近记录默认收起，保留参数编辑空间。
 * 实况、最近记录、lanes 派生全部按 kind + sourceId 内聚在此，
 * 编辑器不再各自复制「最近一次运行」的时序查询。
 */

/** 错误包装：编辑器的 perform（失败落编辑器自己的错误条），按钮与摘要共用 */
type Perform = (action: () => Promise<unknown>) => void;

export type RunButtonProps = {
  /** 运行来源种类：剧本 / 编排（定位本编辑器的实况与停止态） */
  kind: LiveRunKind;
  /** 来源剧本 / 编排 id */
  sourceId: string;
  /** 启动文案（停止 / 正在停止文案固定） */
  startLabel: string;
  /** 启动动作：编辑器注入自己的启动 thunk（失败经 perform 落错误条） */
  onStart: () => Promise<unknown>;
  perform: Perform;
};

export function RunButton({
  kind,
  sourceId,
  startLabel,
  onStart,
  perform,
}: RunButtonProps) {
  const dispatch = useAppDispatch();
  const runs = useAppSelector((root) => root.runs);
  const busy = useAppSelector((root) => isRunBusy(root));
  const active = selectLiveRunFor(runs, kind, sourceId);
  const stopping = !!active && isStoppingRun(runs, active.runId);
  return (
    <Button
      variant={active ? "destructive" : "default"}
      disabled={active ? stopping : busy}
      onClick={() =>
        void perform(() =>
          active ? dispatch(stopRun(active.runId)).unwrap() : onStart(),
        )
      }
    >
      {stopping ? (
        <Spinner aria-hidden="true" data-icon="inline-start" />
      ) : active ? (
        <SquareIcon aria-hidden="true" data-icon="inline-start" />
      ) : (
        <PlayIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {stopping ? "正在停止…" : active ? "停止运行" : startLabel}
    </Button>
  );
}

/** 连接未就绪指引（第三段起各域文案不同，正文经 message 注入） */
export function RunConnectionNotice({ message }: { message: ReactNode }) {
  const dispatch = useAppDispatch();
  return (
    <Notice className="mb-4">
      <InfoIcon aria-hidden="true" className="size-4 shrink-0" />
      <span>{message}</span>
      <Button
        size="sm"
        onClick={() => dispatch(setView("connections"))}
        variant="outline"
      >
        前往平台连接
      </Button>
    </Notice>
  );
}

export type RunSectionProps = {
  /** 运行来源种类：剧本 / 编排（定位实况与最近记录） */
  kind: LiveRunKind;
  /** 来源剧本 / 编排 id */
  sourceId: string;
  /** 实况与历史都缺位时的执行方式兜底（编排传草稿 mode；剧本恒 serial） */
  mode: "serial" | "parallel";
  /** RunSummary 的停止动作经编辑器 perform 落错误条 */
  perform: Perform;
  /** 编排视角：运行轨道上方带「本次运行 · 并行/串行快照」标题；剧本无 */
  lanesHeading?: boolean;
  children?: ReactNode;
};

export function RunSection({
  kind,
  sourceId,
  mode,
  perform,
  lanesHeading = false,
  children,
}: RunSectionProps) {
  const dispatch = useAppDispatch();
  const [expanded, setExpanded] = useState(false);
  const runs = useAppSelector((root) => root.runs);
  const active = selectLiveRunFor(runs, kind, sourceId);
  const last = lastRunFor(runs, kind, sourceId);
  const lanes = active ? liveLanes(active) : last ? recordLanes(last) : [];
  const resolvedMode = active?.mode ?? last?.mode ?? mode;
  const summary = (
    <RunSummary
      lanes={lanes}
      mode={resolvedMode}
      active={!!active}
      stopping={!!active && isStoppingRun(runs, active.runId)}
      source={kind}
      cancelled={last?.cancelled}
      onStop={() =>
        active && void perform(() => dispatch(stopRun(active.runId)).unwrap())
      }
      onOpen={() => {
        if (last) dispatch(selectRun(last.id));
        dispatch(setView("runs"));
      }}
    />
  );
  return (
    <>
      <RunPersistenceNotice runId={last?.id} />
      {active ? summary : null}
      {children}
      {lanes.length ? (
        <Collapsible
          className="mt-6 border-t pt-4"
          open={!!active || expanded}
          onOpenChange={setExpanded}
        >
          <CollapsibleTrigger
            render={
              <Button variant="ghost" className="w-full justify-between" />
            }
          >
            <span className="flex items-center gap-2">
              <HistoryIcon />
              {active ? "执行轨迹" : "最近一次运行"}
            </span>
            <ChevronDownIcon
              className={cn(
                "transition-transform",
                (active || expanded) && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            {!active ? summary : null}
            {lanesHeading ? (
              <h3 className="mb-3 text-sm font-semibold">
                本次运行 · {resolvedMode === "parallel" ? "并行" : "串行"}快照
              </h3>
            ) : null}
            <RunLanes lanes={lanes} mode={resolvedMode} />
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </>
  );
}
