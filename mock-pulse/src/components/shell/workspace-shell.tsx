import {
  FolderIcon,
  HardDriveIcon,
  InfoIcon,
  type LucideIcon,
  Settings2Icon,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { IconButton } from "@/components/icon-button";
import { useLibraryDisclosure } from "@/components/resource-workspace";
import { ThemeMenu } from "@/components/theme-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { WindowControls } from "@/components/window-controls";
import { WorkspaceDialog } from "@/components/workspace-dialog";

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

function NavigationItems<T extends string>({
  entries,
  currentView,
  onSelectView,
}: {
  entries: NavEntry<T>[];
  currentView: T;
  onSelectView: (view: T) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu className="gap-1">
      {entries.map(({ icon: Icon, ...entry }) => (
        <SidebarMenuItem key={entry.id}>
          <SidebarMenuButton
            isActive={currentView === entry.id}
            aria-current={currentView === entry.id ? "page" : undefined}
            tooltip={entry.name}
            onClick={() => {
              onSelectView(entry.id);
              setOpenMobile(false);
            }}
          >
            <Icon />
            <span>{entry.name}</span>
          </SidebarMenuButton>
          {entry.count !== undefined ? (
            <SidebarMenuBadge>{entry.count}</SidebarMenuBadge>
          ) : null}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function WorkspaceShell<T extends string>({
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
  const connection = navGroups
    .flatMap((group) => group.entries)
    .find((entry) => entry.id === "connections");
  return (
    <>
      <SidebarProvider
        className="h-dvh min-h-0"
        style={{ "--sidebar-width": "12.5rem" } as CSSProperties}
      >
        <Sidebar collapsible="icon" aria-label="主导航">
          <SidebarHeader
            className="gap-3 px-3 py-6"
            data-tauri-drag-region="deep"
          >
            <div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:px-0">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                className="size-8 shrink-0"
                width={32}
                height={32}
                alt="MockPulse 标志"
                draggable={false}
              />
              <span className="font-heading text-lg font-semibold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
                MockPulse
              </span>
            </div>
            <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              消息回调 · 本地联调
            </p>
          </SidebarHeader>
          <SidebarContent>
            {navGroups
              .filter((group) => !group.pinnedBottom)
              .map((group, index) => (
                <SidebarGroup key={group.label ?? index}>
                  {group.label ? (
                    <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  ) : null}
                  <SidebarGroupContent>
                    <NavigationItems
                      entries={group.entries}
                      currentView={currentView}
                      onSelectView={onSelectView}
                    />
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
          </SidebarContent>
          <SidebarFooter className="gap-4 pb-4">
            <NavigationItems
              entries={navGroups
                .filter((group) => group.pinnedBottom)
                .flatMap((group) => group.entries)}
              currentView={currentView}
              onSelectView={onSelectView}
            />
            <div className="flex flex-col gap-3 px-2 group-data-[collapsible=icon]:hidden">
              <Separator />
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <HardDriveIcon className="size-3.5" />
                数据保存在本机
              </p>
            </div>
          </SidebarFooter>
          <SidebarRail aria-label="收起或展开主导航" title="收起或展开主导航" />
        </Sidebar>
        <SidebarInset className="h-dvh min-h-0 min-w-0 overflow-hidden">
          <header
            data-tauri-drag-region="deep"
            className="flex h-14 shrink-0 select-none items-center gap-3 border-b bg-card px-4 lg:px-5"
          >
            <SidebarTrigger aria-label="切换主导航" />
            <Separator orientation="vertical" className="h-4" />
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline">
                工作空间 /
              </span>
              <strong className="truncate font-medium">{currentTitle}</strong>
            </div>
            <div className="min-w-0 flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="min-[900px]:hidden"
              onClick={() => request(currentView)}
            >
              <FolderIcon data-icon="inline-start" />
              {currentView === "connections"
                ? "平台列表"
                : currentView === "runs"
                  ? "运行列表"
                  : "素材库"}
            </Button>
            <Badge variant="secondary" className="hidden lg:inline-flex">
              本地联调
            </Badge>
            {connection ? (
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => onSelectView(connection.id)}
              >
                <Settings2Icon data-icon="inline-start" />
                平台连接
              </Button>
            ) : null}
            <IconButton label="使用说明" onClick={() => setHelp(true)}>
              <InfoIcon />
            </IconButton>
            <ThemeMenu />
            <div className="-mr-4 flex self-stretch lg:-mr-5">
              <WindowControls />
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
      <WorkspaceDialog
        open={help}
        title="从一条事件开始"
        description="调好参数，保存复用，再组织完整测试流程。"
        onClose={() => setHelp(false)}
      >
        <ol className="flex list-decimal flex-col gap-5 pl-5">
          <li>
            <h3 className="font-medium">调试并保存事件</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              编辑用户、消息与完整报文，发送一次检查回执。保存后进入事件素材库。
            </p>
          </li>
          <li>
            <h3 className="font-medium">组装平台剧本</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              只添加同平台的已保存事件，用上下按钮调整步骤顺序。
            </p>
          </li>
          <li>
            <h3 className="font-medium">串行或并行运行</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              把多个剧本加入执行编排，运行记录保留当时的参数与回执。
            </p>
          </li>
        </ol>
      </WorkspaceDialog>
    </>
  );
}
