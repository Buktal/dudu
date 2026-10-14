package com.dudu.duduserver.channel.meituan;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * 美团 IM 消息纯文本发送（事实见 docs/research/channels/meituan.md §2.4、§4.1、§5.7、
 * §6、§8 第 3/5 条）：POST msg/send 表单——系统级 app_id/timestamp/sig 必传（ISV 门店
 * access_token 参签、品牌商不涉及，本票不做 access_token），应用级按官方「msg/send 发送
 * IM 消息（接单）」与回调同名词法 biz_type=1（两方会话）/app_poi_code/push_content；完整
 * URL 未取得官方原文，接口地址默认官方网关 /api/v1，可用 dudu.channel.meituan.api-base
 * 覆盖为受控替身。响应按合作中心 API 家族错误形状缺席即成功（{"data":"ng","error":{…}}、
 * {"code":…,"msg":…} 任一出现如实失败），不返回消息标识。
 */
@Slf4j
@Component
public class MeituanTextSender {

    private static final String DEFAULT_API_BASE = "https://waimaiopen.meituan.com/api/v1";
    private static final String PATH_MSG_SEND = "/msg/send";

    // 系统级参数（§4.1/§6）：调用时的十进制 UNIX 秒与签名
    private static final String PARAM_APP_ID = "app_id";
    private static final String PARAM_TIMESTAMP = "timestamp";
    private static final String PARAM_SIG = "sig";

    // 应用级参数：官方实锤的两方会话类型值与回调同名字段（§2.4、§5.4）
    private static final String PARAM_BIZ_TYPE = "biz_type";
    private static final String BIZ_TYPE_IM_CHAT = "1";
    private static final String PARAM_APP_POI_CODE = "app_poi_code";
    private static final String PARAM_PUSH_CONTENT = "push_content";

    // 凭据缺失的如实说明：不编造可发能力
    private static final String SEND_CREDENTIALS_MISSING = "渠道发送凭据未配置";

    private final MeituanProtocol protocol;

    private final RestClient restClient;

    // 签名与请求同址：待签 url = api 网关基地址 + msg/send
    private final String apiBase;

    public MeituanTextSender(MeituanProtocol protocol, RestClient.Builder builder,
                             @Value("${dudu.channel.meituan.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.protocol = protocol;
        this.restClient = builder.baseUrl(apiBase).build();
        this.apiBase = apiBase;
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        MeituanCredentials credentials = MeituanCredentials.of(account);
        if (credentials == null) {
            return ChannelSendResult.failed(SEND_CREDENTIALS_MISSING);
        }
        LinkedMultiValueMap<String, String> form = form(credentials, externalUserId, text);
        try {
            String response = restClient.post()
                .uri(PATH_MSG_SEND)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(String.class);
            // 原文先判形再解析：XML 形态字符串会被 hutool 解析成 JSONObject，不能当成功
            String error = MeituanErrors.describe(response);
            if (error != null) {
                return ChannelSendResult.failed("美团消息发送失败：" + error);
            }
            return ChannelSendResult.sent(null);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果；凭据不写日志
            log.warn("[meituan] 消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("美团接口调用失败：" + e.getMessage());
        }
    }

    // 发送表单：系统级在发送前现算签名（timestamp 取调用时 UNIX 秒），sig 之外全参参签
    private LinkedMultiValueMap<String, String> form(MeituanCredentials credentials, String externalUserId,
                                                     String text) {
        LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add(PARAM_BIZ_TYPE, BIZ_TYPE_IM_CHAT);
        form.add(PARAM_APP_POI_CODE, externalUserId);
        form.add(PARAM_PUSH_CONTENT, text);
        form.add(PARAM_APP_ID, credentials.appId());
        form.add(PARAM_TIMESTAMP, String.valueOf(Instant.now().getEpochSecond()));
        Map<String, String> signed = new HashMap<>(form.toSingleValueMap());
        form.add(PARAM_SIG, protocol.sign(apiBase + PATH_MSG_SEND, signed, credentials.appSecret()));
        return form;
    }
}
