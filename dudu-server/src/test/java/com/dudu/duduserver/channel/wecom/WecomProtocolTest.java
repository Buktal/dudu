package com.dudu.duduserver.channel.wecom;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.junit.jupiter.api.Test;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 企业微信回调协议纯逻辑验收（协议事实见 docs/research/channels/wecom.md）：官方 §5.1
 * 加解密完整示例参数真实可复算，作为验签、解密与加密的黄金向量；报文解析按官方 §2.1/§2.2
 * 覆盖普通消息六类型与事件推送。
 */
class WecomProtocolTest {

    private static final long CHANNEL_ID = 9201L;

    // 官方 90968 加解密完整示例（docs/research/channels/wecom.md §5.1 逐字拷贝）
    private static final String GOLDEN_CORP_ID = "wx5823bf96d3bd56c7";
    private static final String GOLDEN_TOKEN = "QDG6eK";
    private static final String GOLDEN_ENCODING_AES_KEY = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";
    private static final String GOLDEN_ENCRYPT = "RypEvHKD8QQKFhvQ6QleEB4J58tiPdvo+rtK1I9qca6aM/wvqnLSV5zEPeusUiX"
        + "5L5X/0lWfrf0QADHHhGd3QczcdCUpj911L3vg3W/sYYvuJTs3TUUkSUXxaccAS0qhxchrRYt66wiSpGLYL42aM6A8dTT+6k4a"
        + "SknmPj48kzJs8qLjvd4Xgpue06DOdnLxAUHzM6+kDZ+HMZfJYuR+LtwGc2hgf5gsijff0ekUNXZiqATP7PF5mZxZ3Izoun1s4"
        + "zG4LUMnvw2r+KqCKIw+3IQH03v+BCA9nMELNqbSf6tiWSrXJB3LAVGUcallcrw8V2t9EL4EhzJWrQUax5wLVMNS0+rUPA3k22"
        + "Ncx4XXZS9o0MBH27Bo6BpNelZpS+/uh9KsNlY6bHCmJU9p8g7m3fVKn28H3KDYA5Pl/T8Z1ptDAVe0lXdQ2YoyyH2uyPIGHBZ"
        + "ZIs2pDBS8R07+qN+E7Q==";
    private static final String GOLDEN_TIMESTAMP = "1409659813";
    private static final String GOLDEN_NONCE = "1372623149";
    private static final String GOLDEN_SIGNATURE = "477715d11cdb4164915debcba66cb864d751f3e6";

    // 黄金密文解密出的明文（284 字节）：研究文档 §5.1 代码块渲染带缩进，真实字节无缩进、
    // 行间 \n 分隔、无结尾换行——以密文可复算的字节为准（与 mock-pulse 对拍一致）
    private static final String GOLDEN_PLAINTEXT = "<xml><ToUserName><![CDATA[wx5823bf96d3bd56c7]]></ToUserName>\n"
        + "<FromUserName><![CDATA[mycreate]]></FromUserName>\n"
        + "<CreateTime>1409659813</CreateTime>\n"
        + "<MsgType><![CDATA[text]]></MsgType>\n"
        + "<Content><![CDATA[hello]]></Content>\n"
        + "<MsgId>4561255354251345929</MsgId>\n"
        + "<AgentID>218</AgentID>\n"
        + "</xml>";

    private final WecomProtocol protocol = new WecomProtocol();

    @Test
    void verifyMatchesOfficialFourValueSignatureVector() {
        // 官方 §5.1：sort_str = nonce + timestamp + token + 密文（四值字典序）→ sha1 40 位小写 hex
        assertThat(protocol.verify(GOLDEN_TOKEN, GOLDEN_SIGNATURE, GOLDEN_TIMESTAMP, GOLDEN_NONCE, GOLDEN_ENCRYPT))
            .isTrue();
        assertThat(protocol.verify(GOLDEN_TOKEN, "0".repeat(40), GOLDEN_TIMESTAMP, GOLDEN_NONCE, GOLDEN_ENCRYPT))
            .isFalse();
        assertThat(protocol.verify("other-token", GOLDEN_SIGNATURE, GOLDEN_TIMESTAMP, GOLDEN_NONCE, GOLDEN_ENCRYPT))
            .isFalse();
        assertThat(protocol.verify(GOLDEN_TOKEN, null, GOLDEN_TIMESTAMP, GOLDEN_NONCE, GOLDEN_ENCRYPT)).isFalse();
        assertThat(protocol.verify(GOLDEN_TOKEN, GOLDEN_SIGNATURE, GOLDEN_TIMESTAMP, GOLDEN_NONCE, null)).isFalse();
    }

