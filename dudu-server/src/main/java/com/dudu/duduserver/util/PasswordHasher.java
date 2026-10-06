package com.dudu.duduserver.util;

import cn.hutool.crypto.digest.BCrypt;

/**
 * 密码哈希编解码工具：复用 Hutool BCrypt，不新增依赖；
 * 哈希仅后端持有，不进入响应或操作记录。
 */
public final class PasswordHasher {

    private PasswordHasher() {
    }

    // 对明文密码生成 BCrypt 哈希（随机盐）
    public static String hash(String rawPassword) {
        return BCrypt.hashpw(rawPassword);
    }

    // 校验明文密码与哈希是否匹配
    public static boolean matches(String rawPassword, String passwordHash) {
        return BCrypt.checkpw(rawPassword, passwordHash);
    }
}
