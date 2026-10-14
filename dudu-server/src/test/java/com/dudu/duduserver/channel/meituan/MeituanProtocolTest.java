package com.dudu.duduserver.channel.meituan;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 美团签名对拍（docs/research/channels/meituan.md §4.1、§5.1、§8）：官方黄金算例逐字作为
 * 测试向量——待签串 = 请求 url + ? + 全参数（sig 除外）按参数名字母序 k=v & 连接 + app
 * secret，MD5 32 位小写；签名输入顺序不敏感（内部排序）。
 */
class MeituanProtocolTest {

    // 官方黄金算例（guide/31 签名工具页逐字）：待签串与签名原文
    private static final String GOLDEN_URL = "http://waimaiopen.meituan.com/api/v1/poi/mget";
    private static final String GOLDEN_APP_ID = "1235123121";
    private static final String GOLDEN_POI_CODES = "31";
    private static final String GOLDEN_TIMESTAMP = "1389751221";
    private static final String GOLDEN_SECRET = "d31ba58fd73c71db697ab5e4946d52d";
    private static final String GOLDEN_SIGN = "00934d00d0aea6f12161edfb6456143d";

    private final MeituanProtocol protocol = new MeituanProtocol();

    @Test
    void signsTheOfficialGoldenVectorWhateverTheInputOrder() {
        Map<String, String> params = goldenParams();

        assertThat(protocol.sign(GOLDEN_URL, params, GOLDEN_SECRET)).isEqualTo(GOLDEN_SIGN);

        // 推送参数未排序（§3.1）：签名对输入顺序不敏感，排序只发生在签名计算内
        Map<String, String> shuffled = new HashMap<>();
        shuffled.put("timestamp", GOLDEN_TIMESTAMP);
        shuffled.put("app_poi_codes", GOLDEN_POI_CODES);
        shuffled.put("app_id", GOLDEN_APP_ID);
        assertThat(protocol.sign(GOLDEN_URL, shuffled, GOLDEN_SECRET)).isEqualTo(GOLDEN_SIGN);
    }

    @Test
    void verifiesTheGoldenSignatureAndRejectsTamperedOrMissingMaterials() {
        Map<String, String> signed = goldenParams();
        signed.put("sig", GOLDEN_SIGN);
        assertThat(protocol.verify(GOLDEN_URL, signed, GOLDEN_SECRET)).isTrue();

        // 伪造签名与缺失材料都按校验失败处理，不猜测来源
        Map<String, String> forged = goldenParams();
        forged.put("sig", "0".repeat(32));
        assertThat(protocol.verify(GOLDEN_URL, forged, GOLDEN_SECRET)).isFalse();
        assertThat(protocol.verify(GOLDEN_URL, goldenParams(), GOLDEN_SECRET)).isFalse();
        assertThat(protocol.verify(GOLDEN_URL, signed, "another-secret")).isFalse();
    }

