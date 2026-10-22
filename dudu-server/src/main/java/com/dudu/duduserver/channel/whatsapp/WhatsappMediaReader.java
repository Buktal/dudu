package com.dudu.duduserver.channel.whatsapp;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.URI;

/**
 * WhatsApp 入站素材读取（事实见 docs/research/channels/whatsapp.md §5.6，2026-10-14
 * 官方全文回填）：两步下载——先 GET /{version}/{media_id}（Bearer）换 {url, mime_type,
 * sha256, file_size, id}，再对 url 带 Authorization: Bearer 头取媒体二进制（官方明文
 * "If you omit your token, the request will fail."，非公开直链）；url 5 分钟有效、webhook
 * 内媒体 id 7 天内可下载，失效如实落库。内容类型优先二进制响应头，回退第一步的
 * mime_type，再回退二进制流。失败原样记录渠道 error，网络与解析异常按调用失败如实
 * 返回。接口地址默认官方域名，可用 dudu.channel.whatsapp.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class WhatsappMediaReader {

    private static final String DEFAULT_API_BASE = "https://graph.facebook.com";
    private static final String PATH_MEDIA = "/" + WhatsappErrors.API_VERSION + "/{mediaId}";
    private static final String KEY_AUTHORIZATION = "Authorization";
    private static final String AUTHORIZATION_SCHEME = "Bearer ";
    private static final String KEY_URL = "url";
    private static final String KEY_MIME_TYPE = "mime_type";
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final RestClient restClient;

    // 第二步的 url 是渠道给出的完整下载地址，用无 baseUrl 的客户端直取
    private final RestClient downloadClient;

    public WhatsappMediaReader(RestClient.Builder builder,
                               @Value("${dudu.channel.whatsapp.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        // downloadClient 须在 builder 挂 baseUrl 前构建，与 restClient 共享自动配置的超时
        this.downloadClient = builder.build();
        this.restClient = builder.baseUrl(apiBase).build();
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        WhatsappSendCredentials credentials = WhatsappSendCredentials.of(account);
        try {
            JSONObject meta = JSONUtil.parseObj(restClient.get()
                .uri(PATH_MEDIA, externalMediaId)
                .header(KEY_AUTHORIZATION, AUTHORIZATION_SCHEME + credentials.accessToken())
                .retrieve()
                .body(String.class));
            String downloadUrl = meta.getStr(KEY_URL);
            if (downloadUrl == null || downloadUrl.isBlank()) {
                // 媒体 id 失效（webhook 内 7 天）等场景没有可下载地址
                return ChannelMediaResult.failed("WhatsApp素材读取失败：响应缺少 url");
            }
            ResponseEntity<byte[]> response = downloadClient.get()
                .uri(URI.create(downloadUrl))
                .header(KEY_AUTHORIZATION, AUTHORIZATION_SCHEME + credentials.accessToken())
                .retrieve()
                .toEntity(byte[].class);
            byte[] bytes = response.getBody() == null ? new byte[0] : response.getBody();
            return ChannelMediaResult.media(bytes, contentType(response, meta));
        } catch (RestClientResponseException e) {
            String reason = WhatsappErrors.channelReason(e);
            log.warn("[whatsapp] 素材读取被渠道拒绝, companyChannelId={}, reason={}",
                account.getCompanyChannelId(), reason);
            return ChannelMediaResult.failed("WhatsApp素材读取失败：" + reason);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测素材内容
            log.warn("[whatsapp] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("WhatsApp接口调用失败：" + e.getMessage());
        }
    }

    // 内容类型：二进制响应头优先，回退第一步 meta 的 mime_type（如 audio/ogg; codecs=opus）
    private String contentType(ResponseEntity<byte[]> response, JSONObject meta) {
        MediaType contentType = response.getHeaders().getContentType();
        if (contentType != null) {
            return contentType.toString();
        }
        String mimeType = meta.getStr(KEY_MIME_TYPE);
        return mimeType == null || mimeType.isBlank() ? DEFAULT_CONTENT_TYPE : mimeType;
    }
}
