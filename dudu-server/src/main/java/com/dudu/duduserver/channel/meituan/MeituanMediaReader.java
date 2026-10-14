package com.dudu.duduserver.channel.meituan;

import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.stereotype.Component;

/**
 * 美团素材读取（docs/research/channels/meituan.md §7 第 5/6 条、§8 第 7 条）：图片/语音藏
 * 在 IM push_content 内，官方素材下载接口未取得原文、不编造下载链路——未配置凭据按受限
 * 说明，凭据齐备也如实返回「接口未实锤」失败；官方结构实锤后在此补真实读取实现。
 */
@Component
public class MeituanMediaReader {

    // 凭据缺失的如实说明：不编造可读能力
    private static final String MEDIA_CREDENTIALS_MISSING = "渠道素材凭据未配置";

    // 官方素材接口未实锤的如实说明（票面渠道要点 4：按现状如实处理并注明边界）
    private static final String MEDIA_API_UNCONFIRMED = "美团渠道素材接口未实锤，暂无法读取素材";

    public ChannelMediaResult read(CompanyChannelDO account, String externalMediaId) {
        if (MeituanCredentials.of(account) == null) {
            return ChannelMediaResult.failed(MEDIA_CREDENTIALS_MISSING);
        }
        return ChannelMediaResult.failed(MEDIA_API_UNCONFIRMED);
    }
}
