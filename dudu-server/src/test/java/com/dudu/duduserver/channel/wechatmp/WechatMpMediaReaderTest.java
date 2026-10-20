package com.dudu.duduserver.channel.wechatmp;

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
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 公众号素材读取薄层装配冒烟：协议行为由微信族骨架 WechatMediaReader 的合并用例验收
 * （channel/support/WechatMediaReaderTest），此处保留 video_url 二次直取一例（8a64097 纪律
 * 的渠道侧回归），验证薄层把公众号的 api-base 覆盖、channel_info 凭据读取与委托接线
 * （含 downloadClient 直取）配对正确（docs/research/channels/wechat-mp.md §2.1、§6）。
 */
class WechatMpMediaReaderTest {

    // 官方返回示例原文形状：成功 {"access_token":"ACCESS_TOKEN","expires_in":7200}
    private static final String TOKEN_OK = "{\"access_token\":\"ACCESS_TOKEN\",\"expires_in\":7200}";
    private static final byte[] VIDEO_BYTES = "fake-mp4-bytes".getBytes(StandardCharsets.UTF_8);

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private String baseUrl;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void fetchVideoBytesThroughTheChannelSuppliedDownloadUrl() {
        // 官方对视频素材返回 JSON：{"video_url": 下载地址}，需再取一次字节
        handleJson("/cgi-bin/token", 200, TOKEN_OK);
        handleJson("/cgi-bin/media/get", 200,
            "{\"video_url\":\"" + baseUrl + "/mpvideo/demo\"}");
        handleBytes("/mpvideo/demo", 200, "video/mp4", VIDEO_BYTES);
        WechatMpMediaReader reader = new WechatMpMediaReader(RestClient.builder(), baseUrl);

        ChannelMediaResult result = reader.read(wechatAccount(
            Map.of("appId", "wx_test_appid", "appSecret", "test-app-secret")), "VIDEO_MEDIA_ID");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(VIDEO_BYTES);
        assertThat(result.contentType()).isEqualTo("video/mp4");
        // 凭据读取经公众号 Credentials 原样进入换取请求，二次直取走完整下载地址
        assertThat(requestLines.get(0))
            .startsWith("GET /cgi-bin/token?")
            .contains("appid=wx_test_appid")
            .contains("secret=test-app-secret");
        assertThat(requestLines.get(1))
            .startsWith("GET /cgi-bin/media/get?")
            .contains("access_token=ACCESS_TOKEN")
            .contains("media_id=VIDEO_MEDIA_ID");
        assertThat(requestLines.get(2)).startsWith("GET /mpvideo/demo");
    }

    // ---- 夹具 ----

    private CompanyChannelDO wechatAccount(Map<String, Object> channelInfo) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setChannel(ChannelEnum.WECHAT_MP);
        account.setChannelInfo(channelInfo);
        return account;
    }

    // 本地替身：按路径记录请求行，返回构造好的官方形状响应
    private void handleJson(String path, int status, String response) {
        handle(path, status, "application/json; charset=utf-8", response.getBytes(StandardCharsets.UTF_8));
    }

    private void handleBytes(String path, int status, String contentType, byte[] response) {
        handle(path, status, contentType, response);
    }

    private void handle(String path, int status, String contentType, byte[] response) {
        server.createContext(path, exchange -> {
            requestLines.add(exchange.getRequestMethod() + " " + exchange.getRequestURI());
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(status, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
    }
}
