package com.dudu.duduserver.channel.xiaohongshuthirdim;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/**
 * 小红书私信三方适配器（事实见 docs/research/channels/xiaohongshu-third-im-spec.md）：
 * 接收侧线索推送已按联调代码规格落地——X-Red-Signature 验签可选（§1.2，pushToken 与
 * 验签头齐备才核验，HMAC-SHA1 为主拼接 SHA1 兜底），线索信封解析为渠道资料项并按
 * 200 应答（§1.3 唯一应答要求）；判型不符的推送是未公开的消息级信封（§1.5），不猜测
 * 解析也不落库，warn 留痕后按成功应答避免平台整体三次重推风暴（§1.3）。发送与素材
 * 读取仍是平台侧限制：端点路径与请求体结构缺位（§2.2/§2.3），凭据齐全仍不可用，
 * Desk 据限制说明禁用入口。令牌轮换链路见 {@link XiaohongshuThirdImTokenClient}，
 * 不经本适配器。
 */
@Slf4j
@Component
public class XiaohongshuThirdImAdapter implements ChannelAdapter {

    // 平台侧限制（与凭据缺失限制区分）：收发规格未随开白下发，凭据齐全仍不可用
    static final String SEND_RESTRICTED =
        "小红书私信三方发送未开放：发送端点与报文规格随平台开白下发（docs/research/channels/xiaohongshu-third-im-spec.md §2.2），规格到手前不实现";
    static final String MEDIA_RESTRICTED =
        "小红书私信三方素材读取未开放：媒体接口规格随平台开白下发（docs/research/channels/xiaohongshu-third-im-spec.md §2.2），规格到手前不实现";

    private final XiaohongshuThirdImProtocol protocol;

    public XiaohongshuThirdImAdapter(XiaohongshuThirdImProtocol protocol) {
        this.protocol = protocol;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.XIAOHONGSHU_THIRD_IM;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        XiaohongshuThirdImCredentials credentials = XiaohongshuThirdImCredentials.of(account);
        if (credentials == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        // 验签可选（官方非必须，spec §1.2）：pushToken 与验签头齐备才核验，双算法都不中
        // 说明 token 配错或非平台推送，按拒绝不落库；材料不齐时跳过验签直接解析
        String signature = headers.getFirst(XiaohongshuThirdImProtocol.SIGNATURE_HEADER);
        if (credentials.pushToken() != null && signature != null
            && !protocol.verifySignature(credentials.pushToken(), signature, body)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        Optional<ChannelInboundMessage> inbound = protocol.parseLead(account.getCompanyChannelId(), body);
        if (inbound.isEmpty()) {
            // 判型不符即未公开的消息级推送（spec §1.5）或缺归属身份的线索：不猜测解析也不
            // 落库，warn 留痕后按成功应答——非 200 会触发平台整体三次重推（§1.3），重推同样无法处理
            log.warn("[xiaohongshu-third-im] 收到无法解析的推送，未落库, companyChannelId={}, bodyLength={}",
                account.getCompanyChannelId(), body == null ? 0 : body.length());
            return ChannelReceiveResult.answer(ChannelCallbackResult.success());
        }
        return ChannelReceiveResult.accept(inbound.get());
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
