package com.dudu.duduserver.channel.weibo;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.support.JsonBodies;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

/**
 * 微博素材读取（事实见 docs/research/channels/weibo.md §2.1、§6）：语音/图片私信的接收者
 * 侧文件 ID（tovfid）经 GET https://upload.api.weibo.com/2/mss/msget?access_token=&fid=
 * 下载，access_token 为 channel_info 直配的粉服凭据（接收者侧）；成功按二进制返回并带
 * 渠道内容类型，失败响应为 JSON，原样记录 error_code 与 error，网络与响应解析异常按调用
 * 失败如实返回。素材地址默认官方域名，可用 dudu.channel.weibo.media-base 覆盖为受控替身。
 */
@Slf4j
@Component
public class WeiboMediaReader {

    private static final String DEFAULT_MEDIA_BASE = "https://upload.api.weibo.com";
    private static final String PATH_MSGET = "/2/mss/msget";

    private final RestClient restClient;

    public WeiboMediaReader(RestClient.Builder builder,
                            @Value("${dudu.channel.weibo.media-base:" + DEFAULT_MEDIA_BASE + "}") String mediaBase) {
        this.restClient = builder.baseUrl(mediaBase).build();
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        WeiboCredentials credentials = WeiboCredentials.of(account);
        try {
            ResponseEntity<byte[]> response = restClient.get()
                .uri(PATH_MSGET + "?access_token={token}&fid={fid}", credentials.accessToken(), externalMediaId)
                .retrieve()
                .toEntity(byte[].class);
            byte[] body = response.getBody() == null ? new byte[0] : response.getBody();
            // 渠道对失败返回 JSON，其余按二进制素材原样返回
            if (JsonBodies.isJson(body)) {
                return ChannelMediaResult.failed(
                    "微博素材读取失败：" + WeiboErrors.describe(JSONUtil.parseObj(new String(body, StandardCharsets.UTF_8))));
            }
            return ChannelMediaResult.media(response);
        } catch (RuntimeException e) {
            // 网络、HTTP 状态与响应解析异常都按调用失败记录，不猜测素材内容
            log.warn("[weibo] 素材读取失败, companyChannelId={}, exception={}",
                account.getCompanyChannelId(), e.getClass().getSimpleName());
            return ChannelMediaResult.failed("微博接口调用失败：" + e.getMessage());
        }
    }

}
