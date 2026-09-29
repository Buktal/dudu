import { Check, ChevronDown, Server } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "@/api/client";
import { useAdmin, useSession } from "@/api/context";
import { Message } from "@/components/feedback";
import { TextField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";

export function EnvironmentMenu() {
  const client = useAdmin();
  const session = useSession();
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState(session.localOrigin);
  const [error, setError] = useState<string | null>(null);
  if (!import.meta.env.DEV) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" />}
          aria-label="选择环境"
          title={session.origin}
        >
          <Server data-icon="inline-start" />
          {session.environment === "local" ? "本地环境" : "线上环境"}
          <ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => client.switchEnvironment("local")}>
              <div className="flex flex-1 flex-col gap-1">
                <span>本地环境</span>
                <span className="truncate text-xs text-muted-foreground">
                  {session.localOrigin}
                </span>
              </div>
              {session.environment === "local" && <Check />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => client.switchEnvironment("online")}
            >
              <div className="flex flex-1 flex-col gap-1">
                <span>线上环境</span>
                <span className="truncate text-xs text-muted-foreground">
                  {client.onlineOrigin}
                </span>
              </div>
              {session.environment === "online" && <Check />}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setAddress(session.localOrigin);
                setError(null);
                setEditing(true);
              }}
            >
              修改本地地址
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>本地服务地址</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                client.switchEnvironment("local", address);
                setEditing(false);
              } catch (failure) {
                setError(errorMessage(failure));
              }
            }}
          >
            <FieldGroup>
              <TextField
                label="服务地址"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="http://192.168.1.10:8080"
                required
              />
            </FieldGroup>
            {error && <Message error>{error}</Message>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button type="submit">保存并切换</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
