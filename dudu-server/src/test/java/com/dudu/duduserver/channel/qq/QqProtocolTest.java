package com.dudu.duduserver.channel.qq;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * QQ 回调协议纯逻辑验收（协议事实见 docs/research/channels/qq.md）：官方 webhook 页
 * §3.2 与安全授权页 §4.2 的黄金向量真实可复算，作为 seed 派生、Ed25519 签名与验签的
 * 回归基准。
 */
class QqProtocolTest {

    private static final long CHANNEL_ID = 9601L;

    // 官方 op13 示例账号与黄金向量（qq.md §3.2 逐字拷贝）
    private static final String GOLDEN_HANDSHAKE_SECRET = "DG5g3B4j9X2KOErG";
    private static final String GOLDEN_PLAIN_TOKEN = "Arq0D5A61EgUu4OxUvOp";
    private static final String GOLDEN_EVENT_TS = "1725442341";
    private static final String GOLDEN_HANDSHAKE_SIGNATURE =
        "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d0"
            + "1bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706";

    // 官方事件验签黄金向量（qq.md §4.2）：secret + timestamp 头不变；签名的 Body 原文为
    // 换行缩进的 pretty-print 形态（2026-10-14 逐字节复核勘定，无结尾换行）
    private static final String GOLDEN_VERIFY_SECRET = "naOC0ocQE3shWLAfffVLB1rhYPG7";
    private static final String GOLDEN_VERIFY_BODY = "{\n  \"op\": 0,\n  \"d\": {},\n  \"t\": \"GATEWAY_EVENT_NAME\"\n}";
    private static final String GOLDEN_VERIFY_SIGNATURE =
        "865ad13a61752ca65e26bde6676459cd36cf1be609375b37bd62af366e1dc25a"
            + "8dc789ba7f14e017ada3d554c671a911bfdf075ba54835b23391d509579ed002";

    private final QqProtocol protocol = new QqProtocol();

    @Test
    void handshakeSignsEventTsPlusPlainTokenWithSecretDerivedKey() {
        String response = protocol.handshakeResponse(
            GOLDEN_HANDSHAKE_SECRET, GOLDEN_PLAIN_TOKEN, GOLDEN_EVENT_TS);

        // 官方应答形状：plain_token 原样回显 + signature 十六进制签名（§3.2 逐字）
        assertThat(response).isEqualTo("{\"plain_token\":\"" + GOLDEN_PLAIN_TOKEN
            + "\",\"signature\":\"" + GOLDEN_HANDSHAKE_SIGNATURE + "\"}");
    }

    @Test
    void verifyMatchesOfficialEventSignatureVectorAndRejectsForgedShapes() {
        // 官方 §4.2 黄金向量：secret naOC0ocQE3shWLAfffVLB1rhYPG7 → seed 循环加倍，
        // msg = timestamp 头字符串 + 原始 Body 字节，签名 64 字节 128 位 hex
        assertThat(protocol.verify(GOLDEN_VERIFY_SECRET, GOLDEN_VERIFY_SIGNATURE,
            GOLDEN_EVENT_TS, GOLDEN_VERIFY_BODY)).isTrue();

        // 篡改任一参与签名的材料都验不过
        assertThat(protocol.verify(GOLDEN_VERIFY_SECRET, GOLDEN_VERIFY_SIGNATURE,
            GOLDEN_EVENT_TS, "{\"op\":0,\"t\":\"FORGED_EVENT\"}")).isFalse();
        assertThat(protocol.verify(GOLDEN_VERIFY_SECRET, GOLDEN_VERIFY_SIGNATURE,
            "1725442342", GOLDEN_VERIFY_BODY)).isFalse();
        assertThat(protocol.verify(GOLDEN_HANDSHAKE_SECRET, GOLDEN_VERIFY_SIGNATURE,
            GOLDEN_EVENT_TS, GOLDEN_VERIFY_BODY)).isFalse();

        // 官方预检口径（§4.2 步骤 2）：hex 解码失败、长度不足 64 字节一律拒绝
        assertThat(protocol.verify(GOLDEN_VERIFY_SECRET, "not-hex-signature",
            GOLDEN_EVENT_TS, GOLDEN_VERIFY_BODY)).isFalse();
        assertThat(protocol.verify(GOLDEN_VERIFY_SECRET, "ab" + "0".repeat(126),
            GOLDEN_EVENT_TS, GOLDEN_VERIFY_BODY)).isFalse();

        // 头缺失同样拒绝，不抛异常
        assertThat(protocol.verify(GOLDEN_VERIFY_SECRET, null, GOLDEN_EVENT_TS, GOLDEN_VERIFY_BODY)).isFalse();
        assertThat(protocol.verify(GOLDEN_VERIFY_SECRET, GOLDEN_VERIFY_SIGNATURE, null, GOLDEN_VERIFY_BODY))
            .isFalse();
        assertThat(protocol.verify(GOLDEN_VERIFY_SECRET, GOLDEN_VERIFY_SIGNATURE, GOLDEN_EVENT_TS, null))
            .isFalse();
    }

