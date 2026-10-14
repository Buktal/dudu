package com.dudu.duduserver.channel.xiaohongshu;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 小红书回调协议验收：握手三参验签与推送四参验签（§10.4/§11.2，签名值以 Python 按官方
 * 算法独立复算）、加密信封取数（Nonce/Timestamp/Encrypt/MsgSignature 在 body 内，Timestamp
 * 为数字）、明文按 MsgType 解析为契约第 4 节统一消息体（§10.3 五型；image/video 仅公开链接，
 * 标识按「消息 ID:0」派生；item/order 映射 card.externalId）；事件回调族与未知类型只应答不落库。
 */
class XiaohongshuProtocolTest {

    // mock-pulse 黄金常量与 Python 独立复算的签名值（同 XiaohongshuCryptoTest 依据）
    private static final String TOKEN = "xhsTestToken";
    private static final String TIMESTAMP = "1648714429";
    private static final String NONCE = "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d";
    private static final String GOLDEN_HANDSHAKE_SIGNATURE = "66643e194cd40e84a39b65d9b2e7d57affa2c5ad";
    private static final String GOLDEN_ENCRYPT =
        "bS0z/nkx36HboyUEjKbr3IeovXTyF7WXkLs5qQ+KCJeH4f3ulcJ29G6PZhgrIwci3EFFlx0w8xgg1DEHb+B86QFtGYINft6w0F0vYjGFw"
            + "onm9lJOneT6D+WUGA0vrhKzSuD++9lhrJdMhLNOAWDpEhLivLuIQgqerUieof5TsedE5+RIc5sw9Z/i+0pzvArXgyLmPFvzlWP/n53"
            + "ZOTIo5b+r6uRSRxCJCkh6MhpCuD4GRPUiltTLLjg8hoZxdH5A";
    private static final String GOLDEN_MSG_SIGNATURE = "90514d607bda0cc78bbf4b18bb817cb34a9ba951";

    private final XiaohongshuProtocol protocol = new XiaohongshuProtocol();

    @Test
    void acceptsGoldenHandshakeSignatureAndRejectsForgedOrIncompleteParams() {
        assertThat(protocol.verify(TOKEN, GOLDEN_HANDSHAKE_SIGNATURE, TIMESTAMP, NONCE)).isTrue();
        assertThat(protocol.verify(TOKEN, "0123456789abcdef0123456789abcdef01234567", TIMESTAMP, NONCE)).isFalse();
        assertThat(protocol.verify(TOKEN, GOLDEN_HANDSHAKE_SIGNATURE, null, NONCE)).isFalse();
        assertThat(protocol.verify(null, GOLDEN_HANDSHAKE_SIGNATURE, TIMESTAMP, NONCE)).isFalse();
    }

    @Test
    void acceptsGoldenFourParamMsgSignatureAndRejectsForgedOrIncompleteParams() {
        assertThat(protocol.verifySignature(TOKEN, GOLDEN_MSG_SIGNATURE, TIMESTAMP, NONCE, GOLDEN_ENCRYPT)).isTrue();
        // 签名材料在 body：Encrypt 变化必须导致校验失败，query 里的三参 signature 不能顶替
        assertThat(protocol.verifySignature(TOKEN, GOLDEN_MSG_SIGNATURE, TIMESTAMP, NONCE, GOLDEN_ENCRYPT + "x"))
            .isFalse();
        assertThat(protocol.verifySignature(TOKEN, GOLDEN_MSG_SIGNATURE, TIMESTAMP, NONCE, null)).isFalse();
        assertThat(protocol.verifySignature(TOKEN, null, TIMESTAMP, NONCE, GOLDEN_ENCRYPT)).isFalse();
    }

    @Test
    void readsEnvelopeFieldsFromBodyWithNumericTimestampAndReturnsNullOnBrokenBody() {
        XiaohongshuEnvelope envelope = protocol.envelopeOf("{\"Nonce\":\"" + NONCE + "\",\"Timestamp\":" + TIMESTAMP
            + ",\"Encrypt\":\"" + GOLDEN_ENCRYPT + "\",\"MsgSignature\":\"" + GOLDEN_MSG_SIGNATURE + "\"}");
        assertThat(envelope).isNotNull();
        assertThat(envelope.nonce()).isEqualTo(NONCE);
        assertThat(envelope.timestamp()).isEqualTo(TIMESTAMP);
        assertThat(envelope.encrypt()).isEqualTo(GOLDEN_ENCRYPT);
        assertThat(envelope.msgSignature()).isEqualTo(GOLDEN_MSG_SIGNATURE);

        assertThat(protocol.envelopeOf("not-json")).isNull();
        assertThat(protocol.envelopeOf("{\"Nonce\":\"n\"}")).isNull();
        assertThat(protocol.envelopeOf(null)).isNull();
    }

