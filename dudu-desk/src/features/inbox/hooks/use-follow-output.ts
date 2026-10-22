import { useEffect, useState } from "react";
import type { FollowOutput } from "react-virtuoso";

/**
 * 跟随滚动的共用习语：atTop/atBottom 状态与 followOutput 的折算只在这里写一次，
 * 会话列表、消息时间线与固定选择器的 Virtuoso 实例共用。atBottom 初始为 true 时
 * 供定位最新消息的时间线使用（initialTopMostItemIndex 定位后内容不满一屏不会触发
 * atBottomStateChange），其余列表从底部未判定开始。
 */
export function useFollowOutput(initialAtBottom = false): {
  followOutput: FollowOutput;
  atTop: boolean;
  atBottom: boolean;
  setAtTop: (value: boolean) => void;
  setAtBottom: (value: boolean) => void;
} {
  const [followOutput, setFollowOutput] = useState<FollowOutput>("auto");
  const [atTop, setAtTop] = useState<boolean>(false);
  const [atBottom, setAtBottom] = useState<boolean>(initialAtBottom);
  useEffect(() => {
    // atBottom 不一定真的在底部（atTop、atBottom 可同时为 true）
    const realAtBottom = atTop ? false : atBottom;
    setFollowOutput(realAtBottom ? "smooth" : "auto");
  }, [atBottom, atTop]);
  return { followOutput, atTop, atBottom, setAtTop, setAtBottom };
}

/** Virtuoso 滚动行为共选，注释只在定义处保留一份。 */
const scrollBehaviorProps = {
  // 虚拟滚动视口扩展距离，提前加载视口外项目。
  increaseViewportBy: { bottom: 200, top: 300 },
  // 滚动时多渲染一些项目，避免滚动时频繁触发 re-render。
  overscan: { main: 200, reverse: 300 },
  // 快速滚动时显示占位符内容，避免性能下降
  scrollSeekConfiguration: false,
} as const;

/** Virtuoso 列表的滚动行为：在网格不支持的行为之外禁用 resize 观察的帧包装。 */
export const virtuosoBehaviorProps = {
  ...scrollBehaviorProps,
  // 禁用 requestAnimationFrame 包装，优化性能但可能出现警告
  skipAnimationFrameInResizeObserver: true,
} as const;

/** VirtuosoGrid 不支持 skipAnimationFrameInResizeObserver：多余属性会透传到根节点 */
export const virtuosoGridBehaviorProps = scrollBehaviorProps;
