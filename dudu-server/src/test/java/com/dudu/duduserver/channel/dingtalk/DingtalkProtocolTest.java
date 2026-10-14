package com.dudu.duduserver.channel.dingtalk;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 钉钉新 HTTP 密文体系协议验收：success 加密回包（四字段可验签解密）、机器人六种
 * msgtype 黄金载荷（事实库 §5.1 片段 + MockPulse bot.ts 官方样本逐字）到统一消息体、
 * 事件信封只应答不落库、非 JSON 明文拒绝。期望值取官方原文，不按实现重算。
 */
class DingtalkProtocolTest {

    // 黄金向量 A 的密钥三元组：回包加密用真实官方密钥，解密断言可独立复核
    private static final String TOKEN = "123456";
    private static final String TIMESTAMP = "1445827045067";
    private static final String NONCE = "nEXhMP4r";
    private static final String AES_KEY = "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij";
    private static final String OWNER = "suite4xxxxxxxxxxxxxxx";

    private static final long CHANNEL_ID = 9001L;

    private final DingtalkProtocol protocol = new DingtalkProtocol();

    @Test
    void successReplyDecryptsToSuccessAndVerifiesWithIncomingValues() {
        String reply = protocol.successReply(TOKEN, TIMESTAMP, NONCE, AES_KEY, OWNER);

        JSONObject fields = JSONUtil.parseObj(reply);
        assertThat(fields.keySet()).containsExactlyInAnyOrder("msg_signature", "timeStamp", "nonce", "encrypt");
        // 回包 timeStamp/nonce 原样取请求带来的值（中文 configure-http-push 页 getEncryptedMap 四参原文）
        assertThat(fields.getStr("timeStamp")).isEqualTo(TIMESTAMP);
        assertThat(fields.getStr("nonce")).isEqualTo(NONCE);
        assertThat(DingtalkCrypto.decrypt(fields.getStr("encrypt"), AES_KEY, OWNER).message())
            .isEqualTo("success");
        assertThat(DingtalkCrypto.verify(fields.getStr("msg_signature"), TOKEN,
            fields.getStr("timeStamp"), fields.getStr("nonce"), fields.getStr("encrypt"))).isTrue();
    }

    @Test
    void parsesGoldenTextMessageWithFullOfficialEnvelope() {
        // 官方全量黄金样本 §5.1（MockPulse bot.ts 逐字）：信封 + text/robotCode/msgtype
        String plaintext = JSONUtil.createObj()
            .set("senderPlatform", "Mac")
            .set("conversationId", "cid6EUvB2O8qVF2RYQtHTKEsg==")
            .set("atUsers", List.of(Map.of("dingtalkId", "$:LWCP_v1:$PcdFk0c1XakTWLPSQCaVcRzxeEVV3pr5")))
            .set("chatbotCorpId", "ding9733d095*******6cb783455b")
            .set("chatbotUserId", "$:LWCP_v1:$PcdFk0c1XakTWLPSQCaVcRzxeEVV3pr5")
            .set("msgId", "msgrK2ckHkMbaiUWt5xQU+riw==")
            .set("senderNick", "小钉")
            .set("isAdmin", true)
            .set("senderStaffId", "014728255240768602")
            .set("sessionWebhookExpiredTime", 1708332604316L)
            .set("createAt", 1708327204136L)
            .set("senderCorpId", "ding9733d095*******6cb783455b")
            .set("conversationType", "2")
            .set("senderId", "$:LWCP_v1:$6GYsn+zrv5WZ77xc2v4zsyXfBv1MhAv9")
            .set("conversationTitle", "测试群")
            .set("isInAtList", true)
            .set("sessionWebhook", "https://oapi.dingtalk.com/robot/sendBySession?session=66d7c695")
            .set("text", Map.of("content", " text"))
            .set("robotCode", "dingohropvkloy0xdm3k")
            .set("msgtype", "text")
            .toString();

        Optional<ChannelInboundMessage> parsed = protocol.parse(CHANNEL_ID, plaintext);

        assertThat(parsed).isPresent();
        ChannelInboundMessage inbound = parsed.get();
        assertThat(inbound.companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(inbound.externalUserId()).isEqualTo("$:LWCP_v1:$6GYsn+zrv5WZ77xc2v4zsyXfBv1MhAv9");
        assertThat(inbound.name()).isEqualTo("小钉");
        assertThat(inbound.avatarUrl()).isNull();
        assertThat(inbound.externalMessageId()).isEqualTo("msgrK2ckHkMbaiUWt5xQU+riw==");
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.channelFields()).isEmpty();
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", " text"));
    }

