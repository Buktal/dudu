package com.dudu.duduserver;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * V4 三表与 V5 渠道码值迁移的独立 MySQL 验收：空库（或已迁移库）上全程执行后的结构契约、
 * V3 状态库升级后旧数据保留与三表可用、V4 状态库存量 wechat 行改写为 wechat-mp；
 * 通过环境变量显式启用，不使用开发库。空库路径由运行前重建 dudu_review 保证；本类同时可独立运行。
 */
@EnabledIfEnvironmentVariable(named = "DUDU_INTEGRATION_TEST", matches = "true")
class DeskMigrationIntegrationTest {

    private static final String VARCHAR_EXTERNAL_BIN = "utf8mb4_0900_bin";

    @Test
    void migratingCurrentDatabaseCreatesThreeVisitorTablesWithContractShape() {
        JdbcTemplate jdbc = current();
        MigrateResult result = flyway(url()).migrate();
        assertThat(result.success).isTrue();

        assertThat(tableNames(jdbc)).contains("visitor", "visitor_profile", "message");
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '4' AND success = 1", Long.class))
            .isEqualTo(1);
        // V1→V5 全程跑通：渠道码值迁移记录成功
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '5' AND success = 1", Long.class))
            .isEqualTo(1);

        // 外部标识保留大小写：二进制排序规则
        assertThat(collationOf(jdbc, "visitor", "external_user_id")).isEqualTo(VARCHAR_EXTERNAL_BIN);
        assertThat(collationOf(jdbc, "message", "external_message_id")).isEqualTo(VARCHAR_EXTERNAL_BIN);
        assertThat(collationOf(jdbc, "visitor", "name")).isEqualTo("utf8mb4_0900_ai_ci");
        // 毫秒精度 DATETIME(3)
        assertThat(columnTypeOf(jdbc, "visitor", "last_message_time")).isEqualTo("datetime(3)");
        assertThat(columnTypeOf(jdbc, "message", "create_time")).isEqualTo("datetime(3)");
        assertThat(columnTypeOf(jdbc, "visitor", "message_count")).isEqualTo("int unsigned");
        // 三表契约索引
        assertThat(indexNames(jdbc, "visitor")).contains("uk_visitor_source", "idx_visitor_account_status");
        assertThat(indexNames(jdbc, "visitor_profile")).containsExactly("PRIMARY");
        assertThat(indexNames(jdbc, "message")).contains("uk_message_sequence");
        // 不设外键的约定在 V4 之后仍成立
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE()", Long.class))
            .isZero();
    }

