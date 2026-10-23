package com.dudu.duduserver.channel.weibo;

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

/**
 * 微博客服消息纯文本主动回复（事实见 docs/research/channels/weibo.md §6、§6.1）：
 * POST /2/messages/reply.json，Content-Type application/x-www-form-urlencoded，form 参数
 * receiver_id（int64 UID）、type=text、data（JSON URLEncode UTF-8），access_token 为
 * channel_info 直配的粉服凭据；成功以 result==true 为准（接口不返回消息标识），save_sender_box
 * 不传按官方默认 1（消息进入发送方私信箱）；失败原样记录 error_code 与 error，网络与响应
 * 解析异常按调用失败如实返回——token 在 URL query 上，异常报文可能携带完整地址，
 * 日志与失败原因都只留异常类名，凭据不写日志也不返回 Desk。接口地址默认官方域名，
 * 可用 dudu.channel.weibo.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class WeiboTextSender {

    private static final String DEFAULT_API_BASE = "https://m.api.weibo.com";
    private static final String PATH_REPLY = "/2/messages/reply.json";
    private static final String MSG_TYPE_TEXT = "text";

    private final RestClient restClient;

    public WeiboTextSender(RestClient.Builder builder,
                           @Value("${dudu.channel.weibo.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
    }

    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        WeiboCredentials credentials = WeiboCredentials.of(account);
        try {
            JSONObject response = JSONUtil.parseObj(restClient.post()
                .uri(PATH_REPLY + "?access_token={token}", credentials.accessToken())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form(externalUserId, text))
                .retrieve()
                .body(String.class));
            if (!Boolean.TRUE.equals(response.getBool("result"))) {
                return ChannelSendResult.failed("微博客服消息发送失败：" + WeiboErrors.describe(response));
            }
            return ChannelSendResult.sent(null);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测发送结果；
            // access_token 在请求 URL 上，异常报文可能携带完整地址，日志与失败原因只留类名
            log.warn("[weibo] 客服消息发送失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelSendResult.failed("微博接口调用失败：" + e.getClass().getSimpleName());
        }
    }

    // 客服消息 form 报文：data 为 {"text": 正文} 做 URLEncode 后的字符串（由表单编码器完成）
    private LinkedMultiValueMap<String, String> form(String externalUserId, String text) {
        LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("receiver_id", externalUserId);
        form.add("type", MSG_TYPE_TEXT);
        form.add("data", JSONUtil.createObj().set("text", text).toString());
        return form;
    }
}
