package com.dudu.duduserver.channel.wechatmini;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 小程序回调协议验收：官方数值例验签（docs/research/channels/wechat-mini.md §3.2、§4.1、
 * §4.2）与官方推送包解析（§5.3、§5.4）——text/image/miniprogrampage 三包与进入会话事件；
 * 密文校验用 msg_signature 而非 signature（官方注意事项原文）。
 */
class WechatMiniProtocolTest {

    private static final String TOKEN = "AAAAA";
    private static final long CHANNEL_ID = 9001L;

    private final WechatMiniProtocol protocol = new WechatMiniProtocol();

    @Test
    void verifyMatchesOfficialHandshakeAndPlainPostVectors() {
        // 数值例一：GET 握手，token/timestamp/nonce 排序拼接 15147114921714036504AAAAA → sha1
        assertThat(protocol.verify(TOKEN, "f464b24fc39322e44b38aa78f5edd27bd1441696", "1514711492", "1714036504"))
            .isTrue();
        // 数值例二：明文模式推送 URL 三参签名
        assertThat(protocol.verify(TOKEN, "899cf89e464efb63f54ddac96b0a0a235f53aa78", "1714037059", "486452656"))
            .isTrue();

        assertThat(protocol.verify(TOKEN, "f464b24fc39322e44b38aa78f5edd27bd1441697", "1514711492", "1714036504"))
            .isFalse();
        assertThat(protocol.verify("", "899cf89e464efb63f54ddac96b0a0a235f53aa78", "1714037059", "486452656"))
            .isFalse();
        assertThat(protocol.verify(TOKEN, null, "1714037059", "486452656")).isFalse();
    }

    @Test
    void verifySignatureMatchesOfficialSecureModeVector() {
        // 数值例三：官方安全模式算例，Encrypt 取包体字段，四参排序拼接后 sha1 → 046e02f8…
        String encrypt = "+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVza"
            + "zhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwK"
            + "SqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04=";
        assertThat(protocol.verifySignature(TOKEN, "046e02f8204d34f8ba5fa3b1db94908f3df2e9b3",
            "1714112445", "415670741", encrypt)).isTrue();
        // 官方明文三参签名不能通过四参校验：加密报文禁止用 signature 验证
        assertThat(protocol.verifySignature(TOKEN, "6c5c811b55cc85e0e1b54100749188c20beb3f5d",
            "1714112445", "415670741", encrypt)).isFalse();
        assertThat(protocol.verifySignature(TOKEN, null, "1714112445", "415670741", encrypt)).isFalse();
        assertThat(protocol.verifySignature(TOKEN, "046e02f8204d34f8ba5fa3b1db94908f3df2e9b3",
            "1714112445", "415670741", null)).isFalse();
    }