    @Test
    void parseMapsC2cAndGroupTextMessagesToSceneScopedVisitors() {
        // 官方 C2C 事件样例（qq.md §5.3）：访客身份 = 场景前缀 + user_openid
        ChannelInboundMessage c2c = parse("""
            {"op":0,"t":"C2C_MESSAGE_CREATE","id":"EVENT_1","s":1,"d":{
              "id":"ROBOT1.0_c2c_message_1",
              "author":{"id":"A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4","user_openid":"C2C_OPENID_1",
                "union_openid":"","username":"小明","bot":false},
              "content":"你好，今天有什么推荐的活动吗？","message_type":0,
              "message_scene":{"source":"default","ext":["msg_idx=REFIDX_x=="]},
              "timestamp":"2026-07-21T10:00:00+08:00"}}
            """);
        assertThat(c2c.companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(c2c.externalUserId()).isEqualTo("c2c:C2C_OPENID_1");
        assertThat(c2c.name()).isEqualTo("小明");
        assertThat(c2c.avatarUrl()).isNull();
        assertThat(c2c.externalMessageId()).isEqualTo("ROBOT1.0_c2c_message_1");
        assertThat(c2c.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(c2c.content()).isEqualTo(Map.of("type", "text", "text", "你好，今天有什么推荐的活动吗？"));

        // 官方群@事件样例（qq.md §5.4）：访客身份 = 群 openid（回复对象即本群）
        ChannelInboundMessage group = parse("""
            {"op":0,"t":"GROUP_AT_MESSAGE_CREATE","id":"EVENT_2","s":2,"d":{
              "id":"ROBOT1.0_group_message_1",
              "author":{"id":"A1B2C3D4E5F6A1B2C3D4","member_openid":"MEMBER_OPENID_1",
                "member_role":"member","username":"小明","bot":false},
              "content":" /今日天气 ","group_openid":"GROUP_OPENID_1","message_type":0,
              "timestamp":"2026-07-21T10:00:00+08:00"}}
            """);
        assertThat(group.externalUserId()).isEqualTo("group:GROUP_OPENID_1");
        assertThat(group.name()).isEqualTo("小明");
        assertThat(group.externalMessageId()).isEqualTo("ROBOT1.0_group_message_1");
        assertThat(group.content()).isEqualTo(Map.of("type", "text", "text", " /今日天气 "));
    }

    @Test
    void parseKeepsAttachmentUrlAsReadableMediaReference() {
        // 官方群全量样例（qq.md §5.12 示例 2）：附件 url 即渠道媒体引用与公开下载链接
        Map<String, Object> content = parse("""
            {"op":0,"t":"GROUP_MESSAGE_CREATE","id":"EVENT_3","s":3,"d":{
              "id":"ROBOT1.0_group_message_2",
              "author":{"id":"A1","member_openid":"MEMBER_OPENID_2","username":"小红","bot":false},
              "content":"","group_openid":"GROUP_OPENID_2","message_type":0,
              "attachments":[{"content_type":"image/jpeg","filename":"photo.jpg",
                "url":"https://multimedia.nt.qq.com.cn/download?fid=x&spec=0","width":800,"height":600,"size":1024}]}}
            """).content();
        assertThat(content.get("type")).isEqualTo("image");
        Map<String, Object> media = mediaOf(content);
        assertThat(media).containsEntry("kind", "image")
            .containsEntry("id", "https://multimedia.nt.qq.com.cn/download?fid=x&spec=0")
            .containsEntry("url", "https://multimedia.nt.qq.com.cn/download?fid=x&spec=0");
    }

    @Test
    void parseMapsGuildMessagesWithNameAndAvatar() {
        // 官方频道 AT_MESSAGE_CREATE 样例（qq.md §5.7）：频道会话按 guild 场景隔离
        ChannelInboundMessage guild = parse("""
            {"op":0,"t":"AT_MESSAGE_CREATE","id":"EVENT_4","s":4,"d":{
              "author":{"avatar":"http://thirdqq.qlogo.cn/0","bot":false,"id":"1234","username":"abc"},
              "channel_id":"100010","content":"ndnnd","guild_id":"18700000000001",
              "id":"0812345677890abcdef","timestamp":"2021-05-20T15:14:58+08:00","seq":101}}
            """);
        assertThat(guild.externalUserId()).isEqualTo("guild:1234");
        assertThat(guild.name()).isEqualTo("abc");
        assertThat(guild.avatarUrl()).isEqualTo("http://thirdqq.qlogo.cn/0");
        assertThat(guild.externalMessageId()).isEqualTo("0812345677890abcdef");
        assertThat(guild.content()).isEqualTo(Map.of("type", "text", "text", "ndnnd"));
    }

    @Test
    void relationAndUnknownEventsOnlyAnswerWithoutVisitorMessages() {
        // 官方关系链事件（qq.md §5.5/§5.6）：只应答不落库
        assertThat(protocol.parse(CHANNEL_ID, protocol.envelope("""
            {"op":0,"t":"FRIEND_ADD","id":"EVENT_5","s":5,"d":{
              "openid":"A1B2C3D4E5F6A1B2C3D4","timestamp":1784570523,"scene":1001,"scene_param":"",
              "author":{"union_openid":"DB85A74E07BA08B5B44CD9ED332FCBD2"}}}
            """))).isEmpty();
        assertThat(protocol.parse(CHANNEL_ID, protocol.envelope("""
            {"op":0,"t":"GROUP_ADD_ROBOT","id":"EVENT_6","s":6,"d":{
              "group_openid":"A1B2C3D4E5F6A1B2C3D4","op_member_openid":"A1B2C3D4E5F6A1B2C3D4",
              "timestamp":1784570534}}
            """))).isEmpty();

        // 未收录事件名向前兼容：同样只应答，不拒绝也不猜内容
        assertThat(protocol.parse(CHANNEL_ID, protocol.envelope(
            "{\"op\":0,\"t\":\"SOME_FUTURE_EVENT\",\"d\":{}}"))).isEmpty();
    }

    @Test
    void nonTextTypesAndUnroutablePayloadsStayHonest() {
        // 结构化卡片（message_type=3）非纯文本：如实落 unknown，不猜正文
        Map<String, Object> ark = parse("""
            {"op":0,"t":"C2C_MESSAGE_CREATE","id":"EVENT_7","s":7,"d":{
              "id":"ROBOT1.0_ark_1","author":{"user_openid":"C2C_OPENID_2"},
              "content":"","message_type":3,"ark_data":{"template_id":23}}}
            """).content();
        assertThat(ark).isEqualTo(Map.of("type", "unknown", "originalType", "3"));

        // 缺少发送方身份（既无 user_openid 也无 author.id）无法确定访客，拒绝
        assertThatThrownBy(() -> parse("""
            {"op":0,"t":"C2C_MESSAGE_CREATE","id":"EVENT_8","s":8,"d":{
              "id":"ROBOT1.0_orphan","content":"hi","message_type":0}}
            """)).isInstanceOf(IllegalArgumentException.class);

        // 群消息缺 group_openid 同样无法确定会话对象
        assertThatThrownBy(() -> parse("""
            {"op":0,"t":"GROUP_AT_MESSAGE_CREATE","id":"EVENT_9","s":9,"d":{
              "id":"ROBOT1.0_orphan2","author":{"member_openid":"M"},"content":"hi","message_type":0}}
            """)).isInstanceOf(IllegalArgumentException.class);

        // 报文不是 JSON 无法入站
        assertThatThrownBy(() -> protocol.envelope("not json")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void conversationDecodesScenePrefixForSendRouting() {
        assertThat(QqProtocol.conversation("c2c:C2C_OPENID_1"))
            .isEqualTo(new QqProtocol.Conversation("c2c", "C2C_OPENID_1"));
        assertThat(QqProtocol.conversation("group:GROUP_OPENID_1"))
            .isEqualTo(new QqProtocol.Conversation("group", "GROUP_OPENID_1"));
        assertThat(QqProtocol.conversation("guild:1234"))
            .isEqualTo(new QqProtocol.Conversation("guild", "1234"));
        // 无场景前缀的身份无法路由发送端点，返回 null 由调用方如实失败
        assertThat(QqProtocol.conversation("bare-openid")).isNull();
        assertThat(QqProtocol.conversation("")).isNull();
    }

    private ChannelInboundMessage parse(String body) {
        return protocol.parse(CHANNEL_ID, protocol.envelope(body)).orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mediaOf(Map<String, Object> content) {
        return (Map<String, Object>) content.get("media");
    }
}
