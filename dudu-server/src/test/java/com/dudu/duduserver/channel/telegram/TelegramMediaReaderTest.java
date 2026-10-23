package com.dudu.duduserver.channel.telegram;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Telegram 素材读取验证（docs/research/channels/telegram.md §6 文件尺寸行、api#getfile）：
 * 凭 file_id 经 {@code <bot 基址>/getFile} 换 file_path，再从 {@code <源>/file/bot<token>/
 * file_path} 取回字节（官方下载路径与 sendMessage 同源同 token）；上传 ≤50MB / 下载
 * ≤20MB 超限由渠道自身拒绝，错误包络原样透传如实失败；缺凭据与空标识不发请求。
 */
class TelegramMediaReaderTest {

    // 官方教程页 token 原文形态
    private static final String BOT_TOKEN = "4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc";
    private static final String GET_FILE_PATH = "/bot" + BOT_TOKEN + "/getFile";
    private static final String DOWNLOAD_PATH = "/file/bot" + BOT_TOKEN + "/documents/file_1.pdf";
    private static final byte[] FILE_BYTES = "telegram-file-bytes".getBytes(StandardCharsets.UTF_8);

    private final List<String> requestLines = new CopyOnWriteArrayList<>();
    // 本地替身：getFile 包络与下载字节按用例改写
    private volatile String getFileBody =
        "{\"ok\":true,\"result\":{\"file_id\":\"doc-1\",\"file_unique_id\":\"uniq-1\","
            + "\"file_size\":19,\"file_path\":\"documents/file_1.pdf\"}}";
    private volatile int downloadStatus = 200;
    private HttpServer server;
    private String botBase;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(GET_FILE_PATH, exchange -> {
            requestLines.add("GET " + exchange.getRequestURI().getPath()
                + "?" + exchange.getRequestURI().getQuery());
            respond(exchange, getFileBody, "application/json");
        });
        server.createContext(DOWNLOAD_PATH, exchange -> {
            requestLines.add("GET " + exchange.getRequestURI().getPath());
            respond(exchange, new String(FILE_BYTES, StandardCharsets.UTF_8), "application/pdf");
        });
        server.start();
        botBase = "http://127.0.0.1:" + server.getAddress().getPort() + "/bot" + BOT_TOKEN;
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void exchangesFileIdForFilePathThenDownloadsBytes() {
        ChannelMediaResult result = reader().read(account(), "doc-1");

        assertThat(result.succeeded()).isTrue();
        assertThat(result.bytes()).isEqualTo(FILE_BYTES);
        assertThat(result.contentType()).isEqualTo("application/pdf");
        // getFile 携带 file_id 查询参数；下载走官方 /file/bot<token>/ 路径
        assertThat(requestLines.get(0)).isEqualTo("GET " + GET_FILE_PATH + "?file_id=doc-1");
        assertThat(requestLines.get(1)).isEqualTo("GET " + DOWNLOAD_PATH);
    }

    @Test
    void passesThroughGetFileErrorEnvelopeHonestly() {
        // 下载超 20MB 等渠道拒绝由 getFile 给出错误包络（#getfile：bots can download
        // files of up to 20MB），原样描述且不发起下载
        getFileBody = "{\"ok\":false,\"error_code\":400,\"description\":\"Bad Request:"
            + " file is too big\",\"parameters\":{\"retry_after\":0}}";

        ChannelMediaResult result = reader().read(account(), "big-file");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).contains("400").contains("file is too big");
        assertThat(requestLines).hasSize(1);
    }

    @Test
    void reportsDownloadFailureHonestly() {
        // 下载非 2XY：错误包络仍为官方形状（文件下载错误同包络）
        downloadStatus = 404;

        ChannelMediaResult result = reader().read(account(), "doc-1");

        assertThat(result.succeeded()).isFalse();
        assertThat(result.failureReason()).isNotBlank();
        // 下载成功包络之外不给字节
        assertThat(result.bytes()).isNull();
    }

    // 凭据缺失的如实拦截由注册表 restriction 承担（见 TelegramAdapterTest），读取器只按
    // 已配置凭据翻译渠道协议与异常

    @Test
    void failsWithoutChannelRequestWhenMediaIdUnrecognizable() {
        assertThat(reader().read(account(), null).failureReason()).contains("素材标识无法识别");
        assertThat(reader().read(account(), "  ").failureReason()).contains("素材标识无法识别");
        assertThat(requestLines).isEmpty();
    }

    private TelegramMediaReader reader() {
        return new TelegramMediaReader(RestClient.builder());
    }

    private void respond(HttpExchange exchange, String body, String contentType) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(downloadStatus, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private CompanyChannelDO account() {
        Map<String, Object> info = new HashMap<>();
        info.put("url", botBase);
        info.put("secretToken", "dudu-secret-token");
        return account(info);
    }

    private CompanyChannelDO account(Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(4107L);
        account.setCompanyId(1L);
        account.setChannel(ChannelEnum.TELEGRAM);
        account.setAccountName("Telegram");
        account.setChannelInfo(info);
        return account;
    }
}
