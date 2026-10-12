import { DeskApiError } from "@/lib/api-response";
import type { AccountApi, AgentSession } from "./api";

const signedOutKey = "dudu-desk.development-signed-out";
const fixture: AgentSession = {
  agent: {
    id: "agent-linzhou",
    name: "林舟",
    username: "linzhou",
    roleName: "客服坐席",
  },
  workspace: { id: "dudu-service", name: "嘟嘟服务中心" },
  access: {
    allGroups: false,
    groups: [{ groupId: "group-service", groupName: "客服组" }],
    accounts: [
      {
        companyChannelId: "channel-wechat",
        groupId: "group-service",
        channel: "wechat",
        accountName: "嘟嘟公众号",
      },
    ],
  },
};

export function createDevelopmentAccountApi(): AccountApi {
  let signedOut = false;
  try {
    signedOut = sessionStorage.getItem(signedOutKey) === "true";
  } catch {
    /* Storage is optional for the development adapter. */
  }
  function remember(value: boolean) {
    signedOut = value;
    try {
      sessionStorage.setItem(signedOutKey, String(value));
    } catch {
      /* Keep the current in-memory session usable. */
    }
  }
  return {
    getSession: async (signal) => {
      signal.throwIfAborted();
      return signedOut ? null : structuredClone(fixture);
    },
    signIn: async ({ username, password }, signal) => {
      signal.throwIfAborted();
      if (username !== "linzhou" || password !== "desk123")
        throw new DeskApiError("authentication", "账号或密码不正确");
      remember(false);
      return structuredClone(fixture);
    },
    signOut: async (signal) => {
      signal.throwIfAborted();
      remember(true);
    },
  };
}
