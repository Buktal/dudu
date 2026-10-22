import { MessageSquareText, Smile } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InputGroupButton } from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const quickReplies = [
  { label: "先回应一下", text: "您好，请问有什么可以帮您？" },
  { label: "正在确认", text: "收到，我先帮您核实一下，请稍等。" },
  { label: "结束前确认", text: "还有其他需要帮助的地方吗？" },
];
const emoji = ["😊", "👍", "🙏", "❤️", "✨", "🌷", "👌", "🎉"];

export function ComposerTools({
  compact,
  onInsert,
}: {
  compact: boolean;
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState<"emoji" | "quick" | null>(null);
  function insert(text: string) {
    onInsert(text);
    setOpen(null);
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover
        open={open === "emoji"}
        onOpenChange={(value) => setOpen(value ? "emoji" : null)}
      >
        <PopoverTrigger
          render={
            <InputGroupButton
              size="icon-sm"
              aria-label="插入表情"
              title="插入表情"
            />
          }
        >
          <Smile />
        </PopoverTrigger>
        <PopoverContent
          side="top"
          sideOffset={8}
          align="start"
          aria-label="插入表情"
          className="w-52 gap-2 rounded-xl p-3"
        >
          <p className="text-xs text-muted-foreground">插入表情</p>
          <div className="grid grid-cols-4 justify-items-center gap-1">
            {emoji.map((item) => (
              <Button
                key={item}
                variant="ghost"
                size="icon"
                onClick={() => insert(item)}
                aria-label={`插入 ${item}`}
              >
                {item}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Popover
        open={open === "quick"}
        onOpenChange={(value) => setOpen(value ? "quick" : null)}
      >
        <PopoverTrigger
          render={
            <InputGroupButton
              size={compact ? "icon-sm" : "xs"}
              className="h-8"
              aria-label="快捷回复"
              title="快捷回复"
            />
          }
        >
          <MessageSquareText data-icon={compact ? undefined : "inline-start"} />
          {!compact && "快捷回复"}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          sideOffset={8}
          align="start"
          aria-label="快捷回复"
          className="w-80 max-w-[calc(100vw-24px)] gap-1 rounded-xl p-2"
        >
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            快捷回复 · 插入后可编辑
          </p>
          <div className="flex flex-col gap-1">
            {quickReplies.map((reply) => (
              <Button
                key={reply.label}
                variant="ghost"
                className="h-auto flex-col items-start gap-1 rounded-lg px-2 py-2 text-left whitespace-normal"
                onClick={() => insert(reply.text)}
              >
                <span className="text-xs font-medium">{reply.label}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {reply.text}
                </span>
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
