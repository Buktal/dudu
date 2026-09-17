/**
 * Single-flight request scope: abort-previous + currency + disposal behind
 * one seam. The inbox Operation ritual (keyed scopes in stores/requests.ts)
 * and the account session (one scope in features/account/stores/session.ts)
 * both answer through here, so abort/current/dispose semantics change once
 * instead of drifting across two store idioms.
 */
export type RequestScope = {
  /** Abort any in-flight request and open a new signal. */
  begin: () => AbortSignal;
  /** Abort the in-flight request, if any; the slot stays usable. */
  abort: () => void;
  /** True while the signal is the latest begun and undisposed. */
  isCurrent: (signal: AbortSignal) => boolean;
  /** Abort and retire the slot; begun signals stop being current. */
  dispose: () => void;
};

export function createRequestScope(): RequestScope {
  let controller: AbortController | undefined;
  let disposed = false;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      return controller.signal;
    },
    abort() {
      controller?.abort();
    },
    isCurrent: (signal) =>
      !disposed && controller?.signal === signal && !signal.aborted,
    dispose() {
      disposed = true;
      controller?.abort();
      controller = undefined;
    },
  };
}
