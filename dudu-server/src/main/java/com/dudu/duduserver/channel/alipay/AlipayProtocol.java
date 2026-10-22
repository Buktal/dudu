package com.dudu.duduserver.channel.alipay;

import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.channel.support.SecureXml;
import com.dudu.duduserver.channel.support.Texts;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import java.io.StringReader;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PrivateKey;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 支付宝生活号回调协议（事实见 docs/research/channels/alipay.md §2.3、§3.2）：网关推送为
 * POST 表单（service/biz_content/sign…，Servlet 表单解析后参数可能落在 query 也可能留在
 * body，两处合并取值）；验签口径见 {@link AlipaySignature}。biz_content 为 GBK 声明的 XML
 * 信封，按 MsgType 解析为契约第 4 节统一消息体：text 取 Text.Content、image 取 Image.MediaId；
 * 事件推送（MsgType=event）不产生访客消息只应答 ack；可识别消息缺发送方身份按参数错误拒绝。
 * 发送方身份取 FromAlipayUserId（现用 userid），缺失回退 FromUserId（官方标注已废弃仍下发）；
 * UserInfo.user_name 作为来访用户名（JSON 字符串，解析失败不阻塞收信）。
 */
@Component
public class AlipayProtocol {

    // 回调服务名（§3.2 网关验证；其余验签通过按 §2.3 被动通知解析）
    static final String SERVICE_CHECK = "alipay.service.check";

    // POST 表单字段名（§3.2/§2.3）
    static final String FIELD_SERVICE = "service";
    static final String FIELD_BIZ_CONTENT = "biz_content";

    // 被动通知 XML 信封字段（§2.3）；Text.Content / Image.MediaId 系两级扁平化键
    private static final String MSG_TYPE_TEXT = "text";
    private static final String MSG_TYPE_IMAGE = "image";
    private static final String MSG_TYPE_EVENT = "event";
    private static final String FIELD_MSG_TYPE = "MsgType";
    private static final String FIELD_FROM_USER_ID = "FromUserId";
    private static final String FIELD_FROM_ALIPAY_USER_ID = "FromAlipayUserId";
    private static final String FIELD_MSG_ID = "MsgId";
    private static final String FIELD_USER_INFO = "UserInfo";
    private static final String FIELD_USER_NAME = "user_name";
    private static final String FIELD_TEXT_CONTENT = "Text.Content";
    private static final String FIELD_IMAGE_MEDIA_ID = "Image.MediaId";

    /**
     * 回调验签：双口径规则见 {@link AlipaySignature#verify}。
     */
    public boolean verify(AlipayCredentials credentials, Map<String, String> params) {
        return AlipaySignature.verify(credentials, params);
    }

    /**
     * 合并回调参数：query 先入、body 原始串按 x-www-form-urlencoded 解析后覆盖（form
     * 表单推送时表单参数可能两处都落，同名字段以 body 为准；替身或网关以非标准内容类型
     * 直发 body 时此处是唯一来源）；畸形百分号编码等无法解码的表单抛出
     * {@link IllegalArgumentException}，由调用方按参数错误拒绝——官方验签四步要求对参数
     * url_decode 精确还原（alipay.md §5.1），官方 SDK 对畸形 % 序列直接抛出不回退。
     */
    public Map<String, String> paramsOf(Map<String, String> query, String body) {
        Map<String, String> params = new LinkedHashMap<>();
        if (query != null) {
            params.putAll(query);
        }
        if (body != null && !body.isBlank()) {
            for (String pair : body.split("&")) {
                int eq = pair.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                params.put(formDecode(pair.substring(0, eq)), formDecode(pair.substring(eq + 1)));
            }
        }
        return params;
    }

    private String formDecode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    /**
     * 网关验证握手成功回包（§3.2 官方逐字格式）：response 节点为 biz_content=开发者公钥
     * （由 appPrivateKey 推导，X.509 Base64）+ success=true，sign 为应用私钥对 response
     * 内容的 RSA2 签名，外层 alipay 信封声明 GBK（内容纯 ASCII，与统一 text/plain 出口
     * 的 UTF-8 字节一致）。私钥无法解析时抛出 {@link IllegalStateException}——握手无法
     * 完成签名就如实失败，不回无签名包。
     */
    public String handshakeReply(AlipayCredentials credentials) {
        try {
            PrivateKey privateKey = AlipaySignature.privateKeyOf(credentials.appPrivateKey());
            String content = "<biz_content>" + AlipaySignature.publicKeyBase64(credentials.appPrivateKey())
                + "</biz_content><success>true</success>";
            return "<?xml version=\"1.0\" encoding=\"GBK\"?><alipay><response>" + content
                + "</response><sign>" + AlipaySignature.signContent(privateKey, content)
                + "</sign><sign_type>RSA2</sign_type></alipay>";
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("应用私钥无法用于握手回包签名", e);
        }
    }

