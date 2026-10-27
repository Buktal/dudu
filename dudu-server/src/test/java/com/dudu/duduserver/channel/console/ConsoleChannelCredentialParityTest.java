package com.dudu.duduserver.channel.console;

import com.dudu.duduserver.channel.ChannelAdapter;
import com.dudu.duduserver.channel.alipay.AlipayAdapter;
import com.dudu.duduserver.channel.alipay.AlipayProtocol;
import com.dudu.duduserver.channel.dingtalk.DingtalkAdapter;
import com.dudu.duduserver.channel.dingtalk.DingtalkMediaReader;
import com.dudu.duduserver.channel.dingtalk.DingtalkProtocol;
import com.dudu.duduserver.channel.dingtalk.DingtalkTextSender;
import com.dudu.duduserver.channel.douyin.DouyinAdapter;
import com.dudu.duduserver.channel.douyin.DouyinProtocol;
import com.dudu.duduserver.channel.feishu.FeishuAdapter;
import com.dudu.duduserver.channel.feishu.FeishuProtocol;
import com.dudu.duduserver.channel.meituan.MeituanAdapter;
import com.dudu.duduserver.channel.meituan.MeituanProtocol;
import com.dudu.duduserver.channel.qq.QqAdapter;
import com.dudu.duduserver.channel.qq.QqProtocol;
import com.dudu.duduserver.channel.telegram.TelegramAdapter;
import com.dudu.duduserver.channel.telegram.TelegramProtocol;
import com.dudu.duduserver.channel.wechatmini.WechatMiniAdapter;
import com.dudu.duduserver.channel.wechatmini.WechatMiniCrypto;
import com.dudu.duduserver.channel.wechatmini.WechatMiniProtocol;
import com.dudu.duduserver.channel.wechatmp.WechatMpAdapter;
import com.dudu.duduserver.channel.wechatmp.WechatMpProtocol;
import com.dudu.duduserver.channel.wecom.WecomAdapter;
import com.dudu.duduserver.channel.wecom.WecomProtocol;
import com.dudu.duduserver.channel.weibo.WeiboAdapter;
import com.dudu.duduserver.channel.weibo.WeiboProtocol;
import com.dudu.duduserver.channel.whatsapp.WhatsappAdapter;
import com.dudu.duduserver.channel.whatsapp.WhatsappProtocol;
import com.dudu.duduserver.channel.xiaohongshu.XiaohongshuAdapter;
import com.dudu.duduserver.channel.xiaohongshu.XiaohongshuCrypto;
import com.dudu.duduserver.channel.xiaohongshu.XiaohongshuProtocol;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpHeaders;

import java.lang.reflect.Constructor;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Console 配置定义与渠道凭据的对拍验收：ConsoleChannelDefinitions 的
 * requiredForReceive/requiredForSend 与各渠道适配器实际凭据门（receive 的凭据缺失
 * 不支持应答、sendRestriction/mediaRestriction 的限制说明）必须同判——Console 判为
 * 必需的字段缺失时适配器同样拒绝，字段齐全时两侧都判可收可发。两侧真相源以渠道
 * Credentials 为协议知识基准（ADR-0014），出现分歧时对齐 Console 侧定义。
 */
class ConsoleChannelCredentialParityTest {

    private static final String CALLBACK_URL = "https://public.example/api/channels/1/callback";

    // 验签基准 URL 的显示形态只影响 describe 的回显，不影响本对拍的门判定
    private final ConsoleChannelConfiguration configuration = new ConsoleChannelConfiguration();

    private final Map<ChannelEnum, ChannelAdapter> adapters = adapters();

    static Stream<ChannelEnum> channels() {
        return ConsoleChannelDefinitions.ALL.stream().map(ConsoleChannelDefinition::channel);
    }

    static Stream<Arguments> receiveRequiredFields() {
        return requiredFields(ConsoleChannelDefinition.Field::requiredForReceive);
    }

    static Stream<Arguments> sendRequiredFields() {
        return requiredFields(ConsoleChannelDefinition.Field::requiredForSend);
    }

    @ParameterizedTest
    @MethodSource("channels")
    void completeFieldsAreJudgedConfigurableByBothSides(ChannelEnum channel) {
        Map<String, Object> full = fullInfo(channel);
        ChannelAdapter adapter = adapters.get(channel);
        CompanyChannelDO account = account(channel, full);

        assertThat(configuration.describe(channel, full).receiveConfigured()).isTrue();
        assertThat(configuration.describe(channel, full).sendConfigured()).isTrue();
        // 适配器侧收信门通过（进入验签阶段按假报文拒绝，而非凭据缺失的不支持）
        assertThat(adapter.receive(account, Map.of(), headersWithHost(), "").response().status())
            .isNotEqualTo(501);
        assertThat(adapter.sendRestriction(account)).isNull();
        assertThat(adapter.mediaRestriction(account)).isNull();
    }

    @ParameterizedTest
    @MethodSource("receiveRequiredFields")
    void missingReceiveRequiredFieldIsRejectedByConsoleAndAdapter(ChannelEnum channel, String fieldKey) {
        Map<String, Object> missing = without(fullInfo(channel), channel, fieldKey);

        assertThat(configuration.describe(channel, missing).receiveConfigured()).isFalse();
        // 凭据缺失的收信一律按不支持应答（各适配器 receive 的统一门语义）
        assertThat(adapters.get(channel).receive(account(channel, missing), Map.of(), headersWithHost(), "")
            .response().status()).isEqualTo(501);
    }

