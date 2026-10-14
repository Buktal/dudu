package com.dudu.duduserver.channel.wechatmp;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.TokenResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

/**
 * 微信公众号素材读取（临时/永久素材 media_id），事实见 docs/research/channels/wechat-mp.md §2.1、§6：
 * 先用 channel_info 的 appId/appSecret 经 /cgi-bin/token 换取 access_token，再
 * GET /cgi-bin/media/get?access_token=&media_id=；成功按二进制返回并带渠道内容类型，
 * 视频素材按官方行为返回 JSON video_url（短时下载地址），需再取一次字节；
 * 失败原样记录 errcode 与 errmsg，接口地址默认官方域名，可用
 * dudu.channel.wechat-mp.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class WechatMpMediaReader {

    private static final String DEFAULT_API_BASE = "https://api.weixin.qq.com";
    private static final String PATH_MEDIA_GET = "/cgi-bin/media/get";
    private static final String KEY_VIDEO_URL = "video_url";
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final RestClient restClient;

    private final WechatMpAccessTokenClient accessTokenClient;

    // 视频素材的 video_url 是渠道给出的完整下载地址，用无 baseUrl 的客户端直取
    private final RestClient downloadClient;

    public WechatMpMediaReader(RestClient.Builder builder,
                               @Value("${dudu.channel.wechat-mp.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.accessTokenClient = new WechatMpAccessTokenClient(restClient);
        this.downloadClient = RestClient.builder().build();
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        WechatMpCredentials credentials = WechatMpCredentials.of(account);
        try {
            TokenResult token = accessTokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelMediaResult.failed(token.failureReason());
            }
            ResponseEntity<byte[]> response = restClient.get()
                .uri(PATH_MEDIA_GET + "?access_token={token}&media_id={mediaId}", token.accessToken(), externalMediaId)
                .retrieve()
                .toEntity(byte[].class);
            byte[] body = response.getBody() == null ? new byte[0] : response.getBody();
            // 渠道对失败与视频素材返回 JSON，其余按二进制素材原样返回
            if (isJson(body)) {
                return fromJson(JSONUtil.parseObj(new String(body, StandardCharsets.UTF_8)));
            }
            return ChannelMediaResult.media(body, contentType(response));
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测素材内容
            log.warn("[wechat-mp] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("微信接口调用失败：" + e.getMessage());
        }
    }

    // 视频素材响应：{"video_url": 下载地址}，再取一次字节；errcode 非 0 时原样记录渠道错误
    private ChannelMediaResult fromJson(JSONObject response) {
        String videoUrl = response.getStr(KEY_VIDEO_URL);
        if (videoUrl != null && !videoUrl.isBlank()) {
            ResponseEntity<byte[]> download = downloadClient.get()
                .uri(videoUrl)
                .retrieve()
                .toEntity(byte[].class);
            return ChannelMediaResult.media(
                download.getBody() == null ? new byte[0] : download.getBody(), contentType(download));
        }
        if (WechatMpErrors.code(response) != 0) {
            return ChannelMediaResult.failed("微信素材读取失败：" + WechatMpErrors.describe(response));
        }
        return ChannelMediaResult.failed("微信素材读取失败：响应无法识别");
    }

    private boolean isJson(byte[] body) {
        for (byte value : body) {
            if (Character.isWhitespace(value)) {
                continue;
            }
            return value == '{';
        }
        return false;
    }

    // 渠道未给内容类型或给出无法使用时按二进制流返回，不猜具体格式
    private String contentType(ResponseEntity<?> response) {
        MediaType contentType = response.getHeaders().getContentType();
        return contentType == null ? DEFAULT_CONTENT_TYPE : contentType.toString();
    }
}
