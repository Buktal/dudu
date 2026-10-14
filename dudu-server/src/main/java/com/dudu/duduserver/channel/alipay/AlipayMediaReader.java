package com.dudu.duduserver.channel.alipay;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 支付宝媒体下载（事实见 docs/research/channels/alipay.md §2.3）：POST {media-base}/
 * chat/multimedia.do（媒体网关与消息网关分离，openfile.alipay.com），接口
 * alipay.mobile.public.multimedia.download，biz_content {"mediaId":…}，加签方式同普通
 * OpenAPI 请求；成功时 HTTP 响应体即图片内容（Content-Type 图片类型，无 JSON 信封）；
 * JSON 错误报文原样透出 code 与 sub_msg，非图片应答与调用异常按失败如实返回。媒体网关
 * 地址默认官方域名，可用 dudu.channel.alipay.media-base 覆盖为受控替身（媒体宿主与
 * api-base 不同，另设一键）。
 */
@Slf4j
@Component
public class AlipayMediaReader {

    static final String DEFAULT_MEDIA_BASE = "https://openfile.alipay.com";
    private static final String PATH_MEDIA = "/chat/multimedia.do";
    private static final String METHOD_MEDIA_DOWNLOAD = "alipay.mobile.public.multimedia.download";
    private static final String CHARSET = "utf-8";
    private static final String SIGN_TYPE = "RSA2";
    private static final String VERSION = "1.0";
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    // 媒体凭据缺失的如实说明：与发送凭据同集（appId/appPrivateKey），文案按能力区分
    static final String MEDIA_CREDENTIALS_MISSING = "渠道媒体凭据未配置";

    private final RestClient restClient;

    public AlipayMediaReader(RestClient.Builder builder,
                             @Value("${dudu.channel.alipay.media-base:" + DEFAULT_MEDIA_BASE + "}") String mediaBase) {
        this.restClient = builder.baseUrl(mediaBase).build();
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        AlipayCredentials credentials = AlipayCredentials.of(account);
        if (credentials == null) {
            return ChannelMediaResult.failed(MEDIA_CREDENTIALS_MISSING);
        }
        try {
            Map<String, String> params = params(credentials,
                JSONUtil.createObj().set("mediaId", externalMediaId).toString());
            ResponseEntity<byte[]> response = restClient.post()
                .uri(PATH_MEDIA)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form(params))
                .retrieve()
                .toEntity(new ParameterizedTypeReference<byte[]>() {
                });
            MediaType contentType = response.getHeaders().getContentType();
            if (contentType == null || !contentType.getType().equals("image")) {
                // 错误报文为 JSON 信封：原样透出 code 与 sub_msg；其余按非图片应答说明
                String failure = jsonFailure(response.getBody());
                return ChannelMediaResult.failed("支付宝媒体下载失败："
                    + (failure != null ? failure : "应答非图片(" + contentType + ")"));
            }
            return ChannelMediaResult.media(response.getBody(), contentType.toString());
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与应答读取异常都按调用失败记录，不猜测媒体内容
            log.warn("[alipay] 媒体下载失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("支付宝接口调用失败：" + e.getMessage());
        }
    }

    // 公共参数（§4.1）+ biz_content + sign
    private Map<String, String> params(AlipayCredentials credentials, String bizContent) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("app_id", credentials.appId());
        params.put("method", METHOD_MEDIA_DOWNLOAD);
        params.put("format", "JSON");
        params.put("charset", CHARSET);
        params.put("sign_type", SIGN_TYPE);
        params.put("timestamp", LocalDateTime.now().format(TIMESTAMP));
        params.put("version", VERSION);
        params.put("biz_content", bizContent);
        try {
            params.put(AlipaySignature.FIELD_SIGN,
                AlipaySignature.sign(AlipaySignature.privateKeyOf(credentials.appPrivateKey()), params));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException("应用私钥无法用于请求加签", e);
        }
        return params;
    }

    private LinkedMultiValueMap<String, String> form(Map<String, String> params) {
        LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        params.forEach(form::add);
        return form;
    }

    // JSON 错误报文（error_response）原样透出 code/msg/sub_code/sub_msg
    private String jsonFailure(byte[] body) {
        if (body == null || body.length == 0) {
            return null;
        }
        try {
            JSONObject payload = JSONUtil.parseObj(new String(body, java.nio.charset.StandardCharsets.UTF_8));
            for (String key : payload.keySet()) {
                if (key.endsWith("_response") && payload.get(key) instanceof JSONObject node) {
                    StringBuilder describe = new StringBuilder();
                    for (String field : new String[]{"code", "msg", "sub_code", "sub_msg"}) {
                        String value = node.getStr(field);
                        if (value != null && !value.isBlank()) {
                            if (describe.length() > 0) {
                                describe.append(", ");
                            }
                            describe.append(field).append("=").append(value);
                        }
                    }
                    return describe.length() > 0 ? describe.toString() : null;
                }
            }
        } catch (RuntimeException e) {
            return null;
        }
        return null;
    }
}