    @Test
    void parsesMediaMessagesByDownloadCode() {
        // 官方片段（§5.1 同页逐字）：媒体消息不直接给二进制，给 downloadCode
        Map<String, Object> picture = parse(map()
            .set("msgtype", "picture")
            .set("senderId", "sender-1")
            .set("content", Map.of("downloadCode", "mIofN681YE3f/…")).toString()).content();
        assertThat(picture.get("type")).isEqualTo("image");
        assertThat(media(picture)).containsEntry("id", "mIofN681YE3f/…").containsEntry("kind", "image");

        Map<String, Object> audio = parse(map()
            .set("msgtype", "audio")
            .set("senderId", "sender-1")
            .set("content", Map.of("duration", 4000, "downloadCode", "mIofN…", "recognition", "钉钉，让进步发生"))
            .toString()).content();
        assertThat(audio.get("type")).isEqualTo("audio");
        assertThat(media(audio)).containsEntry("id", "mIofN…").containsEntry("kind", "audio");

        Map<String, Object> video = parse(map()
            .set("msgtype", "video")
            .set("senderId", "sender-1")
            .set("content", Map.of("duration", 4000, "downloadCode", "mIofN…", "videoType", "mp4")).toString())
            .content();
        assertThat(video.get("type")).isEqualTo("video");
        assertThat(media(video)).containsEntry("id", "mIofN…").containsEntry("kind", "video");

        Map<String, Object> file = parse(map()
            .set("msgtype", "file")
            .set("senderId", "sender-1")
            .set("content", Map.of("downloadCode", "mIofN…", "fileName", "钉钉让进步发生.pdf")).toString())
            .content();
        assertThat(file.get("type")).isEqualTo("file");
        assertThat(media(file)).containsEntry("id", "mIofN…").containsEntry("kind", "file")
            .containsEntry("name", "钉钉让进步发生.pdf");
    }

    @Test
    @SuppressWarnings("unchecked")
    void parsesRichTextAsReplyWithPictureAttachments() {
        // 官方片段（逐字）：文本段 + 图片附件段 → 契约 reply 分支
        Map<String, Object> richText = parse(map()
            .set("msgtype", "richText")
            .set("senderId", "sender-1")
            .set("content", Map.of("richText", List.of(
                Map.of("text", "你好"),
                Map.of("downloadCode", "mIofN…", "type", "picture")))).toString()).content();

        assertThat(richText.get("type")).isEqualTo("reply");
        assertThat(richText.get("text")).isEqualTo("你好");
        List<?> attachments = (List<?>) richText.get("attachments");
        assertThat(attachments).hasSize(1);
        assertThat((Map<String, Object>) attachments.get(0))
            .containsEntry("kind", "image").containsEntry("id", "mIofN…");
    }

    @Test
    void parsesPlainTextRichTextAsTextMessage() {
        // 无图片附件的富文本退化为纯文本消息
        Map<String, Object> richText = parse(map()
            .set("msgtype", "richText")
            .set("senderId", "sender-1")
            .set("content", Map.of("richText", List.of(Map.of("text", "你好"), Map.of("text", "世界"))))
            .toString()).content();
        assertThat(richText).isEqualTo(Map.of("type", "text", "text", "你好世界"));
    }

    @Test
    void savesUnknownMsgtypeFaithfullyWithoutSenderFails() {
        // 无法映射的 msgtype 按契约 unknown 如实保存；缺发送方身份不猜值直接拒绝
        Map<String, Object> unknown = parse(map()
            .set("msgtype", "markdown")
            .set("senderId", "sender-1")
            .set("content", Map.of("text", "# 标题")).toString()).content();
        assertThat(unknown).isEqualTo(Map.of("type", "unknown", "originalType", "markdown"));

        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, map()
            .set("msgtype", "text").set("text", Map.of("content", "无发送方")).toString()))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void treatsEventEnvelopeAsAnswerOnlyAndRejectsNonJson() {
        // 事件信封（握手 dt-check_url 官方样本）不产生访客消息
        assertThat(protocol.isEvent("{\"EventType\":\"check_url\"}")).isTrue();
        assertThat(protocol.parse(CHANNEL_ID, "{\"EventType\":\"check_url\"}")).isEmpty();

        // 机器人消息不是事件；非 JSON 明文（网关页/损坏包）拒绝
        assertThat(protocol.isEvent(map().set("msgtype", "text").set("senderId", "s")
            .set("text", Map.of("content", "hi")).toString())).isFalse();
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, "<html>bad gateway</html>"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    private ChannelInboundMessage parse(String plaintext) {
        return protocol.parse(CHANNEL_ID, plaintext).orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> media(Map<String, Object> content) {
        return (Map<String, Object>) content.get("media");
    }

    private JSONObject map() {
        return JSONUtil.createObj();
    }
}
