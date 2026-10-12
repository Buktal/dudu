import { LoaderCircle, LogOut, Settings2, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError } from "@/components/ui/field";
import { WorkspaceSettings } from "@/components/workspace-settings";
import { useAccount } from "../account-provider";
import { AccountAvatar } from "./account-avatar";
import { AccountDetails } from "./account-details";

const sections = {
  profile: {
    title: "坐席信息",
    description: "当前登录的坐席、所属企业与接待范围。",
  },
  settings: {
    title: "工作台设置",
    description: "偏好自动保存，三种接待方式通用。",
  },
  logout: {
    title: "退出登录",
    description:
      "退出后，未发送的草稿、附件和固定会话将清空。主题与接待偏好会保留。",
  },
};

export function AccountMenu() {
  const account = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [section, setSection] = useState<keyof typeof sections>("profile");
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = account.status === "signing-out";
  if (!account.session) return null;
  const { session } = account;
  function openSection(next: keyof typeof sections) {
    setMenuOpen(false);
    setSection(next);
    setDialogOpen(true);
  }
  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              ref={trigger}
              variant="ghost"
              size="icon-sm"
              aria-label={`坐席账户：${session.agent.name}`}
              title="坐席账户与设置"
            />
          }
        >
          <AccountAvatar agent={session.agent} className="size-7" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={10}
          className="w-64 max-w-[calc(100vw-24px)]"
          finalFocus={dialogOpen ? false : undefined}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="flex items-center gap-3">
                <AccountAvatar agent={session.agent} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {session.agent.name}
                  </span>
                  <span className="truncate">{session.workspace.name}</span>
                </span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => openSection("profile")}>
              <UserRound data-icon="inline-start" />
              坐席信息
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSection("settings")}>
              <Settings2 data-icon="inline-start" />
              工作台设置
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => openSection("logout")}
            >
              <LogOut data-icon="inline-start" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!pending) setDialogOpen(open);
        }}
      >
        <DialogContent
          finalFocus={trigger}
          showCloseButton={!pending}
          className="max-h-[85dvh] overflow-y-auto rounded-2xl p-5 sm:max-w-[520px]"
        >
          <DialogHeader className="pr-8">
            <DialogTitle>{sections[section].title}</DialogTitle>
            <DialogDescription>
              {sections[section].description}
            </DialogDescription>
          </DialogHeader>
          {section === "profile" && <AccountDetails session={session} />}
          {section === "settings" && <WorkspaceSettings />}
          {section === "logout" && account.error && (
            <FieldError role="alert">{account.error.message}</FieldError>
          )}
          <DialogFooter>
            <DialogClose
              render={<Button variant="secondary" disabled={pending} />}
            >
              {section === "logout" ? "取消" : "完成"}
            </DialogClose>
            {section === "logout" && (
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => void account.signOut()}
              >
                {pending ? (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <LogOut data-icon="inline-start" />
                )}
                {pending ? "正在退出…" : "退出登录"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