    @Test
    void goldenCiphertextDecryptsToOfficialPlaintextWithCorpIdReceiveid() {
        WecomProtocol.Decrypted decrypted = protocol.decrypt(GOLDEN_ENCODING_AES_KEY, GOLDEN_ENCRYPT);

        assertThat(decrypted.xml()).isEqualTo(GOLDEN_PLAINTEXT);
        assertThat(decrypted.receiveid()).isEqualTo(GOLDEN_CORP_ID);
    }

    @Test
    void goldenPlaintextReencryptsToOfficialCiphertextWithTheSameRandom() {
        // 覆盖加密全链路（PKCS#7 按 32 字节块补位、IV 取 key 前 16 字节、Base64）：
        // random(16B) 从官方密文独立取回（测试内直接 AES 解密，不走生产代码），同随机数
        // 重加密官方明文必须逐字节复现官方密文
        String encrypted = protocol.encrypt(GOLDEN_ENCODING_AES_KEY, goldenRandom16(),
            GOLDEN_PLAINTEXT.getBytes(StandardCharsets.UTF_8), GOLDEN_CORP_ID);

        assertThat(encrypted).isEqualTo(GOLDEN_ENCRYPT);
    }

    @Test
    void parseMapsAllSixMessageTypesToTheUnifiedBody() {
        ChannelInboundMessage text = parse("""
            <xml><ToUserName><![CDATA[wx5823bf96d3bd56c7]]></ToUserName><FromUserName><![CDATA[mycreate]]></FromUserName>
            <CreateTime>1409659813</CreateTime><MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[hello]]></Content><MsgId>4561255354251345929</MsgId><AgentID>218</AgentID></xml>
            """);
        assertThat(text.externalUserId()).isEqualTo("mycreate");
        assertThat(text.externalMessageId()).isEqualTo("4561255354251345929");
        assertThat(text.direction()).isEqualTo(MessageDirectionEnum.INCOMING);
        assertThat(text.content()).isEqualTo(Map.of("type", "text", "text", "hello"));

        Map<String, Object> image = parse("""
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1348831860</CreateTime><MsgType><![CDATA[image]]></MsgType>
            <PicUrl><![CDATA[http://mmbiz.qpic.cn/pic]]></PicUrl><MediaId><![CDATA[MEDIA_ID]]></MediaId>
            <MsgId>1234567890123456</MsgId><AgentID>1</AgentID></xml>
            """).content();
        assertThat(image.get("type")).isEqualTo("image");
        assertThat(media(image)).containsEntry("id", "MEDIA_ID").containsEntry("kind", "image")
            .containsEntry("url", "http://mmbiz.qpic.cn/pic");

        Map<String, Object> voice = parse("""
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1357290913</CreateTime><MsgType><![CDATA[voice]]></MsgType>
            <MediaId><![CDATA[MEDIA_ID]]></MediaId><Format><![CDATA[amr]]></Format>
            <MsgId>1234567890123456</MsgId><AgentID>1</AgentID></xml>
            """).content();
        assertThat(voice.get("type")).isEqualTo("audio");
        assertThat(media(voice)).containsEntry("id", "MEDIA_ID").containsEntry("kind", "audio");

        Map<String, Object> video = parse("""
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1357290913</CreateTime><MsgType><![CDATA[video]]></MsgType>
            <MediaId><![CDATA[MEDIA_ID]]></MediaId><ThumbMediaId><![CDATA[THUMB_MEDIA_ID]]></ThumbMediaId>
            <MsgId>1234567890123456</MsgId><AgentID>1</AgentID></xml>
            """).content();
        assertThat(video.get("type")).isEqualTo("video");
        assertThat(media(video)).containsEntry("id", "MEDIA_ID").containsEntry("kind", "video");

        Map<String, Object> location = parse("""
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1351776360</CreateTime><MsgType><![CDATA[location]]></MsgType>
            <Location_X>23.134521</Location_X><Location_Y>113.358803</Location_Y><Scale>20</Scale>
            <Label><![CDATA[广州市海珠区客村]]></Label><MsgId>1234567890123456</MsgId><AgentID>1</AgentID></xml>
            """).content();
        // 官方定义 Location_X 为纬度、Location_Y 为经度
        assertThat(location).containsEntry("type", "location").containsEntry("latitude", 23.134521d)
            .containsEntry("longitude", 113.358803d).containsEntry("label", "广州市海珠区客村");

        Map<String, Object> link = parse("""
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1351776360</CreateTime><MsgType><![CDATA[link]]></MsgType>
            <Title><![CDATA[标题]]></Title><Description><![CDATA[描述]]></Description>
            <Url><![CDATA[http://url]]></Url><PicUrl><![CDATA[http://pic]]></PicUrl>
            <MsgId>1234567890123456</MsgId><AgentID>1</AgentID></xml>
            """).content();
        assertThat(link).containsEntry("type", "link").containsEntry("title", "标题")
            .containsEntry("url", "http://url").containsEntry("description", "描述");
    }

