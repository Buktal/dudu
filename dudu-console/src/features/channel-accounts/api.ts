import { ApiError, type ConsoleClient } from "@/api/client";
import { isRecord, pageOf, validId } from "@/api/validators";
export interface ChannelField {
  key: string;
  label: string;
  secret: boolean;
  requiredForReceive: boolean;
  requiredForSend: boolean;
  immutableOnceConfigured: boolean;
  control: "text" | "password" | "textarea";
}
export interface ChannelDefinition {
  channel: string;
  name: string;
  available: boolean;
  restriction: string;
  fields: ChannelField[];
  notes: string[];
}
export interface Account {
  companyChannelId: string;
  groupId: string;
  groupName: string;
  channel: string;
  accountName: string;
  receiveConfigured: boolean;
  sendConfigured: boolean;
  missingReceiveFields: string[];
  missingSendFields: string[];
  createTime: string;
  updateTime: string;
}
export interface AccountDetail extends Account {
  callbackUrl: string;
  fields: Record<string, string>;
  configuredSecretFields: string[];
  notes: string[];
}
export interface GroupOption {
  groupId: string;
  groupName: string;
}
export interface AccountFilters {
  page: number;
  pageSize: number;
  keyword?: string;
  groupId?: string;
  channel?: string;
}
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const isGroup = (v: unknown): v is GroupOption =>
  isRecord(v) && validId(v.groupId) && typeof v.groupName === "string";
const isField = (v: unknown): v is ChannelField =>
  isRecord(v) &&
  typeof v.key === "string" &&
  typeof v.label === "string" &&
  [
    "secret",
    "requiredForReceive",
    "requiredForSend",
    "immutableOnceConfigured",
  ].every((k) => typeof v[k] === "boolean") &&
  ["text", "password", "textarea"].includes(String(v.control));
const isDefinition = (v: unknown): v is ChannelDefinition =>
  isRecord(v) &&
  typeof v.channel === "string" &&
  typeof v.name === "string" &&
  typeof v.available === "boolean" &&
  typeof v.restriction === "string" &&
  Array.isArray(v.fields) &&
  v.fields.every(isField) &&
  strings(v.notes);
export const isAccount = (v: unknown): v is Account =>
  isRecord(v) &&
  validId(v.companyChannelId) &&
  validId(v.groupId) &&
  ["groupName", "channel", "accountName", "createTime", "updateTime"].every(
    (k) => typeof v[k] === "string",
  ) &&
  typeof v.receiveConfigured === "boolean" &&
  typeof v.sendConfigured === "boolean" &&
  strings(v.missingReceiveFields) &&
  strings(v.missingSendFields);
const isDetail = (v: unknown): v is AccountDetail =>
  isAccount(v) &&
  isRecord(v) &&
  typeof v.callbackUrl === "string" &&
  isRecord(v.fields) &&
  Object.values(v.fields).every((x) => typeof x === "string") &&
  strings(v.configuredSecretFields) &&
  strings(v.notes);
const MAX_CONFIGURATION_BYTES = 128 * 1024;
// 凭据文本长度上限（数据契约）：多行控件 16384，单行控件 4096，与组件校验共用
export const CREDENTIAL_TEXTAREA_MAX_LENGTH = 16384;
export const CREDENTIAL_TEXT_MAX_LENGTH = 4096;
// telegram Bot token 形如「数字 ID:密钥」，仅作入口格式初检，授权有效性以渠道平台为准
export const TELEGRAM_BOT_TOKEN_PATTERN = /^[0-9]+:[A-Za-z0-9_-]+$/;
// wechat-mini 密文回调必需的应用身份字段：密文回调没有 appId 无法解密回执
export const WECHAT_MINI_APP_ID_FIELD = "appId";
// 服务端下发的系统字段（回调地址等由平台生成）：缺失即接入未就绪，
// 不允许进入「维护名称与凭据」流程
export const SYSTEM_FIELD = "system";
function validateConfigurationSize(body: unknown) {
  if (
    new TextEncoder().encode(JSON.stringify(body)).byteLength >
    MAX_CONFIGURATION_BYTES
  )
    throw new ApiError("配置请求不能超过 128KiB");
}
export const channelApi = {
  catalog: (client: ConsoleClient, signal: AbortSignal) =>
    client.request("/console/channels", {
      signal,
      validate: (v): v is { channels: ChannelDefinition[] } =>
        isRecord(v) &&
        Array.isArray(v.channels) &&
        v.channels.every(isDefinition),
    }),
  query: (
    client: ConsoleClient,
    filters: AccountFilters,
    signal: AbortSignal,
  ) =>
    client.request("/console/company_channels/query", {
      method: "POST",
      body: filters,
      signal,
      paginated: true,
      validate: pageOf(isAccount),
    }),
  detail: (client: ConsoleClient, id: string, signal: AbortSignal) =>
    client.request(`/console/company_channels/${id}`, {
      signal,
      validate: isDetail,
    }),
  async groups(client: ConsoleClient, signal: AbortSignal) {
    const groups: GroupOption[] = [];
    let page = 1;
    while (true) {
      const result = await client.request("/console/user_groups/query", {
        method: "POST",
        body: { page, pageSize: 100 },
        signal,
        paginated: true,
        validate: pageOf(isGroup),
      });
      groups.push(...result.list);
      if (
        result.page * result.pageSize >= result.total ||
        result.list.length === 0
      )
        return groups;
      page = result.page + 1;
    }
  },
  create: async (
    client: ConsoleClient,
    body: {
      groupId: string;
      channel: string;
      accountName: string;
      fields: Record<string, string>;
    },
    signal: AbortSignal,
  ) => {
    validateConfigurationSize(body);
    return client.request("/console/company_channels", {
      method: "POST",
      body,
      signal,
      write: true,
      validate: isDetail,
    });
  },
  update: async (
    client: ConsoleClient,
    id: string,
    body: {
      accountName: string;
      credentialChanges: { set: Record<string, string>; clear: string[] };
    },
    signal: AbortSignal,
  ) => {
    validateConfigurationSize(body);
    return client.request(`/console/company_channels/${id}`, {
      method: "PUT",
      body,
      signal,
      write: true,
      validate: isDetail,
    });
  },
  move: (
    client: ConsoleClient,
    id: string,
    groupId: string,
    signal: AbortSignal,
  ) =>
    client.request(`/console/company_channels/${id}/group`, {
      method: "PUT",
      body: { groupId },
      signal,
      write: true,
      validate: isDetail,
    }),
};
