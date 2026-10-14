package com.dudu.duduserver.testutil;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 评审库派生工具的库名解析契约：任意 dudu_review_* 形态的 URL 都能解出库名并派生
 * 同实例独立库（连接参数原样保留），不再硬编码固定库名。
 */
class IntegrationTestEnvTest {

    @Test
    void parsesDatabaseNameFromUrlsWithAndWithoutQueryParameters() {
        assertThat(IntegrationTestEnv.databaseOf(
            "jdbc:mysql://127.0.0.1:3306/dudu_review_fix?sslMode=REQUIRED&characterEncoding=UTF-8"))
            .isEqualTo("dudu_review_fix");
        assertThat(IntegrationTestEnv.databaseOf("jdbc:mysql://127.0.0.1:3306/dudu_review_v3v4"))
            .isEqualTo("dudu_review_v3v4");
    }

    @Test
    void derivesSiblingDatabasePreservingHostAndQueryParameters() {
        String url = "jdbc:mysql://127.0.0.1:3306/dudu_review_fix?sslMode=REQUIRED&characterEncoding=UTF-8";
        assertThat(IntegrationTestEnv.withDatabase(url, IntegrationTestEnv.databaseOf(url) + "_upgrade"))
            .isEqualTo("jdbc:mysql://127.0.0.1:3306/dudu_review_fix_upgrade?sslMode=REQUIRED&characterEncoding=UTF-8");
        assertThat(IntegrationTestEnv.withDatabase("jdbc:mysql://127.0.0.1:3306/dudu_review_fix", "dudu_review_fix_v4v5"))
            .isEqualTo("jdbc:mysql://127.0.0.1:3306/dudu_review_fix_v4v5");
    }
}
