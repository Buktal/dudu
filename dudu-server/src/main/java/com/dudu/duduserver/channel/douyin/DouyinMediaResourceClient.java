package com.dudu.duduserver.channel.douyin;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.Texts;
import com.dudu.duduserver.channel.support.TokenResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * 抖音入站媒体资源读取（事实见 docs/research/channels/douyin.md §8.4）：用户发送的
 * 本地图片/视频（user_local_image/user_local_video）经 GetIMMessageResource 以
 * server_message_id 换 30 天有效资源 URL——GET /api/im/message/resources/，query
 * conversation_id/message_id/open_id 均含 + = 等特殊字符须 URL 编码，Header
 * access-token 为用户授权类 act.*（与发送私信同一 refreshToken 续期链路，素材读取
 * 各建各的令牌缓存，口径见 AccessTokenCache）。响应信封 err_no/err_msg/log_id +
 * data{media_type,url}（非 dop 常见 extra 信封），err_no 非 0 如实失败（HTTP 恒
 * 200）；url 可能含字面「反斜杠+u0026」转义序列需替换为 & 后访问，且访问须携带与调用接口相同的
 * Access-Token/OpenID 头，二跳直取用无 baseUrl 的 downloadClient（须在 builder 挂
 * api-base 前构建，WechatMediaReader 同款纪律）。仅半年内消息可取，接口地址默认
 * 官方域名，可用 dudu.channel.douyin.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class DouyinMediaResourceClient {

    private static final String PATH_MESSAGE_RESOURCES = "/api/im/message/resources/";

    // query 三参数名（§8.4：均含特殊字符，经 uriBuilder 编码）
    private static final String KEY_CONVERSATION_ID = "conversation_id";
    private static final String KEY_MESSAGE_ID = "message_id";
    private static final String KEY_OPEN_ID = "open_id";

    // 接口与二跳访问的鉴权头（官方 curl 逐字：小写 access-token 换 URL，二跳大小写头）
    private static final String HEADER_ACCESS_TOKEN = "access-token";
    private static final String HEADER_ACCESS_TOKEN_TITLE = "Access-Token";
    private static final String HEADER_OPEN_ID_TITLE = "OpenID";

    // §8.4 响应信封字段（err_no/err_msg/log_id + data）
    private static final String KEY_ERR_NO = "err_no";
    private static final String KEY_ERR_MSG = "err_msg";
    private static final String KEY_LOG_ID = "log_id";
    private static final String KEY_DATA = "data";
    private static final String KEY_URL = "url";

    // 官方口径：URL 可能含字面「反斜杠+u0026」转义序列，需替换为 & 后才能访问；
    // 拆开书写避免该序列被 Java 词法层 unicode 预处理先行替换
    private static final String ESCAPED_AMP = "\\" + "u0026";
    private static final String AMP = "&";

    private static final String FAILURE_PREFIX = "抖音素材读取失败：";

    private final RestClient restClient;

    // 资源 URL 是渠道给出的完整下载地址（CDN 域名与接口域名不同），用无 baseUrl 的客户端直取
    private final RestClient downloadClient;

    // 素材读取与发送各建各的令牌缓存实例，互不共享
    private final DouyinTokenClient tokenClient;

    // 接口域名：资源接口 query 全量编码后以完整 URI 出网（uriBuilder 会二次编码 %）
    private final String apiBase;

    public DouyinMediaResourceClient(RestClient.Builder builder,
                                     @Value("${dudu.channel.douyin.api-base:https://open.douyin.com}") String apiBase) {
        // downloadClient 须在 builder 挂 baseUrl 前构建，与 restClient 共享自动配置的超时
        this.downloadClient = builder.build();
        this.restClient = builder.baseUrl(apiBase).build();
        this.tokenClient = new DouyinTokenClient(restClient);
        this.apiBase = apiBase;
    }

    public ChannelMediaResult read(CompanyChannelDO account, DouyinProtocol.MediaResource resource) {
        DouyinCredentials credentials = DouyinCredentials.of(account);
        if (credentials == null) {
            return ChannelMediaResult.failed(FAILURE_PREFIX + "渠道凭据未配置");
        }
        TokenResult token = tokenClient.fetch(credentials);
        if (!token.succeeded()) {
            return ChannelMediaResult.failed(token.failureReason());
        }
        try {
            JSONObject response = JSONUtil.parseObj(restClient.get()
                .uri(resourceUri(resource))
                .header(HEADER_ACCESS_TOKEN, token.accessToken())
                .retrieve()
                .body(String.class));
            Object errNo = response.get(KEY_ERR_NO);
            if (!(errNo instanceof Number number) || number.longValue() != 0) {
                return ChannelMediaResult.failed(FAILURE_PREFIX + describeError(response, errNo));
            }
            JSONObject data = response.getJSONObject(KEY_DATA);
            String url = data == null ? null : Texts.blankToNull(data.getStr(KEY_URL, null));
            if (url == null) {
                return ChannelMediaResult.failed(FAILURE_PREFIX + "响应缺少资源 url");
            }
            ResponseEntity<byte[]> download = downloadClient.get()
                .uri(URI.create(url.replace(ESCAPED_AMP, AMP)))
                .header(HEADER_ACCESS_TOKEN_TITLE, token.accessToken())
                .header(HEADER_OPEN_ID_TITLE, resource.ownerOpenId())
                .retrieve()
                .toEntity(byte[].class);
            return ChannelMediaResult.media(download);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测素材内容
            log.warn("[douyin] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("抖音接口调用失败：" + e.getMessage());
        }
    }

    // 资源接口完整 URI：官方样例对三参全量编码（@ + / = 均转义，裸 + 会被按 form 语义
    // 解成空格损坏会话标识）；预编码后以完整 URI 出网——uriBuilder 的模板编码会把
    // 已转义序列中的 % 再编码为 %25，双重编码损坏标识
    private URI resourceUri(DouyinProtocol.MediaResource resource) {
        return URI.create(apiBase + PATH_MESSAGE_RESOURCES
            + "?" + KEY_CONVERSATION_ID + "=" + encoded(resource.conversationId())
            + "&" + KEY_MESSAGE_ID + "=" + encoded(resource.serverMessageId())
            + "&" + KEY_OPEN_ID + "=" + encoded(resource.ownerOpenId()));
    }

    private static String encoded(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    // 渠道错误描述：err_no + err_msg，补 log_id 便于向平台侧排查定位
    private String describeError(JSONObject response, Object errNo) {
        StringBuilder description = new StringBuilder(String.valueOf(errNo));
        String errMsg = response.getStr(KEY_ERR_MSG, null);
        if (!Texts.isBlank(errMsg)) {
            description.append(" ").append(errMsg);
        }
        String logId = response.getStr(KEY_LOG_ID, null);
        if (!Texts.isBlank(logId)) {
            description.append(" log_id=").append(logId);
        }
        return description.toString();
    }
}
