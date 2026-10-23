import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  InfoIcon,
  XIcon,
} from "lucide-react";
import { Fragment } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { IconButton } from "@/components/icon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EVENT_SCHEMAS } from "@/features/events";
import { isTemplateStep } from "@/features/scenarios";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { channelById } from "@/lib/channels";
import { cn } from "@/lib/utils";
import {
  type PlanItem,
  type PlanMode,
  laneSnapshotOutdated,
  resolveLaneScenario,
} from "../model";
import { moveDraftLane, removeDraftLane } from "../stores/plans-slice";

export function PlanLanes({
  items,
  mode,
  onSync,
}: {
  items: PlanItem[];
  mode: PlanMode;
  onSync: (index: number) => void;
}) {
  const dispatch = useAppDispatch();
  const scenarios = useAppSelector((root) => root.scenarios.items);
  const events = useAppSelector((root) => root.events.items);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4",
        mode === "parallel" &&
          items.length > 0 &&
          "border-s-2 border-primary/30 ps-4",
      )}
    >
      {items.map((item, index) => {
        const scene = resolveLaneScenario(item, scenarios);
        // 快照落后库内最新版的展示标记（判定单点在 model）
        const outdated = laneSnapshotOutdated(item, scenarios);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 编排允许重复剧本；轨道按模型中的位置标识，没有局部组件状态。
          <Fragment key={`${index}-${item.scenarioId}`}>
            {mode === "serial" && index > 0 ? (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ArrowDownIcon className="size-4" />
                上一剧本结束后开始
              </div>
            ) : null}
            <Card className="min-w-0" size="sm">
              <CardHeader className="flex flex-wrap items-start gap-3">
                {scene ? (
                  <ChannelMark channel={scene.channelId} />
                ) : (
                  <InfoIcon className="size-5" />
                )}
                <div className="min-w-0 flex-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {mode === "parallel" ? "轨道" : "顺序"}{" "}
                      {String(index + 1).padStart(2, "0")}
                    </Badge>
                    {scene?.name ?? "来源剧本不存在"}
                  </CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                    <span>
                      {scene
                        ? `${channelById(scene.channelId)?.name} · ${scene.steps.length} 步 · v${scene.revision ?? 1}`
                        : "请移除后重新选择"}
                    </span>
                    {outdated ? (
                      <Button
                        size="xs"
                        variant="link"
                        onClick={() => onSync(index)}
                      >
                        有新版本 · 同步
                      </Button>
                    ) : null}
                  </CardDescription>
                </div>
                <CardAction className="flex items-center gap-1">
                  <IconButton
                    label="剧本上移"
                    disabled={index === 0}
                    onClick={() =>
                      dispatch(moveDraftLane({ index, delta: -1 }))
                    }
                  >
                    <ArrowUpIcon />
                  </IconButton>
                  <IconButton
                    label="剧本下移"
                    disabled={index === items.length - 1}
                    onClick={() => dispatch(moveDraftLane({ index, delta: 1 }))}
                  >
                    <ArrowDownIcon />
                  </IconButton>
                  <IconButton
                    label="从编排中移除剧本"
                    onClick={() => dispatch(removeDraftLane(index))}
                  >
                    <XIcon />
                  </IconButton>
                </CardAction>
              </CardHeader>
              <CardContent className="min-w-0">
                <ol
                  className="flex items-center gap-3 overflow-x-auto pb-2"
                  aria-label={`${scene?.name ?? "剧本"}的步骤`}
                >
                  {scene?.steps.length ? (
                    scene.steps.map((step, stepIndex) => {
                      // 模板步骤显示模板名（纯引用不指向素材，事件表里查不到）
                      const name = isTemplateStep(step)
                        ? (EVENT_SCHEMAS.find(
                            (item) => item.id === step.templateId,
                          )?.name ?? "内置模板缺失")
                        : (events.find((event) => event.id === step.eventId)
                            ?.name ?? "来源事件不存在");
                      return (
                        <li
                          // biome-ignore lint/suspicious/noArrayIndexKey: 固定剧本快照允许重复事件，步骤位置是快照标识。
                          key={`${stepIndex}-${isTemplateStep(step) ? step.templateId : step.eventId}`}
                          className="flex shrink-0 items-center gap-3"
                        >
                          {stepIndex ? (
                            <ArrowRightIcon className="size-4 text-muted-foreground" />
                          ) : null}
                          <div className="flex min-w-32 max-w-60 flex-col gap-2 rounded-lg bg-muted/50 p-3">
                            <span className="truncate">{name}</span>
                            <span className="text-xs text-muted-foreground">
                              {String(stepIndex + 1).padStart(2, "0")} ·{" "}
                              {step.wait ? `等待 ${step.wait}s` : "立即发送"}
                            </span>
                          </div>
                        </li>
                      );
                    })
                  ) : (
                    <li className="text-sm text-muted-foreground">
                      这个剧本还没有步骤
                    </li>
                  )}
                </ol>
              </CardContent>
            </Card>
          </Fragment>
        );
      })}
    </div>
  );
}
