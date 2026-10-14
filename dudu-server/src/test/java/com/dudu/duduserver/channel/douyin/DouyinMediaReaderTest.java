package com.dudu.duduserver.channel.douyin;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 抖音入站媒体读取验收（事实见 docs/research/channels/douyin.md §6.2）：可读范围
 * 只有素材标识为 CDN 直链（emoji 非空 resource_url）的素材——直接 GET 取字节；
 * 派生标识（图片无素材标识）与 @-加密标识（视频 item_id 无公开下载接口）如实返回
 * 渠道原因；凭据缺失与传输失败不冒成功。
 */
class DouyinMediaReaderTest {

    private static final byte[] EMOJI_BYTES = "gif-bytes".getBytes(StandardCharsets.UTF_8);

    private final HttpServer server;

    DouyinMediaReaderTest() {
        HttpServer created;
        try {
            created = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server = created;
    }

    @BeforeEach
    void start() {
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void downloadsDirectLinkResourcesWithTheirContentType() {
        // emoji resource_url 直链即素材标识：GET 取回字节与响应 Content-Type
        server.createContext("/emoji.gif", exchange -> {
            byte[] body = EMOJI_BYTES;
            exchange.getResponseHeaders().set("Content-Type", "image/gif");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/emoji.gif";

        ChannelMediaResult result = new DouyinMediaReader(RestClient.builder())
            .read(account(Map.of("clientKey", "k", "clientSecret", "s")), url);

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(EMOJI_BYTES);
        assertThat(result.contentType()).isEqualTo("image/gif");
    }

    @Test
    void failsHonestlyForIdentifiersWithoutAnOfficialDownloadChannel() {
        // 派生标识（图片载荷无素材标识）与 @-加密 item_id（视频无公开下载接口）
        for (String id : List.of("@msgId:0", "@72NwHyW53+MNggFhRkwGuX1ntuc2RfUyVnKfdTzwU0F0")) {
            ChannelMediaResult result = new DouyinMediaReader(RestClient.builder())
                .read(account(Map.of("clientKey", "k", "clientSecret", "s")), id);
            assertThat(result.succeeded()).isFalse();
            assertThat(result.failureReason()).contains("无官方下载通道");
        }
    }

    @Test
    void failsHonestlyWhenCredentialsAreMissing() {
        ChannelMediaResult result = new DouyinMediaReader(RestClient.builder())
            .read(account(Map.of("clientKey", "k")), "https://p3.douyinpic.com/emoji.gif");
        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isEqualTo("渠道素材凭据未配置");
    }

    @Test
    void reportsTransportFailureInsteadOfPretendingSuccess() {
        // 直链指向本机未注册路径（HTTP 404）：如实记录读取失败
        String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/missing.gif";
        ChannelMediaResult result = new DouyinMediaReader(RestClient.builder())
            .read(account(Map.of("clientKey", "k", "clientSecret", "s")), url);
        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isNotBlank();
    }

    private CompanyChannelDO account(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.DOUYIN);
        account.setChannelInfo(channelInfo);
        return account;
    }
}
