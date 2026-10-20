package com.dudu.duduserver.channel.console;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.ChannelEnum;
import java.util.List;
import static com.dudu.duduserver.constant.ChannelEnum.*;

/**
 * 首版十三个实际渠道的配置定义；不从渠道枚举推断适配器存在或接入能力。
 */
public final class ConsoleChannelDefinitions {
    private ConsoleChannelDefinitions() {
    }

    public static final List<ConsoleChannelDefinition> ALL = List.of(
        definition(WECHAT_MP, "只支持明文回调，不支持公众号 AES 模式。", List.of(
            field("token", "回调 Token", true, true, false, false),
            field("appId", "App ID", false, false, true, true),
            field("appSecret", "App Secret", true, false, true, false))),
        definition(WECHAT_MINI, "可选配置 EncodingAESKey；密文回调还必须填写 App ID。", List.of(
            field("token", "回调 Token", true, true, false, false),
            field("encodingAesKey", "EncodingAESKey", true, false, false, false),
            field("appId", "App ID", false, false, true, true),
            field("appSecret", "App Secret", true, false, true, false))),
        definition(WECOM, "仅支持自建应用 agent，不支持 aibot。", List.of(
            field("corpId", "企业 ID", false, true, true, true),
            field("token", "回调 Token", true, true, false, false),
            field("encodingAesKey", "EncodingAESKey", true, true, false, false),
            field("corpSecret", "应用 Secret", true, false, true, false),
            field("agentId", "Agent ID", false, false, true, true))),
        definition(QQ, "使用 Bot Secret 验证 op13 握手与 Ed25519 推送。", List.of(
            field("appId", "App ID", false, false, true, true),
            field("appSecret", "Bot Secret", true, true, true, false))),
        definition(WEIBO, "接收需 App Secret；发送令牌由管理员在粉服后台取得，本控制台不提供 OAuth。", List.of(
            field("appSecret", "App Secret", true, true, false, false),
            field("accessToken", "粉服 Access Token", true, false, true, false))),
        definition(FEISHU, "使用 HTTP Webhook；Encrypt Key 可选，配置后按加密模式接收。", List.of(
            field("appId", "App ID", false, true, true, true),
            field("verificationToken", "Verification Token", true, true, false, false),
            field("encryptKey", "Encrypt Key", true, false, false, false),
            field("appSecret", "App Secret", true, false, true, false))),
        definition(ALIPAY, "仅支持支付宝生活号，应用私钥与支付宝公钥必须分别填写完整 PEM。", List.of(
            field("appId", "App ID", false, true, true, true),
            pem("appPrivateKey", "应用私钥", true), pem("alipayPublicKey", "支付宝公钥", false))),
        definition(DOUYIN, "发送需要已获授权的 Refresh Token，本控制台不发起 OAuth 授权。", List.of(
            field("clientKey", "Client Key", false, true, true, true),
            field("clientSecret", "Client Secret", true, true, true, false),
            field("refreshToken", "Refresh Token", true, false, true, false))),
        definition(XIAOHONGSHU, "填写平台回调加密材料；配置齐全不代表平台授权有效。", List.of(
            field("token", "回调 Token", true, true, false, false),
            field("encodingAesKey", "EncodingAESKey", true, true, false, false),
            field("appId", "App ID", false, true, true, true),
            field("appSecret", "App Secret", true, false, true, false))),
        definition(DINGTALK, "仅支持 HTTP 密文推送，不支持 Stream；Owner Key 是回调身份校验值。", List.of(
            field("token", "回调 Token", true, true, false, false),
            field("encodingAesKey", "EncodingAESKey", true, true, false, false),
            field("ownerKey", "Owner Key", false, true, false, true),
            field("appKey", "App Key", false, false, true, true),
            field("appSecret", "App Secret", true, false, true, false),
            field("agentId", "Agent ID", false, false, true, true))),
        definition(MEITUAN, "仅支持公开 HTTP 入口、端口 80 或 8080；反向代理必须保留实际公网 Host。", List.of(
            field("app_id", "App ID", false, true, true, true),
            field("app_secret", "App Secret", true, true, true, false))),
        definition(WHATSAPP, "回调地址由服务端生成；Verify Token 用于 GET 握手，App Secret 用于 POST 验签。", List.of(
            field("appSecret", "App Secret", true, true, false, false),
            field("verifyToken", "Verify Token", true, true, false, false),
            field("accessToken", "Access Token", true, false, true, false),
            field("phoneNumberId", "Phone Number ID", false, false, true, true))),
        definition(TELEGRAM, "无 GET challenge；Secret Token 校验 Webhook 请求头。仅可轮换同一 Bot ID 的 Bot Token，不能输入 URL。", List.of(
            field("secretToken", "Webhook Secret Token", true, true, false, false),
            field("botToken", "Bot Token", true, false, true, false)))
    );

    public static ConsoleChannelDefinition require(ChannelEnum channel) {
        return ALL.stream().filter(definition -> definition.channel() == channel).findFirst()
            .orElseThrow(() -> new BizException(ApiEnum.DATA_NOT_ALLOW, "当前渠道不支持控制台配置"));
    }

    private static ConsoleChannelDefinition definition(ChannelEnum channel, String note,
                                                       List<ConsoleChannelDefinition.Field> fields) {
        return new ConsoleChannelDefinition(channel, channel.getDisplayName(), true, "", fields, List.of(note,
            "请在渠道官方平台完成应用准备、权限与回调配置。参数齐全不代表已授权、在线或生产可收发。",
            "仅对同一外部账号轮换凭据；更换真实账号请新建记录，无法自动核验不透明授权归属。"));
    }

    private static ConsoleChannelDefinition.Field field(String key, String label, boolean secret, boolean receive,
                                                         boolean send, boolean immutable) {
        return new ConsoleChannelDefinition.Field(key, label, secret, receive, send, immutable,
            secret ? "password" : "text");
    }

    private static ConsoleChannelDefinition.Field pem(String key, String label, boolean secret) {
        return new ConsoleChannelDefinition.Field(key, label, secret, true, true, false, "textarea");
    }
}
