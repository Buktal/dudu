package com.dudu.duduserver.channel.dingtalk;

import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 钉钉加解密原语官方向量验收：事实库 §4.1 加密例（黄金向量 A）与 §5.10 FAQ 调试向量
 * （黄金向量 B）逐字，验签、密文解密、明文回填加密与错误形态拒绝；期望值全部取官方
 * 原文或字节长度边界，不按实现重算。
 */
class DingtalkCryptoTest {

    // 黄金向量 A（官方加解密示例逐字）：明文 pad 值 22 > 16，证明 32 字节块 PKCS#7
    private static final String TOKEN_A = "123456";
    private static final String TIMESTAMP_A = "1445827045067";
    private static final String NONCE_A = "nEXhMP4r";
    private static final String SIGNATURE_A = "5a65ceeef9aab2d149439f82dc191dd6c5cbe2c0";
    private static final String AES_KEY_A = "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij";
    private static final String OWNER_A = "suite4xxxxxxxxxxxxxxx";
    private static final String ENCRYPT_A = "1a3NBxmCFwkCJvfoQ7WhJHB+iX3qHPsc9JbaDznE1i03peOk1LaOQoRz3+nlyGNhwmwJ3vDMG"
        + "+OzrHMeiZI7gTRWVdUBmfxjZ8Ej23JVYa9VrYeJ5as7XM/ZpulX8NEQis44w53h1qAgnC3PRzM7Zc/D6Ibr0rgUathB6"
        + "zRHP8PYrfgnNOS9PhSBdHlegK+AGGanfwjXuQ9+0pZcy0w9lQ==";
    private static final String PLAINTEXT_A =
        "{\"EventType\":\"check_create_suite_url\",\"Random\":\"LPIdSnlF\",\"TestSuiteKey\":\"suite4xxxxxxxxxxxxxxx\"}";

    @Test
    void verifyMatchesOfficialSignatureVector() {
        // 官方签名例：sha1(字典序排序(token,timestamp,nonce,encrypt))，任一参数被篡改即失败
        assertThat(DingtalkCrypto.buildSignature(TOKEN_A, TIMESTAMP_A, NONCE_A, ENCRYPT_A))
            .isEqualTo(SIGNATURE_A);
        assertThat(DingtalkCrypto.verify(SIGNATURE_A, TOKEN_A, TIMESTAMP_A, NONCE_A, ENCRYPT_A)).isTrue();
        assertThat(DingtalkCrypto.verify(SIGNATURE_A, TOKEN_A, TIMESTAMP_A, NONCE_A, ENCRYPT_A + "x")).isFalse();
        assertThat(DingtalkCrypto.verify("5a65ceeef9aab2d149439f82dc191dd6c5cbe2c1", TOKEN_A, TIMESTAMP_A,
            NONCE_A, ENCRYPT_A)).isFalse();
    }

    @Test
    void decryptsOfficialVectorWithOwnerKey() {
        DingtalkCrypto.PlainMessage plain = DingtalkCrypto.decrypt(ENCRYPT_A, AES_KEY_A, OWNER_A);

        assertThat(plain.message()).isEqualTo(PLAINTEXT_A);
        assertThat(plain.ownerKey()).isEqualTo(OWNER_A);
    }

    @Test
    void decryptsFaqVectorToSuccess() {
        // 黄金向量 B（help.dingtalk.io FAQ 调试例逐字）：明文 success
        assertThat(DingtalkCrypto.decrypt(
            "YvkvaGe4hQxd3VxRmEty0dVlnCOAqwf56xwTRHDHoOURqhalbmBJQk5FNcRk42Gl5T0YQXZNwpwWSm1xAFJ5ZA==",
            "1234567890123456789012345678901234567890123", "dingsnotzck6pm5veliw").message())
            .isEqualTo("success");
    }

    @Test
    void roundtripsPlaintextAcrossPkcs7BlockBoundaries() {
        // 32 字节块边界回填：0/1/15/16/17/31/32/33 字节明文与向量 A 明文逐字节还原
        String owner = "ding0000000000000001";
        for (int length : new int[]{0, 1, 15, 16, 17, 31, 32, 33}) {
            String plaintext = "x".repeat(length);
            String encrypt = DingtalkCrypto.encrypt(plaintext, AES_KEY_A, owner);
            DingtalkCrypto.PlainMessage plain = DingtalkCrypto.decrypt(encrypt, AES_KEY_A, owner);
            assertThat(plain.message()).as("长度 %d 回填", length).isEqualTo(plaintext);
            assertThat(plain.ownerKey()).isEqualTo(owner);
        }
        assertThat(DingtalkCrypto.decrypt(
            DingtalkCrypto.encrypt(PLAINTEXT_A, AES_KEY_A, OWNER_A), AES_KEY_A, OWNER_A).message())
            .isEqualTo(PLAINTEXT_A);
    }

    @Test
    void rejectsWrongShapeKeysAndMalformedCiphertext() {
        // 密钥形态错误（42/44 位、非 Base64 残位）与密文损坏均不得给出明文
        assertThatThrownBy(() -> DingtalkCrypto.decrypt(ENCRYPT_A, AES_KEY_A.substring(1), OWNER_A))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("43 位");
        assertThatThrownBy(() -> DingtalkCrypto.decrypt(ENCRYPT_A, AES_KEY_A + "=", OWNER_A))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DingtalkCrypto.decrypt("not-base64!!", AES_KEY_A, OWNER_A))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DingtalkCrypto.decrypt(
            Base64.getEncoder().encodeToString(new byte[8]), AES_KEY_A, OWNER_A))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsOwnerKeyMismatch() {
        // 包尾 ownerKey 与期望不一致：ReceiveId 校验错误
        assertThatThrownBy(() -> DingtalkCrypto.decrypt(ENCRYPT_A, AES_KEY_A, "suite4yyyyyyyyyyyyyyy"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("ReceiveId");
    }
}
