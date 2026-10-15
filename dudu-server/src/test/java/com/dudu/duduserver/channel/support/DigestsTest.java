package com.dudu.duduserver.channel.support;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验签字符串比对语义验收：渠道摘要统一小写 hex 口径下大小写不敏感、null 与不等值
 * 一律 false；常量时间属性由实现（MessageDigest.isEqual）保证，不在此断言。
 */
class DigestsTest {

    @Test
    void stringEqualsIgnoresHexCaseAndRejectsNullAndMismatch() {
        assertThat(Digests.constantTimeEquals("a1b2c3", "a1b2c3")).isTrue();
        // 渠道推大写 hex 不误拒（各渠道摘要统一小写 hex 口径）
        assertThat(Digests.constantTimeEquals("a1b2c3", "A1B2C3")).isTrue();
        assertThat(Digests.constantTimeEquals("a1b2c3", "a1b2c4")).isFalse();
        assertThat(Digests.constantTimeEquals("a1b2c3", "a1b2")).isFalse();
        assertThat(Digests.constantTimeEquals(null, "a1b2c3")).isFalse();
        assertThat(Digests.constantTimeEquals("a1b2c3", null)).isFalse();
    }
}
