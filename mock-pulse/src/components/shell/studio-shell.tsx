import type { LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { useLibraryDisclosure } from "../resource-workspace";
import { IconButton, StudioButton, StudioDialog } from "../studio-controls";
import { StudioIcon, type StudioIconName } from "../studio-icon";

export type NavEntry<T extends string = string> = {
  id: T;
  name: string;
  icon: LucideIcon;
  count?: number;
};
export type NavGroup<T extends string = string> = {
  label?: string;
  entries: NavEntry<T>[];
  pinnedBottom?: boolean;
};

const navIcons: Record<string, StudioIconName> = {
  events: "event",
  scenarios: "scenario",
  plans: "plan",
  runs: "history",
  connections: "settings",
};

export function StudioShell<T extends string>({
  navGroups,
  currentView,
  onSelectView,
  currentTitle,
  children,
}: {
  navGroups: NavGroup<T>[];
  currentView: T;
  onSelectView: (view: T) => void;
  currentTitle: string;
  children: ReactNode;
}) {
  const [help, setHelp] = useState(false);
  const { request } = useLibraryDisclosure();
  const entries = navGroups.flatMap((group) => group.entries);
  const connection = entries.find((entry) => entry.id === "connections");
  const navButton = (entry: NavEntry<T>) => (
    <button
      key={entry.id}
      type="button"
      className={cn("nav-button", currentView === entry.id && "active")}
      aria-current={currentView === entry.id ? "page" : undefined}
      title={entry.name}
      onClick={() => onSelectView(entry.id)}
    >
      <StudioIcon name={navIcons[entry.id] ?? "event"} />
      <span>{entry.name}</span>
      {entry.count !== undefined ? (
        <span className="nav-count">{entry.count}</span>
      ) : null}
    </button>
  );
  return (
    <div className="mockpulse-studio studio-app">
      <div className="shell-a">
        <nav className="sidebar" aria-label="主导航">
          <div className="brand">
            <StudioIcon name="pulse" className="brand-symbol" />
            <div className="brand-text">
              <div className="brand-name">MockPulse</div>
            </div>
          </div>
          <div className="brand-caption">PLATFORM EVENT LAB</div>
          <div className="nav-section-label">构建与调试</div>
          <div className="nav-list">
            {entries
              .filter((entry) => entry.id !== "connections")
              .map((entry) =>
                entry.id === "runs" ? (
                  <div key={entry.id} className="nav-history">
                    <div className="nav-spacer" />
                    {navButton(entry)}
                  </div>
                ) : (
                  navButton(entry)
                ),
              )}
          </div>
          <div className="sidebar-bottom">
            {connection ? navButton(connection) : null}
            <div className="local-note">
              <span className="dot" /> 本地工作空间
              <br />
              数据保存于本机
            </div>
          </div>
        </nav>
        <section className="workspace" aria-label="工作区">
          <header className="workspace-bar">
            <div className="crumb">
              工作空间<span className="slash">/</span>
              <strong>{currentTitle}</strong>
            </div>
            <span className="grow" />
            <StudioButton
              tone="quiet"
              small
              className="browse-mobile"
              onClick={() => request(currentView)}
            >
              <StudioIcon name="folder" />
              素材库
            </StudioButton>
            <span className="pill">本地联调 · 回调模拟</span>
            {connection ? (
              <StudioButton
                tone="quiet"
                small
                onClick={() => onSelectView(connection.id)}
              >
                <StudioIcon name="settings" />
                本地开发
              </StudioButton>
            ) : null}
            <IconButton label="使用说明" onClick={() => setHelp(true)}>
              <StudioIcon name="info" />
            </IconButton>
          </header>
          {children}
        </section>
      </div>
      <StudioDialog
        open={help}
        title="从一条事件开始"
        description="调好参数，保存复用，再组织完整测试流程。"
        onClose={() => setHelp(false)}
      >
        <div className="help-steps">
          <div className="help-step">
            <div>
              <strong>调试并保存事件</strong>
              <p>
                编辑用户、消息与完整报文，发送一次检查回执。保存后进入事件素材库。
              </p>
            </div>
          </div>
          <div className="help-step">
            <div>
              <strong>组装平台剧本</strong>
              <p>只添加同平台的已保存事件，用上下按钮调整步骤顺序。</p>
            </div>
          </div>
          <div className="help-step">
            <div>
              <strong>串行或并行运行</strong>
              <p>把多个剧本加入执行编排，运行记录保留当时的参数与回执。</p>
            </div>
          </div>
        </div>
      </StudioDialog>
    </div>
  );
}
