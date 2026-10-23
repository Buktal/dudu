package com.dudu.duduserver.channel.support;

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
 * 直链素材读取骨架验证：QQ 附件、小红书 PicUrl/VideoUrl、抖音 emoji CDN 链接共用此
 * 接口——http(s) 绝对地址 GET 直取字节与渠道内容类型；非 http(s) 与非法 URI 按调用方
 * 给定的渠道原因拒绝且不发起请求；下载失败按调用方前缀如实报告，不模拟素材。
 */
class DirectHttpMediaReaderTest {

    private static final byte[] IMAGE_BYTES = "direct-link-bytes".getBytes(StandardCharsets.UTF_8);

    private final HttpServer server;

    DirectHttpMediaReaderTest() {
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
    void downloadsDirectLinkBytesWithChannelContentType() {
        server.createContext("/emoji.gif", exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "image/gif");
            exchange.sendResponseHeaders(200, IMAGE_BYTES.length);
            exchange.getResponseBody().write(IMAGE_BYTES);
            exchange.close();
        });

        ChannelMediaResult result = reader().read(account(),
            "http://127.0.0.1:" + server.getAddress().getPort() + "/emoji.gif",
            "引用不可读", "test", "素材读取失败：");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(IMAGE_BYTES);
        assertThat(result.contentType()).isEqualTo("image/gif");
    }

    @Test
    void rejectsNonHttpAndIllegalReferencesWithoutAnyRequest() {
        DirectHttpMediaReader reader = reader();
        // 非 http(s) 引用、畸形 URI（含空格等非法字符在构造即失败）一律按渠道原因拒绝，
        // 不以未知异常逃逸，也不发起请求
        for (String reference : new String[] {"file:///etc/passwd", "not a url", null,
            "http://cdn.example.com/emoji file.gif"}) {
            ChannelMediaResult result = reader.read(account(), reference, "引用不可读", "test", "素材读取失败：");
            assertThat(result.succeeded()).isFalse();
            assertThat(result.failureReason()).isEqualTo("引用不可读");
        }
    }

    @Test
    void reportsTransportFailureWithCallerPrefixInsteadOfPretendingSuccess() {
        // 直链指向未注册路径（HTTP 404）：按调用方前缀如实报告读取失败
        String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/missing.gif";

        ChannelMediaResult result = reader().read(account(), url, "引用不可读", "test", "素材读取失败：");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).startsWith("素材读取失败：");
    }

    private DirectHttpMediaReader reader() {
        return new DirectHttpMediaReader(RestClient.builder());
    }

    // 直链读取不依赖渠道凭据，账号仅承载日志归属
    private CompanyChannelDO account() {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(9604L);
        account.setChannel(ChannelEnum.QQ);
        account.setChannelInfo(Map.of());
        return account;
    }
}
