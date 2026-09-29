import { useEffect, useState, useSyncExternalStore } from "react";
import { AdminClient } from "@/api/client";
import { AdminContext } from "@/api/context";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingState } from "@/components/feedback";
import { AccountPage } from "@/features/account/AccountPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { CompaniesPage } from "@/features/companies/CompaniesPage";
import { LogsPage } from "@/features/operations/LogsPage";
import { OverviewPage } from "@/features/overview/OverviewPage";
import { ResourcesPage } from "@/features/resources/ResourcesPage";
import { navigate, useRoute } from "@/navigation";

function Workspace() {
  const route = useRoute();
  return (
    <AdminLayout view={route.view}>
      {route.view === "companies" && (
        <CompaniesPage
          selectedId={route.selectedId}
          creating={route.creating}
          navigate={navigate}
        />
      )}
      {route.view === "overview" && <OverviewPage navigate={navigate} />}
      {route.view === "resources" && (
        <ResourcesPage
          key={route.selectedId}
          companyId={route.selectedId}
          navigate={navigate}
        />
      )}
      {route.view === "logs" && <LogsPage />}
      {route.view === "account" && <AccountPage />}
    </AdminLayout>
  );
}

export default function App() {
  const [client] = useState(() => new AdminClient());
  const session = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => {
    const controller = new AbortController();
    void client.restore(controller.signal);
    return () => controller.abort();
  }, [client]);
  return (
    <AdminContext value={client}>
      {session.restoring ? (
        <LoadingState />
      ) : session.user ? (
        <Workspace key={session.generation} />
      ) : (
        <LoginPage key={session.generation} />
      )}
    </AdminContext>
  );
}
