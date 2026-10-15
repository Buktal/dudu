package com.dudu.duduserver;

import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.UserGroupDO;
import com.dudu.duduserver.service.DeskInboundService;
import com.dudu.duduserver.testutil.IntegrationTestEnv;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 入站信件幂等在独立 MySQL 真实事务边界验收：渠道近乎同时重推同一封信（at-least-once）
 * 时双方事务快照都先于对方提交建立，重推判定须靠锁定读看到对方已落库的同标识消息，
 * 两次受理都正常完成、消息恰落一条、计数不重复，而不是各自撞唯一键回滚外泄异常。
 * 通过环境变量显式启用，运行前需重建 dudu_review。
 */
@SpringBootTest(properties = {"dudu.auth.jwt-secret=integration-test-secret"},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeskInboundIntegrationTest extends DeskIntegrationSupport {

    private static final long COMPANY_ID = 798001L;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", IntegrationTestEnv::jdbcUrl);
        registry.add("spring.datasource.username", IntegrationTestEnv::dbUser);
        registry.add("spring.datasource.password", IntegrationTestEnv::dbPassword);
    }

    @Autowired DeskInboundService deskInboundService;

    private long channelWechat;

    @BeforeAll
    void seed() {
        companies.createCompany(company(COMPANY_ID, "inboundowner", "入站幂等验收企业"), 1L);
        UserGroupDO group = group(COMPANY_ID, "入站组");
        channelWechat = channel(COMPANY_ID, group.getGroupId(), ChannelEnum.WECHAT_MP, "公众号",
            Map.of("token", "inbound-token"));
    }

    @Test
    void concurrentRedeliveryOfTheSameMessageIsIdempotent() throws Exception {
        CompanyChannelDO account = channels.getById(channelWechat);
        ChannelInboundMessage push = new ChannelInboundMessage(channelWechat, "inbound-ext-1", null, null,
            List.of(), "dup-msg-1", MessageDirectionEnum.INCOMING, Map.of("type", "text", "text", "并发重推"));

        // 屏障对齐后同时受理，最大化「双方快照先于对方提交建立」的并发窗口
        CyclicBarrier aligned = new CyclicBarrier(2);
        List<Future<Object>> deliveries;
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            deliveries = List.of(
                pool.submit(() -> {
                    aligned.await();
                    deskInboundService.accept(account, push);
                    return null;
                }),
                pool.submit(() -> {
                    aligned.await();
                    deskInboundService.accept(account, push);
                    return null;
                }));
        }
        // 重推的任何一方都不应把数据库异常外泄给渠道
        for (Future<Object> delivery : deliveries) {
            delivery.get();
        }

        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM message WHERE external_message_id = 'dup-msg-1'", Long.class))
            .isEqualTo(1L);
        assertThat(jdbc.queryForObject("""
                SELECT message_count FROM visitor WHERE company_id = ? AND external_user_id = 'inbound-ext-1'
                """, Integer.class, COMPANY_ID))
            .isEqualTo(1);
    }
}
