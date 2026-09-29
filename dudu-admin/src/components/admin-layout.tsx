import {
  Building2,
  ChevronRight,
  FileClock,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useAdmin, useSession } from "@/api/context";
import { EnvironmentMenu } from "@/features/auth/EnvironmentMenu";
import { cn } from "@/lib/utils";
import { navigate, type View } from "@/navigation";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

const items = [
  { view: "overview", label: "运营概览", icon: LayoutDashboard },
  { view: "companies", label: "企业管理", icon: Building2 },
  { view: "resources", label: "企业资源汇总", icon: Layers3 },
  { view: "logs", label: "操作记录", icon: FileClock },
  { view: "account", label: "个人账号", icon: UserRound },
] as const;

export function AdminLayout({
  view,
  children,
}: {
  view: View;
  children: ReactNode;
}) {
  const client = useAdmin();
  const session = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await client.logout();
  };
  const navigation = (
    <nav aria-label="主导航" className="flex flex-col gap-1.5 p-4">
      {items.map(({ view: target, label, icon: Icon }) => (
        <a
          key={target}
          href={`#/${target}`}
          aria-current={target === view ? "page" : undefined}
          className={cn("nav-item", target === view && "nav-item-active")}
          onClick={() => setMobileOpen(false)}
        >
          <Icon className="size-[18px]" />
          {label}
        </a>
      ))}
    </nav>
  );
  return (
    <div className="min-h-svh">
      <button
        type="button"
        className="skip-link"
        onClick={() => {
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到主要内容
      </button>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card md:flex">
        <div className="px-6 pb-7 pt-8">
          <Brand />
        </div>
        {navigation}
        <div className="mt-auto flex items-center gap-3 border-t p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">
            {session.user?.name.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{session.user?.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">平台管理员</p>
          </div>
        </div>
      </aside>
      <div className="flex min-h-svh min-w-0 flex-col md:ml-60">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="md:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger
                  render={<Button variant="ghost" size="icon" />}
                  aria-label="打开导航"
                >
                  <Menu />
                </SheetTrigger>
                <SheetContent side="left" className="data-[side=left]:w-64">
                  <SheetHeader>
                    <SheetTitle>DuDu Admin</SheetTitle>
                  </SheetHeader>
                  {navigation}
                </SheetContent>
              </Sheet>
            </div>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => navigate("overview")}
                className="hidden text-muted-foreground sm:inline"
              >
                运营中心
              </button>
              <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
              <span className="truncate font-medium">
                {items.find((item) => item.view === view)?.label}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {import.meta.env.DEV && <EnvironmentMenu />}
            <Button
              variant="ghost"
              size="sm"
              disabled={loggingOut}
              onClick={() => void logout()}
            >
              <LogOut data-icon="inline-start" />
              {loggingOut ? "正在退出" : "退出"}
            </Button>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 p-4 outline-none sm:p-8 xl:p-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
