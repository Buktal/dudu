import { useId } from "react";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TranslationSettings } from "@/features/translation/settings";
import { receptionModes } from "@/lib/reception-mode";
import { palettes } from "@/lib/theme-palette";
import { ReceptionModeSwitch } from "./reception-mode-switch";
import { ThemePicker } from "./theme-picker";
import { useTheme } from "./theme-provider";

export function WorkspaceSettings() {
  const { theme, setTheme, mode, setMode, reduceMotion, setReduceMotion } =
    useTheme();
  const id = useId();
  return (
    <FieldGroup className="gap-6">
      <TranslationSettings />
      <Field className="gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">主题色</h3>
            <p className="text-xs text-muted-foreground">
              {palettes[theme].name} · {palettes[theme].description}
            </p>
          </div>
          <ThemePicker value={theme} onChange={setTheme} />
        </div>
      </Field>
      <Field className="gap-3">
        <h3 className="text-sm font-medium">接待方式</h3>
        <ReceptionModeSwitch value={mode} onChange={setMode} />
        <FieldDescription>{receptionModes[mode].description}</FieldDescription>
      </Field>
      <Field className="gap-3">
        <h3 id={`${id}-motion`} className="text-sm font-medium">
          界面动效
        </h3>
        <ToggleGroup
          aria-labelledby={`${id}-motion`}
          value={[reduceMotion ? "reduced" : "system"]}
          onValueChange={(values) => {
            if (values[0]) setReduceMotion(values[0] === "reduced");
          }}
          variant="outline"
          size="sm"
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem value="system">跟随系统</ToggleGroupItem>
          <ToggleGroupItem value="reduced">减少动态效果</ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>
          切换接待方式和展开面板时使用轻量过渡。
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
