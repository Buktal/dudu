package com.dudu.duduserver.channel.wecom;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.TokenResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

/**
 * 企业微信素材读取（临时素材 media_id，事实见 docs/research/channels/wecom.md §2 素材
 * 读取补证/90254）：先用 channel_info 的 corpId/corpSecret 经 /cgi-bin/gettoken 换取
 * access_token，再 GET /cgi-bin/media/get?access_token=&media_id=；成功按普通 HTTP 下载
 * 返回二进制与渠道内容类型（media_id 同企业应用间共享、仅三天内有效，超 20M 渠道要求
 * Range 分块并返回 830002，本接口不做分块按失败如实透传）；失败原样记录 errcode 与
 * errmsg，接口地址默认官方域名，可用 dudu.channel.wecom.api-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class WecomMediaReader {

    private static final String DEFAULT_API_BASE = "https://qyapi.weixin.qq.com";
    private static final String PATH_MEDIA_GET = "/cgi-bin/media/get";
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final RestClient restClient;

    private final WecomAccessTokenClient accessTokenClient;

    public WecomMediaReader(RestClient.Builder builder,
                            @Value("${dudu.channel.wecom.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.baseUrl(apiBase).build();
        this.accessTokenClient = new WecomAccessTokenClient(restClient);
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        WecomCredentials credentials = WecomCredentials.of(account);
        try {
            TokenResult token = accessTokenClient.fetch(credentials);
            if (!token.succeeded()) {
                return ChannelMediaResult.failed(token.failureReason());
            }
            ResponseEntity<byte[]> response = restClient.get()
                .uri(PATH_MEDIA_GET + "?access_token={token}&media_id={mediaId}",
                    token.accessToken(), externalMediaId)
                .retrieve()
                .toEntity(byte[].class);
            byte[] body = response.getBody() == null ? new byte[0] : response.getBody();
            // 渠道对失败返回 JSON 错误报文，其余按二进制素材原样返回（成功无 JSON 形态）
            if (isJson(body)) {
                return ChannelMediaResult.failed("企业微信素材读取失败："
                    + WecomErrors.describe(JSONUtil.parseObj(new String(body, StandardCharsets.UTF_8))));
            }
            return ChannelMediaResult.media(body, contentType(response));
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测素材内容
            log.warn("[wecom] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("企业微信接口调用失败：" + e.getMessage());
        }
    }

    private boolean isJson(byte[] body) {
        for (byte value : body) {
            if (Character.isWhitespace(value)) {
                continue;
            }
            return value == '{';
        }
        return false;
    }

    // 渠道未给内容类型或给出无法使用时按二进制流返回，不猜具体格式
    private String contentType(ResponseEntity<?> response) {
        org.springframework.http.MediaType contentType = response.getHeaders().getContentType();
        return contentType == null ? DEFAULT_CONTENT_TYPE : contentType.toString();
    }
}
