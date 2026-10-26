package com.dudu.duduserver.translation;

import com.dudu.duduserver.testutil.IntegrationTestEnv;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.Connection;
import java.sql.DriverManager;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * 只在显式评审数据源创建并删除独立库，验证空库与 V7 升级，不触开发库。
 */
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
class TranslationMigrationTest {
    @Test
    void freshAndV7DatabaseSupportTranslationWithoutForeignKeys() throws Exception {
        String configured = IntegrationTestEnv.jdbcUrl();
        String database = IntegrationTestEnv.databaseOf(configured);
        if (!database.equals("dudu_review_translation")) throw new IllegalStateException("测试仅使用 dudu_review_translation");
        String user = IntegrationTestEnv.dbUser();
        if (!user.equals("dudu_review")) throw new IllegalStateException("测试仅使用 dudu_review 用户");
        String password = IntegrationTestEnv.dbPassword();
        try (Connection admin = DriverManager.getConnection(IntegrationTestEnv.withDatabase(configured, ""), user, password)) {
            for (boolean upgrade : new boolean[] {false, true}) {
                String name = database + (upgrade ? "_upgrade" : "");
                String url = IntegrationTestEnv.withDatabase(configured, name);
                try (var statement = admin.createStatement()) {
                    statement.execute("DROP DATABASE IF EXISTS " + name);
                    statement.execute("CREATE DATABASE " + name + " CHARACTER SET utf8mb4");
                    try {
                        if (upgrade) {
                            Flyway.configure().dataSource(url, user, password).target("7").load().migrate();
                            try (Connection old = DriverManager.getConnection(url, user, password); var insert = old.createStatement()) {
                                insert.execute("INSERT INTO company(company_id,company_name,create_time,update_time) VALUES(799001,'保留企业',NOW(3),NOW(3))");
                            }
                        }
                        Flyway flyway = Flyway.configure().dataSource(url, user, password).load();
                        assertThat(flyway.migrate().success).isTrue();
                        try (Connection current = DriverManager.getConnection(url, user, password); var check = current.createStatement()) {
                            check.execute("INSERT INTO translation_preference(user_id,company_id) VALUES(10,799001)");
                            try (var result = check.executeQuery("SELECT automatic,target_language FROM translation_preference WHERE user_id=10")) {
                                assertThat(result.next()).isTrue();
                                assertThat(result.getBoolean(1)).isFalse();
                                assertThat(result.getString(2)).isEqualTo("zh");
                            }
                            try (var result = check.executeQuery("SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()")) {
                                result.next(); assertThat(result.getInt(1)).isZero();
                            }
                            if (upgrade) try (var result = check.executeQuery("SELECT company_name FROM company WHERE company_id=799001")) {
                                assertThat(result.next()).isTrue(); assertThat(result.getString(1)).isEqualTo("保留企业");
                            }
                        }
                        assertThat(flyway.migrate().migrationsExecuted).isZero();
                    } finally { statement.execute("DROP DATABASE IF EXISTS " + name); }
                }
            }
        }
    }
}
