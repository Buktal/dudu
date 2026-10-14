package com.dudu.duduserver.channel.dingtalk;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 钉钉媒体读取（事实库 §5.11）：downloadCode 先调 /v1.0/robot/messageFiles/download
 * 换临时 downloadUrl 再下载字节；换链与下载两跳都走 api 系，header 携带
 * x-acs-dingtalk-access-token。测试以本地替身按官方事实构造响应。
 */
@Component
public class DingtalkMediaReader {

    static final String DEFAULT_API_BASE = "https://api.dingtalk.com";

    private final RestClient restClient;
    private final String apiBase;

    DingtalkMediaReader(RestClient.Builder builder,
                        @Value("${dudu.channel.dingtalk.api-base:" + DEFAULT_API_BASE + "}") String apiBase) {
        this.restClient = builder.build();
        this.apiBase = apiBase;
    }

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        throw new UnsupportedOperationException("尚未实现");
    }
}
