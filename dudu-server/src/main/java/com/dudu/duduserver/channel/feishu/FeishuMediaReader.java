package com.dudu.duduserver.channel.feishu;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

/**
 * 飞书消息资源读取，事实见 docs/research/channels/feishu.md §5.11、§5.13、§6：入参
 * 「message_id:file_key:type」复合标识（协议层编码，type 为下载接口的查询参数
 * image|file），先经 tenant_access_token/internal 换取（进程内缓存复用）接口凭据，
 * 再 GET /open-apis/im/v1/messages/:message_id/resources/:file_key?type= 取回二进制。
 * 渠道错误携带 JSON {code,msg}（HTTP 4xx/5xx 或 200 体），原样记录 code 与 msg；
 * 网络与响应解析异常按调用失败如实返回。接口地址默认官方域名，可用
 * dudu.channel.feishu.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class FeishuMediaReader {

    private static final String DEFAULT_API_BASE = "https://open.feishu.cn";
    private static final String PATH_RESOURCE = "/open-apis/im/v1/messages/{messageId}/resources/{fileKey}";
    private static final String QUERY_TYPE = "type={resourceType}";
    private static final String MEDIA_ID_UNRECOGNIZED = "飞书素材读取失败：素材标识无法识别";    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
    private static final String BEARER_PREFIX = "Bearer ";

    private final RestClient restClient;

    private final FeishuTokenClient tokenClient;

    public FeishuMediaReader(RestClient.Builder builder,
                              @Value("${dudu.channel.feishu.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
        // 与读取共用同一 RestClient 基址，便于测试替身与官方域名切换
        this.tokenClient = new FeishuTokenClient(restClient);
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        String[] parts = externalMediaId == null ? new String[0] : externalMediaId.split(":", 3);
        if (parts.length != 3 || isBlank(parts[0]) || isBlank(parts[1]) || isBlank(parts[2])) {
            return ChannelMediaResult.failed(MEDIA_ID_UNRECOGNIZED);
        }
        FeishuSendCredentials credentials = FeishuSendCredentials.of(account);
        if (credentials == null) {
            return ChannelMediaResult.failed(ChannelRestrictions.MEDIA_CREDENTIALS_MISSING);
        }
        FeishuTokenClient.TokenResult token = tokenClient.fetch(credentials);
        if (!token.succeeded()) {
            return ChannelMediaResult.failed(token.failureReason());
        }
        try {
            ResponseEntity<byte[]> response = restClient.get()
                .uri(PATH_RESOURCE + "?" + QUERY_TYPE, parts[0], parts[1], parts[2])
                .header("Authorization", BEARER_PREFIX + token.accessToken())
                .retrieve()
                .toEntity(byte[].class);
            byte[] body = response.getBody() == null ? new byte[0] : response.getBody();
            return ChannelMediaResult.media(body, contentType(response));
        } catch (HttpStatusCodeException e) {
            // 渠道错误（HTTP 4xx/5xx）响应体为 {code,msg}，原样透出渠道说明
            log.warn("[feishu] 素材读取被渠道拒绝, companyChannelId={}, status={}",
                account.getCompanyChannelId(), e.getStatusCode().value());
            return ChannelMediaResult.failed("飞书素材读取失败：" + describeErrorBody(e.getResponseBodyAsByteArray()));
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测素材内容
            log.warn("[feishu] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("飞书接口调用失败：" + e.getMessage());
        }
    }

    // 渠道错误响应体为 JSON {code,msg}（官方 §5.13）；无法解析时如实说明无法识别
    private String describeErrorBody(byte[] body) {
        try {
            JSONObject error = JSONUtil.parseObj(new String(body, StandardCharsets.UTF_8));
            return FeishuErrors.describe(error);
        } catch (RuntimeException e) {
            return "响应无法识别";
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    // 渠道未给内容类型或给出无法使用时按二进制流返回，不猜具体格式
    private String contentType(ResponseEntity<?> response) {
        MediaType contentType = response.getHeaders().getContentType();
        return contentType == null ? DEFAULT_CONTENT_TYPE : contentType.toString();
    }
}
