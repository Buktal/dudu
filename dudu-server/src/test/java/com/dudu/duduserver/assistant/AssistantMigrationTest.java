package com.dudu.duduserver.assistant;

import com.dudu.duduserver.testutil.IntegrationTestEnv;
import java.sql.Connection;
import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * 使用独立评审库验证 V9 空库与 V8 升级，不修改开发库。
 */
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
class AssistantMigrationTest {
    @Test
    void freshAndV8UpgradeKeepTranslationConfiguration() throws Exception {
        String configured = IntegrationTestEnv.jdbcUrl();
        String database = IntegrationTestEnv.databaseOf(configured);
        String user = IntegrationTestEnv.dbUser();
        String password = IntegrationTestEnv.dbPassword();
        if (!database.equals("dudu_review_assistant") || !user.equals("dudu_review")) {
            throw new IllegalStateException("仅允许 dudu_review 访问 dudu_review_assistant 系列库");
        }
        try (Connection admin = DriverManager.getConnection(IntegrationTestEnv.withDatabase(configured, ""), user, password)) {
            for (boolean upgrade : new boolean[] {false, true}) {
                String name = database + (upgrade ? "_upgrade" : "");
                String url = IntegrationTestEnv.withDatabase(configured, name);
                try (var statement = admin.createStatement()) {
                    statement.execute("DROP DATABASE IF EXISTS " + name);
                    statement.execute("CREATE DATABASE " + name + " CHARACTER SET utf8mb4");
                    try {
                        if (upgrade) {
                            Flyway.configure().dataSource(url, user, password).target("8").load().migrate();
                            try (Connection old = DriverManager.getConnection(url, user, password); var insert = old.createStatement()) {
                                insert.execute("INSERT INTO translation_setting(company_id,revision,default_service,configuration) VALUES(799001,3,'existing-model','encrypted-preserved')");
                            }
                        }
                        var flyway = Flyway.configure().dataSource(url, user, password).load();
                        assertThat(flyway.migrate().success).isTrue();
                        try (Connection current = DriverManager.getConnection(url, user, password); var check = current.createStatement()) {
                            if (!upgrade) check.execute("INSERT INTO translation_setting(company_id,revision,configuration) VALUES(799001,1,'fresh')");
                            try (var result = check.executeQuery("SELECT assistant_service,default_service,configuration FROM translation_setting WHERE company_id=799001")) {
                                assertThat(result.next()).isTrue();
                                assertThat(result.getString(1)).isNull();
                                if (upgrade) {
                                    assertThat(result.getString(2)).isEqualTo("existing-model");
                                    assertThat(result.getString(3)).isEqualTo("encrypted-preserved");
                                }
                            }
                            check.execute("UPDATE translation_setting SET assistant_service='assistant-model' WHERE company_id=799001");
                            try (var result = check.executeQuery("SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()")) {
                                result.next(); assertThat(result.getInt(1)).isZero();
                            }
                        }
                        assertThat(flyway.migrate().migrationsExecuted).isZero();
                    } finally { statement.execute("DROP DATABASE IF EXISTS " + name); }
                }
            }
        }
    }
}
