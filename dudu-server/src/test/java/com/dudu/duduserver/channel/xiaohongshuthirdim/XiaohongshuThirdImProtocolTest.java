package com.dudu.duduserver.channel.xiaohongshuthirdim;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Digests;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 小红书三方私信推送协议验收（事实见 docs/research/channels/xiaohongshu-third-im-spec.md）：
 * 验签双算法任一命中即过——HMAC-SHA1 用 RFC 2202 黄金向量钉实现（key=Jefe），拼接
 * SHA1(token+body) 为另一实现口径（§1.2 矛盾未决）；sha1= 前缀剥离含官方文案的等号后
 * 空格形态。线索信封判型（§1.4）三键形态齐全且 leads_id 在场才产生访客消息，判型不符
 * 或缺归属身份一律空返回由调用方只应答。
 */
class XiaohongshuThirdImProtocolTest {

    // RFC 2202 Test Case 2（HMAC-SHA1）：key="Jefe"、data="what do ya want for nothing?"
    // （向量经 openssl dgst -sha1 -hmac 独立复算核验）
    private static final String RFC2202_KEY = "Jefe";
    private static final String RFC2202_DATA = "what do ya want for nothing?";
    private static final String RFC2202_HMAC_SHA1 = "effcdf6ae5eb2fa2d27416d5f184df9c259a7c79";

    private static final String PUSH_TOKEN = "push-token-value";

    // §1.4 字段名逐字（值无官方样本自造）；信封 timestamp 取 spec 样本 1721796000000
    private static final String FULL_LEAD_BODY = "{\"data\":{"
        + "\"landing_page_id\":881,\"url\":\"https://www.xiaohongshu.com/note/1\","
        + "\"submitted_time\":\"2026-07-24 10:00:00\",\"source_channel\":\"search\","
        + "\"account_id\":\"acc-1\",\"account_name\":\"投放一号\",\"campaign_id\":201,"
        + "\"campaign_name\":\"夏季大促\",\"unit_id\":301,\"unit_name\":\"搜索组\","
        + "\"creative_id\":401,\"leads_id\":\"lead-9\",\"keyword\":\"沙发\","
        + "\"data\":[{\"label\":\"电话号码\",\"value\":\"13800000000\"},"
        + "{\"label\":\"用户昵称\",\"value\":\"\"},{\"label\":\"备注\"}]},"
        + "\"timestamp\":1721796000000,\"source\":\"xx\"}";

    private final XiaohongshuThirdImProtocol protocol = new XiaohongshuThirdImProtocol();

    @Test
    void hmacSha1SignatureMatchesRfc2202Vector() {
        // HMAC-SHA1(token, body) 主算法：RFC 2202 向量钉实现，sha1= 前缀剥离
        assertThat(protocol.verifySignature(RFC2202_KEY, "sha1=" + RFC2202_HMAC_SHA1, RFC2202_DATA)).isTrue();
    }

    @Test
    void hmacSignatureToleratesSpaceAfterPrefix() {
        // 官方文案含「sha1= <hex>」等号后空格形态（§1.2 引文逐字），剥离时一并去除
        assertThat(protocol.verifySignature(RFC2202_KEY, "sha1= " + RFC2202_HMAC_SHA1, RFC2202_DATA)).isTrue();
    }

    @Test
    void concatenatedSha1SignatureMatches() {
        // 拼接算法 SHA1(token+body) 兜底命中：另一实现口径（§1.2 矛盾未决）
        String signature = Digests.sha1Hex((RFC2202_KEY + RFC2202_DATA).getBytes(StandardCharsets.UTF_8));
        assertThat(protocol.verifySignature(RFC2202_KEY, "sha1=" + signature, RFC2202_DATA)).isTrue();
    }

    @Test
    void wrongOrMissingSignatureMaterialFails() {
        // 双算法都不中、材料缺失与值形态不完整都按不匹配处理
        assertThat(protocol.verifySignature(RFC2202_KEY, "sha1=" + "0".repeat(40), RFC2202_DATA)).isFalse();
        assertThat(protocol.verifySignature(RFC2202_KEY, null, RFC2202_DATA)).isFalse();
        assertThat(protocol.verifySignature(RFC2202_KEY, "sha1=", RFC2202_DATA)).isFalse();
        assertThat(protocol.verifySignature(null, "sha1=" + RFC2202_HMAC_SHA1, RFC2202_DATA)).isFalse();
        assertThat(protocol.verifySignature(RFC2202_KEY, "sha1=" + RFC2202_HMAC_SHA1, "")).isFalse();
    }

