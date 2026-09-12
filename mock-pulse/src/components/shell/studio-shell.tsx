import type { LucideIcon } from "lucide-react";
import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";

export type NavEntry<T extends string = string> = {
  id: T;
  name: string;
  icon: LucideIcon;
};

/** 侧栏导航分组：构建与调试在前，运行记录居后，平台连接固定底部 */
export type NavGroup<T extends string = string> = {
  label?: string;
  entries: NavEntry<T>[];
  pinnedBottom?: boolean;
};

type StudioShellProps<T extends string> = {
  navGroups: NavGroup<T>[];
  currentView: T;
  onSelectView: (view: T) => void;
  currentTitle: string;
  children: React.ReactNode;
};

/** 参数工作台外壳：固定功能导航 + 右侧内容区（纯展示，状态由组合根注入） */
export function StudioShell<T extends string>({
  navGroups,
  currentView,
  onSelectView,
  currentTitle,
  children,
}: StudioShellProps<T>) {
  const mainGroups = navGroups.filter((group) => !group.pinnedBottom);
  const bottomGroups = navGroups.filter((group) => group.pinnedBottom);

  const renderNavButton = (entry: NavEntry<T>) => {
    const Icon = entry.icon;
    const active = currentView === entry.id;
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => onSelectView(entry.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-xs text-sidebar-foreground transition-colors",
          "hover:bg-accent hover:text-foreground",
          active &&
            "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm before:absolute before:-left-3.5 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-r before:bg-sidebar-primary",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span>{entry.name}</span>
      </button>
    );
  };

  return (
    <div className="grid h-svh grid-cols-[184px_minmax(0,1fr)] overflow-hidden bg-background">
      <nav
        aria-label="主导航"
        className="flex min-w-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar p-4 pt-7"
      >
        <div className="px-2.5">
          <div className="flex items-center gap-2.5">
            <Activity className="size-7 text-sidebar-primary" aria-hidden />
            <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
              MockPulse
            </span>
          </div>
          <p className="mt-2 font-mono text-[8px] tracking-[0.125em] text-muted-foreground">
            PLATFORM EVENT LAB
          </p>
        </div>

        {mainGroups.map((group, index) => (
          <div
            key={group.entries.map((entry) => entry.id).join("-")}
            className={cn("flex flex-col gap-1.5", index > 0 && "mt-1")}
          >
            {group.label ? (
              <p className="px-3 pb-1 text-[10px] font-medium text-muted-foreground">
                {group.label}
              </p>
            ) : null}
            {group.entries.map(renderNavButton)}
          </div>
        ))}

        {bottomGroups.map((group) => (
          <div
            key={group.entries.map((entry) => entry.id).join("-")}
            className="mt-auto flex flex-col gap-1.5 border-t border-sidebar-border pt-4"
          >
            {group.entries.map(renderNavButton)}
            <p className="px-3 pt-2 text-[10px] leading-relaxed text-muted-foreground">
              本地联调工具 · 回调模拟
            </p>
          </div>
        ))}
      </nav>

      <section aria-label="工作区" className="flex min-w-0 flex-col">
        <header className="flex h-14 flex-none items-center gap-2.5 border-b border-border bg-card px-6">
          <p className="text-[11px] text-muted-foreground">
            工作空间 <span className="px-1">/</span>
            <strong className="font-semibold text-foreground">
              {currentTitle}
            </strong>
          </p>
          <span className="grow" />
          <span className="font-mono text-[10px] text-muted-foreground">
            按 d 切换深浅色
          </span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </section>
    </div>
  );
}
