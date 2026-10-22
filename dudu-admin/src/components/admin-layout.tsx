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
import { Fragment, type ReactNode, useState } from "react";
import { useAdmin, useSession } from "@/api/context";
import { useMutation } from "@/api/use-mutation";
import { cn } from "@/lib/utils";
import { href, navigate, routes, type View } from "@/navigation";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

const items = [
  {
    view: "overview",
    label: "运营概览",
    icon: LayoutDashboard,
    route: routes.overview,
  },
  {
    view: "companies",
    label: "企业管理",
    icon: Building2,
    route: routes.companies,
  },
  {
    view: "resources",
    label: "企业资源汇总",
    icon: Layers3,
    route: routes.resources,
  },
  { view: "logs", label: "操作记录", icon: FileClock, route: routes.logs },
  {
    view: "account",
    label: "个人账号",
    icon: UserRound,
    route: routes.account,
  },
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
  const mutation = useMutation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // 重入门卫归 useMutation 单点：退出在途时重复触发直接被拦。
  const logout = () => mutation.run(() => client.logout());
  const navigation = (
    <nav
      aria-label="主导航"
      className="flex min-h-0 flex-col gap-1 overflow-y-auto px-4 py-3"
    >
      <p className="px-3.5 pb-3 text-xs font-medium text-muted-foreground">
        平台管理
      </p>
      {items.map(({ view: target, label, icon: Icon, route }) => (
        <Fragment key={target}>
          {target === "account" && <Separator className="my-3" />}
          <a
            href={href(route())}
            aria-current={target === view ? "page" : undefined}
            className={cn("nav-item", target === view && "nav-item-active")}
            onClick={() => setMobileOpen(false)}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
            {label}
          </a>
        </Fragment>
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
        <div className="px-6 pb-5 pt-7">
          <Brand />
        </div>
        {navigation}
        <div className="mt-auto p-3">
          <Separator className="mb-3" />
          <a
            href={href(routes.account())}
            aria-label="查看个人账号"
            className="sidebar-profile"
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-foreground"
              aria-hidden="true"
            >
              {session.user?.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {session.user?.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">平台管理员</p>
            </div>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </a>
        </div>
      </aside>
      <div className="flex min-h-svh min-w-0 flex-col md:ml-60">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-8">
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
                onClick={() => navigate(routes.overview())}
                className="hidden rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:inline"
              >
                运营中心
              </button>
              <ChevronRight
                className="hidden size-3.5 text-muted-foreground sm:block"
                aria-hidden="true"
              />
              <h1 className="truncate font-medium">
                {items.find((item) => item.view === view)?.label}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={mutation.pending}
              onClick={() => void logout()}
            >
              <LogOut data-icon="inline-start" />
              {mutation.pending ? "正在退出" : "退出"}
            </Button>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 outline-none sm:px-8 xl:px-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
