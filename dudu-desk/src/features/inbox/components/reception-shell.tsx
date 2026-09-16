import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useInboxSearch } from "../hooks/use-inbox-shortcuts";

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
