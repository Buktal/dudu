package com.dudu.duduserver.channel.alipay;

import cn.hutool.json.JSONObject;
import org.springframework.util.LinkedMultiValueMap;

import java.security.GeneralSecurityException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 支付宝网关请求组装（事实见 docs/research/channels/alipay.md §4.1）：客服消息发送与
 * 媒体下载共用同一套公共参数骨架、表单编码与结果节点解析，仅 method 与业务报文由调用方
 * 给定；加签走 {@link AlipaySignature}，timestamp 按官方 GMT+8 口径生成。
 */
final class AlipayRequests {

    private static final String FORMAT_JSON = "JSON";
    private static final String CHARSET = "utf-8";
    private static final String SIGN_TYPE = "RSA2";
    private static final String VERSION = "1.0";
    // 支付宝 timestamp 的官方时区（GMT+8），与服务器时区无关
    private static final ZoneId CHANNEL_TIMEZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    // 结果节点失败描述字段，按官方 code/msg/sub_code/sub_msg 顺序透出
    private static final String[] DESCRIBE_FIELDS = {"code", "msg", "sub_code", "sub_msg"};

    private AlipayRequests() {
    }

    // 公共参数（§4.1）+ biz_content + sign；加签剔除 sign 与空值参数由签名器处理
    static Map<String, String> params(AlipayCredentials credentials, String method, String bizContent) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("app_id", credentials.appId());
        params.put("method", method);
        params.put("format", FORMAT_JSON);
        params.put("charset", CHARSET);
        params.put("sign_type", SIGN_TYPE);
        params.put("timestamp", LocalDateTime.now(CHANNEL_TIMEZONE).format(TIMESTAMP));
        params.put("version", VERSION);
        params.put("biz_content", bizContent);
        try {
            params.put(AlipaySignature.FIELD_SIGN,
                AlipaySignature.sign(AlipaySignature.privateKeyOf(credentials.appPrivateKey()), params));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("应用私钥无法用于请求加签", e);
        }
        return params;
    }

    static LinkedMultiValueMap<String, String> form(Map<String, String> params) {
        LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        params.forEach(form::add);
        return form;
    }

    // *_response 结果节点遍历：缺节点或调用方已保证报文可解析之外的形态返回 null
    static JSONObject resultNodeIn(JSONObject payload) {
        for (String key : payload.keySet()) {
            if (key.endsWith("_response") && payload.get(key) instanceof JSONObject node) {
                return node;
            }
        }
        return null;
    }

    // 结果节点失败描述：code/msg/sub_code/sub_msg 逐一拼接，全空返回空串由调用方兜底
    static String describe(JSONObject node) {
        StringBuilder describe = new StringBuilder();
        for (String field : DESCRIBE_FIELDS) {
            String value = node.getStr(field);
            if (value != null && !value.isBlank()) {
                if (describe.length() > 0) {
                    describe.append(", ");
                }
                describe.append(field).append("=").append(value);
            }
        }
        return describe.toString();
    }
}
