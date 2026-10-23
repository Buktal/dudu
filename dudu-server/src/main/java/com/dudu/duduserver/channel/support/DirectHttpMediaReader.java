package com.dudu.duduserver.channel.support;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;

/**
 * 直链素材读取共享骨架：QQ 附件、小红书 PicUrl/VideoUrl、抖音 emoji CDN 链接等渠道的
 * 素材引用本身就是无需鉴权的公开 http(s) 直链，读取即 GET 取字节与响应内容类型。
 * 引用只接受 http(s) 绝对地址，其余按调用方给定的渠道原因如实拒绝；下载与网络异常
 * 按调用方文案如实失败，不模拟素材。渠道差异（拒绝原因、失败前缀、日志标签）由
 * 调用方注入，本类不持有渠道语义。
 */
@Slf4j
@Component
public class DirectHttpMediaReader {

    private static final String SCHEME_HTTP = "http";
    private static final String SCHEME_HTTPS = "https";

    // 素材直链是渠道给出的完整公开地址（CDN 域名与接口域名不同），用无 baseUrl 的客户端直取
    private final RestClient downloadClient;

    public DirectHttpMediaReader(RestClient.Builder builder) {
        this.downloadClient = builder.build();
    }

    public ChannelMediaResult read(CompanyChannelDO account, String reference, String rejectionReason,
                                   String logTag, String failurePrefix) {
        URI uri = httpUriOf(reference);
        if (uri == null) {
            return ChannelMediaResult.failed(rejectionReason);
        }
        try {
            ResponseEntity<byte[]> response = downloadClient.get().uri(uri).retrieve().toEntity(byte[].class);
            return ChannelMediaResult.media(response);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应读取异常都按调用失败记录，不猜测素材内容
            log.warn("[{}] 素材读取失败, companyChannelId={}, exception={}",
                logTag, account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed(failurePrefix + e.getMessage());
        }
    }

    // 只接受 http(s) 绝对 URL（附件与 CDN 直链的形态），其余引用一律不可读
    private URI httpUriOf(String reference) {
        if (reference == null) {
            return null;
        }
        URI uri;
        try {
            uri = URI.create(reference);
        } catch (IllegalArgumentException e) {
            return null;
        }
        String scheme = uri.getScheme();
        return SCHEME_HTTP.equalsIgnoreCase(scheme) || SCHEME_HTTPS.equalsIgnoreCase(scheme) ? uri : null;
    }
}
