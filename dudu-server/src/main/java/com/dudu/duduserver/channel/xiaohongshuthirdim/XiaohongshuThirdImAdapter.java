package com.dudu.duduserver.channel.xiaohongshuthirdim;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 小红书私信三方适配器（绑定骨架，事实见 docs/research/channels/xiaohongshu.md
 * §13、§14）：收发接口规格是开白受控资产（§14.7 四块缺口清单），规格到手前本
 * 适配器只承载绑定骨架——接收侧信封、验签与应答格式均未公开（§14.1），收到推送
 * 不猜测解析，按成功应答避免平台整体三次重推风暴（§13.6）并以 warn 留痕；发送与
 * 素材读取是平台侧限制，凭据齐全仍不可用，Desk 据限制说明禁用入口。令牌轮换链路
 * 见 {@link XiaohongshuThirdImTokenClient}，不经本适配器。
 */
@Slf4j
@Component
public class XiaohongshuThirdImAdapter implements ChannelAdapter {

    // 平台侧限制（与凭据缺失限制区分）：收发规格未随开白下发，凭据齐全仍不可用
    static final String SEND_RESTRICTED =
        "小红书私信三方发送未开放：收发接口规格随平台开白下发（docs/research/channels/xiaohongshu.md §14.7），规格到手前不实现";
    static final String MEDIA_RESTRICTED =
        "小红书私信三方素材读取未开放：媒体接口规格随平台开白下发（docs/research/channels/xiaohongshu.md §14.7），规格到手前不实现";

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.XIAOHONGSHU_THIRD_IM;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        if (XiaohongshuThirdImCredentials.of(account) == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        // 接收信封与验签规格未公开（§14.1）：不猜测解析也不落库，warn 留痕后按成功
        // 应答——应答非 200 会触发平台整体三次重推（§13.6），每次重推同样无法处理
        log.warn("[xiaohongshu-third-im] 收到推送但接收规格未开放，未落库, companyChannelId={}, bodyLength={}",
            account.getCompanyChannelId(), body == null ? 0 : body.length());
        return ChannelReceiveResult.answer(ChannelCallbackResult.success());
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        // 注册表在 send 前经 sendRestriction 拦截；直呼本方法同样按平台限制如实失败
        return ChannelSendResult.failed(SEND_RESTRICTED);
    }

    @Override
    public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
        return ChannelMediaResult.failed(MEDIA_RESTRICTED);
    }

    @Override
    public String sendRestriction(CompanyChannelDO account) {
        return SEND_RESTRICTED;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return MEDIA_RESTRICTED;
    }
}
