import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { AccountApi } from "./api";
import { AccountScreen } from "./components/account-screen";
import { SignIn } from "./components/sign-in";
import { createHttpAccountApi } from "./http-account-api";
import {
  type AccountSessionStore,
  createAccountSession,
} from "./stores/session";

const AccountContext = createContext<AccountSessionStore | null>(null);

export function AccountProvider({
  api,
  children,
}: {
  api?: AccountApi;
  children: ReactNode;
}) {
  const [store, setStore] = useState<AccountSessionStore>();
  useEffect(() => {
    // 真实适配器同步构造：未注入时由本组件拥有并在卸载时释放
    const adapter = api ?? createHttpAccountApi();
    const session = createAccountSession(adapter);
    setStore(session);
    void session.restore();
    return () => {
      session.dispose();
      if (!api) adapter.dispose?.();
    };
  }, [api]);
  return store ? (
    <AccountContext value={store}>{children}</AccountContext>
  ) : (
    <AccountScreen />
  );
}

export function useAccount() {
  const store = useContext(AccountContext);
  if (!store) throw new Error("useAccount must be used within AccountProvider");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return {
    ...snapshot,
    signIn: store.signIn,
    signOut: store.signOut,
    refresh: store.refresh,
  };
}

export function AccountGate({ children }: { children: ReactNode }) {
  const account = useAccount();
  if (account.status === "loading") return <AccountScreen />;
  if (account.session) return children;
  return (
    <SignIn
      pending={account.status === "signing-in"}
      error={account.error?.message}
      onSignIn={account.signIn}
    />
  );
}
