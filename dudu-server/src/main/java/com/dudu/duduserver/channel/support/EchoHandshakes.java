package com.dudu.duduserver.channel.support;

import com.dudu.duduserver.channel.ChannelCallbackResult;

import java.util.Map;

/**
 * 「三参 sha1 验签 + echostr 回显」型渠道握手共用骨架（公众号/小程序/微博/小红书，
 * 事实见 docs/research/channels/ 各渠道文档）：验签密钥缺失按不支持、验签失败按拒绝、
 * echostr 缺失按参数错误、验签通过原样回显。验签密钥的来源（channel_info 的 token、
 * appSecret 或凭据组合）与验签入口是渠道真实差异，由调用方以函数值提供。
 */
public final class EchoHandshakes {

    // 握手四要素在 GET query 的参数名（四渠道同名）
    private static final String PARAM_SIGNATURE = "signature";
    private static final String PARAM_TIMESTAMP = "timestamp";
    private static final String PARAM_NONCE = "nonce";
    private static final String PARAM_ECHOSTR = "echostr";

    private EchoHandshakes() {
    }

    // 三参 sha1 验签入口：密钥、签名、时间戳与随机串
    @FunctionalInterface
    public interface Sha1Verification {
        boolean verify(String secret, String signature, String timestamp, String nonce);
    }

    /**
     * 握手收尾：验签密钥 null 按不支持；验签失败按拒绝；echostr 缺失按参数错误；
     * 通过则原样回显 echostr。
     *
     * @param secret  验签密钥（token/appSecret），null 表示账号未配置回调验签
     * @param verify  渠道协议的三参验签入口
     * @param query   渠道 GET 握手的查询参数
     * @return 回调应答
     */
    public static ChannelCallbackResult verifyUrl(String secret, Sha1Verification verify, Map<String, String> query) {
        if (secret == null) {
            return ChannelCallbackResult.unsupported();
        }
        if (!verify.verify(secret, query.get(PARAM_SIGNATURE), query.get(PARAM_TIMESTAMP), query.get(PARAM_NONCE))) {
            return ChannelCallbackResult.rejected();
        }
        String echostr = query.get(PARAM_ECHOSTR);
        if (echostr == null || echostr.isEmpty()) {
            return ChannelCallbackResult.badRequest();
        }
        return ChannelCallbackResult.echo(echostr);
    }
}
