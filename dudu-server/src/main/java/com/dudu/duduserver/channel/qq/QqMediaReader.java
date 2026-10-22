package com.dudu.duduserver.channel.qq;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;

/**
 * QQ 入站素材读取（事实见 docs/research/channels/qq.md §5.12）：入站事件的 attachments
 * 给出的是多媒体下载直链（multimedia.nt.qq.com.cn，无需鉴权、无独立 MediaId 下载接口），
 * 读取即按普通 HTTP 直取字节与渠道内容类型；链接引用只接受 http(s) 绝对地址，非 http(s)
 * 与下载失败（链接过期返回非 2xx）如实报告。不需要渠道凭据，接口地址即附件 URL 本身。
 */
@Slf4j
@Component
public class QqMediaReader {

    private static final String SCHEME_HTTP = "http";
    private static final String SCHEME_HTTPS = "https";
    private static final String UNREADABLE_REFERENCE = "素材引用不是可读取的附件链接";

    private final RestClient restClient;

    public QqMediaReader(RestClient.Builder builder) {
        // 附件 URL 是绝对地址，无需 baseUrl
        this.restClient = builder.build();
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        URI uri = uriOf(externalMediaId);
        if (uri == null) {
            return ChannelMediaResult.failed(UNREADABLE_REFERENCE);
        }
        try {
            ResponseEntity<byte[]> response = restClient.get().uri(uri).retrieve().toEntity(byte[].class);
            return ChannelMediaResult.media(response);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测素材内容
            log.warn("[qq] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("QQ素材读取失败：" + e.getMessage());
        }
    }

    // 只接受 http(s) 绝对 URL（附件直链的形态），其余引用一律不可读
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
