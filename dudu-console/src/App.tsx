import { useEffect, useState, useSyncExternalStore } from "react";
import { ConsoleClient } from "@/api/client";
import { ConsoleContext, useSession } from "@/api/context";
import { ConsoleLayout } from "@/components/console-layout";
import { LoadingState } from "@/components/feedback";
import { AccountPage } from "@/features/account/AccountPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { navigate, routes, useRoute } from "@/navigation";

function Workspace() {
  const route = useRoute();
  const session = useSession();
  const initial = session.profile?.user.isInitialAdmin;
  useEffect(() => {
    if (route.view === "login" || (route.view === "employees" && !initial))
      navigate(initial ? routes.employees() : routes.userGroups());
  }, [route.view, initial]);
  return (
    <ConsoleLayout view={route.view}>
      {route.view === "account" ? (
        <AccountPage />
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">
            {route.view === "employees"
              ? "员工"
              : route.view === "user-groups"
                ? "用户组"
                : "渠道账号"}
          </h2>
          <p className="text-muted-foreground">正在准备管理页面。</p>
        </div>
      )}
    </ConsoleLayout>
  );
}
export default function App() {
  const [client] = useState(() => new ConsoleClient());
  const session = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => {
    const controller = new AbortController();
    void client.restore(controller.signal);
    return () => controller.abort();
  }, [client]);
  return (
    <ConsoleContext value={client}>
      {session.restoring ? (
        <LoadingState />
      ) : session.profile ? (
        <Workspace key={session.generation} />
      ) : (
        <LoginPage key={session.generation} />
      )}
    </ConsoleContext>
  );
}
