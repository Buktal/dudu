package com.dudu.duduserver.util;

import cn.hutool.crypto.digest.BCrypt;

/**
 * 密码哈希编解码工具：复用 Hutool BCrypt，不新增依赖；
 * 哈希仅后端持有，不进入响应或操作记录。
 */
public final class PasswordHasher {

    private PasswordHasher() {
    }

    // 登录路径用户名不存在时的等代价比对目标：失败耗时不携带用户名存在性信号
    private static final String DUMMY_HASH = BCrypt.hashpw("dudu-login-timing-equalizer");

    // 对明文密码生成 BCrypt 哈希（随机盐）
    public static String hash(String rawPassword) {
        return BCrypt.hashpw(rawPassword);
    }

    // 校验明文密码与哈希是否匹配
    public static boolean matches(String rawPassword, String passwordHash) {
        return BCrypt.checkpw(rawPassword, passwordHash);
    }

    // 登录比对单点：存储哈希缺失（用户名不存在）时对固定哈希做等代价比对，
    // 结果恒为 false；调用方据返回值与用户存在性一并给出同一失败
    public static boolean loginMatches(String rawPassword, String storedHash) {
        return matches(rawPassword, storedHash == null ? DUMMY_HASH : storedHash);
    }
}
