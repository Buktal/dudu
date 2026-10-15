package com.dudu.duduserver.channel.dingtalk;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.TokenResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * 钉钉媒体读取（事实库 §5.11 换链 API 直抓）：先用发送侧凭据（robotCode 取 appKey，
 * 实施假设见事实库 §5.11）经新版凭证客户端取 accessToken，再 POST
 * /v1.0/robot/messageFiles/download（header x-acs-dingtalk-access-token，body
 * robotCode/downloadCode）换临时 downloadUrl，最后直取该地址字节；换链渠道错误为
 * 新 api 系 code/message 形状，原始值透传。接口地址默认官方域名，可用
 * dudu.channel.dingtalk.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class DingtalkMediaReader {

    static final String DEFAULT_API_BASE = "https://api.dingtalk.com";
    private static final String PATH_MESSAGE_FILES_DOWNLOAD = "/v1.0/robot/messageFiles/download";
    private static final String HEADER_ACCESS_TOKEN = "x-acs-dingtalk-access-token";
    private static final String KEY_DOWNLOAD_URL = "downloadUrl";

    private final RestClient apiClient;
    private final DingtalkAccessTokenClient accessTokenClient;

    // downloadUrl 是渠道给出的完整临时地址，用无 baseUrl 的客户端直取
    private final RestClient downloadClient;

    DingtalkMediaReader(RestClient.Builder builder,
                        @Value("${dudu.channel.dingtalk.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        // downloadClient 须在 builder 挂 baseUrl 前构建，与 apiClient 共享自动配置的超时
        this.downloadClient = builder.build();
        this.apiClient = builder.baseUrl(apiBase).build();
        this.accessTokenClient = new DingtalkAccessTokenClient(builder.clone().baseUrl(apiBase).build());
    }

    /**
     * 按消息中保存的渠道标识（downloadCode）读取媒体字节。
     *
     * @param account         渠道账号
     * @param externalMediaId downloadCode
     * @return 媒体字节与内容类型，或失败说明
     */
    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        DingtalkSendCredentials credentials = DingtalkSendCredentials.of(account);
        try {
            TokenResult token = accessTokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelMediaResult.failed(token.failureReason());
            }
            JSONObject exchange = JSONUtil.parseObj(apiClient.post()
                .uri(PATH_MESSAGE_FILES_DOWNLOAD)
                .header(HEADER_ACCESS_TOKEN, token.accessToken())
                .body(Map.of("robotCode", credentials.appKey(), "downloadCode", externalMediaId))
                .retrieve()
                .body(String.class));
            String downloadUrl = exchange.getStr(KEY_DOWNLOAD_URL);
            if (downloadUrl == null || downloadUrl.isBlank()) {
                return ChannelMediaResult.failed("钉钉媒体读取失败：" + DingtalkErrors.describeNew(exchange));
            }
            ResponseEntity<byte[]> download = downloadClient.get()
                .uri(downloadUrl)
                .retrieve()
                .toEntity(byte[].class);
                        return ChannelMediaResult.media(download);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测素材内容
            log.warn("[dingtalk] 媒体读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("钉钉接口调用失败：" + e.getMessage());
        }
    }

}
