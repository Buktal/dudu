package com.dudu.duduserver.channel.alipay;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/**
 * 支付宝生活号适配器：组合回调验签协议、客服消息纯文本发送与媒体下载，聚合该渠道的
 * 服务器验证、入站接收与发送/读取能力说明（事实见 docs/research/channels/alipay.md）。
 * 回调凭据 appId/appPrivateKey/alipayPublicKey 住在 channel_info（{@link AlipayCredentials}
 * ，验签用平台公钥）；官方网关验证握手为 POST 表单（§3.2，官方示例工程 doGet 委托
 * doPost），无 GET 验证阶段，verifyUrl 按不支持应答；POST 侧 service=alipay.service.check
 * 回签名 XML 信封完成开发者模式激活，被动通知按 MsgType 落访客消息并回无签名 XML ack
 * （§2.3）；无 biz_content 的表单推送（支付类通知形态、mock-pulse 探测）验签通过后按
 * success 应答。
 */
@Component
public class AlipayAdapter implements ChannelAdapter {

    private final AlipayProtocol protocol;

    private final AlipayTextSender textSender;

    private final AlipayMediaReader mediaReader;

    public AlipayAdapter(AlipayProtocol protocol, AlipayTextSender textSender, AlipayMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.ALIPAY;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        AlipayCredentials credentials = AlipayCredentials.of(account);
        if (credentials == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        // POST 表单推送：参数可能经 Servlet 表单解析落在 query，也可能留在 body 原始串；
        // 畸形百分号编码无法解码时按参数错误拒绝（验签无从进行，不外泄 500）
        Map<String, String> params;
        try {
            params = protocol.paramsOf(query, body);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        String sign = params.get(AlipaySignature.FIELD_SIGN);
        if (sign == null || sign.isBlank()) {
            // 缺签名材料无法验签，按参数错误处理
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        if (!protocol.verify(credentials, params)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        // 网关验证握手（§3.2）：验签通过后回签名 XML 信封，开发者模式即激活
        if (AlipayProtocol.SERVICE_CHECK.equals(params.get(AlipayProtocol.FIELD_SERVICE))) {
            return ChannelReceiveResult.answer(new ChannelCallbackResult(200, protocol.handshakeReply(credentials)));
        }
        String bizContent = params.get(AlipayProtocol.FIELD_BIZ_CONTENT);
        if (bizContent == null || bizContent.isBlank()) {
            // 无 biz_content 的表单推送（支付类通知形态、mock-pulse 探测）：验签已通过，
            // 按支付族惯例回明文 success（§5.3），不产生访客消息
            return ChannelReceiveResult.answer(ChannelCallbackResult.success());
        }
        Optional<ChannelInboundMessage> inbound;
        try {
            inbound = protocol.parse(account.getCompanyChannelId(), bizContent);
        } catch (IllegalArgumentException e) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 文本/图片落访客消息并回无签名 ack（ToUserId 按官方口径回显来报 FromUserId，见协议层）；
        // 事件族与无法解析的报文只应答 ack
        ChannelCallbackResult ack = new ChannelCallbackResult(200, protocol.ackReply(credentials, bizContent));
        return inbound
            .map(message -> ChannelReceiveResult.accept(message, ack))
            .orElseGet(() -> ChannelReceiveResult.answer(ack));
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
        return AlipayCredentials.of(account) == null ? AlipayTextSender.SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return AlipayCredentials.of(account) == null ? AlipayMediaReader.MEDIA_CREDENTIALS_MISSING : null;
    }
}
