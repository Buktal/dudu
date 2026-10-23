package com.dudu.duduserver.channel.dingtalk;

import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.ChannelSendResult;
import com.dudu.duduserver.channel.support.ChannelRestrictions;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 钉钉渠道适配器（ADR-0014 接缝）：无 GET URL 验证阶段（check_url 以加密事件形态走
 * POST receive），密文通道只承载 http_crypto 形态；receive 验签失败拒绝（403），解密与
 * 明文解析失败按参数错误应答（400，与微信三系口径一致），
 * 事件信封与未知明文只应答加密 success 包，机器人消息解析落库且应答仍为加密包；发送
 * 与素材读取按各自凭据如实给出限制说明，凭据缺失不发起渠道请求。凭据不写入日志。
 */
@Slf4j
@Component
public class DingtalkAdapter implements ChannelAdapter {

    // 推送通道形态：本票唯一接入的新 HTTP 密文信封（事实库 §5.11 对拍基线）
    private static final String SYSTEM_HTTP_CRYPTO = "http_crypto";

    private final DingtalkProtocol protocol;
    private final DingtalkTextSender textSender;
    private final DingtalkMediaReader mediaReader;

    DingtalkAdapter(DingtalkProtocol protocol, DingtalkTextSender textSender, DingtalkMediaReader mediaReader) {
        this.protocol = protocol;
        this.textSender = textSender;
        this.mediaReader = mediaReader;
    }

    @Override
    public ChannelEnum channel() {
        return ChannelEnum.DINGTALK;
    }

    @Override
    public ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers,
                                        String body) {
        DingtalkCredentials credentials = DingtalkCredentials.of(account);
        if (credentials == null || !SYSTEM_HTTP_CRYPTO.equals(credentials.system())) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.unsupported());
        }
        String timestamp = query.get("timestamp");
        String nonce = query.get("nonce");
        String encrypt = encryptOf(body);
        if (timestamp == null || timestamp.isEmpty() || nonce == null || nonce.isEmpty() || encrypt == null) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 兼容 signature 与 msg_signature 两种查询参数名（事实库 §3.2/§5.10）
        String signature = query.get("signature");
        if (signature == null || signature.isEmpty()) {
            signature = query.get("msg_signature");
        }
        if (!DingtalkCrypto.verify(signature, credentials.token(), timestamp, nonce, encrypt)) {
            return ChannelReceiveResult.answer(ChannelCallbackResult.rejected());
        }
        DingtalkCrypto.PlainMessage plain;
        try {
            plain = DingtalkCrypto.decrypt(encrypt, credentials.encodingAesKey(), credentials.ownerKey());
        } catch (IllegalArgumentException e) {
            log.warn("[dingtalk] 回调密文解密失败, companyChannelId={}, reason={}",
                account.getCompanyChannelId(), e.getMessage());
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
        // 应答统一为加密 success 包：timeStamp/nonce 原样取请求带来的值（1500ms 窗由入口承担）
        ChannelCallbackResult encryptedSuccess = new ChannelCallbackResult(200, protocol.successReply(
            credentials.token(), timestamp, nonce, credentials.encodingAesKey(), credentials.ownerKey()));
        if (protocol.isEvent(plain.message())) {
            return ChannelReceiveResult.answer(encryptedSuccess);
        }
        try {
            return protocol.parse(account.getCompanyChannelId(), plain.message())
                .map(message -> ChannelReceiveResult.accept(message, encryptedSuccess))
                .orElseGet(() -> {
                    log.warn("[dingtalk] 回调明文无可路由信封, companyChannelId={}, message={}",
                        account.getCompanyChannelId(), plain.message());
                    return ChannelReceiveResult.answer(encryptedSuccess);
                });
        } catch (IllegalArgumentException e) {
            log.warn("[dingtalk] 回调明文解析失败, companyChannelId={}, reason={}",
                account.getCompanyChannelId(), e.getMessage());
            return ChannelReceiveResult.answer(ChannelCallbackResult.badRequest());
        }
    }

    @Override
    public ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text) {
        // 凭据缺失由注册表的 restriction 先行拦截，send 不再重复检查
        return textSender.send(account, externalUserId, text);
    }

    @Override
    public ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId) {
        // 凭据缺失由注册表的 restriction 先行拦截，readMedia 不再重复检查
        return mediaReader.read(account, externalMediaId);
    }

    @Override
    public String sendRestriction(CompanyChannelDO account) {
        return DingtalkSendCredentials.of(account) == null ? ChannelRestrictions.SEND_CREDENTIALS_MISSING : null;
    }

    @Override
    public String mediaRestriction(CompanyChannelDO account) {
        return DingtalkSendCredentials.of(account) == null ? ChannelRestrictions.MEDIA_CREDENTIALS_MISSING : null;
    }

    // 推送报文取 {"encrypt": "..."}；缺失或非 JSON 由调用方按参数错误拒绝
    private String encryptOf(String body) {
        if (body == null || !JSONUtil.isTypeJSONObject(body)) {
            return null;
        }
        String encrypt = JSONUtil.parseObj(body).getStr("encrypt");
        return encrypt == null || encrypt.isEmpty() ? null : encrypt;
    }
}
