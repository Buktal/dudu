package com.dudu.duduserver.channel.kuaishou;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.channel.support.Texts;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * 快手智能客服纯文本发送（事实见 docs/research/channels/kuaishou.md §6.5.2 与 §4.3）：
 * POST /open/cs/intelligent/message/send，form-urlencoded 参数族 method/version/
 * access_token/appkey/signMethod/sign/timestamp(毫秒)/param(URL 编码 JSON)。param 携带
 * requestId（本地生成作幂等与渠道消息标识）、type=1、generator=1（快手侧发起的会话，
 * 服务商异步回复）、fromUser（商家，role=2，nickName 取绑定账号名）与 messageList
 * 文本报文（contentType=1，content 为 JSON 字符串）。签名按电商域网关算法：除 sign 外
 * 参数按 key 字典序 k=v& 拼接，末尾追加 &signSecret=<signSecret> 取 MD5 小写 hex；
 * 先签名后对 param 编码（form 提交自动编码）。成功以 result=1 为准；出参无渠道消息
 * ID，以 requestId 回填。接口地址默认官方推荐域名，可用 dudu.channel.kuaishou.api-base
 * 覆盖为受控替身。
 */
@Slf4j
@Component
public class KuaishouTextSender {

    private static final String DEFAULT_API_BASE = "https://openapi.kwaixiaodian.com";
    private static final String PATH_SEND = "/open/cs/intelligent/message/send";

    // 网关 form 参数名（§4.3 参数族逐字）
    private static final String FORM_METHOD = "method";
    private static final String FORM_VERSION = "version";
    private static final String FORM_ACCESS_TOKEN = "access_token";
    private static final String FORM_APPKEY = "appkey";
    private static final String FORM_SIGN_METHOD = "signMethod";
    private static final String FORM_SIGN = "sign";
    private static final String FORM_TIMESTAMP = "timestamp";
    private static final String FORM_PARAM = "param";

    private static final String METHOD_SEND = "open.cs.intelligent.message.send";
    private static final String VERSION = "1";
    private static final String SIGN_METHOD_MD5 = "MD5";

    // param 业务字段（§6.5.2 入参表）
    private static final String KEY_REQUEST_ID = "requestId";
    private static final String KEY_TYPE = "type";
    private static final String KEY_GENERATOR = "generator";
    private static final String KEY_FROM_USER = "fromUser";
    private static final String KEY_TO_USER = "toUser";
    private static final String KEY_MESSAGE_LIST = "messageList";
    private static final String KEY_NICK_NAME = "nickName";
    private static final String KEY_ROLE = "role";
    private static final String KEY_CONTENT_TYPE = "contentType";
    private static final String KEY_CONTENT = "content";
    private static final String KEY_TEXT = "text";

    // 官方语义：type=1 消息；generator=1 快手侧发起、服务商异步回复；role 1买家 2商家
    private static final int TYPE_MESSAGE = 1;
    private static final int GENERATOR_KUAISHOU_INITIATED = 1;
    private static final int ROLE_BUYER = 1;
    private static final int ROLE_SELLER = 2;
    private static final int CONTENT_TYPE_TEXT = 1;

    // 出参（官方示例逐字 {"result": 1,"error_msg": "SUCCESS"}）
    private static final String KEY_RESULT = "result";
    private static final String KEY_ERROR_MSG = "error_msg";

    // 发送侧凭据缺口的如实说明（与适配器 restriction 同源）
    static final String SIGN_SECRET_MISSING =
        "快手发送未完成配置：channel_info 缺少 signSecret（发送签名密钥，平台分配）";
    static final String ACCESS_TOKEN_MISSING =
        "快手发送未完成授权：channel_info 缺少 accessToken（商家授权令牌，过期后需重新授权录入）";
    static final String VISITOR_NAME_MISSING =
        "快手消息发送失败：缺少可回复的来信（买家名称未知，需访客先来信）";

    private final RestClient restClient;

    private final KuaishouVisitorNames visitorNames;

