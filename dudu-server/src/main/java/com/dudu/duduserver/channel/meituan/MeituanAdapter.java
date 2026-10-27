package com.dudu.duduserver.channel.meituan;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelRoutes;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 美团适配器：组合表单验签协议、IM 消息发送与素材读取实现，聚合该渠道的接收与发送/读取
 * 能力说明（事实见 docs/research/channels/meituan.md §3、§4.1、§8）。美团无 GET 握手阶段
 * （票面要点 6），verifyUrl 沿用接口 default 应答不支持，握手以 POST 验签口径对拍
 * mock-pulse 探针语义；推送为表单参数，验签材料全在表单（无 header 验签）。验签基准
 * URL 未配置时取请求 Host 头（官方明文入口直连口径），配置
 * dudu.channel.meituan.callback-base-url 后以配置值为准（反代改写 Host 的部署）。
 */
@Slf4j
@Component
public class MeituanAdapter implements ChannelAdapter {

    private final MeituanProtocol protocol;

    private final MeituanTextSender textSender;

    private final MeituanMediaReader mediaReader;

    // 渠道视角的签名基准（scheme://host[:port]，如 http://gw.example:8080）；空表示取 Host 头
    private final String callbackBaseUrl;

    public MeituanAdapter(MeituanProtocol protocol, MeituanTextSender textSender, MeituanMediaReader mediaReader,
                          @Value("${dudu.channel.meituan.callback-base-url:}") String callbackBaseUrl) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
        this.callbackBaseUrl = callbackBaseUrl == null ? "" : callbackBaseUrl.trim();
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.MEITUAN;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        MeituanCredentials credentials = MeituanCredentials.of(account);
        if (credentials == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        // 待签串含完整回调 URL（§8 第 1 条）：路径由统一路由确定性派生；官方端口仅 80/8080
        // 明文（guide/6），scheme 恒 http，反代 https 场景未加防御（边界注明）。
        // 待签基准两口径：未配置基准 URL 时 Host 取原始头值（含端口），与渠道签名时的 URL
        // 逐字一致；反代改写 Host 的部署配置 dudu.channel.meituan.callback-base-url，
        // 以配置值为 scheme://host 段，路径仍由统一路由派生
        String host = headers.getFirst(HttpHeaders.HOST);
        if (host == null || host.isEmpty()) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        String url = callbackBaseUrl.isEmpty()
            ? "http://" + host + ChannelRoutes.callbackPath(account.getCompanyChannelId())
            : callbackBaseUrl + ChannelRoutes.callbackPath(account.getCompanyChannelId());
        // 合并 query 与 body 表单（网关以非标准内容类型直发 body 时容器不解析），按官方
        // 「解码 2 次」口径解码后参签与解析
        Map<String, String> form = protocol.paramsOf(query, body);
        if (!protocol.verify(url, form, credentials.appSecret())) {
            // 验签失败无法落库，留待签定位线索排障；appSecret 绝不写入日志
            log.warn("[meituan] 回调验签失败, companyChannelId={}, signUrl={}",
                account.getCompanyChannelId(), url);
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        try {
            return protocol.parse(account.getCompanyChannelId(), form);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        return textSender.send(account, externalUserId, text);
    }

    @Override
    public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
        return mediaReader.read(account, externalMediaId);
    }

    @Override
    public String sendRestriction(CompanyChannelDO account) {
        return MeituanCredentials.of(account) == null ? ChannelRestrictions.SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return MeituanCredentials.of(account) == null ? ChannelRestrictions.MEDIA_CREDENTIALS_MISSING : null;
    }
}
