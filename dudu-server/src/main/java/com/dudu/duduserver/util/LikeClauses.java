package com.dudu.duduserver.util;

/**
 * LIKE 字面匹配单点：搜索词的通配符转义与显式 ESCAPE 子句。调用侧以 {0} 占位符绑定
 * {@link #pattern(String)} 产物并追加 {@link #ESCAPE}（MP Lambda 的 like 无法表达
 * ESCAPE，统一走受支持的 apply 片段）；显式转义字符 ! 不随连接默认转义字符、sql_mode
 * 变化，% 与 _ 按字面匹配。
 */
public final class LikeClauses {

    // 转义子句：字面匹配语义固定，不随连接的默认转义字符、sql_mode 变化
    public static final String ESCAPE = " ESCAPE '!'";

    private LikeClauses() {
    }

    // 通配符转义后的包含匹配模式：%term%（term 内的 ! % _ 均为字面量）
    public static String pattern(String term) {
        return "%" + escape(term) + "%";
    }

    // 通配符转义：! 自身先转义（后两步替换会引入 !），% 与 _ 变为字面量；与 SQL 中显式
    // ESCAPE '!' 及 JSON_SEARCH 的 escape_char 一致
    public static String escape(String term) {
        return term.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }
}
