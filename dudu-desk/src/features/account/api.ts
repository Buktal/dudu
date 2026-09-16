import { DeskApiError } from "@/lib/api-response";

export type AgentSession = Readonly<{
  agent: {
    id: string;
    name: string;
    username: string;
    roleName: string;
    avatarUrl?: string;
  };
  workspace: { id: string; name: string };
}>;

export type LoginCredentials = { username: string; password: string };

// Adapters own credentials. The UI receives identity metadata, never access tokens.
export interface AccountApi {
  getSession(signal: AbortSignal): Promise<AgentSession | null>;
  signIn(
    credentials: LoginCredentials,
    signal: AbortSignal,
  ): Promise<AgentSession>;
  signOut(signal: AbortSignal): Promise<void>;
  dispose?(): void;
}

async function unavailable(): Promise<never> {
  throw new DeskApiError("unavailable", "登录服务暂不可用，请稍后重试");
}

export const unavailableAccountApi: AccountApi = {
  getSession: async () => null,
  signIn: unavailable,
  signOut: unavailable,
};
