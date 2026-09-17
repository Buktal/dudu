import { ArrowLeft } from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceView } from "@/components/workspace-motion";
import type { ReceptionMode } from "@/lib/reception-mode";
import { useInboxSearch } from "../hooks/use-inbox-shortcuts";
import { CalmWorkspace } from "./calm-workspace";
import { InboxLoading } from "./inbox-state";

/**
 * Reception workspace shared skeleton: the list-pane visibility both calm and
 * parallel modes toggle on small screens, and the mobile-only back button
 * that returns to it. Quick mode renders cards instead of a list pane, so it
 * stays outside this shell.
 */
export function useListPane({
  initial,
  onOpen,
}: {
  initial: boolean;
  onOpen?: () => void;
}): [boolean, (open: boolean) => void] {
  const [show, setShow] = useState(initial);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);
  const open = useCallback(() => {
    onOpenRef.current?.();
    setShow(true);
  }, []);
  useInboxSearch(open);
  return [show, setShow];
}

export function ReceptionBackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mb-1 justify-start min-[761px]:hidden"
      onClick={onBack}
    >
      <ArrowLeft data-icon="inline-start" />
      返回会话列表
    </Button>
  );
}

const ParallelWorkspace = lazy(() =>
  import("./parallel-workspace").then((module) => ({
    default: module.ParallelWorkspace,
  })),
);
const QuickWorkspace = lazy(() =>
  import("./quick-workspace").then((module) => ({
    default: module.QuickWorkspace,
  })),
);

/**
 * Reception workspace mode switch. Owns the mounting ritual shared by all
 * three modes (exit/enter transition + suspense fallback + workspace switch)
 * so the session keeps only store-bound concerns (effects, notice bar).
 * Mode itself stays a prop: it is a persisted workspace preference owned by
 * the shared shell (`@/lib/reception-mode`), which also renders before the
 * inbox store exists — moving it into the inbox store would split ownership.
 */
export function ReceptionWorkspace({ mode }: { mode: ReceptionMode }) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <WorkspaceView key={mode}>
        <Suspense fallback={<InboxLoading label="正在切换接待布局…" />}>
          {mode === "parallel" ? (
            <ParallelWorkspace />
          ) : mode === "quick" ? (
            <QuickWorkspace />
          ) : (
            <CalmWorkspace />
          )}
        </Suspense>
      </WorkspaceView>
    </AnimatePresence>
  );
}
