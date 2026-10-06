package com.dudu.duduserver.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordHasherTest {

    @Test
    void hashProducesRandomSaltedBcryptVerifiableByMatches() {
        String raw = "secret-password";

        String hash = PasswordHasher.hash(raw);

        assertThat(hash).isNotEqualTo(raw).startsWith("$2");
        assertThat(PasswordHasher.matches(raw, hash)).isTrue();
    }

    @Test
    void sameRawPasswordYieldsDifferentHashes() {
        assertThat(PasswordHasher.hash("same-input")).isNotEqualTo(PasswordHasher.hash("same-input"));
    }

    @Test
    void matchesRejectsWrongPassword() {
        String hash = PasswordHasher.hash("correct-horse");

        assertThat(PasswordHasher.matches("wrong-horse", hash)).isFalse();
    }
}