    @Test
    void parsesImChatIntoVisitorMessageAndAnswersTheUppercaseOk() {
        // §5.4 IM 单聊回调字段表逐字：biz_type 固定 1，字段 biz_type/app_poi_code/push_content/
        // extended_field；应答 {"data":"OK"} 4 秒内。已实锤字段无顾客级标识，会话粒度=门店
        // （§8 第 6 条），push_content 内部结构未实锤，按文本如实保存
        Map<String, String> form = imChat();

        ChannelReceiveResult result = protocol.parse(4101L, form);

        assertThat(result.message()).isNotNull();
        ChannelInboundMessage inbound = result.message();
        assertThat(inbound.companyChannelId()).isEqualTo(4101L);
        assertThat(inbound.externalUserId()).isEqualTo("668921");
        assertThat(inbound.externalMessageId()).isNull();
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "你好，在吗？"));
        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.response().body()).isEqualTo("{\"data\":\"OK\"}");
    }

    @Test
    void acknowledgesOrderStoreAndOtherFamilyPushesWithoutVisitorData() {
        // §5.3 订单推送样本逐字（order_id 家族）：事件只应答 {"data":"ok"}，不落访客数据
        Map<String, String> order = new HashMap<>();
        order.put("order_id", "27061900338318741");
        order.put("order_tag_list", "8");
        order.put("wm_order_id_view", "27061900338318741");
        order.put("app_poi_code", "668921");
        order.put("wm_poi_name", "药品01店");
        order.put("recipient_phone", "13812345678_1236");
        order.put("pay_type", "2");
        assertEventOnly(protocol.parse(4101L, order), "{\"data\":\"ok\"}");

        // §5.5 门店绑定/解绑推送逐字：op_type 1-绑定/2-解绑
        Map<String, String> store = new HashMap<>();
        store.put("op_type", "1");
        store.put("poi_info", "{\"app_poi_code\":\"668921\",\"poi_name\":\"药品01店\"}");
        store.put("op_time", "1583393145");
        store.put("op_source", "商家账号信息");
        assertEventOnly(protocol.parse(4101L, store), "{\"data\":\"ok\"}");

        // IM 家族非单聊（匿名评价群聊等 biz_type≠1）：同样只应答大写 OK，不落访客数据
        Map<String, String> group = imChat();
        group.put("biz_type", "4");
        assertEventOnly(protocol.parse(4101L, group), "{\"data\":\"OK\"}");

        // 无判型键的未知推送：按事件只应答（拒绝会触发渠道 1 分钟×3 重推+短信报警，§8 第 8 条）
        Map<String, String> unknown = new HashMap<>();
        unknown.put("logistics_code", "0001");
        unknown.put("app_poi_code", "668921");
        assertEventOnly(protocol.parse(4101L, unknown), "{\"data\":\"ok\"}");
    }

    @Test
    void rejectsImChatMissingRequiredFieldsHonestly() {
        // §5.4 字段表：biz_type/app_poi_code/push_content 均必填，缺失按参数错误拒绝
        Map<String, String> noPushContent = imChat();
        noPushContent.remove("push_content");
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(4101L, noPushContent));

        Map<String, String> noPoi = imChat();
        noPoi.remove("app_poi_code");
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
            () -> protocol.parse(4101L, noPoi));
    }

    @Test
    void decodesTheSecondTimeAsTheOfficialRuleRequires() {
        // §3.1/§8 第 2 条：容器已解码一次，适配器再解码一次即官方「解码 2 次」；
        // 畸形 % 序列保留一次解码值，不抛异常
        Map<String, String> wire = new HashMap<>();
        wire.put("wm_poi_name", "%E8%8D%AF%E5%93%8101%E5%BA%97");
        wire.put("recipient_phone", "13812345678_1236");
        wire.put("garbled", "bad%2seq");

        Map<String, String> decoded = protocol.decodeTwice(wire);

        assertThat(decoded.get("wm_poi_name")).isEqualTo("药品01店");
        assertThat(decoded.get("recipient_phone")).isEqualTo("13812345678_1236");
        assertThat(decoded.get("garbled")).isEqualTo("bad%2seq");
    }

    // §5.4 IM 单聊字段值：app_poi_code 沿用官方样本门店 668921
    private Map<String, String> imChat() {
        Map<String, String> form = new HashMap<>();
        form.put("biz_type", "1");
        form.put("app_poi_code", "668921");
        form.put("push_content", "你好，在吗？");
        form.put("extended_field", "example");
        return form;
    }

    private void assertEventOnly(ChannelReceiveResult result, String ackBody) {
        assertThat(result.message()).isNull();
        assertThat(result.response().status()).isEqualTo(200);
        assertThat(result.response().body()).isEqualTo(ackBody);
    }

    // 官方示例应用级参数：app_poi_codes（复数）为 poi/mget 的门店 code 列表
    private Map<String, String> goldenParams() {
        Map<String, String> params = new HashMap<>();
        params.put("app_id", GOLDEN_APP_ID);
        params.put("app_poi_codes", GOLDEN_POI_CODES);
        params.put("timestamp", GOLDEN_TIMESTAMP);
        return params;
    }
}