    public KuaishouTextSender(RestClient.Builder builder,
                              @Value("${dudu.channel.kuaishou.api-base:" + DEFAULT_API_BASE + "}") String apiBase,
                              KuaishouVisitorNames visitorNames) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.visitorNames = visitorNames;
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        KuaishouCredentials credentials = KuaishouCredentials.of(account);
        if (credentials == null || credentials.signSecret() == null) {
            return ChannelSendResult.failed(SIGN_SECRET_MISSING);
        }
        if (credentials.accessToken() == null) {
            return ChannelSendResult.failed(ACCESS_TOKEN_MISSING);
        }
        String visitorName = visitorNames.nameOf(account.getCompanyChannelId(), externalUserId);
        if (visitorName == null) {
            return ChannelSendResult.failed(VISITOR_NAME_MISSING);
        }
        // 出参无渠道消息 ID：requestId 是唯一请求标识（官方必填幂等位），作外部消息标识回填
        String requestId = UUID.randomUUID().toString();
        MultiValueMap<String, String> form = form(credentials, requestId, param(requestId, visitorName,
            Texts.firstNonBlank(account.getAccountName(), ""), text));
        try {
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_SEND)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(String.class));
            Integer result = response.getInt(KEY_RESULT, null);
            if (result == null || result != 1) {
                return ChannelSendResult.failed("快手消息发送失败：" + result + " "
                    + response.getStr(KEY_ERROR_MSG, ""));
            }
            return ChannelSendResult.sent(requestId);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果
            log.warn("[kuaishou] 消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("快手接口调用失败：" + e.getMessage());
        }
    }

    // form 参数族（除 sign 外全部参签）：sign 对其余参数的未编码值计算
    private MultiValueMap<String, String> form(KuaishouCredentials credentials, String requestId, String param) {
        Map<String, String> values = new TreeMap<>();
        values.put(FORM_METHOD, METHOD_SEND);
        values.put(FORM_VERSION, VERSION);
        values.put(FORM_ACCESS_TOKEN, credentials.accessToken());
        values.put(FORM_APPKEY, credentials.appKey());
        values.put(FORM_SIGN_METHOD, SIGN_METHOD_MD5);
        values.put(FORM_TIMESTAMP, String.valueOf(System.currentTimeMillis()));
        values.put(FORM_PARAM, param);

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        values.forEach(form::add);
        form.add(FORM_SIGN, sign(values, credentials.signSecret()));
        return form;
    }

    // 电商域网关签名（§4.3 SDK sortAndJoin 逐字）：key 字典序 k=v& 拼接，末尾追加
    // &signSecret=<signSecret> 取 MD5 小写 hex；sign 本身不参签，param 用未编码值
    private String sign(Map<String, String> values, String signSecret) {
        StringBuilder joined = new StringBuilder();
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (entry.getValue() == null) {
                continue;
            }
            if (joined.length() > 0) {
                joined.append('&');
            }
            joined.append(entry.getKey()).append('=').append(entry.getValue());
        }
        joined.append("&signSecret=").append(signSecret);
        return Digests.md5Hex(joined.toString());
    }

    // param 业务报文：{toUser{nickName,role:1}, messageList[{contentType:1, content}],
    // generator:1, type:1, requestId, fromUser{nickName,role:2}}
    private String param(String requestId, String visitorName, String sellerNickName, String text) {
        return JSONUtil.createObj()
            .set(KEY_TO_USER, JSONUtil.createObj().set(KEY_NICK_NAME, visitorName).set(KEY_ROLE, ROLE_BUYER))
            .set(KEY_MESSAGE_LIST, JSONUtil.createArray().set(
                JSONUtil.createObj().set(KEY_CONTENT_TYPE, CONTENT_TYPE_TEXT)
                    .set(KEY_CONTENT, JSONUtil.createObj().set(KEY_TEXT, text).toString())))
            .set(KEY_GENERATOR, GENERATOR_KUAISHOU_INITIATED)
            .set(KEY_TYPE, TYPE_MESSAGE)
            .set(KEY_REQUEST_ID, requestId)
            .set(KEY_FROM_USER, JSONUtil.createObj().set(KEY_NICK_NAME, sellerNickName).set(KEY_ROLE, ROLE_SELLER))
            .toString();
    }
}