    @ParameterizedTest
    @MethodSource("sendRequiredFields")
    void missingSendRequiredFieldIsRejectedByConsoleAndAdapter(ChannelEnum channel, String fieldKey) {
        Map<String, Object> missing = without(fullInfo(channel), channel, fieldKey);

        assertThat(configuration.describe(channel, missing).sendConfigured()).isFalse();
        // 发送与素材读取同一凭据门：restriction 路径如实拒绝，不发起渠道请求
        assertThat(adapters.get(channel).sendRestriction(account(channel, missing))).isNotNull();
    }

    // ---- 夹具 ----

    static Stream<Arguments> requiredFields(Function<ConsoleChannelDefinition.Field, Boolean> required) {
        return ConsoleChannelDefinitions.ALL.stream()
            .flatMap(definition -> definition.fields().stream()
                .filter(field -> required.apply(field))
                .map(field -> Arguments.of(definition.channel(), field.key())));
    }

    // 全字段齐全的 channel_info：经 Console merge 写入路径生成（telegram 落 url/botId、
    // wecom/dingtalk 补 system、whatsapp 补回调 url），与真实保存形态一致
    private Map<String, Object> fullInfo(ChannelEnum channel) {
        ConsoleChannelDefinition definition = ConsoleChannelDefinitions.require(channel);
        Map<String, Object> set = new LinkedHashMap<>();
        for (ConsoleChannelDefinition.Field field : definition.fields()) {
            set.put(field.key(), fieldValue(field));
        }
        return configuration.merge(channel, Map.of(), set, List.of(), CALLBACK_URL);
    }

    // 字段值给出可读假值；telegram botToken 须满足官方 Bot Token 形态，PEM 控件按块形态
    private String fieldValue(ConsoleChannelDefinition.Field field) {
        if ("textarea".equals(field.control())) {
            return "-----BEGIN PRIVATE KEY-----\nvalue\n-----END PRIVATE KEY-----";
        }
        if ("botToken".equals(field.key())) {
            return "123:abc_DEF";
        }
        return field.key() + "-value";
    }

    // Console 字段键到 channel_info 键：telegram 的 botToken 以 url 形态落库（merge 写入），
    // 与 describe 的读取映射一致
    private Map<String, Object> without(Map<String, Object> info, ChannelEnum channel, String fieldKey) {
        Map<String, Object> missing = new LinkedHashMap<>(info);
        missing.remove("botToken".equals(fieldKey) && channel == ChannelEnum.TELEGRAM ? "url" : fieldKey);
        return missing;
    }

    private CompanyChannelDO account(ChannelEnum channel, Map<String, Object> info) {
        CompanyChannelDO account = new CompanyChannelDO();
        account.setCompanyChannelId(1L);
        account.setCompanyId(1L);
        account.setChannel(channel);
        account.setAccountName(channel.getDisplayName());
        account.setChannelInfo(info);
        return account;
    }

    private static HttpHeaders headersWithHost() {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.HOST, "callback.dudu.local");
        return headers;
    }

    // 各适配器只取收信门与限制说明路径，发送器与素材读取器不参与（receive/restriction 不触达）
    private static Map<ChannelEnum, ChannelAdapter> adapters() {
        List<ChannelAdapter> all = List.of(
            new WechatMpAdapter(new WechatMpProtocol(), null, null),
            new WechatMiniAdapter(new WechatMiniProtocol(), new WechatMiniCrypto(), null, null),
            new WecomAdapter(new WecomProtocol(), null, null),
            new QqAdapter(new QqProtocol(), null, null),
            new WeiboAdapter(new WeiboProtocol(), null, null),
            new FeishuAdapter(new FeishuProtocol(), null, null),
            new AlipayAdapter(new AlipayProtocol(), null, null),
            new DouyinAdapter(new DouyinProtocol(), null, null),
            new XiaohongshuAdapter(new XiaohongshuProtocol(), new XiaohongshuCrypto(), null, null),
            dingtalkAdapter(),
            new MeituanAdapter(new MeituanProtocol(), null, null, ""),
            new WhatsappAdapter(new WhatsappProtocol(), null, null),
            new TelegramAdapter(new TelegramProtocol(), null, null));
        return all.stream().collect(Collectors.toMap(ChannelAdapter::channel, Function.identity()));
    }

    // DingtalkAdapter 构造器为包内可见（其余适配器均 public）：对拍测试跨渠道装配，
    // 经反射走同一构造路径，不为测试放宽主代码可见性
    private static ChannelAdapter dingtalkAdapter() {
        try {
            Constructor<DingtalkAdapter> constructor = DingtalkAdapter.class.getDeclaredConstructor(
                DingtalkProtocol.class, DingtalkTextSender.class, DingtalkMediaReader.class);
            constructor.setAccessible(true);
            return constructor.newInstance(new DingtalkProtocol(), null, null);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("DingtalkAdapter 构造失败", e);
        }
    }
}