    @Test
    void fullLeadEnvelopeParsesToInboundMessage() {
        Optional<ChannelInboundMessage> inbound = protocol.parseLead(9401L, FULL_LEAD_BODY);
        assertThat(inbound).isPresent();
        ChannelInboundMessage message = inbound.orElseThrow();
        // leads_id 归属会话，leads_id:timestamp 让平台 30s×3 重推幂等（§1.3）
        assertThat(message.externalUserId()).isEqualTo("lead-9");
        assertThat(message.externalMessageId()).isEqualTo("lead-9:1721796000000");
        assertThat(message.name()).isNull();
        assertThat(message.content()).isEqualTo(Map.of("type", "text", "text", "收到小红书私信线索"));
    }

    @Test
    void leadFieldsCarryStructuredColumnsAndLabelPairs() {
        ChannelInboundMessage message = protocol.parseLead(9401L, FULL_LEAD_BODY).orElseThrow();
        // 结构化字段按中文标签进资料项，线索标签键值对跟随其后：value 空串按渠道给出的
        // 空值保存、缺失按未提供保留标签（ChannelField 语义）
        assertThat(message.channelFields()).containsExactly(
            new ChannelInboundMessage.ChannelField("落地页 ID", "881"),
            new ChannelInboundMessage.ChannelField("发送地址", "https://www.xiaohongshu.com/note/1"),
            new ChannelInboundMessage.ChannelField("提交时间", "2026-07-24 10:00:00"),
            new ChannelInboundMessage.ChannelField("渠道", "search"),
            new ChannelInboundMessage.ChannelField("投放账号 ID", "acc-1"),
            new ChannelInboundMessage.ChannelField("投放账号名", "投放一号"),
            new ChannelInboundMessage.ChannelField("广告计划 ID", "201"),
            new ChannelInboundMessage.ChannelField("广告计划名", "夏季大促"),
            new ChannelInboundMessage.ChannelField("广告单元 ID", "301"),
            new ChannelInboundMessage.ChannelField("广告单元名", "搜索组"),
            new ChannelInboundMessage.ChannelField("广告创意 ID", "401"),
            new ChannelInboundMessage.ChannelField("线索 ID", "lead-9"),
            new ChannelInboundMessage.ChannelField("关键词", "沙发"),
            new ChannelInboundMessage.ChannelField("电话号码", "13800000000"),
            new ChannelInboundMessage.ChannelField("用户昵称", ""),
            new ChannelInboundMessage.ChannelField("备注", null));
    }

    @Test
    void envelopeShapeMismatchReturnsEmpty() {
        // data 非对象 / timestamp 非数字 / 缺 source：不是线索信封（可能是未公开的
        // 消息级推送 §1.5），空返回由调用方按成功应答防重推
        assertThat(protocol.parseLead(9401L, "{\"data\":\"x\",\"timestamp\":1,\"source\":\"xx\"}")).isEmpty();
        assertThat(protocol.parseLead(9401L, "{\"data\":{},\"timestamp\":\"1\",\"source\":\"xx\"}")).isEmpty();
        assertThat(protocol.parseLead(9401L, "{\"data\":{},\"timestamp\":1}")).isEmpty();
        assertThat(protocol.parseLead(9401L, "{\"whatever\":\"push\"}")).isEmpty();
        assertThat(protocol.parseLead(9401L, "not-json")).isEmpty();
        assertThat(protocol.parseLead(9401L, null)).isEmpty();
    }

    @Test
    void leadWithoutLeadsIdReturnsEmpty() {
        // 像线索信封但缺归属身份：不拒绝（400 会触发平台三次重推）也不落库
        String body = "{\"data\":{\"keyword\":\"沙发\"},\"timestamp\":1721796000000,\"source\":\"xx\"}";
        assertThat(protocol.parseLead(9401L, body)).isEmpty();
    }

    @Test
    void signatureHeaderNameIsXRedSignature() {
        // §1.2 三家代理商转述同一官方口径的头名；body 缺失在材料缺失分支判失败
        assertThat(XiaohongshuThirdImProtocol.SIGNATURE_HEADER).isEqualTo("X-Red-Signature");
        assertThat(protocol.verifySignature(PUSH_TOKEN, "sha1=" + RFC2202_HMAC_SHA1, null)).isFalse();
    }
}
