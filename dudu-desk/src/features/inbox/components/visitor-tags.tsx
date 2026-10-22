import { Plus, Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseTags, TAG_SEPARATORS } from "../tags";

export function VisitorTags({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const tags = parseTags(value);

  useEffect(() => {
    if (adding) input.current?.focus();
  }, [adding]);

  function close() {
    setAdding(false);
    setText("");
    setError(null);
    toggle.current?.focus();
  }

  function add() {
    const tag = text.trim();
    if (!tag) return;
    if (TAG_SEPARATORS.test(tag)) {
      setError("一次添加一个标签，请勿使用逗号或分号。");
      return;
    }
    if (tags.includes(tag)) {
      setError("这个标签已存在。");
      return;
    }
    onChange([...tags, tag].join("，"));
    close();
  }

  return (
    <Field
      className="gap-3 rounded-xl bg-card p-4 text-card-foreground"
      aria-labelledby={`${id}-label`}
      data-invalid={!!error}
    >
      <div className="flex items-center justify-between gap-2">
        <FieldLabel
          id={`${id}-label`}
          htmlFor={adding ? id : undefined}
          className="text-xs"
        >
          <Tag className="size-3.5 text-muted-foreground" />
          来访标签
        </FieldLabel>
        <Button
          ref={toggle}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={adding ? "收起标签输入" : "添加访客标签"}
          aria-expanded={adding}
          aria-controls={adding ? `${id}-add` : undefined}
          onClick={() => {
            if (adding) close();
            else setAdding(true);
          }}
        >
          {adding ? (
            <X data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
        </Button>
      </div>
      <div className="flex flex-wrap items-start gap-1.5">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="h-auto max-w-full gap-1 rounded-md py-0 pr-0.5 pl-2"
          >
            <span className="min-w-0 break-words whitespace-normal">{tag}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="rounded-sm"
              aria-label={`移除标签 ${tag}`}
              onClick={() => {
                onChange(tags.filter((item) => item !== tag).join("，"));
                toggle.current?.focus();
              }}
            >
              <X data-icon="inline-start" />
            </Button>
          </Badge>
        ))}
        {!tags.length && (
          <p className="text-[11px] text-muted-foreground">暂无标签</p>
        )}
      </div>
      {adding && (
        <div id={`${id}-add`} className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Input
              ref={input}
              id={id}
              value={text}
              maxLength={30}
              placeholder="输入标签，回车添加"
              aria-label="新标签名称"
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                setText(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229
                )
                  return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  add();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!text.trim()}
              onClick={add}
            >
              添加
            </Button>
          </div>
          <FieldError id={`${id}-error`}>{error}</FieldError>
        </div>
      )}
    </Field>
  );
}
