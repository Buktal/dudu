package com.dudu.duduserver.channel.douyin;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;

/**
 * 抖音入站媒体读取，事实见 docs/research/channels/douyin.md §6.2：入站私信媒体无
 * 通用下载接口——可读范围只有素材标识为 CDN 直链的素材（emoji 非空 resource_url），
 * 直接 GET 取字节、Content-Type 取响应头（缺失回退 application/octet-stream）；
 * 派生标识（图片载荷无素材标识）与 @-加密标识（视频 item_id 无公开下载接口）如实
 * 返回渠道原因。凭据缺失按限制如实回答，传输失败不冒成功。
 */
@Slf4j
@Component
public class DouyinMediaReader {

    // 直链标识前缀（emoji resource_url 为 http/https CDN 链接）
    private static final String HTTP_PREFIX = "http://";

    private static final String HTTPS_PREFIX = "https://";

    // §6.2：图片载荷不含素材标识、视频 item_id 无公开下载接口——官方下载通道不存在
    private static final String NO_DOWNLOAD_CHANNEL =
        "抖音素材读取失败：该素材无官方下载通道（图片载荷不含素材标识，视频分享无公开下载接口）";

    private final RestClient restClient;

    public DouyinMediaReader(RestClient.Builder builder) {
        // 直链下载无固定基址，逐请求携带绝对地址
        this.restClient = builder.build();
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        if (DouyinCredentials.of(account) == null) {
            return ChannelMediaResult.failed(ChannelRestrictions.MEDIA_CREDENTIALS_MISSING);
        }
        if (externalMediaId == null
            || !(externalMediaId.startsWith(HTTP_PREFIX) || externalMediaId.startsWith(HTTPS_PREFIX))) {
            return ChannelMediaResult.failed(NO_DOWNLOAD_CHANNEL);
        }
        try {
            ResponseEntity<byte[]> entity = restClient.get()
                .uri(URI.create(externalMediaId))
                .retrieve()
                .toEntity(byte[].class);
            return ChannelMediaResult.media(entity);
        } catch (IllegalArgumentException e) {
            // 非 RFC2396 形态的直链（含空格等非法字符）在 URI 构造即失败：与其他失败
            // 同路返回渠道原因，不以未知异常 500 逃逸
            log.warn("[douyin] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("抖音素材读取失败：素材链接不是合法 URI");
        } catch (RestClientException e) {
            log.warn("[douyin] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("抖音素材读取失败：" + e.getMessage());
        }
    }
}
