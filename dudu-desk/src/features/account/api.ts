import { DeskApiError } from "@/lib/api-response";

type AgentAccessGroup = Readonly<{
  groupId: string;
  groupName: string;
}>;

// 当前授权组内属于本企业的渠道账号；不包含渠道凭据与接入参数
type AgentAccessAccount = Readonly<{
  companyChannelId: string;
  groupId: string;
  channel: string;
  accountName: string;
}>;

// 当前企业内的接待范围；空数组只表示当前没有相应数据，allGroups 仅初始企业管理员为 true
export type AgentAccess = Readonly<{
  allGroups: boolean;
  groups: readonly AgentAccessGroup[];
  accounts: readonly AgentAccessAccount[];
}>;

export type AgentSession = Readonly<{
  agent: {
    id: string;
    name: string;
    username: string;
    roleName: string;
  };
  workspace: { id: string; name: string };
  access: AgentAccess;
}>;

// 企业登录凭据：企业 ID 定位企业作用域，账号在企业内不区分大小写
export type LoginCredentials = {
  companyId: string;
  username: string;
  password: string;
};

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