    /**
     * 从来报 biz_content 提取发送方后构建 ack（消息与事件族共用应答路径）：ToUserId 官方
     * 要求回显来报 FromUserId（示例工程 buildBaseAckMsg 口径），来报缺失该字段（verifygw
     * 事件、仅带现用 userid 的报文）时回退 FromAlipayUserId；访客身份落库仍以 FromAlipayUserId
     * 优先（现用唯一标识），与 ack 回显口径互不影响。
     */
    public String ackReply(AlipayCredentials credentials, String bizContent) {
        Map<String, String> fields = fields(bizContent);
        return buildAck(Texts.firstNonBlank(fields.get(FIELD_FROM_USER_ID), fields.get(FIELD_FROM_ALIPAY_USER_ID)),
            credentials.appId());
    }

    private String buildAck(String fromUserId, String appId) {
        return "<XML><ToUserId><![CDATA[" + (fromUserId == null ? "" : fromUserId) + "]]></ToUserId>"
            + "<AppId><![CDATA[" + appId + "]]></AppId>"
            + "<CreateTime>" + System.currentTimeMillis() + "</CreateTime>"
            + "<MsgType><![CDATA[ack]]></MsgType></XML>";
    }

    /**
     * 解析被动通知 biz_content XML（§2.3）：text/image 消息转为统一入站消息，事件推送
     * （MsgType=event）返回空表示只应答 ack 不落库；无法解析的报文返回空按只应答处理；
     * 可识别消息缺发送方身份抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String bizContent) {
        Map<String, String> fields = fields(bizContent);
        String msgType = fields.getOrDefault(FIELD_MSG_TYPE, "");
        if (MSG_TYPE_EVENT.equals(msgType) || fields.isEmpty()) {
            // 事件族与无法解析的报文只应答不保存
            return Optional.empty();
        }
        String externalUserId = Texts.firstNonBlank(fields.get(FIELD_FROM_ALIPAY_USER_ID), fields.get(FIELD_FROM_USER_ID));
        if (externalUserId == null) {
            // 可识别的访客消息缺发送方身份无法归属会话，按参数错误拒绝
            throw new IllegalArgumentException("渠道报文缺少发送方身份");
        }
        return Optional.of(new ChannelInboundMessage(
            companyChannelId,
            externalUserId,
            userName(fields.get(FIELD_USER_INFO)),
            null,
            List.of(),
            Texts.blankToNull(fields.get(FIELD_MSG_ID)),
            MessageDirectionEnum.INCOMING,
            content(msgType, fields)));
    }

    // 报文两级扁平化：一级字段直接存；Text/Image 等嵌套节点记为「节点.子节点」
    // （DOM textContent 会拼接后代文本，嵌套结构须按下层元素展开）
    private Map<String, String> fields(String bizContent) {
        if (bizContent == null || bizContent.isBlank()) {
            return Map.of();
        }
        Document document;
        try {
            document = SecureXml.builder().parse(new InputSource(new StringReader(bizContent)));
        } catch (Exception e) {
            return Map.of();
        }
        Map<String, String> fields = new LinkedHashMap<>();
        NodeList children = document.getDocumentElement().getChildNodes();
        for (int index = 0; index < children.getLength(); index++) {
            Node child = children.item(index);
            if (child.getNodeType() != Node.ELEMENT_NODE) {
                continue;
            }
            NodeList inner = child.getChildNodes();
            if (hasElementChild(inner)) {
                for (int nested = 0; nested < inner.getLength(); nested++) {
                    Node grandchild = inner.item(nested);
                    if (grandchild.getNodeType() == Node.ELEMENT_NODE) {
                        fields.put(child.getNodeName() + '.' + grandchild.getNodeName(),
                            grandchild.getTextContent());
                    }
                }
            } else {
                fields.put(child.getNodeName(), child.getTextContent());
            }
        }
        return fields;
    }

    private boolean hasElementChild(NodeList nodes) {
        for (int index = 0; index < nodes.getLength(); index++) {
            if (nodes.item(index).getNodeType() == Node.ELEMENT_NODE) {
                return true;
            }
        }
        return false;
    }

    // 按 MsgType 映射统一消息体；字段值不符合类型约定时如实落 unknown，不猜测内容
    private Map<String, Object> content(String msgType, Map<String, String> fields) {
        return switch (msgType) {
            case MSG_TYPE_TEXT -> Map.of("type", "text",
                "text", fields.getOrDefault(FIELD_TEXT_CONTENT, ""));
            case MSG_TYPE_IMAGE -> media(fields);
            default -> MessageBodies.unknown(msgType);
        };
    }

    // 图片消息：MediaId 为唯一下载凭据（multimedia.do），无公开链接；MediaId 缺失没有可
    // 如实表达的引用，按 unknown 保存不填假值（契约第 4 节媒体引用必有 id）
    private Map<String, Object> media(Map<String, String> fields) {
        String mediaId = Texts.blankToNull(fields.get(FIELD_IMAGE_MEDIA_ID));
        if (mediaId == null) {
            return MessageBodies.unknown(MSG_TYPE_IMAGE);
        }
        return MessageBodies.media(MSG_TYPE_IMAGE, mediaId, null, null);
    }

    // UserInfo 为 JSON 字符串（logon_id/user_name）：损坏或缺失返回 null，不阻塞收信
    private String userName(String userInfo) {
        if (userInfo == null || userInfo.isBlank()) {
            return null;
        }
        try {
            return Texts.blankToNull(JSONUtil.parseObj(userInfo).getStr(FIELD_USER_NAME));
        } catch (RuntimeException e) {
            return null;
        }
    }

}