    @Test
    void parsesOfficialTextPayloadInXmlAndJsonFormats() {
        // 官方 §5.3 文本消息 XML 原文（三空格缩进、MsgId 裸文本）
        Optional<ChannelInboundMessage> xml = protocol.parse(CHANNEL_ID, """
            <xml>
               <ToUserName><![CDATA[toUser]]></ToUserName>
               <FromUserName><![CDATA[fromUser]]></FromUserName>
               <CreateTime>1482048670</CreateTime>
               <MsgType><![CDATA[text]]></MsgType>
               <Content><![CDATA[this is a test]]></Content>
               <MsgId>1234567890123456</MsgId>
            </xml>
            """);
        assertThat(xml).isPresent();
        assertThat(xml.get().companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(xml.get().externalUserId()).isEqualTo("fromUser");
        assertThat(xml.get().externalMessageId()).isEqualTo("1234567890123456");
        assertThat(xml.get().direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(xml.get().name()).isNull();
        assertThat(xml.get().avatarUrl()).isNull();
        assertThat(xml.get().channelFields()).isEmpty();
        assertThat(xml.get().content()).isEqualTo(Map.of("type", "text", "text", "this is a test"));

        // 官方 §5.3 同包 JSON 形态原文：数据格式 XML/JSON 可选（§3.1）
        Optional<ChannelInboundMessage> json = protocol.parse(CHANNEL_ID, """
            {
              "ToUserName": "toUser",
              "FromUserName": "fromUser",
              "CreateTime": 1482048670,
              "MsgType": "text",
              "Content": "this is a test",
              "MsgId": 1234567890123456
            }
            """);
        assertThat(json.get().content()).isEqualTo(Map.of("type", "text", "text", "this is a test"));
        assertThat(json.get().externalMessageId()).isEqualTo("1234567890123456");
    }

    @Test
    void parsesOfficialImageAndMiniProgramCardPayloads() {
        // 官方 §5.4 图片推送：PicUrl 系统生成链接 + MediaId 可拉取素材
        Map<String, Object> image = parse("""
            {
              "ToUserName": "toUser",
              "FromUserName": "fromUser",
              "CreateTime": 1482048670,
              "MsgType": "image",
              "PicUrl": "this is a url",
              "MediaId": "media_id",
              "MsgId": 1234567890123456
            }
            """).content();
        assertThat(image.get("type")).isEqualTo("image");
        assertThat(media(image)).containsEntry("kind", "image").containsEntry("id", "media_id")
            .containsEntry("url", "this is a url");

        // 官方 §5.4 小程序卡片：标题进卡片 title；PagePath 是页内路径不是外链、
        // ThumbMediaId 是封面素材编号，都不映射成 url/externalId 以免 Desk 出坏链接
        Map<String, Object> card = parse("""
            {
              "ToUserName": "toUser",
              "FromUserName": "fromUser",
              "CreateTime": 1482048670,
              "MsgType": "miniprogrampage",
              "MsgId": 1234567890123456,
              "Title": "title",
              "AppId": "appid",
              "PagePath": "path",
              "ThumbUrl": "",
              "ThumbMediaId": ""
            }
            """).content();
        assertThat(card).isEqualTo(Map.of("type", "card", "kind", "miniprogrampage", "title", "title"));
    }

    @Test
    void imageFallsBackToMessageScopedIdAndUnmappableStaysUnknown() {
        // 渠道未给 MediaId 时用「消息 ID:媒体下标」派生稳定标识
        Map<String, Object> fallback = parse("""
            {
              "ToUserName": "toUser",
              "FromUserName": "fromUser",
              "CreateTime": 1482048670,
              "MsgType": "image",
              "PicUrl": "this is a url",
              "MsgId": 1234567890123456
            }
            """).content();
        assertThat(media(fallback)).containsEntry("id", "1234567890123456:0").containsEntry("url", "this is a url");

        // 既无 MediaId 又无 MsgId：媒体引用必有 id，没有可如实表达的引用时归 unknown
        Map<String, Object> unknown = parse("""
            {"ToUserName":"toUser","FromUserName":"fromUser","CreateTime":1482048670,
             "MsgType":"image","PicUrl":"this is a url"}
            """).content();
        assertThat(unknown).isEqualTo(Map.of("type", "unknown", "originalType", "image"));

        // 无法映射的未来类型按 unknown 如实保存
        Map<String, Object> future = parse("""
            {"ToUserName":"toUser","FromUserName":"fromUser","CreateTime":1482048670,
             "MsgType":"future_type","MsgId":42}
            """).content();
        assertThat(future).isEqualTo(Map.of("type", "unknown", "originalType", "future_type"));
    }

    @Test
    void enterTempSessionEventAcknowledgesWithoutVisitorMessage() {
        // 官方 §5.4 进入会话事件：只应答不落库
        assertThat(protocol.parse(CHANNEL_ID, """
            {
              "ToUserName": "toUser",
              "FromUserName": "fromUser",
              "CreateTime": 1482048670,
              "MsgType": "event",
              "Event": "user_enter_tempsession",
              "SessionFrom": "sessionFrom"
            }
            """)).isEmpty();

        assertThat(protocol.parse(CHANNEL_ID, """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>123456789</CreateTime><MsgType><![CDATA[event]]></MsgType>
            <Event><![CDATA[user_enter_tempsession]]></Event></xml>
            """)).isEmpty();
    }

    @Test
    void malformedOrIdentitylessPayloadIsRejected() {
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, "not a payload"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, """
            <xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[hi]]></Content></xml>
            """)).isInstanceOf(IllegalArgumentException.class);
    }

    private ChannelInboundMessage parse(String payload) {
        return protocol.parse(CHANNEL_ID, payload).orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> media(Map<String, Object> content) {
        return (Map<String, Object>) content.get("media");
    }
}

