package com.dudu.duduserver.channel.support;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.function.Function;

/**
 * 微信族素材读取骨架（临时/永久素材 media_id）：公众号与小程序同 URL 同协议
 * （docs/research/channels/wechat-mp.md §2.1/§6 与 wechat-mini.md §6.4，同一
 * GET /cgi-bin/media/get，视频素材返回 JSON video_url 需再取一次字节）；wecom 为真分叉
 * 不在此列。渠道薄层以 api-base、日志标签与凭据取值参数化。先经 WechatTokenClient 换取
 * access_token（进程内按凭据组缓存复用），成功按二进制返回并带渠道内容类型；失败原样
 * 记录 errcode 与 errmsg。实例由渠道薄层按用途各建各的，与发送互不共享令牌缓存（口径见
 * AccessTokenCache）。视频二次直取走无 baseUrl 的 downloadClient：须在 builder 挂
 * api-base 前构建（Builder.baseUrl 就地修改），只取渠道给出的完整地址，不继承 api-base，
 * 两客户端共享 Boot 自动配置的出站超时（8a64097 纪律）。
 */
@Slf4j
public final class WechatMediaReader<C> {

    private static final String PATH_MEDIA_GET = "/cgi-bin/media/get";
    private static final String KEY_VIDEO_URL = "video_url";

    private final RestClient restClient;

    private final WechatTokenClient<C> tokenClient;

    // 视频素材的 video_url 是渠道给出的完整下载地址，用无 baseUrl 的客户端直取
    private final RestClient downloadClient;

    // 日志标签：渠道薄层给定（"wechat-mp"/"wechat-mini"），日志口径与渠道前缀一致
    private final String logTag;

    public WechatMediaReader(RestClient.Builder builder, String apiBase, String logTag,
                             Function<C, String> appIdOf, Function<C, String> appSecretOf) {
        // downloadClient 须在 builder 挂 baseUrl 前构建，与 restClient 共享自动配置的超时
        this.downloadClient = builder.build();
        this.restClient = builder.baseUrl(apiBase).build();
        this.tokenClient = new WechatTokenClient<>(restClient, appIdOf, appSecretOf);
        this.logTag = logTag;
    }

    public ChannelMediaResult read(C credentials, Long companyChannelId, String externalMediaId) {
        try {
            TokenResult token = tokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelMediaResult.failed(token.failureReason());
            }
            ResponseEntity<byte[]> response = restClient.get()
                .uri(PATH_MEDIA_GET + "?access_token={token}&media_id={mediaId}", token.accessToken(), externalMediaId)
                .retrieve()
                .toEntity(byte[].class);
            byte[] body = response.getBody() == null ? new byte[0] : response.getBody();
            // 渠道对失败与视频素材返回 JSON，其余按二进制素材原样返回
            if (JsonBodies.isJson(body)) {
                return fromJson(JSONUtil.parseObj(new String(body, StandardCharsets.UTF_8)));
            }
            return ChannelMediaResult.media(response);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测素材内容
            log.warn("[{}] 素材读取失败, companyChannelId={}, exception={}",
                logTag, companyChannelId, e.getClass().getSimpleName());
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
            return ChannelMediaResult.media(download);
        }
        if (Errcodes.code(response) != 0) {
            return ChannelMediaResult.failed("微信素材读取失败：" + Errcodes.describe(response));
        }
        return ChannelMediaResult.failed("微信素材读取失败：响应无法识别");
    }
}
