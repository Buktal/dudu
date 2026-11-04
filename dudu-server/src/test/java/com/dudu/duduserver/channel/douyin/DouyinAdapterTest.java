package com.dudu.duduserver.channel.douyin;

import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.channel.support.DirectHttpMediaReader;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 抖音适配器回调四态验收（事实见 docs/research/channels/douyin.md §3.1/§4.1）：
 * 缺凭据按不支持、签名不符按拒绝、verify_webhook 握手按数字 challenge 原样回显、
 * im_receive_msg 落统一入站消息、其余事件只应答、无法解析的报文按参数错误；
 * 发送限制随凭据与用户授权如实回答，素材限制随凭据如实回答。
 */
class DouyinAdapterTest {

    private static final long CHANNEL_ID = 9201L;
    private static final String CLIENT_SECRET = "9e096e3a2a8b4e0f9c0f";
    private static final String SIGNATURE_HEADER = "X-Douyin-Signature";

    private final HttpHeaders headers = new HttpHeaders();

    private DouyinAdapter adapter;

    @BeforeEach
    void setUp() {
        // 发送与素材实现不参与回调路径：接口地址指向本机保留端口，误请求会以连接失败暴露
        adapter = new DouyinAdapter(new DouyinProtocol(),
            new DouyinTextSender(RestClient.builder(), "http://127.0.0.1:9", (channelId, userId) -> null),
            new DirectHttpMediaReader(RestClient.builder()),
            new DouyinMediaResourceClient(RestClient.builder(), "http://127.0.0.1:9"));
    }

    @Test
    void channelRegistersDouyin() {
        assertThat(adapter.channel()).isEqualTo(ChannelEnum.DOUYIN);
    }

    @Test
    void receiveWithoutRequiredCredentialsAnswersUnsupported() {
        // 必填键 clientSecret 缺失即凭据未配置，不模拟成功
        CompanyChannelDO incomplete = new CompanyChannelDO();
        incomplete.setCompanyChannelId(CHANNEL_ID);
        incomplete.setChannel(ChannelEnum.DOUYIN);
        incomplete.setChannelInfo(Map.of("clientKey", "asdfavetgbvasf"));
        assertThat(adapter.receive(incomplete, Map.of(), headers, "{}").response().status()).isEqualTo(501);
    }

    @Test
    void signedHandshakeEchoesNumericChallengeVerbatim() {
        String body = "{\"event\":\"verify_webhook\",\"content\":{\"challenge\":123456}}";
        sign(body);

        ChannelCallbackResult response = adapter.receive(account(null), Map.of(), headers, body).response();
        assertThat(response.status()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"challenge\":123456}");
    }

    @Test
    void signatureMismatchIsRejected() {
        String body = "{\"event\":\"verify_webhook\",\"content\":{\"challenge\":123456}}";
        sign(body);
        headers.set(SIGNATURE_HEADER, "0".repeat(40));
        assertThat(adapter.receive(account(null), Map.of(), headers, body).response())
            .isEqualTo(ChannelCallbackResult.rejected());

        // 签名头缺失同样按拒绝处理
        headers.remove(SIGNATURE_HEADER);
        assertThat(adapter.receive(account(null), Map.of(), headers, body).response())
            .isEqualTo(ChannelCallbackResult.rejected());
    }

