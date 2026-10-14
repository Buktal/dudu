package com.dudu.duduserver.channel.qq;

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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * QQ 素材读取实现验证（事实见 docs/research/channels/qq.md §5.12）：入站附件的 url 是
 * 无需鉴权的公开下载链接，读取即按普通 HTTP 直取字节与渠道内容类型；非 http(s) 引用与
 * 下载失败如实报告，不需要渠道凭据。
 */
class QqMediaReaderTest {

    private static final byte[] IMAGE_BYTES = "qq-media-bytes".getBytes(StandardCharsets.UTF_8);

    private HttpServer server;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void readsAttachmentUrlBytesWithChannelContentType() {
        String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/download?fid=x&spec=0";
        server.createContext("/download", exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
            exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
            exchange.getResponseBody().write(IMAGE_BYTES);
            exchange.close();
        });

        ChannelMediaResult result = reader().read(account(), url);

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(IMAGE_BYTES);
        assertThat(result.contentType()).isEqualTo("image/jpeg");
    }

    @Test
    void rejectsNonHttpReferenceAndReportsDownloadFailureHonestly() {
        // 只有 http(s) 附件 URL 是合法媒体引用，其余拒绝且不发起请求
        assertThat(reader().read(account(), "file:///etc/passwd").succeeded()).isFalse();
        assertThat(reader().read(account(), "not a url").succeeded()).isFalse();

        // 附件链接失效（HTTP 404）：如实按读取失败报告
        String expired = "http://127.0.0.1:" + server.getAddress().getPort() + "/expired";
        server.createContext("/expired", exchange -> exchange.sendResponseHeaders(404, -1));
        ChannelMediaResult failed = reader().read(account(), expired);
        assertThat(failed.succeeded()).isFalse();
        assertThat(failed.failureReason()).isNotBlank();
    }

    private QqMediaReader reader() {
        return new QqMediaReader(RestClient.builder());
    }

    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9604L);
        account.setChannel(ChannelEnum.QQ);
        // 素材读取凭附件 URL 直读，无需任何渠道凭据
        account.setChannelInfo(Map.of());
        return account;
    }
}
