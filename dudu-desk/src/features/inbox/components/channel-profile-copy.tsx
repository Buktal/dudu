import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatChannelProfile } from "../channel-profile";
import type { VisitorIdentity, VisitorProfile } from "../types";

export function ChannelProfileCopy({
  identity,
  profile,
}: {
  identity: VisitorIdentity;
  profile?: VisitorProfile;
}) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">(
    "idle",
  );
  useEffect(() => {
    if (status !== "copied") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function copy() {
    if (!profile) return;
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(
        formatChannelProfile(identity, profile.fields),
      );
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        role="status"
        className={
          status === "error" ? "text-[10px] text-destructive" : "sr-only"
        }
      >
        {status === "error"
          ? "复制失败，请重试"
          : status === "copied"
            ? "渠道资料已复制"
            : ""}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={!profile || status === "copying"}
        aria-label="复制渠道资料"
        title={status === "copied" ? "已复制" : "复制全部渠道资料"}
        onClick={() => void copy()}
      >
        {status === "copied" ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
