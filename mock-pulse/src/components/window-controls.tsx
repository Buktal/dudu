import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CopyIcon, MinusIcon, SquareIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

/** 窗口控制按钮贴齐标题栏顶边，高度跟随 header（自绘后替代系统标题栏按钮）。 */
const CONTROL_BUTTON_CLASS =
  "inline-flex w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset";

/** 拖拽调窗时 onResized 连续触发，防抖后只在尘埃落定时查询一次最大化状态。 */
const MAXIMIZED_SYNC_DELAY_MS = 100;

export function WindowControls() {
  // 非 Tauri 环境（纯浏览器 dev/preview、jsdom 测试）不渲染，避免假窗口按钮。
  const [appWindow] = useState(() =>
    isTauri() ? getCurrentWindow() : undefined,
  );
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const syncMaximized = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        appWindow
          .isMaximized()
          .then((value) => {
            if (!disposed) setMaximized(value);
          })
          .catch(() => undefined);
      }, MAXIMIZED_SYNC_DELAY_MS);
    };
    appWindow
      .isMaximized()
      .then((value) => {
        if (!disposed) setMaximized(value);
      })
      .catch(() => undefined);
    appWindow
      .onResized(syncMaximized)
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      clearTimeout(timer);
      unlisten?.();
    };
  }, [appWindow]);

  if (!appWindow) return null;

  return (
    <div className="flex shrink-0">
      <button
        type="button"
        aria-label="最小化"
        className={CONTROL_BUTTON_CLASS}
        onClick={() => appWindow.minimize()}
      >
        <MinusIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={maximized ? "向下还原" : "最大化"}
        className={CONTROL_BUTTON_CLASS}
        onClick={() => appWindow.toggleMaximize()}
      >
        {maximized ? (
          <CopyIcon className="size-3" />
        ) : (
          <SquareIcon className="size-3" />
        )}
      </button>
      <button
        type="button"
        aria-label="关闭"
        className={`${CONTROL_BUTTON_CLASS} hover:bg-destructive hover:text-primary-foreground`}
        onClick={() => appWindow.close()}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
