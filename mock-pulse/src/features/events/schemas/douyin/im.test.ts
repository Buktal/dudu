import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";

describe("抖音 IM 私信明细模板", () => {
  it("message_type 变体逐字取自官方黄金样本（§5.6/§5.7/§5.8/§5.9）", () => {
    // §5.6 表情：resource 三件 + gif
    const emoji = schemaById("dy-emoji").payload;
    expect(emoji).toMatchObject({
      from_user_id: "eeb0ea9b-bed4-4b70-913d-c29bfc00000",
      to_user_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
    });
    expect(emoji.content).toMatchObject({
      conversation_type: 1,
      create_time: 1656671771668,
      message_type: "emoji",
      resource_type: "gif",
      resource_width: 450,
      resource_height: 450,
      resource_url: "",
      index: "1672502407220000",
    });

    // §5.7 图片与 user_local_image 同构（仅 message_type 不同）
    expect(schemaById("dy-image").payload.content).toMatchObject({
      message_type: "image",
      index: "1672502407220000",
    });
    expect(schemaById("dy-local-image").payload.content).toMatchObject({
      message_type: "user_local_image",
    });
    const localImage = schemaById("dy-local-image").payload.content as Record<
      string,
      unknown
    >;
    const image = schemaById("dy-image").payload.content as Record<
      string,
      unknown
    >;
    expect(localImage.conversation_short_id).toBe(image.conversation_short_id);

    // §5.8 视频分享：item_id 为 @ 加密串
    expect(schemaById("dy-video").payload.content).toMatchObject({
      message_type: "video",
      item_id:
        "@72NwHyW53+MNggFhRkwGuX1ntuc2RfUyVnKfdTzwU0F0CtjUrU9MpJSYEVV6/2hKy3NMVbBhh6BW27IsDFieLg==",
    });
  });

  it("留资卡片-完成态黄金载荷逐字（§5.9，card_status=2 + card_data 三项）", () => {
    const card = schemaById("dy-retain-card").payload;
    expect(card.content).toMatchObject({
      message_type: "retain_consult_card",
      index: "1672502407220000",
      card_id:
        "@72MqAjfymKYS1xNrB0sG4X1iidgOeMsMbUSpQwLJb3kYzJh7eXsSr5+aH2GTsvEv",
      card_status: 2,
      card_data: [
        { label: "姓名", value: "Tonality" },
        { label: "手机号", value: "12345678901" },
        { label: "城市", value: "北京市北京市海淀区" },
      ],
    });
  });

  it("线索电话卡片黄金载荷逐字（§5.18 content + 官方注明补信封）", () => {
    const leads = schemaById("dy-leads-phone-card").payload;
    expect(leads.content).toMatchObject({
      conversation_short_id:
        "@9VwDhOCRTcMhM22uc8ptWc791mzgO/mKM5xwrQmjL1AVafT460zdRmYqig357zEBh7/PnNH674GEk3Xg4tuf3e==",
      server_message_id:
        "@9VwDhOCRTcMhM22uc8ptWc790GDoPvCBPpB5oA6lKFEXaPD960zdRmYqig357zEBaz9O5wCBmBjy0YTazvfVqg==",
      create_time: 1758193500753,
      message_type: "leads_phone_card",
      source: "",
      im_mode: "Unset",
      leads_phone_card:
        '{"title":"我","button_text":"立即预约","bottom_text":"提交即发送抖音绑定手机号"}',
      group_info: {},
      // 官方样本该字段为数字形态（与私聊样本的字符串形态不同，逐字保留）
      index: 1672502400690000,
    });
    expect(
      (leads.content as { user_infos: unknown[] }).user_infos,
    ).toHaveLength(2);
  });

  it("发送私信文本与接收文本同构，事件名换 im_send_msg", () => {
    const send = schemaById("dy-send-text").payload;
    expect(send.event).toBe("im_send_msg");
    const receive = schemaById("dy-text").payload;
    expect(send.content).toEqual(receive.content);
  });

  it("撤回私信黄金载荷逐字（§5.12，含掩码星号与独有 msg_id）", () => {
    expect(schemaById("dy-recall").payload).toEqual({
      event: "im_recall_msg",
      client_key: "tt5daf***",
      from_user_id: "236ed9d9-2cb3-4d2f-a834-***",
      to_user_id: "971d8bed-40b6-417e-a88a-***",
      content: '{"server_message_id":"@9VwNxuKKBZ03MXG7M8ooWM791mzu***"}',
      log_id: "02172241112209700000000000000000000ffff0a94***",
      msg_id: "3292f6c3e9fba93e0255fdf12558b0224ca64cbf8d489070857c99***",
    });
    expect(schemaById("dy-recall").contentString).toBe(true);
  });

  it("ID 生成覆盖事件特有路径：视频 item_id、撤回 server_message_id、已读 read_open_id", () => {
    const videoPaths = schemaById("dy-video").idGenerations.map(
      (rule) => rule.path,
    );
    expect(videoPaths).toContain("content.item_id");

    const recallPaths = schemaById("dy-recall").idGenerations.map(
      (rule) => rule.path,
    );
    expect(recallPaths).toEqual(
      expect.arrayContaining(["msg_id", "content.server_message_id", "log_id"]),
    );

    const readPaths = schemaById("dy-read").idGenerations.map(
      (rule) => rule.path,
    );
    expect(readPaths).toContain("content.read_open_id");
    expect(readPaths).not.toContain("content.server_message_id");
  });
});