    @Test
    void imReceiveMessageBecomesInboundAndOtherEventsOnlyAcknowledge() {
        String message = "{\"event\":\"im_receive_msg\",\"from_user_id\":\"visitor-open\","
            + "\"to_user_id\":\"owner-open\",\"client_key\":\"asdfavetgbvasf\",\"log_id\":\"log-1\","
            + "\"content\":{\"message_type\":\"text\",\"text\":\"在吗\","
            + "\"server_message_id\":\"@msg1\",\"conversation_short_id\":\"@conv1\"}}";
        sign(message);

        ChannelReceiveResult result = adapter.receive(account(null), Map.of(), headers, message);
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(result.message()).isNotNull();
        assertThat(result.message().externalUserId()).isEqualTo("visitor-open");
        assertThat(result.message().content()).isEqualTo(Map.of("type", "text", "text", "在吗"));

        // 已读事件只应答，没有可落库的访客消息
        String read = "{\"event\":\"im_message_read\",\"from_user_id\":\"visitor-open\","
            + "\"to_user_id\":\"owner-open\",\"content\":{\"message_id\":\"@msg1\"}}";
        sign(read);
        ChannelReceiveResult acked = adapter.receive(account(null), Map.of(), headers, read);
        assertThat(acked.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(acked.message()).isNull();
    }

    @Test
    void signedMerchantSentMessageBecomesOutgoingInboundLetter() {
        // im_send_msg（授权号发出消息的同步推送）：验签后端到端转为 OUTGOING 信件，
        // 访客身份取 to_user_id（from 是授权号）
        String message = "{\"event\":\"im_send_msg\",\"from_user_id\":\"owner-open\","
            + "\"to_user_id\":\"visitor-open\",\"client_key\":\"asdfavetgbvasf\",\"log_id\":\"log-2\","
            + "\"content\":{\"message_type\":\"text\",\"text\":\"已收到\","
            + "\"server_message_id\":\"@msg2\",\"conversation_short_id\":\"@conv1\"}}";
        sign(message);

        ChannelReceiveResult result = adapter.receive(account(null), Map.of(), headers, message);
        assertThat(result.response()).isEqualTo(ChannelCallbackResult.success());
        assertThat(result.message()).isNotNull();
        assertThat(result.message().externalUserId()).isEqualTo("visitor-open");
        assertThat(result.message().direction()).isEqualTo(MessageDirectionEnum.OUTGOING);
        assertThat(result.message().content()).isEqualTo(Map.of("type", "text", "text", "已收到"));
    }

    @Test
    void leadsComponentMessagesMapCardsConfiguredTitlesAndNoticeExplanation() {
        // v1.0.5 组件消息（事实见 docs/research/channels/douyin.md §2.2/§5.18 官方逐字样本节选）：
        // 组件 id 取 content 顶层 component_id，旧类型无样本字段回退 card_id；
        // product/question_list 解析同名配置串取标题与商品 id；notice 是系统提示，
        // 按 unknown 带渠道原因说明
        String premium = "{\"event\":\"im_receive_msg\",\"from_user_id\":\"visitor-open\","
            + "\"to_user_id\":\"owner-open\",\"client_key\":\"asdfavetgbvasf\",\"log_id\":\"log-3\","
            + "\"content\":{\"message_type\":\"premium_online_appointment_card\","
            + "\"server_message_id\":\"@msg3\",\"conversation_short_id\":\"@conv1\","
            + "\"component_id\":\"7140809997826394892\",\"component_status\":1}}";
        sign(premium);
        var premiumResult = adapter.receive(account(null), Map.of(), headers, premium);
        assertThat(premiumResult.message().content()).isEqualTo(Map.of(
            "type", "card", "kind", "premium_online_appointment_card",
            "externalId", "7140809997826394892"));

        // 无样本三类型（招商加盟卡等）按 kind 映射，缺组件 id 不填假值
        String franchise = "{\"event\":\"im_receive_msg\",\"from_user_id\":\"visitor-open\","
            + "\"to_user_id\":\"owner-open\",\"client_key\":\"asdfavetgbvasf\",\"log_id\":\"log-4\","
            + "\"content\":{\"message_type\":\"investment_franchise_card\","
            + "\"server_message_id\":\"@msg4\",\"conversation_short_id\":\"@conv1\"}}";
        sign(franchise);
        var franchiseResult = adapter.receive(account(null), Map.of(), headers, franchise);
        assertThat(franchiseResult.message().content())
            .isEqualTo(Map.of("type", "card", "kind", "investment_franchise_card"));

        // 团购商品：配置串内 product_name/product_id 映射 title/externalId（样本为数字 id）
        String product = "{\"event\":\"im_receive_msg\",\"from_user_id\":\"visitor-open\","
            + "\"to_user_id\":\"owner-open\",\"client_key\":\"asdfavetgbvasf\",\"log_id\":\"log-5\","
            + "\"content\":{\"message_type\":\"product\",\"server_message_id\":\"@msg5\","
            + "\"conversation_short_id\":\"@conv1\","
            + "\"product\":\"{\\\"product_id\\\":1792588596209674,"
            + "\\\"product_name\\\":\\\"欢聚|清汤1份2人餐\\\"}\"}}";
        sign(product);
        var productResult = adapter.receive(account(null), Map.of(), headers, product);
        assertThat(productResult.message().content()).isEqualTo(Map.of(
            "type", "card", "kind", "product", "title", "欢聚|清汤1份2人餐",
            "externalId", "1792588596209674"));

        // 问题列表：配置串 title 映射卡片标题，questions 选项无契约位不映射
        String questionList = "{\"event\":\"im_receive_msg\",\"from_user_id\":\"visitor-open\","
            + "\"to_user_id\":\"owner-open\",\"client_key\":\"asdfavetgbvasf\",\"log_id\":\"log-6\","
            + "\"content\":{\"message_type\":\"question_list\",\"server_message_id\":\"@msg6\","
            + "\"conversation_short_id\":\"@conv1\","
            + "\"question_list\":\"{\\\"title\\\":\\\"请问您家房子是在【哪个城市】呢？\\\","
            + "\\\"questions\\\":[\\\"北京\\\",\\\"上海\\\"]}\"}}";
        sign(questionList);
        var questionResult = adapter.receive(account(null), Map.of(), headers, questionList);
        assertThat(questionResult.message().content()).isEqualTo(Map.of(
            "type", "card", "kind", "question_list",
            "title", "请问您家房子是在【哪个城市】呢？"));

        // 系统提示：平台消息非访客输入，tips 不映射 text，按 unknown 带原因说明
        String notice = "{\"event\":\"im_receive_msg\",\"from_user_id\":\"visitor-open\","
            + "\"to_user_id\":\"owner-open\",\"client_key\":\"asdfavetgbvasf\",\"log_id\":\"log-7\","
            + "\"content\":{\"message_type\":\"notice\",\"server_message_id\":\"@msg7\","
            + "\"conversation_short_id\":\"@conv1\","
            + "\"notice\":\"{\\\"tips\\\":\\\"回复超时，智能客服介入接待 {{1}}\\\","
            + "\\\"push_detail\\\":\\\"\\\"}\"}}";
        sign(notice);
        var noticeResult = adapter.receive(account(null), Map.of(), headers, notice);
        assertThat(noticeResult.message().content()).containsEntry("type", "unknown")
            .containsEntry("originalType", "notice")
            .containsEntry("explanation", "抖音系统提示类消息（如智能客服介入接待），非访客输入内容");
    }

    @Test
    void signedButUnparsableBodyIsBadRequest() {
        // 签名合法但报文不是合法 JSON → 按参数错误
        sign("not-json");
        assertThat(adapter.receive(account(null), Map.of(), headers, "not-json").response().status()).isEqualTo(400);

        // 解析成功但缺少发送方身份 → 同样按参数错误
        String identityMissing = "{\"event\":\"im_receive_msg\",\"to_user_id\":\"owner-open\","
            + "\"content\":{\"message_type\":\"text\",\"text\":\"在吗\"}}";
        sign(identityMissing);
        assertThat(adapter.receive(account(null), Map.of(), headers, identityMissing).response().status())
            .isEqualTo(400);
    }

    @Test
    void restrictionsReflectConfiguredCredentialsAndAuthorization() {
        // 无 channel_info 的账号缺少必填凭据，如实说明不可发不可读
        CompanyChannelDO incomplete = new CompanyChannelDO();
        incomplete.setChannel(ChannelEnum.DOUYIN);
        assertThat(adapter.sendRestriction(incomplete)).isEqualTo("渠道发送凭据未配置");
        assertThat(adapter.mediaRestriction(incomplete)).isEqualTo("渠道素材凭据未配置");

        // 凭据齐全但未完成用户授权（缺 refreshToken）：发送与素材读取（§8.4 用户授权类
        // 主通道）不可用的原因均如实指向授权缺口
        Map<String, Object> withoutRefresh = new HashMap<>();
        withoutRefresh.put("clientKey", "asdfavetgbvasf");
        withoutRefresh.put("clientSecret", CLIENT_SECRET);
        CompanyChannelDO unauthorized = new CompanyChannelDO();
        unauthorized.setCompanyChannelId(CHANNEL_ID);
        unauthorized.setChannel(ChannelEnum.DOUYIN);
        unauthorized.setChannelInfo(withoutRefresh);
        assertThat(adapter.sendRestriction(unauthorized))
            .isEqualTo("抖音发送未完成用户授权：channel_info 缺少 refreshToken（需运营完成抖音号授权后录入）");
        assertThat(adapter.mediaRestriction(unauthorized))
            .isEqualTo("抖音素材读取未完成用户授权：channel_info 缺少 refreshToken（需运营完成抖音号授权后录入）");

        // 凭据与授权齐全不设限制
        assertThat(adapter.sendRestriction(account("rft.1d1021d2aee3d41fee2d2ad"))).isNull();
        assertThat(adapter.mediaRestriction(account("rft.1d1021d2aee3d41fee2d2ad"))).isNull();
    }

    @Test
    void readMediaRoutesByReferenceShape() {
        // 四段复合标识（user_local 图片/视频）走 GetIMMessageResource 链路：未完成用户
        // 授权时如实带回接口凭据缺口，而非无下载通道说明
        var unauthorized = adapter.readMedia(account(null), "@msg:@conv:owner-open:0");
        assertThat(unauthorized.succeeded()).isFalse();
        assertThat(unauthorized.failureReason()).contains("用户授权").contains("refreshToken");

        // 旧两段派生标识（留存消息无会话上下文）与 @-加密标识：无下载通道说明
        assertThat(adapter.readMedia(account(null), "@msg:0").failureReason())
            .isEqualTo("抖音素材读取失败：该素材无官方下载通道（分享类图片/视频与旧版留存的本地素材标识不支持读取）");
        assertThat(adapter.readMedia(account(null), "@72NwHyW53+MN==").failureReason())
            .isEqualTo("抖音素材读取失败：该素材无官方下载通道（分享类图片/视频与旧版留存的本地素材标识不支持读取）");

        // http(s) 直链仍走直取：不可达地址按调用失败如实记录（区别于无通道说明）
        assertThat(adapter.readMedia(account(null), "http://127.0.0.1:9/emoji.gif").failureReason())
            .startsWith("抖音素材读取失败：");
    }

    // ---- 夹具 ----

    // 凭据齐全账号；refreshToken 为 null 表示未完成用户授权（不写 refreshToken 键）
    private CompanyChannelDO account(String refreshToken) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(CHANNEL_ID);
        account.setChannel(ChannelEnum.DOUYIN);
        Map<String, Object> info = new HashMap<>();
        info.put("clientKey", "asdfavetgbvasf");
        info.put("clientSecret", CLIENT_SECRET);
        if (refreshToken != null) {
            info.put("refreshToken", refreshToken);
        }
        account.setChannelInfo(info);
        return account;
    }

    // 按官方 §4.1 计算签名并写入 X-Douyin-Signature：sha1(client_secret + body) 小写 hex
    private void sign(String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            digest.update(CLIENT_SECRET.getBytes(StandardCharsets.UTF_8));
            digest.update(body.getBytes(StandardCharsets.UTF_8));
            headers.set(SIGNATURE_HEADER, HexFormat.of().formatHex(digest.digest()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
