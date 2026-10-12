import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentSession } from "../api";
import { AccountDetails } from "./account-details";

const base = {
  agent: { id: "9", name: "老板", username: "boss", roleName: "企业管理员" },
  workspace: { id: "783101", name: "验收企业" },
};

afterEach(cleanup);

describe("account details", () => {
  it("shows the company workspace and the initial administrator scope", () => {
    const session: AgentSession = {
      ...base,
      access: {
        allGroups: true,
        groups: [
          { groupId: "31", groupName: "售前" },
          { groupId: "32", groupName: "售后" },
        ],
        accounts: [
          {
            companyChannelId: "51",
            groupId: "31",
            channel: "wechat",
            accountName: "公众号",
          },
        ],
      },
    };

    render(<AccountDetails session={session} />);

    expect(screen.getByText("所属企业")).toBeInTheDocument();
    expect(screen.getByText("验收企业")).toBeInTheDocument();
    expect(screen.getByText("接待范围")).toBeInTheDocument();
    expect(
      screen.getByText("全部用户组（2 个组，1 个账号）"),
    ).toBeInTheDocument();
  });

  it("shows the member scope and an explicit empty state without any access", () => {
    render(
      <AccountDetails
        session={{
          ...base,
          access: {
            allGroups: false,
            groups: [{ groupId: "31", groupName: "售前" }],
            accounts: [],
          },
        }}
      />,
    );
    expect(screen.getByText("1 个用户组，0 个账号")).toBeInTheDocument();

    cleanup();
    render(
      <AccountDetails
        session={{
          ...base,
          access: { allGroups: false, groups: [], accounts: [] },
        }}
      />,
    );
    expect(screen.getByText("暂无接待权限")).toBeInTheDocument();
  });
});
