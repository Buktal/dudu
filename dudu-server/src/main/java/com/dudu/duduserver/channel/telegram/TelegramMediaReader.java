package com.dudu.duduserver.channel.telegram;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.channel.support.JsonBodies;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

/**
 * Telegram 素材读取（事实见 docs/research/channels/telegram.md §6 文件尺寸行、api#getfile、
 * #file）：凭消息中已保存的 file_id 经 {@code <bot 基址>/getFile} 换取 file_path，再从官方
 * 下载路径 {@code <源>/file/bot<token>/<file_path>}（与 sendMessage 同源同 token，由基址
 * 在 bot 段前插 file 段派生）取回字节。上传 ≤50MB / 下载 ≤20MB 超限由渠道自身在 getFile
 * 拒绝（#getfile：bots can download files of up to 20MB），错误包络
 * {@code ok:false + error_code/description} 原样描述如实失败，不伪装字节；缺凭据与空
 * 标识不发请求。token 在 URL 路径上，日志只记 companyChannelId 与异常类名。
 */
@Slf4j
@Component
public class TelegramMediaReader {

    private static final String PATH_GET_FILE = "/getFile";
    private static final String SEGMENT_BOT = "/bot";
    private static final String SEGMENT_FILE_BOT = "/file/bot";
    private static final String QUERY_FILE_ID = "?file_id={fileId}";

    private static final String KEY_OK = "ok";
    private static final String KEY_RESULT = "result";
    private static final String KEY_FILE_PATH = "file_path";
    private static final String KEY_ERROR_CODE = "error_code";
    private static final String KEY_DESCRIPTION = "description";

    private static final String MEDIA_ID_UNRECOGNIZED = "Telegram 素材读取失败：素材标识无法识别";
    private static final String RESPONSE_UNRECOGNIZED = "Telegram 素材读取失败：响应无法识别";

    private final RestClient restClient;

    public TelegramMediaReader(RestClient.Builder builder) {
        this.restClient = builder.build();
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        if (externalMediaId == null || externalMediaId.isBlank()) {
            return ChannelMediaResult.failed(MEDIA_ID_UNRECOGNIZED);
        }
        TelegramSendCredentials credentials = TelegramSendCredentials.of(account);
        if (credentials == null) {
            return ChannelMediaResult.failed(ChannelRestrictions.MEDIA_CREDENTIALS_MISSING);
        }
        FilePathResult lookup = requestFilePath(account, credentials, externalMediaId);
        if (lookup.failureReason() != null) {
            return ChannelMediaResult.failed(lookup.failureReason());
        }
        return download(account, credentials, lookup.filePath());
    }

    // getFile 换取结果：file_path 或失败说明二选一（record 值承载，单例无共享状态）
    private record FilePathResult(String filePath, String failureReason) {

        static FilePathResult of(String filePath) {
            return new FilePathResult(filePath, null);
        }

        static FilePathResult failed(String reason) {
            return new FilePathResult(null, reason);
        }
    }

    // getFile 换 file_path：错误包络、无法识别的响应与缺 file_path 都按失败说明返回；
    // 渠道拒绝（HTTP 4xx/5xx，含下载超 20MB 的 file is too big）按包络如实描述
    private FilePathResult requestFilePath(CompanyChannelDO account, TelegramSendCredentials credentials,
                                           String fileId) {
        String response;
        try {
            response = restClient.get()
                .uri(credentials.url() + PATH_GET_FILE + QUERY_FILE_ID, fileId)
                .retrieve()
                .body(String.class);
        } catch (HttpStatusCodeException e) {
            return FilePathResult.failed("Telegram 素材读取失败：" + describe(e.getResponseBodyAsString()));
        } catch (RuntimeException e) {
            log.warn("[telegram] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return FilePathResult.failed("Telegram 接口调用失败：" + e.getClass().getSimpleName());
        }
        JSONObject envelope = parse(response);
        if (envelope == null) {
            return FilePathResult.failed(RESPONSE_UNRECOGNIZED);
        }
        if (!(envelope.get(KEY_OK) instanceof Boolean ok) || !ok) {
            return FilePathResult.failed("Telegram 素材读取失败：" + describe(envelope));
        }
        JSONObject result = JsonBodies.objectField(envelope, KEY_RESULT, "Telegram 素材响应报文");
        String filePath = result == null ? null : result.getStr(KEY_FILE_PATH, null);
        if (filePath == null || filePath.isBlank()) {
            return FilePathResult.failed("Telegram 素材读取失败：响应缺少 file_path");
        }
        return FilePathResult.of(filePath);
    }

    // 下载：官方路径为 <源>/file/bot<token>/<file_path>（api#file），由基址在 bot 段前
    // 插 file 段派生；HTTP 非 2XY 按渠道错误如实失败，不伪装字节
    private ChannelMediaResult download(CompanyChannelDO account, TelegramSendCredentials credentials,
                                        String filePath) {
        try {
            ResponseEntity<byte[]> response = restClient.get()
                .uri(downloadBase(credentials.url()) + "/" + filePath)
                .retrieve()
                .toEntity(byte[].class);
            return ChannelMediaResult.media(response);
        } catch (HttpStatusCodeException e) {
            log.warn("[telegram] 素材下载被渠道拒绝, companyChannelId={}, status={}",
                account.getCompanyChannelId(), e.getStatusCode().value());
            return ChannelMediaResult.failed("Telegram 素材下载失败：" + describe(e.getResponseBodyAsString()));
        } catch (RuntimeException e) {
            log.warn("[telegram] 素材下载失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("Telegram 接口调用失败：" + e.getClass().getSimpleName());
        }
    }

    private JSONObject parse(String rawResponse) {
        try {
            return JSONUtil.parseObj(rawResponse);
        } catch (RuntimeException e) {
            return null;
        }
    }

    // 错误包络描述：「error_code description」，形状不符按无法识别
    private String describe(String body) {
        JSONObject envelope = parse(body);
        if (envelope == null) {
            return "响应无法识别";
        }
        return describe(envelope);
    }

    private String describe(JSONObject envelope) {
        if (!(envelope.get(KEY_OK) instanceof Boolean ok) || ok) {
            return "响应无法识别";
        }
        Object errorCode = envelope.get(KEY_ERROR_CODE);
        String description = envelope.getStr(KEY_DESCRIPTION, "");
        if (errorCode == null && description.isEmpty()) {
            return "响应无法识别";
        }
        if (errorCode == null) {
            return description;
        }
        return description.isEmpty() ? String.valueOf(errorCode) : errorCode + " " + description;
    }

    // token 无 '/' 字符，bot 段是基址最后一段：在其前插 file 段即官方下载路径
    private String downloadBase(String botBase) {
        int index = botBase.lastIndexOf(SEGMENT_BOT);
        return index < 0 ? botBase
            : botBase.substring(0, index) + SEGMENT_FILE_BOT + botBase.substring(index + SEGMENT_BOT.length());
    }
}
