import { CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

export function CodeBlock({ title, value }: { title: string; value: string }) {
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Button
            size="xs"
            variant="ghost"
            aria-label={`复制${title}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                toast.add({ title: "已复制到剪贴板", type: "success" });
              } catch {
                toast.add({
                  title: "复制失败，请选中文本后手动复制。",
                  type: "error",
                });
              }
            }}
          >
            <CopyIcon data-icon="inline-start" />
            复制
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <pre className="max-h-80 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
          {value}
        </pre>
      </CardContent>
    </Card>
  );
}
