package com.dudu.duduserver.channel.alipay;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * 支付宝媒体下载（事实见 docs/research/channels/alipay.md §2.3）：POST {media-base}/
 * chat/multimedia.do（媒体网关与消息网关分离，openfile.alipay.com），接口
 * alipay.mobile.public.multimedia.download，biz_content {"mediaId":…}，加签方式同普通
 * OpenAPI 请求；成功时 HTTP 响应体即图片内容（Content-Type 图片类型，无 JSON 信封）；
 * JSON 错误报文原样透出 code 与 sub_msg，非图片应答与调用异常按失败如实返回。媒体网关
 * 地址默认官方域名，可用 dudu.channel.alipay.media-base 覆盖为受控替身（媒体宿主与
 * api-base 不同，另设一键）。timestamp 按支付宝官方 GMT+8 口径（Asia/Shanghai）生成——
 * 渠道协议保真，非业务时间。
 */
@Slf4j
@Component
public class AlipayMediaReader {

    static final String DEFAULT_MEDIA_BASE = "https://openfile.alipay.com";
    private static final String PATH_MEDIA = "/chat/multimedia.do";
    private static final String METHOD_MEDIA_DOWNLOAD = "alipay.mobile.public.multimedia.download";

    private final RestClient restClient;

    public AlipayMediaReader(RestClient.Builder builder,
                             @Value("${dudu.channel.alipay.media-base:" + DEFAULT_MEDIA_BASE + "}") String mediaBase) {
        this.restClient = builder.baseUrl(mediaBase).build();
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        AlipayCredentials credentials = AlipayCredentials.of(account);
        try {
            Map<String, String> params = AlipayRequests.params(credentials, METHOD_MEDIA_DOWNLOAD,
                JSONUtil.createObj().set("mediaId", externalMediaId).toString());
            ResponseEntity<byte[]> response = restClient.post()
                .uri(PATH_MEDIA)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(AlipayRequests.form(params))
                .retrieve()
                .toEntity(byte[].class);
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

    // JSON 错误报文（error_response）原样透出 code/msg/sub_code/sub_msg
    private String jsonFailure(byte[] body) {
        if (body == null || body.length == 0) {
            return null;
        }
        try {
            JSONObject node = AlipayRequests.resultNodeIn(
                JSONUtil.parseObj(new String(body, java.nio.charset.StandardCharsets.UTF_8)));
            String describe = node == null ? "" : AlipayRequests.describe(node);
            return describe.isEmpty() ? null : describe;
        } catch (RuntimeException e) {
            return null;
        }
    }
}
