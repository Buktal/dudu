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
            className="flex max-h-(--available-height) w-80 max-w-[calc(100vw-24px)] origin-(--transform-origin) flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-hidden transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <div className="flex flex-col gap-1 px-2 pt-1">
              <Popover.Title id={titleId} className="text-sm font-semibold">
                主题色
              </Popover.Title>
              <Popover.Description className="text-xs text-muted-foreground">
                自动记住你的选择，三种接待方式通用。
              </Popover.Description>
            </div>
            <ToggleGroup
              aria-labelledby={titleId}
              orientation="vertical"
              value={[value]}
              onValueChange={(values) => {
                if (values[0]) onChange(values[0]);
                setOpen(false);
              }}
              className="flex flex-col gap-1"
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
                  className="h-auto min-h-12 justify-start gap-3 rounded-lg px-2 py-1.5 text-left"
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
                  <span className="flex flex-1 flex-col gap-0.5">
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
