package com.dudu.duduserver.testutil;

/**
 * 集成测试环境变量统一入口：DUDU_INTEGRATION_TEST=true 时数据源三件套
 * （DUDU_TEST_JDBC_URL/DUDU_TEST_DB_USER/DUDU_TEST_DB_PASSWORD）缺一不可——取值缺失
 * 或空白即抛出并点名缺失变量，杜绝 Supplier 返回 null 使 Spring 回落 application.yaml
 * 误连开发库；另提供从 JDBC URL 解析库名与派生同实例独立库的工具（评审库名不再硬编码）。
 */
public final class IntegrationTestEnv {

    // 门闩变量与数据源三件套的变量名（异常消息逐字引用）
    public static final String GATE = "DUDU_INTEGRATION_TEST";
    public static final String JDBC_URL = "DUDU_TEST_JDBC_URL";
    public static final String DB_USER = "DUDU_TEST_DB_USER";
    public static final String DB_PASSWORD = "DUDU_TEST_DB_PASSWORD";

    private IntegrationTestEnv() {
    }

    // 数据源三件套取值（方法引用形态供 @DynamicPropertySource 使用）
    public static String jdbcUrl() {
        return required(JDBC_URL);
    }

    public static String dbUser() {
        return required(DB_USER);
    }

    public static String dbPassword() {
        return required(DB_PASSWORD);
    }

    // 缺失或空白即失败：异常消息点名缺失变量并说明回落后果
    public static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("集成测试缺少环境变量 " + name + "：" + GATE + "=true 时 "
                + JDBC_URL + "/" + DB_USER + "/" + DB_PASSWORD + " 缺一不可，缺失会回落 application.yaml 误连开发库");
        }
        return value;
    }

    // JDBC URL 中的库名：主机端口之后、查询参数之前的一段（无参数段时取到串尾）
    public static String databaseOf(String jdbcUrl) {
        int slash = jdbcUrl.lastIndexOf('/');
        int question = jdbcUrl.indexOf('?', slash);
        return question < 0 ? jdbcUrl.substring(slash + 1) : jdbcUrl.substring(slash + 1, question);
    }

    // 把 JDBC URL 的库名替换为指定库，主机端口与查询参数原样保留
    public static String withDatabase(String jdbcUrl, String database) {
        int slash = jdbcUrl.lastIndexOf('/');
        int question = jdbcUrl.indexOf('?', slash);
        return jdbcUrl.substring(0, slash + 1) + database
            + (question < 0 ? "" : jdbcUrl.substring(question));
    }
}
