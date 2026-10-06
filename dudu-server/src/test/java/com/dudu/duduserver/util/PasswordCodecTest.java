package com.dudu.duduserver.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordCodecTest {

    @Test
    void hashProducesRandomSaltedBcryptVerifiableByMatches() {
        String raw = "secret-password";

        String hash = PasswordCodec.hash(raw);

        assertThat(hash).isNotEqualTo(raw).startsWith("$2");
        assertThat(PasswordCodec.matches(raw, hash)).isTrue();
    }

    @Test
    void sameRawPasswordYieldsDifferentHashes() {
        assertThat(PasswordCodec.hash("same-input")).isNotEqualTo(PasswordCodec.hash("same-input"));
    }

    @Test
    void matchesRejectsWrongPassword() {
        String hash = PasswordCodec.hash("correct-horse");

        assertThat(PasswordCodec.matches("wrong-horse", hash)).isFalse();
    }
}