    @Test
    void parsesTextPushIntoUnifiedMessageWithSenderAndMsgId() {
        Optional<ChannelInboundMessage> parsed = protocol.parse(7L,
            "{\"MsgId\":\"MSG_ID\",\"FromOpenId\":\"USER_OPEN_ID\",\"ToAppId\":\"SELLER_APP_ID\","
                + "\"MsgType\":\"text\",\"CreateTime\":1648714429,\"Content\":\"你好，请问这款有货吗\"}");

        assertThat(parsed).isPresent();
        ChannelInboundMessage inbound = parsed.get();
        assertThat(inbound.companyChannelId()).isEqualTo(7L);
        assertThat(inbound.externalUserId()).isEqualTo("USER_OPEN_ID");
        assertThat(inbound.externalMessageId()).isEqualTo("MSG_ID");
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "你好，请问这款有货吗"));
    }

    @Test
    void parsesImageAndVideoIntoMediaReferenceWithDerivedIdAndPublicUrl() {
        Optional<ChannelInboundMessage> image = protocol.parse(7L,
            "{\"MsgId\":\"MSG_ID\",\"FromOpenId\":\"USER_OPEN_ID\",\"ToAppId\":\"SELLER_APP_ID\","
                + "\"MsgType\":\"image\",\"CreateTime\":1648714429,"
                + "\"PicUrl\":\"https://img.xhscdn.com/img.jpg\"}");
        assertThat(image).isPresent();
        assertThat(image.get().content()).isEqualTo(Map.of(
            "type", "image",
            "media", Map.of("kind", "image", "id", "MSG_ID:0", "url", "https://img.xhscdn.com/img.jpg")));

        Optional<ChannelInboundMessage> video = protocol.parse(7L,
            "{\"MsgId\":\"MSG_ID\",\"FromOpenId\":\"USER_OPEN_ID\",\"ToAppId\":\"SELLER_APP_ID\","
                + "\"MsgType\":\"video\",\"CreateTime\":1648714429,"
                + "\"VideoUrl\":\"https://img.xhscdn.com/video.mp4\"}");
        assertThat(video).isPresent();
        assertThat(video.get().content()).isEqualTo(Map.of(
            "type", "video",
            "media", Map.of("kind", "video", "id", "MSG_ID:0", "url", "https://img.xhscdn.com/video.mp4")));
    }

    @Test
    void parsesItemAndOrderIntoCardWithExternalId() {
        Optional<ChannelInboundMessage> item = protocol.parse(7L,
            "{\"MsgId\":\"MSG_ID\",\"FromOpenId\":\"USER_OPEN_ID\",\"ToAppId\":\"SELLER_APP_ID\","
                + "\"MsgType\":\"item\",\"CreateTime\":1648714429,\"OutProductId\":\"OUT_PRODUCT_ID\"}");
        assertThat(item).isPresent();
        assertThat(item.get().content()).isEqualTo(Map.of(
            "type", "card", "kind", "item", "externalId", "OUT_PRODUCT_ID"));

        Optional<ChannelInboundMessage> order = protocol.parse(7L,
            "{\"MsgId\":\"MSG_ID\",\"FromOpenId\":\"USER_OPEN_ID\",\"ToAppId\":\"SELLER_APP_ID\","
                + "\"MsgType\":\"order\",\"CreateTime\":1648714429,\"OutOrderId\":\"OUT_ORDER_ID\"}");
        assertThat(order).isPresent();
        assertThat(order.get().content()).isEqualTo(Map.of(
            "type", "card", "kind", "order", "externalId", "OUT_ORDER_ID"));
    }

    @Test
    void dropsEventFamilyAndUnknownTypesAndRejectsMissingSender() {
        // 事件回调族与未知 MsgType 不产生访客消息，调用方只应答 success（§10.7）
        assertThat(protocol.parse(7L, "{\"Event\":\"note_publish\",\"FromOpenId\":\"USER_OPEN_ID\"}")).isEmpty();
        assertThat(protocol.parse(7L, "{\"MsgType\":\"voice\",\"FromOpenId\":\"USER_OPEN_ID\"}")).isEmpty();
        assertThat(protocol.parse(7L, "not-json")).isEmpty();

        // 缺发送方身份无法归属会话，按参数错误拒绝
        assertThatThrownBy(() -> protocol.parse(7L,
            "{\"MsgId\":\"MSG_ID\",\"MsgType\":\"text\",\"Content\":\"hi\"}"))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
