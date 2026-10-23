package com.dudu.duduserver.channel.wechatmini;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.MessageBodies;
import com.dudu.duduserver.channel.support.SecureXml;
import com.dudu.duduserver.channel.support.Texts;
import com.dudu.duduserver.channel.support.WechatInboundMessages;
import com.dudu.duduserver.channel.support.WechatSignatures;
import com.dudu.duduserver.channel.support.WechatXmlBodies;
import org.springframework.stereotype.Component;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * 小程序回调协议（事实见 docs/research/channels/wechat-mini.md §3.2、§4、§5）：握手与明文
 * 推送用三参 sha1(字典序(token, timestamp, nonce) 拼接)；安全/兼容模式密文校验必须用四参
 * msg_signature——官方注意事项原文「注意：不要使用 signature 验证！」，URL 中的三参
 * signature 仅作并存，不参与密文校验。推送包按数据格式支持 XML 与 JSON（§3.1 二选一配置），
 * 客服会话仅 text/image/miniprogrampage 三包加进入会话事件（§2.1），按 MsgType 解析为契约
 * 第 4 节统一消息体；事件推送不产生访客消息，只由调用方应答。
 */
@Component
public class WechatMiniProtocol {

    // 小程序客服会话仅有的三种消息类型
    private static final String MSG_TYPE_TEXT = "text";
    private static final String MSG_TYPE_IMAGE = "image";
    private static final String MSG_TYPE_MINI_PROGRAM_PAGE = "miniprogrampage";

    /**
     * 三参验签：token/timestamp/nonce 字典序排序后拼接取 sha1 十六进制小写与渠道签名比对；
     * 材料缺失或空白由共用验签原语判失败。
     */
    public boolean verify(String token, String signature, String timestamp, String nonce) {
        return WechatSignatures.verifySha1(signature, token, timestamp, nonce);
    }

    /**
     * 四参验签：token/timestamp/nonce/Encrypt（包体密文字段）字典序排序拼接取 sha1 与
     * msg_signature 比对；Encrypt 缺失或签名缺失都按校验失败处理。
     */
    public boolean verifySignature(String token, String msgSignature, String timestamp, String nonce,
                                   String encrypt) {
        return WechatSignatures.verifySha1(msgSignature, token, timestamp, nonce, encrypt);
    }

    /**
     * 解析推送报文：普通消息转为统一入站消息，事件推送返回空表示只应答不保存；报文无法
     * 解析或缺少发送方身份时抛出 {@link IllegalArgumentException}，由调用方按参数错误拒绝。
     */
    public Optional<ChannelInboundMessage> parse(Long companyChannelId, String body) {
        // 数据格式二选一（§3.1）：字段提取按首字符分派 XML/JSON，骨架共用事件判定与统一消息组装
        return WechatInboundMessages.parse(companyChannelId, fields(body), this::content);
    }

    /**
     * 取加密信封中的密文字段（XML 与 JSON 信封同名为 Encrypt，§3.3/§5.2）；报文无法解析
     * 或没有密文时返回 null，由调用方按验签失败处理。
     */
    public String encryptOf(String body) {
        String trimmed = body == null ? "" : body.stripLeading();
        if (!trimmed.startsWith("{")) {
            try {
                return Texts.blankToNull(SecureXml.flatFields(trimmed).get("Encrypt"));
            } catch (IllegalArgumentException e) {
                return null;
            }
        }
        try {
            return Texts.blankToNull(JSONUtil.parseObj(trimmed).getStr("Encrypt"));
        } catch (RuntimeException e) {
            return null;
        }
    }

    // 数据格式二选一（§3.1）：首字符 { 按 JSON 解析，其余按 XML 解析；只取根元素一级子元素
    private Map<String, String> fields(String body) {
        String trimmed = body == null ? "" : body.stripLeading();
        if (!trimmed.startsWith("{")) {
            return SecureXml.flatFields(trimmed);
        }
        try {
            JSONObject payload = JSONUtil.parseObj(trimmed);
            Map<String, String> fields = new LinkedHashMap<>();
            for (String key : payload.keySet()) {
                fields.put(key, payload.getStr(key));
            }
            return fields;
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("渠道回调报文无法解析", e);
        }
    }

    // 按 MsgType 映射统一消息体；渠道不提供的可选信息省略，无法映射的按 unknown 如实保存
    private Map<String, Object> content(String msgType, Map<String, String> fields) {
        try {
            return switch (msgType) {
                case MSG_TYPE_TEXT -> Map.of("type", "text", "text", fields.getOrDefault("Content", ""));
                case MSG_TYPE_IMAGE -> WechatXmlBodies.media("image", msgType,
                    fields.get("MediaId"), fields.get("PicUrl"), fields.get("MsgId"));
                case MSG_TYPE_MINI_PROGRAM_PAGE -> miniProgramCard(fields);
                default -> MessageBodies.unknown(msgType);
            };
        } catch (RuntimeException e) {
            // 字段值不符合类型约定时如实落 unknown，不猜测内容
            return MessageBodies.unknown(msgType);
        }
    }

    // 小程序卡片映射 card：Title 进 title；PagePath 是小程序页内路径不是外链、ThumbMediaId
    // 是封面素材编号，都不映射为 url/externalId，避免 Desk 渲染出无法打开的来源链接
    private Map<String, Object> miniProgramCard(Map<String, String> fields) {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "card");
        content.put("kind", MSG_TYPE_MINI_PROGRAM_PAGE);
        String title = Texts.blankToNull(fields.get("Title"));
        if (title != null) {
            content.put("title", title);
        }
        return content;
    }
}
