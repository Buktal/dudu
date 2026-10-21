import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../ids";
import { wireBodyText } from "../payload";
import { ALI_DEFINITIONS, ALI_SCHEMAS } from "./alipay";

/** 官方 §5.1 公共参数表 + 业务参数表逐字值拼出的核验样本（form 线上字节，
 * RFC 3986 大写 hex：notify_time 空格 %20、冒号 %3A；sign 为官方页样例截断
 * 示意值照录——事实库警示不作验签回归向量，Rust 侧探针样本同源同字节） */
const GOLDEN_NOTIFY_BODY =
  "notify_time=2018-10-21%2015%3A45%3A22&notify_type=trade_status_sync&notify_id=ac05099524730693a8b330c45cf72da943&charset=utf-8&version=1.0&sign_type=RSA2&sign=601510b7970e52cc63db0f44997cf70e&auth_app_id=2018072300007418&trade_no=2013112011001004330000121536&app_id=2019082200007148&out_trade_no=6823789339978248&trade_status=TRADE_SUCCESS&total_amount=10.99";

/** 网关/From 蚂蚁代表（官方未给载荷样本：信封取 §5.1 公共参数族词汇占位 +
 * topic 接口名逐字，见字段说明；sign 占位直发时由适配器现算） */
const GOLDEN_APPAUTH_BODY =
  "notify_time=2026-09-15%2010%3A00%3A00&notify_type=app_auth_cancelled&notify_id=3f0a7c8d92e54b16a0d4c8f21e7b9a03d52&charset=utf-8&version=1.0&sign_type=RSA2&sign=SIGN_PLACEHOLDER&app_id=2019082200007148&topic=alipay.open.auth.appauth.cancelled";
const GOLDEN_FUND_BODY =
  "notify_time=2026-09-15%2010%3A00%3A00&notify_type=fund_trans_changed&notify_id=3f0a7c8d92e54b16a0d4c8f21e7b9a03d52&charset=utf-8&version=1.0&sign_type=RSA2&sign=SIGN_PLACEHOLDER&app_id=2019082200007148&topic=alipay.fund.trans.order.changed";

describe("支付宝事件 schema 聚合（异步通知三地址；RSA2 验签在 Rust 适配器）", () => {
  it("三地址代表 3 模板：notify_url 1 + 应用网关/From 蚂蚁订阅 2，id 全仓库唯一且 ali- 前缀", () => {
    expect(ALI_SCHEMAS).toHaveLength(3);
    const ids = ALI_SCHEMAS.map((schema) => schema.id);
    expect(ids).toEqual([
      "ali-notify-trade-status-sync",
      "ali-gateway-appauth-cancelled",
      "ali-gateway-fund-trans-changed",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("ali-"))).toBe(true);
  });

  it("描述文件装载合法，且模板条目与协议模块一一对应", () => {
    expect(ALI_DEFINITIONS.channelId).toBe("alipay");
    expect(ALI_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(ALI_DEFINITIONS.schemas).sort()).toEqual(
      ALI_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：三地址全部 wire = form（POST 表单 §2.1/§3.1 逐字）", () => {
    for (const schema of ALI_SCHEMAS) {
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
      expect(schema.wire, `${schema.id} wire`).toBe("form");
    }
  });

  it("默认期望回执 = 官方成功应答：HTTP 200 + 纯文本 success（§3.3/§5.3 逐字）", () => {
    for (const schema of ALI_SCHEMAS) {
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "success",
        bodyMode: "equals",
      });
    }
  });

  it("模板载荷逐字对齐事实库：§5.1 两表逐字 + 网关/From 蚂蚁 topic 逐字（信封占位注明）", () => {
    const bodies = ALI_SCHEMAS.map((schema) =>
      wireBodyText(schema, schema.payload),
    );
    expect(bodies[0]).toBe(GOLDEN_NOTIFY_BODY);
    expect(bodies[1]).toBe(GOLDEN_APPAUTH_BODY);
    expect(bodies[2]).toBe(GOLDEN_FUND_BODY);
  });

  it("支付认定口径（§2.1 逐字）：TRADE_SUCCESS 认付款，支付成功不含 out_biz_no/退款字段", () => {
    const notify = ALI_SCHEMAS[0];
    expect(notify.payload.trade_status).toBe("TRADE_SUCCESS");
    expect(notify.payload).not.toHaveProperty("out_biz_no");
    expect(notify.payload).not.toHaveProperty("gmt_refund");
    expect(notify.payload).not.toHaveProperty("refund_fee");
    const statusDescription = notify.fields.find(
      (field) => field.path === "trade_status",
    )?.description;
    expect(statusDescription).toContain("TRADE_FINISHED");
    expect(statusDescription).toContain("买家付款成功");
  });

  it("验签语义锚定（§4.3 rsaCheckV1）：sign/sign_type 在载荷信封，字段说明注明剔除口径", () => {
    const notify = ALI_SCHEMAS[0];
    expect(notify.payload.sign_type).toBe("RSA2");
    const signDescription = notify.fields.find(
      (field) => field.path === "sign",
    )?.description;
    expect(signDescription).toContain("344 位");
    expect(signDescription).toContain("剔除");
    expect(signDescription).toContain("切勿用本 §5.1 拼出的串做验签回归向量");
    const signTypeDescription = notify.fields.find(
      (field) => field.path === "sign_type",
    )?.description;
    expect(signTypeDescription).toContain("不出现在待签串");
  });

  it("网关/From 蚂蚁代表：官方未给载荷样本，信封占位注明、topic 接口名逐字", () => {
    for (const schema of ALI_SCHEMAS.slice(1)) {
      expect(schema.payload.sign).toBe("SIGN_PLACEHOLDER");
      expect(schema.payload.charset).toBe("utf-8");
      expect(schema.payload.version).toBe("1.0");
      const topicDescription = schema.fields.find(
        (field) => field.path === "topic",
      )?.description;
      expect(topicDescription).toContain(schema.payload.topic);
      expect(topicDescription).toContain("模拟器占位");
      expect(schema.name).toContain(String(schema.payload.topic));
    }
    expect(ALI_SCHEMAS[1].payload.topic).toBe(
      "alipay.open.auth.appauth.cancelled",
    );
    expect(ALI_SCHEMAS[2].payload.topic).toBe(
      "alipay.fund.trans.order.changed",
    );
  });

  it("ID 生成器官方形态：notify_id 按 §5.1 样本 35 位小写十六进制重生成（幂等键 §3.4）", () => {
    for (const schema of ALI_SCHEMAS) {
      const draft = applyGeneratedIds(schema, structuredClone(schema.payload));
      const regenerated = String(draft.notify_id);
      expect(regenerated).toMatch(/^[0-9a-f]{35}$/);
      expect(regenerated).not.toBe(schema.payload.notify_id);
      // 官方实锤词汇/样本值不重生（trade_no/out_trade_no/app_id/topic 照录）
      expect(draft.app_id).toBe(schema.payload.app_id);
      expect(draft.topic).toBe(schema.payload.topic);
    }
    const notifyDraft = applyGeneratedIds(
      ALI_SCHEMAS[0],
      structuredClone(ALI_SCHEMAS[0].payload),
    );
    expect(notifyDraft.trade_no).toBe(ALI_SCHEMAS[0].payload.trade_no);
    expect(notifyDraft.out_trade_no).toBe(ALI_SCHEMAS[0].payload.out_trade_no);
  });
});
