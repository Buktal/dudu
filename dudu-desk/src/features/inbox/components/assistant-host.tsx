import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * 助手宿主节点单点：quick 历史弹层把内容节点登记上来，悬浮助手用同一节点
 * 挂载。走 React 数据流代替「弹层挂载后查一次 DOM」的一次性查询——弹层尚未
 * 挂载时查询会永久落空，浮层回落 fixed 被弹层遮罩盖住；宿主卸载（弹层关闭、
 * 切换接待方式）时自然回到无宿主的 fixed 形态。
 */
type AssistantHostValue = {
  host: HTMLElement | null;
  setHost: (node: HTMLElement | null) => void;
};

const AssistantHostContext = createContext<AssistantHostValue>({
  host: null,
  setHost: () => {},
});

export function AssistantHostProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  // setHost 身份稳定，值只随宿主节点变化：宿主外的重渲染不惊动消费方
  const value = useMemo(() => ({ host, setHost }), [host]);
  return (
    <AssistantHostContext.Provider value={value}>
      {children}
    </AssistantHostContext.Provider>
  );
}

/** 宿主弹层的登记入口：弹层内容用回调 ref 把自身节点上供。 */
export function useAssistantHostSetter() {
  return useContext(AssistantHostContext).setHost;
}

/** 悬浮助手读取当前宿主；无宿主时回落 fixed 定位。 */
export function useAssistantHost() {
  return useContext(AssistantHostContext).host;
}
