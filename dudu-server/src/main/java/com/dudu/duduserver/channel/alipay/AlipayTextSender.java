package com.dudu.duduserver.channel.alipay;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import java.security.GeneralSecurityException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 支付宝客服消息纯文本主动回复（事实见 docs/research/channels/alipay.md §2.3、§4.1）：
 * POST {api-base}/gateway.do 表单公共参数 app_id/method/format/charset/sign_type/
 * timestamp（yyyy-MM-dd HH:mm:ss）/version + biz_content {to_user_id, msg_type:text,
 * text:{content}}，接口 alipay.open.public.message.custom.send（48h 交互窗口、单用户
 * 每日百条频控由渠道约束，失败时原样透出）。请求加签按官方规则剔除 sign 与空值参数
 * （sign_type 参与），SHA256WithRSA 后 Base64；响应按响应节点 code=10000 判成功（接口
 * 不返回消息标识）；响应验签需支付宝公钥（不在凭据集）不做。凭据缺失、业务失败与调用
 * 异常如实返回。接口地址默认官方域名，可用 dudu.channel.alipay.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class AlipayTextSender {

    static final String DEFAULT_API_BASE = "https://openapi.alipay.com";
    private static final String PATH_GATEWAY = "/gateway.do";
    private static final String METHOD_CUSTOM_SEND = "alipay.open.public.message.custom.send";
    private static final String MSG_TYPE_TEXT = "text";
    private static final String CHARSET = "utf-8";
    private static final String SIGN_TYPE = "RSA2";
    private static final String VERSION = "1.0";
    private static final String CODE_SUCCESS = "10000";
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    // 发送凭据缺失的如实说明：不编造可发能力
    // 字面值与全渠道限制说明同源（适配器测试引用本常量，故保留声明）
    static final String SEND_CREDENTIALS_MISSING = ChannelRestrictions.SEND_CREDENTIALS_MISSING;

    private final RestClient restClient;

    public AlipayTextSender(RestClient.Builder builder,
                            @Value("${dudu.channel.alipay.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        AlipayCredentials credentials = AlipayCredentials.of(account);
        if (credentials == null) {
            return ChannelSendResult.failed(SEND_CREDENTIALS_MISSING);
        }
        try {
            Map<String, String> params = params(credentials, bizContent(externalUserId, text));
            String response = restClient.post()
                .uri(PATH_GATEWAY)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form(params))
                .retrieve()
                .body(String.class);
            String failure = failureOf(response);
            if (failure != null) {
                return ChannelSendResult.failed("支付宝客服消息发送失败：" + failure);
            }
            return ChannelSendResult.sent(null);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[alipay] 客服消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("支付宝接口调用失败：" + e.getMessage());
        }
    }

    // DC 105938 业务报文：{to_user_id, msg_type:text, text:{content}}
    private String bizContent(String externalUserId, String text) {
        return JSONUtil.createObj()
            .set("to_user_id", externalUserId)
            .set("msg_type", MSG_TYPE_TEXT)
            .set("text", JSONUtil.createObj().set("content", text))
            .toString();
    }

    // 公共参数（§4.1）+ biz_content + sign；加签剔除 sign 与空值参数由签名器处理
    private Map<String, String> params(AlipayCredentials credentials, String bizContent) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("app_id", credentials.appId());
        params.put("method", METHOD_CUSTOM_SEND);
        params.put("format", "JSON");
        params.put("charset", CHARSET);
        params.put("sign_type", SIGN_TYPE);
        params.put("timestamp", LocalDateTime.now().format(TIMESTAMP));
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

    private LinkedMultiValueMap<String, String> form(Map<String, String> params) {
        LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        params.forEach(form::add);
        return form;
    }

    // 成功以响应节点 code=10000 为准；error_response 与 code!=10000 原样透出
    private String failureOf(String response) {
        if (response == null || response.isBlank()) {
            return "响应为空";
        }
        JSONObject payload;
        try {
            payload = JSONUtil.parseObj(response);
        } catch (RuntimeException e) {
            return "响应无法解析";
        }
        for (String key : payload.keySet()) {
            if (key.endsWith("_response") && payload.get(key) instanceof JSONObject node) {
                String code = node.getStr("code");
                return CODE_SUCCESS.equals(code) ? null : describe(node);
            }
        }
        return "响应缺少结果节点";
    }

    private String describe(JSONObject node) {
        StringBuilder describe = new StringBuilder();
        for (String field : new String[]{"code", "msg", "sub_code", "sub_msg"}) {
            String value = node.getStr(field);
            if (value != null && !value.isBlank()) {
                if (describe.length() > 0) {
                    describe.append(", ");
                }
                describe.append(field).append("=").append(value);
            }
        }
        return describe.length() > 0 ? describe.toString() : "未知失败";
    }
}
