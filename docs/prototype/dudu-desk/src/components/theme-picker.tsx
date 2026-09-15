import { Popover } from "@base-ui/react/popover";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Check, Palette as PaletteIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { type Palette, paletteKeys, palettes } from "../lib/theme-palette";
import { cn } from "../lib/utils";
import { Button } from "./primitives";

export function ThemePicker({
  value,
  onChange,
}: {
  value: Palette;
  onChange: (value: Palette) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={<Button variant="ghost" size="sm" />}
        className="theme-trigger"
        aria-label={`主题色，当前${palettes[value].name}`}
        title={`主题色：${palettes[value].name}`}
      >
        <PaletteIcon data-icon="inline-start" className="text-primary" />
        <span>主题色</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={10} className="isolate">
          <Popover.Popup
            data-palette={value}
            initialFocus={selectedRef}
            className={cn(
              "flex max-h-(--available-height) w-104 max-w-[calc(100vw-24px)] origin-(--transform-origin) flex-col gap-3 overflow-hidden rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-hidden transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none",
              palettes[value].scheme === "dark" && "dark",
            )}
          >
            <div className="flex shrink-0 flex-col gap-1 px-2 pt-1">
              <div className="flex items-center justify-between gap-2">
                <Popover.Title id={titleId} className="text-sm font-semibold">
                  主题色
                </Popover.Title>
                <span className="text-xs text-muted-foreground">
                  {paletteKeys.length} 款配色
                </span>
              </div>
              <Popover.Description className="text-xs text-muted-foreground">
                按色系成对排列，可连续切换比较。
              </Popover.Description>
            </div>
            <ToggleGroup
              aria-labelledby={titleId}
              orientation="horizontal"
              value={[value]}
              onValueChange={(values) => {
                if (values[0]) onChange(values[0]);
              }}
              className="grid min-h-0 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain p-1 max-[360px]:grid-cols-1"
            >
              {paletteKeys.map((key) => (
                <Toggle
                  key={key}
                  value={key}
                  ref={key === value ? selectedRef : undefined}
                  aria-label={`${palettes[key].name}主题`}
                  render={
                    <Button
                      variant={key === value ? "secondary" : "ghost"}
                      size="sm"
                    />
                  }
                  className="h-auto min-h-14 justify-start gap-2 rounded-lg px-2 py-2 text-left"
                >
                  <span
                    data-palette={key}
                    aria-hidden="true"
                    className="flex size-9 shrink-0 overflow-hidden rounded-md border border-border bg-background"
                  >
                    <span className="w-2.5 bg-sidebar-accent" />
                    <span className="flex flex-1 flex-col justify-center gap-1 p-1">
                      <span className="h-1.5 rounded-sm bg-primary" />
                      <span className="h-1.5 w-2/3 rounded-sm bg-accent" />
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-xs">{palettes[key].name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {palettes[key].description}
                    </span>
                  </span>
                  <Check
                    data-icon="inline-end"
                    className={cn("ml-auto", key !== value && "invisible")}
                  />
                </Toggle>
              ))}
            </ToggleGroup>
            <div className="flex shrink-0 items-center justify-between gap-2 px-2 pb-1">
              <p className="text-[11px] text-muted-foreground">
                自动保存 · 三种模式通用
              </p>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setOpen(false)}
              >
                完成
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
