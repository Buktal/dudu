package com.dudu.duduserver.channel.wechatmp;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 公众号明文模式协议纯逻辑验收：官方数值例验签、七类消息体映射、事件与异常报文处理。
 */
class WechatMpProtocolTest {

    private static final long CHANNEL_ID = 9001L;
    private static final String TOKEN = "AAAAA";

    private final WechatMpProtocol protocol = new WechatMpProtocol();

    @Test
    void verifyMatchesOfficialSignatureVector() {
        // 官方明文数值例：token=AAAAA timeStamp=1714037059 nonce=486452656
        assertThat(protocol.verify(TOKEN, "899cf89e464efb63f54ddac96b0a0a235f53aa78", "1714037059", "486452656"))
            .isTrue();
        assertThat(protocol.verify(TOKEN, "899cf89e464efb63f54ddac96b0a0a235f53aa79", "1714037059", "486452656"))
            .isFalse();
        assertThat(protocol.verify("", "899cf89e464efb63f54ddac96b0a0a235f53aa78", "1714037059", "486452656"))
            .isFalse();
        assertThat(protocol.verify(TOKEN, null, "1714037059", "486452656")).isFalse();
    }

    @Test
    void parsesTextMessageWithCdata() {
        Optional<ChannelInboundMessage> parsed = protocol.parse(CHANNEL_ID, textXml("this is a test", "1234567890123456"));

        assertThat(parsed).isPresent();
        ChannelInboundMessage inbound = parsed.get();
        assertThat(inbound.companyChannelId()).isEqualTo(CHANNEL_ID);
        assertThat(inbound.externalUserId()).isEqualTo("fromUser");
        assertThat(inbound.externalMessageId()).isEqualTo("1234567890123456");
        assertThat(inbound.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(inbound.name()).isNull();
        assertThat(inbound.avatarUrl()).isNull();
        assertThat(inbound.channelFields()).isEmpty();
        assertThat(inbound.content()).isEqualTo(Map.of("type", "text", "text", "this is a test"));
    }

    @Test
    void parsesImageVoiceVideoLocationAndLinkBodies() {
        Map<String, Object> image = parse(imageXml()).content();
        assertThat(image.get("type")).isEqualTo("image");
        assertThat(media(image)).containsEntry("id", "media_id").containsEntry("kind", "image")
            .containsEntry("url", "http://mmbiz.qpic.cn/pic");

        Map<String, Object> voice = parse(voiceXml()).content();
        assertThat(voice.get("type")).isEqualTo("audio");
        assertThat(media(voice)).containsEntry("id", "media_id").containsEntry("kind", "audio");

        Map<String, Object> location = parse(locationXml()).content();
        assertThat(location.get("type")).isEqualTo("location");
        // 官方定义 Location_X 为纬度、Location_Y 为经度
        assertThat(location.get("latitude")).isEqualTo(23.134521d);
        assertThat(location.get("longitude")).isEqualTo(113.358803d);
        assertThat(location.get("label")).isEqualTo("广州市海珠区客村");

        Map<String, Object> link = parse(linkXml()).content();
        assertThat(link).containsEntry("type", "link").containsEntry("title", "标题").containsEntry("url", "http://url")
            .containsEntry("description", "描述");
    }

    @Test
    void unmappedMediaFallsBackToMessageScopedIdAndUnknownFormatsStayUnknown() {
        // 渠道未给 MediaId 时用「消息 ID:媒体下标」派生稳定标识
        Map<String, Object> image = parse(imageXml().replace("<MediaId><![CDATA[media_id]]></MediaId>", "")).content();
        assertThat(media(image)).containsEntry("id", "1234567890123456:0");

        Map<String, Object> unknown = parse("""
            <xml><FromUserName><![CDATA[user-open-id]]></FromUserName><MsgType><![CDATA[future_type]]></MsgType>
            <MsgId>42</MsgId></xml>
            """).content();
        assertThat(unknown).isEqualTo(Map.of("type", "unknown", "originalType", "future_type"));

        // 位置精度不是数字时如实落 unknown，不猜测内容
        Map<String, Object> broken = parse(locationXml().replace("<Location_X>23.134521</Location_X>", "<Location_X>abc</Location_X>"))
            .content();
        assertThat(broken.get("type")).isEqualTo("unknown");

        // 坐标溢出为非有限值（parseDouble 对 1e999 不抛异常）同样落 unknown，不产出契约外数值
        Map<String, Object> overflow = parse(locationXml().replace("<Location_X>23.134521</Location_X>", "<Location_X>1e999</Location_X>"))
            .content();
        assertThat(overflow).isEqualTo(Map.of("type", "unknown", "originalType", "location"));
    }

    @Test
    void mediaWithoutChannelOrMessageIdentifierStaysUnknownInsteadOfAFakeId() {
        // 既无 MediaId 又无 MsgId：契约第 4 节要求媒体引用必有 id，没有可如实表达的引用时归 unknown
        Map<String, Object> image = parse(imageXml()
            .replace("<MediaId><![CDATA[media_id]]></MediaId>", "")
            .replace("<MsgId>1234567890123456</MsgId>", "")).content();
        assertThat(image).isEqualTo(Map.of("type", "unknown", "originalType", "image"));

        Map<String, Object> voice = parse(voiceXml()
            .replace("<MediaId><![CDATA[media_id]]></MediaId>", "")
            .replace("<MsgId>1234567890123456</MsgId>", "")).content();
        assertThat(voice).isEqualTo(Map.of("type", "unknown", "originalType", "voice"));
    }

    @Test
    void eventPushAcknowledgesWithoutVisitorMessage() {
        String event = """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[FromUser]]></FromUserName>
            <CreateTime>123456789</CreateTime><MsgType><![CDATA[event]]></MsgType>
            <Event><![CDATA[subscribe]]></Event></xml>
            """;
        assertThat(protocol.parse(CHANNEL_ID, event)).isEmpty();
    }

    @Test
    void malformedOrIdentitylessPayloadIsRejected() {
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, "not xml")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, """
            <xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[hi]]></Content></xml>
            """)).isInstanceOf(IllegalArgumentException.class);
    }

    private ChannelInboundMessage parse(String xml) {
        return protocol.parse(CHANNEL_ID, xml).orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> media(Map<String, Object> content) {
        return (Map<String, Object>) content.get("media");
    }

    private String textXml(String content, String messageId) {
        return """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1348831860</CreateTime><MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[%s]]></Content><MsgId>%s</MsgId></xml>
            """.formatted(content, messageId);
    }

    private String imageXml() {
        return """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1348831860</CreateTime><MsgType><![CDATA[image]]></MsgType>
            <PicUrl><![CDATA[http://mmbiz.qpic.cn/pic]]></PicUrl><MediaId><![CDATA[media_id]]></MediaId>
            <MsgId>1234567890123456</MsgId></xml>
            """;
    }

    private String voiceXml() {
        return """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1357290913</CreateTime><MsgType><![CDATA[voice]]></MsgType>
            <MediaId><![CDATA[media_id]]></MediaId><Format><![CDATA[amr]]></Format>
            <MsgId>1234567890123456</MsgId></xml>
            """;
    }

    private String locationXml() {
        return """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1351776360</CreateTime><MsgType><![CDATA[location]]></MsgType>
            <Location_X>23.134521</Location_X><Location_Y>113.358803</Location_Y><Scale>20</Scale>
            <Label><![CDATA[广州市海珠区客村]]></Label><MsgId>1234567890123456</MsgId></xml>
            """;
    }

    private String linkXml() {
        return """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1351776360</CreateTime><MsgType><![CDATA[link]]></MsgType>
            <Title><![CDATA[标题]]></Title><Description><![CDATA[描述]]></Description>
            <Url><![CDATA[http://url]]></Url><MsgId>1234567890123456</MsgId></xml>
            """;
    }
}
