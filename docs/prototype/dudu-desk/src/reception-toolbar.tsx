import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  Columns2,
  MessageCircle,
  PanelLeft,
  PanelRight,
  Zap,
} from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { softSpring } from "./components/motion";
import { Brand, Button } from "./components/primitives";
import { ThemePicker } from "./components/theme-picker";
import type { Palette } from "./lib/theme-palette";
import type { Variant } from "./types";
import { variantKeys, variants } from "./variant-registry";

const modeIcons = { A: MessageCircle, C: Columns2, E: Zap };

export function ReceptionToolbar({
  variant,
  onVariant,
  palette,
  onPalette,
  onToggleQueue,
  infoOpen,
  onToggleInfo,
  away,
  onToggleAway,
}: {
  variant: Variant;
  onVariant: (value: Variant) => void;
  palette: Palette;
  onPalette: (value: Palette) => void;
  onToggleQueue: () => void;
  infoOpen: boolean;
  onToggleInfo: () => void;
  away: boolean;
  onToggleAway: () => void;
}) {
  return (
    <header className="reception-header" data-mode={variant}>
      <div className="reception-brand">
        <Brand />
        <span>客服工作台</span>
      </div>
      <div className="reception-modes">
        <span className="mode-label" id="reception-mode-label">
          接待方式
        </span>
        <LayoutGroup id="reception-modes">
          <ToggleGroup
            className="mode-switcher"
            aria-labelledby="reception-mode-label"
            value={[variant]}
            onValueChange={(values) => {
              if (values[0]) onVariant(values[0]);
            }}
          >
            {variantKeys.map((key) => {
              const Icon = modeIcons[key];
              return (
                <Toggle
                  key={key}
                  value={key}
                  render={<Button variant="ghost" size="sm" />}
                  aria-label={`${variants[key].name}模式`}
                  title={variants[key].description}
                >
                  {variant === key && (
                    <motion.span
                      className="mode-selection"
                      layoutId="reception-mode-selection"
                      transition={softSpring}
                    />
                  )}
                  <Icon data-icon="inline-start" />
                  <span>{variants[key].name}</span>
                </Toggle>
              );
            })}
          </ToggleGroup>
        </LayoutGroup>
      </div>
      <div className="reception-actions">
        <ThemePicker value={palette} onChange={onPalette} />
        {variant !== "E" && (
          <Button
            className="toolbar-queue"
            variant="ghost"
            size="sm"
            aria-label="显示或收起会话列表"
            onClick={onToggleQueue}
          >
            <PanelLeft data-icon="inline-start" />
            <span>会话</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label="显示或收起访客信息"
          aria-pressed={infoOpen}
          onClick={onToggleInfo}
        >
          <PanelRight data-icon="inline-start" />
          <span>访客信息</span>
        </Button>
        <Button
          className="agent-status"
          variant="ghost"
          size="sm"
          onClick={onToggleAway}
          aria-label={
            away ? "当前暂时离开，点击恢复接待" : "当前接待中，点击暂时离开"
          }
        >
          <i data-away={away} />
          <span>{away ? "暂时离开" : "接待中"}</span>
          <span className="agent-avatar">苏</span>
        </Button>
      </div>
    </header>
  );
}
