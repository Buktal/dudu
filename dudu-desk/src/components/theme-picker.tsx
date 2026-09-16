import { Check, Palette as PaletteIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  isPalette,
  type Palette,
  paletteKeys,
  palettes,
} from "@/lib/theme-palette";
import { cn } from "@/lib/utils";

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" />}
        aria-label={`主题色，当前${palettes[value].name}`}
        title={`主题色：${palettes[value].name}`}
      >
        <PaletteIcon data-icon="inline-start" />
        <span className="max-[960px]:hidden">主题色</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        initialFocus={selectedRef}
        className="max-h-(--available-height) w-[416px] max-w-[calc(100vw-24px)] gap-3 overflow-hidden p-3"
      >
        <PopoverHeader className="shrink-0 px-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle id={titleId}>主题色</PopoverTitle>
            <span className="text-xs text-muted-foreground">12 款配色</span>
          </div>
          <PopoverDescription>
            按色系成对排列，可连续切换比较。
          </PopoverDescription>
        </PopoverHeader>
        <ToggleGroup
          aria-labelledby={titleId}
          value={[value]}
          spacing={1.5}
          onValueChange={(values) => {
            if (isPalette(values[0])) onChange(values[0]);
          }}
          className="grid min-h-0 w-full grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain p-1 max-[360px]:grid-cols-1"
        >
          {paletteKeys.map((key) => (
            <ToggleGroupItem
              key={key}
              value={key}
              ref={key === value ? selectedRef : undefined}
              aria-label={`${palettes[key].name}主题`}
              className="h-auto min-h-14 min-w-0 justify-start gap-2 rounded-lg px-2 py-2 text-left"
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
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex shrink-0 items-center justify-between gap-2 px-2 pb-1">
          <p className="text-[11px] text-muted-foreground">
            自动保存 · 三种模式通用
          </p>
          <Button variant="secondary" size="xs" onClick={() => setOpen(false)}>
            完成
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
