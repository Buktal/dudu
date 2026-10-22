package com.dudu.duduserver.channel.xiaohongshu;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;

/**
 * 小红书素材读取（事实见 docs/research/channels/xiaohongshu.md §10.3、§12.4）：小红书服务端
 * 不提供按 media_id 拉取素材的接口，推送中的 image/video 素材只有 PicUrl/VideoUrl 公开链接，
 * 消息中已保存的渠道引用即该链接——读取=下载该链接字节；Desk 侧带链接的引用直接使用 URL，
 * 不进入本读取器。回调凭据（token/encodingAesKey/appId）不齐的账号视为未完成渠道接入，
 * 读取前即被拒；链接引用只接受 http(s) 绝对地址，下载失败与非法引用都如实返回失败说明，
 * 不模拟成功。
 */
@Slf4j
@Component
public class XiaohongshuMediaReader {

    private static final String SCHEME_HTTP = "http";
    private static final String SCHEME_HTTPS = "https";
    private static final String UNREADABLE_REFERENCE = "素材引用不是可读取的素材链接";

    // 素材链接是渠道给出的完整公开地址（CDN 域名与接口域名不同），用无 baseUrl 的客户端直取
    private final RestClient downloadClient;

    public XiaohongshuMediaReader(RestClient.Builder builder) {
        this.downloadClient = builder.build();
    }

    /**
     * 按消息中已保存的渠道引用（PicUrl/VideoUrl 链接）读取媒体字节。
     *
     * @param account         渠道账号
     * @param externalMediaId 消息中保存的渠道引用链接
     * @return 媒体字节与内容类型，或失败说明
     */
    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        if (XiaohongshuCredentials.of(account) == null) {
            return ChannelMediaResult.failed(ChannelRestrictions.MEDIA_CREDENTIALS_MISSING);
        }
        URI uri = uriOf(externalMediaId);
        if (uri == null) {
            return ChannelMediaResult.failed(UNREADABLE_REFERENCE);
        }
        try {
            ResponseEntity<byte[]> download = downloadClient.get()
                .uri(uri)
                .retrieve()
                .toEntity(byte[].class);
            return ChannelMediaResult.media(download);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按读取失败记录，不猜测素材内容
            log.warn("[xiaohongshu] 素材读取失败, companyChannelId={}, exception={}",
                account == null ? null : account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("小红书素材下载失败：" + e.getMessage());
        }
    }

    // 只接受 http(s) 绝对 URL（PicUrl/VideoUrl 直链的形态），其余引用一律不可读
    private URI uriOf(String externalMediaId) {
        URI uri;
        try {
            uri = URI.create(externalMediaId);
        } catch (IllegalArgumentException e) {
            return null;
        }
        String scheme = uri.getScheme();
        return SCHEME_HTTP.equalsIgnoreCase(scheme) || SCHEME_HTTPS.equalsIgnoreCase(scheme) ? uri : null;
    }

}
