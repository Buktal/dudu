import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";

/** 官方黄金样本 §5.14（new_video_digg / new_follow_action，content 为 json 字符串，逐字） */
const goldenDiggContent =
  '{"action_type":1,"action_time":1686817996,"item_id":"@9VwWjvGUTp9kKW+ma4huFs791WPtO/mAPpx3rg6nL1kRbfn/60zdRmYqig357zEBDoyWkKJYf4Ae9sL0fd9gYw=="}';
const goldenFollowContent = '{"action_type":1,"action_time":1686811643}';

/** 官方黄金样本 §5.15（contract_authorize，content 为 json 字符串，逐字） */
const goldenContractContent = '{"scopes":["经营Scope"],"timestamp":123456789}';

/** 官方黄金样本 §5.16（service_market_order content，逐字；service_id 官方原文带掩码） */
const goldenOrderContent =
  '{"order_id":"701913106392234xxxx","order_event":1,"order_snapshot":{"order_id":"701913106392234xxxx","service_id":"7021602203591******","service_name":"服务名称","service_mode_id":"standard_1","specification_type":3,"specification_title":"标准版","create_time":1631850028000,"order_event_time":1631850028000},"purchase_info":{"order_id":"701913106392234xxxx","service_id":"7021602203591******","service_mode_id":"standard_1","specification_type":3,"effective_time":1651409686000,"expire_time":1651841686602}}';

describe("抖音 dop 主体系模板", () => {
  it("dop 14 事件全部入表且事件名与官方目录一致", () => {
    const dop = [
      "dy-create-video",
      "dy-authorize",
      "dy-unauthorize",
      "dy-contract-authorize",
      "dy-contract-unauthorize",
      "dy-union-auth-c",
      "dy-union-auth-b",
      "dy-new-video-digg",
      "dy-new-follow",
      "dy-group-audit",
      "dy-group-fans",
      "dy-im-group-receive",
      "dy-im-group-send",
      "dy-service-market-order",
    ].map((id) => schemaById(id));
    expect(dop.map((schema) => schema.eventName)).toEqual([
      "create_video",
      "authorize",
      "unauthorize",
      "contract_authorize",
      "contract_unauthorize",
      "union_auth_info_for_c",
      "union_auth_info_for_b",
      "new_video_digg",
      "new_follow_action",
      "enter_group_audit_change",
      "group_fans_event",
      "im_group_receive_msg",
      "im_group_send_msg",
      "service_market_order",
    ]);
  });

  it("create_video/authorize 黄金载荷逐字（官方 schema 示例空值形态）", () => {
    expect(schemaById("dy-create-video").payload).toEqual({
      event: "create_video",
      from_user_id: "",
      client_key: "",
      content: { item_id: "", share_id: "" },
    });
    expect(schemaById("dy-authorize").payload).toEqual({
      event: "authorize",
      from_user_id: "",
      client_key: "",
      content: { scopes: [] },
    });
    expect(schemaById("dy-unauthorize").payload).toMatchObject({
      event: "unauthorize",
      content: { scopes: [] },
    });
  });

  it("行为/经营/订单事件的 content 为官方 json 字符串（逐字）", () => {
    expect(schemaById("dy-new-video-digg").payload.content).toBe(
      goldenDiggContent,
    );
    expect(schemaById("dy-new-follow").payload.content).toBe(
      goldenFollowContent,
    );
    expect(schemaById("dy-contract-authorize").payload.content).toBe(
      goldenContractContent,
    );
    expect(schemaById("dy-contract-unauthorize").payload.content).toBe(
      goldenContractContent,
    );
    expect(schemaById("dy-service-market-order").payload.content).toBe(
      goldenOrderContent,
    );
    // contentString 旗标随载荷形态（unstringify 编辑模型）
    for (const id of [
      "dy-new-video-digg",
      "dy-new-follow",
      "dy-contract-authorize",
      "dy-service-market-order",
    ]) {
      expect(schemaById(id).contentString).toBe(true);
    }
  });

  it("行为事件的黄金信封逐字（含官方 log_id/客户端标识）", () => {
    expect(schemaById("dy-new-video-digg").payload).toMatchObject({
      client_key: "awr8bfr64vxgk036",
      from_user_id: "5adb9d61-b91a-4382-8252-b0cea8793e35",
      to_user_id: "e3af6e1d-d83a-4116-8f9f-5cb8ac2413c7",
      log_id: "20230615163316517143EDD4CEF10721B6",
    });
    expect(schemaById("dy-new-follow").payload).toMatchObject({
      from_user_id: "5bfa0218-477c-4d51-865c-64f0588794a6",
      log_id: "202306151447300000000000005369C6D",
    });
  });

  it("群聊/联合授权事件按官方空 content 骨架装载", () => {
    for (const id of [
      "dy-union-auth-c",
      "dy-union-auth-b",
      "dy-group-audit",
      "dy-group-fans",
    ]) {
      expect(schemaById(id).payload).toMatchObject({ content: {} });
    }
    // 群聊消息骨架按 §5.4 信封键序（event → client_key → from_user_id → to_user_id → content）
    expect(Object.keys(schemaById("dy-im-group-receive").payload)).toEqual([
      "event",
      "client_key",
      "from_user_id",
      "to_user_id",
      "content",
    ]);
  });

  it("期望回执 = dop 真实语义：HTTP 200，正文不校验", () => {
    for (const id of [
      "dy-create-video",
      "dy-authorize",
      "dy-new-video-digg",
      "dy-service-market-order",
    ]) {
      expect(schemaById(id).expected).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });
});