    @Test
    void v3DatabaseUpgradesToLatestPreservingExistingRowsAndServesNewTables() {
        String adminUrl = url();
        JdbcTemplate admin = new JdbcTemplate(new DriverManagerDataSource(adminUrl, "root", password()));
        admin.execute("DROP DATABASE IF EXISTS dudu_review_v3v4");
        admin.execute("CREATE DATABASE dudu_review_v3v4 CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
        String url = adminUrl.replace("/dudu_review?", "/dudu_review_v3v4?");
        Flyway.configure().dataSource(url, "root", password()).target("3").load().migrate();
        JdbcTemplate old = new JdbcTemplate(new DriverManagerDataSource(url, "root", password()));

        // V3 状态的基线数据：企业、初始管理员、组、成员关系与渠道账号
        old.update("INSERT INTO company(company_id, company_name, create_time, update_time)"
            + " VALUES(784501, '升级企业', NOW(3), NOW(3))");
        old.update("INSERT INTO user(user_id, company_id, username, name, password_hash, role, status, create_time, update_time)"
            + " VALUES(78451, 784501, 'old-admin', '旧管理员', 'unused-hash', 'console', 1, NOW(3), NOW(3))");
        old.update("UPDATE company SET init_user_id = 78451 WHERE company_id = 784501");
        old.update("INSERT INTO user_group(group_id, company_id, group_name, create_time, update_time)"
            + " VALUES(78452, 784501, '旧组', NOW(3), NOW(3))");
        old.update("INSERT INTO user_group_member(member_id, company_id, user_id, group_id)"
            + " VALUES(78453, 784501, 78451, 78452)");
        old.update("INSERT INTO company_channel(company_channel_id, company_id, group_id, channel, account_name,"
            + " create_time, update_time) VALUES(78454, 784501, 78452, 'wechat', '旧账号', NOW(3), NOW(3))");

        MigrateResult upgraded = Flyway.configure().dataSource(url, "root", password()).load().migrate();

        // 执行 V4 与 V5 两个迁移，既有 Admin 基线数据保留且重启可读
        assertThat(upgraded.migrationsExecuted).isEqualTo(2);
        assertThat(old.queryForObject("SELECT company_name FROM company WHERE company_id = 784501", String.class))
            .isEqualTo("升级企业");
        assertThat(old.queryForObject("SELECT username FROM user WHERE user_id = 78451", String.class))
            .isEqualTo("old-admin");
        assertThat(old.queryForObject("SELECT group_name FROM user_group WHERE group_id = 78452", String.class))
            .isEqualTo("旧组");
        assertThat(old.queryForObject("SELECT account_name FROM company_channel WHERE company_channel_id = 78454", String.class))
            .isEqualTo("旧账号");
        // 存量 wechat 行随 V5 升级改写为 wechat-mp
        assertThat(old.queryForObject("SELECT channel FROM company_channel WHERE company_channel_id = 78454", String.class))
            .isEqualTo("wechat-mp");

        // 三表出现后可写入并读回访客、名片与消息（含会话内 sequence 唯一键）
        old.update("INSERT INTO visitor(visitor_id, company_id, company_channel_id, external_user_id, name, status,"
            + " last_message_preview, message_count, version, create_time, update_time)"
            + " VALUES(78455, 784501, 78454, 'ext-Upgrade', '升级访客', 'needs-reply', '升级后摘要', 1, 1, NOW(3), NOW(3))");
        old.update("INSERT INTO visitor_profile(visitor_id, channel_fields, tags, note, create_time, update_time)"
            + " VALUES(78455, JSON_ARRAY(), JSON_ARRAY('旧客'), '', NOW(3), NOW(3))");
        old.update("INSERT INTO message(visitor_id, sequence, direction, content, create_time, update_time)"
            + " VALUES(78455, 1, 'incoming', JSON_OBJECT('type', 'text', 'text', '升级后消息'), NOW(3), NOW(3))");
        assertThat(old.queryForObject("SELECT external_user_id FROM visitor WHERE visitor_id = 78455", String.class))
            .isEqualTo("ext-Upgrade");
        assertThat(old.queryForObject("SELECT JSON_UNQUOTE(JSON_EXTRACT(tags, '$[0]')) FROM visitor_profile WHERE visitor_id = 78455", String.class))
            .isEqualTo("旧客");
        assertThat(old.queryForObject("SELECT COUNT(*) FROM message WHERE visitor_id = 78455 AND sequence = 1", Long.class))
            .isEqualTo(1);

        // 已是最新版本时重复迁移不再执行
        assertThat(Flyway.configure().dataSource(url, "root", password()).load().migrate().migrationsExecuted).isZero();
    }

    @Test
    void v4DatabaseUpgradesToV5RenamingWechatRowsAndLeavingOtherChannelsUntouched() {
        String adminUrl = url();
        JdbcTemplate admin = new JdbcTemplate(new DriverManagerDataSource(adminUrl, "root", password()));
        admin.execute("DROP DATABASE IF EXISTS dudu_review_v4v5");
        admin.execute("CREATE DATABASE dudu_review_v4v5 CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
        String url = adminUrl.replace("/dudu_review?", "/dudu_review_v4v5?");
        Flyway.configure().dataSource(url, "root", password()).target("4").load().migrate();
        JdbcTemplate v4 = new JdbcTemplate(new DriverManagerDataSource(url, "root", password()));

        // V4 状态的存量账号：旧码值 wechat、已是新码值的 wechat-mp 与无关渠道各一行
        v4.update("INSERT INTO company_channel(company_channel_id, company_id, group_id, channel, account_name,"
            + " create_time, update_time) VALUES(78561, 78560, 78562, 'wechat', '旧码值公众号', NOW(3), NOW(3))");
        v4.update("INSERT INTO company_channel(company_channel_id, company_id, group_id, channel, account_name,"
            + " create_time, update_time) VALUES(78563, 78560, 78562, 'wechat-mp', '新码值公众号', NOW(3), NOW(3))");
        v4.update("INSERT INTO company_channel(company_channel_id, company_id, group_id, channel, account_name,"
            + " create_time, update_time) VALUES(78564, 78560, 78562, 'douyin', '抖音号', NOW(3), NOW(3))");

        MigrateResult upgraded = Flyway.configure().dataSource(url, "root", password()).load().migrate();

        // 只执行 V5：旧码值改写为新码值，其余渠道不动
        assertThat(upgraded.migrationsExecuted).isEqualTo(1);
        assertThat(v4.queryForObject("SELECT channel FROM company_channel WHERE company_channel_id = 78561", String.class))
            .isEqualTo("wechat-mp");
        assertThat(v4.queryForObject("SELECT channel FROM company_channel WHERE company_channel_id = 78563", String.class))
            .isEqualTo("wechat-mp");
        assertThat(v4.queryForObject("SELECT channel FROM company_channel WHERE company_channel_id = 78564", String.class))
            .isEqualTo("douyin");
        // 重复执行不再改写
        assertThat(Flyway.configure().dataSource(url, "root", password()).load().migrate().migrationsExecuted).isZero();
    }

    private JdbcTemplate current() {
        return new JdbcTemplate(new DriverManagerDataSource(url(), "root", password()));
    }

    private Flyway flyway(String url) {
        return Flyway.configure().dataSource(url, "root", password()).load();
    }

    private static String url() {
        return System.getenv("DUDU_TEST_JDBC_URL");
    }

    private static String password() {
        return System.getenv("DUDU_TEST_DB_PASSWORD");
    }

    private List<String> tableNames(JdbcTemplate jdbc) {
        return jdbc.queryForList(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()", String.class);
    }

    private String collationOf(JdbcTemplate jdbc, String table, String column) {
        return jdbc.queryForObject("SELECT collation_name FROM information_schema.columns"
            + " WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?", String.class, table, column);
    }

    private String columnTypeOf(JdbcTemplate jdbc, String table, String column) {
        return jdbc.queryForObject("SELECT column_type FROM information_schema.columns"
            + " WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?", String.class, table, column);
    }

    private List<String> indexNames(JdbcTemplate jdbc, String table) {
        return jdbc.queryForList("SELECT DISTINCT index_name FROM information_schema.statistics"
                + " WHERE table_schema = DATABASE() AND table_name = ?", String.class, table)
            .stream().sorted().toList();
    }
}