    @Test
    void eventPushAndUnmappedFormatsStayOutOfVisitorMessages() {
        // 官方 §5.3 subscribe 事件：事件推送只应答不落库
        assertThat(protocol.parse(CHANNEL_ID, """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[UserID]]></FromUserName>
            <CreateTime>1348831860</CreateTime><MsgType><![CDATA[event]]></MsgType>
            <Event><![CDATA[subscribe]]></Event><AgentID>1</AgentID></xml>
            """)).isEmpty();

        // 未收录的 MsgType 与字段类型不符的报文如实落 unknown，不猜内容
        Map<String, Object> unknown = parse("""
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1348831860</CreateTime><MsgType><![CDATA[future_type]]></MsgType>
            <MsgId>42</MsgId><AgentID>1</AgentID></xml>
            """).content();
        assertThat(unknown).isEqualTo(Map.of("type", "unknown", "originalType", "future_type"));

        Map<String, Object> broken = parse("""
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><FromUserName><![CDATA[fromUser]]></FromUserName>
            <CreateTime>1351776360</CreateTime><MsgType><![CDATA[location]]></MsgType>
            <Location_X>abc</Location_X><Location_Y>113.358803</Location_Y>
            <MsgId>1234567890123456</MsgId><AgentID>1</AgentID></xml>
            """).content();
        assertThat(broken.get("type")).isEqualTo("unknown");
    }

    @Test
    void payloadWithoutSenderOrUnparseableXmlIsRejected() {
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, "not xml")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> protocol.parse(CHANNEL_ID, """
            <xml><ToUserName><![CDATA[toUser]]></ToUserName><MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[hi]]></Content><MsgId>1</MsgId></xml>
            """)).isInstanceOf(IllegalArgumentException.class);
    }

    private ChannelInboundMessage parse(String xml) {
        return protocol.parse(CHANNEL_ID, xml).orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> media(Map<String, Object> content) {
        return (Map<String, Object>) content.get("media");
    }

    // 官方密文头部 random(16B)：AESKey=Base64Decode(EncodingAESKey+"=")，IV=key 前 16 字节
    private byte[] goldenRandom16() {
        try {
            byte[] key = Base64.getDecoder().decode(GOLDEN_ENCODING_AES_KEY + "=");
            Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(key, 0, 16));
            return Arrays.copyOf(cipher.doFinal(Base64.getDecoder().decode(GOLDEN_ENCRYPT)), 16);
        } catch (Exception e) {
            throw new IllegalStateException("黄金密文随机数取回失败", e);
        }
    }
}
