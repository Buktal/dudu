import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";

describe("抖音企业号线索组件模板（v1.0.5）", () => {
  it("高级在线预约：component_id 在 content 顶层为字符串，配置串内为数字（§5.18.1）", () => {
    const content = schemaById("dy-premium-card").payload.content as Record<
      string,
      unknown
    >;
    expect(content.message_type).toBe("premium_online_appointment_card");
    // 官方样本顶层为字符串形态、配置串内为数字形态，两种形态逐字保留
    expect(content.component_id).toBe("7140809997826394892");
    expect(content.component_status).toBe(1);
    expect(content.marketing_tool).toContain(
      '"component_id":7140809997826394892',
    );
    // 签名图片直链的 & 以 & 转义形态保留
    expect(content.marketing_tool).toContain("\\u0026x-expires=");
  });

  it("企业微信卡：配置串字段名 common_content、type=wechat_ca_card（§5.18.2）", () => {
    const content = schemaById("dy-enterprise-wechat-card").payload
      .content as Record<string, unknown>;
    expect(content.message_type).toBe("enterprise_wechat_card");
    expect(content.common_content).toBe(
      '{"type":"wechat_ca_card","enterprise_name":"蓝v婚庆113","company_name":"企业号经营","tag":"提供专属优质服务","button_text":"添加企业微信"}',
    );
  });

  it("团购商品：product_id 数字、价格单位分、product_url 为 aweme scheme（§5.18.3）", () => {
    const content = schemaById("dy-product").payload.content as Record<
      string,
      unknown
    >;
    expect(content.message_type).toBe("product");
    expect(content.product).toContain('"product_id":1792588596209674,');
    expect(content.product).toContain('"product_name":"欢聚|清汤1份2人餐"');
    expect(content.product).toContain('"actual_amount":100');
    expect(content.product).toContain('"origin_amount":1500');
    expect(content.product).toContain(
      '"product_url":"aweme://poi/goodsdetail/',
    );
  });

  it("系统提示：tips 含中文引号与 {{1}} 占位符，push_detail 恒空串（§5.18.4）", () => {
    const content = schemaById("dy-notice").payload.content as Record<
      string,
      unknown
    >;
    expect(content.message_type).toBe("notice");
    expect(content.notice).toBe(
      '{"tips":"回复超时，智能客服介入接待（您可以在“人工客服设置-接待不及时设置”中调整配置） {{1}}","push_detail":""}',
    );
  });

  it("问题引导：title 与八个城市选项逐字（§5.18.5）", () => {
    const content = schemaById("dy-question-list").payload.content as Record<
      string,
      unknown
    >;
    expect(content.message_type).toBe("question_list");
    expect(content.question_list).toBe(
      '{"title":"好的亲，请问您家房子是在【哪个城市】呢？给您安排附近门店。","questions":["北京","上海","深圳","广州","杭州","南京","成都","其他城市"]}',
    );
  });

  it("五个模板信封身份一致：from/to 随 user_infos 官方序（[0]=企业号）", () => {
    for (const id of [
      "dy-premium-card",
      "dy-enterprise-wechat-card",
      "dy-product",
      "dy-notice",
      "dy-question-list",
    ]) {
      const payload = schemaById(id).payload;
      const content = payload.content as {
        user_infos: Array<{ open_id: string }>;
      };
      expect(payload.event).toBe("im_receive_msg");
      expect(payload.from_user_id).toBe(content.user_infos[0]?.open_id);
      expect(payload.to_user_id).toBe(content.user_infos[1]?.open_id);
    }
  });

  it("ID 生成复用 IM 消息族规则：信封、会话与两侧资料 ID 均覆盖", () => {
    const paths = schemaById("dy-premium-card").idGenerations.map(
      (rule) => rule.path,
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        "from_user_id",
        "to_user_id",
        "content.conversation_short_id",
        "content.server_message_id",
        "content.create_time",
        "content.user_infos[0].open_id",
        "content.user_infos[1].open_id",
      ]),
    );
  });
});
