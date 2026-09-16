import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { debounce } from "lodash-es";

export function isDesktopWindow(): boolean {
  return isTauri();
}

export async function minimizeDesktopWindow(): Promise<void> {
  if (isDesktopWindow()) await getCurrentWindow().minimize();
}

export async function toggleDesktopWindowMaximize(): Promise<void> {
  if (isDesktopWindow()) await getCurrentWindow().toggleMaximize();
}

export async function closeDesktopWindow(): Promise<void> {
  // close emits the normal close request, so existing/future guards can intercept it.
  if (isDesktopWindow()) await getCurrentWindow().close();
}

export function watchDesktopWindowMaximized(
  onChange: (maximized: boolean) => void,
  onError: () => void,
): () => void {
  if (!isDesktopWindow()) return () => undefined;
  const appWindow = getCurrentWindow();
  let disposed = false;
  let request = 0;
  let unlisten: (() => void) | undefined;

  const refresh = () => {
    if (disposed) return;
    const current = ++request;
    void appWindow
      .isMaximized()
      .then((maximized) => {
        if (!disposed && request === current) onChange(maximized);
      })
      .catch(() => {
        if (!disposed && request === current) onError();
      });
  };
  const scheduleRefresh = debounce(refresh, 100);
  void appWindow
    .onResized(() => {
      if (disposed) return;
      ++request;
      scheduleRefresh();
    })
    .then((stop) => {
      if (disposed) stop();
      else {
        unlisten = stop;
        refresh();
      }
    })
    .catch(() => {
      if (!disposed) onError();
    });

  return () => {
    disposed = true;
    scheduleRefresh.cancel();
    unlisten?.();
  };
}
