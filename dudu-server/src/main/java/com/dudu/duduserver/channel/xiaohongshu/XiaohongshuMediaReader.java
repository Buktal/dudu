package com.dudu.duduserver.channel.xiaohongshu;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 小红书素材读取（事实见 docs/research/channels/xiaohongshu.md §10.3、§12.4）：小红书服务端
 * 不提供按 media_id 拉取素材的接口，推送中的 image/video 素材只有 PicUrl/VideoUrl 公开链接，
 * 消息中已保存的渠道引用即该链接——读取=下载该链接字节；Desk 侧带链接的引用直接使用 URL，
 * 不进入本读取器。回调凭据（token/encodingAesKey/appId）不齐的账号视为未完成渠道接入，
 * 读取前即被拒；下载失败与非法引用都如实返回失败说明，不模拟成功。
 */
@Slf4j
@Component
public class XiaohongshuMediaReader {

    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
    // 回调凭据缺失的如实说明：不编造可读能力
    static final String MEDIA_CREDENTIALS_MISSING = "渠道素材凭据未配置";

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
            return ChannelMediaResult.failed(MEDIA_CREDENTIALS_MISSING);
        }
        try {
            ResponseEntity<byte[]> download = downloadClient.get()
                .uri(externalMediaId)
                .retrieve()
                .toEntity(byte[].class);
            byte[] body = download.getBody() == null ? new byte[0] : download.getBody();
            return ChannelMediaResult.media(body, contentType(download));
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与引用非法（非链接）都按读取失败记录，不猜测素材内容
            log.warn("[xiaohongshu] 素材读取失败, companyChannelId={}, exception={}",
                account == null ? null : account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("小红书素材下载失败：" + e.getMessage());
        }
    }

    // 渠道未给内容类型或给出无法使用时按二进制流返回，不猜具体格式
    private String contentType(ResponseEntity<?> response) {
        MediaType contentType = response.getHeaders().getContentType();
        return contentType == null ? DEFAULT_CONTENT_TYPE : contentType.toString();
    }
}
