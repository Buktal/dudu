package com.dudu.duduserver.testutil;

import com.dudu.duduserver.config.AdminInitializer;
import com.dudu.duduserver.service.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

/**
 * 无数据库环境下的上下文测试基类：排除 JDBC 自动装配，领域服务与管理员初始化器用 Mockito 替身。
 * MP 3.5.17 的 ServiceImpl 链式 API（lambdaQuery/lambdaUpdate）要求真 MapperProxy，
 * Mockito 替身的 Mapper 无法支撑，故在领域服务边界切分；SQL 真实行为由本地 MySQL 验收覆盖。
 */
@SpringBootTest(properties = {
    "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration",
    "dudu.auth.jwt-secret=test-secret"
})
@Import(NoDatasourceSpringTest.TxConfig.class)
public abstract class NoDatasourceSpringTest {

    @MockitoBean
    protected UserGroupMemberService userGroupMemberService;

    @MockitoBean
    protected UserService userService;

    @MockitoBean
    protected CompanyService companyService;

    @MockitoBean
    protected OperationLogService operationLogService;

    @MockitoBean
    protected UserGroupService userGroupService;

    @MockitoBean
    protected CompanyChannelService companyChannelService;

    @MockitoBean
    protected OverviewService overviewService;

    @MockitoBean
    protected DeskAuthService deskAuthService;

    @MockitoBean
    protected DeskAccessService deskAccessService;

    @MockitoBean
    protected DeskVisitorService deskVisitorService;

    @MockitoBean
    protected VisitorService visitorService;

    @MockitoBean
    protected MessageService messageService;

    @MockitoBean
    protected VisitorProfileService visitorProfileService;

    @MockitoBean
    protected ChannelCallbackService channelCallbackService;

    @MockitoBean
    protected DeskInboundService deskInboundService;

    // 上下文启动即执行的 ApplicationRunner，替身避免初始化流程触库
    @MockitoBean
    protected AdminInitializer platformAdminInitializer;

    @TestConfiguration(proxyBeanMethods = false)
    static class TxConfig {

        // 无 DataSource 时补空转事务管理器，仅为装配通过；事务语义由真实库验收覆盖
        @Bean
        PlatformTransactionManager transactionManager() {
            return new PlatformTransactionManager() {
                @Override
                public TransactionStatus getTransaction(TransactionDefinition definition) {
                    return new SimpleTransactionStatus();
                }

                @Override
                public void commit(TransactionStatus status) {
                }

                @Override
                public void rollback(TransactionStatus status) {
                }
            };
        }
    }
}
