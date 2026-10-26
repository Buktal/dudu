package com.dudu.duduserver.translation;

import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 用部署密钥派生独立用途的 AES-GCM 密钥，企业 ID 作为认证数据隔离密文。
 */
@Component
public class TranslationCipher {
    private static final int NONCE_SIZE = 12;
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public TranslationCipher(@Value("${dudu.translation.secret:${dudu.auth.jwt-secret}}") String secret) {
        try {
            if (secret.length() < 32) throw new IllegalArgumentException("翻译加密密钥至少 32 字符");
            key = new SecretKeySpec(MessageDigest.getInstance("SHA-256")
                .digest(("dudu.translation.v1:" + secret).getBytes(StandardCharsets.UTF_8)), "AES");
        } catch (java.security.GeneralSecurityException error) {
            throw new IllegalStateException("无法初始化翻译配置加密", error);
        }
    }

    public String encrypt(Long companyId, String plaintext) {
        try {
            byte[] nonce = new byte[NONCE_SIZE];
            random.nextBytes(nonce);
            Cipher cipher = cipher(Cipher.ENCRYPT_MODE, companyId, nonce);
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + encrypted.length)
                .put(nonce).put(encrypted).array());
        } catch (java.security.GeneralSecurityException error) {
            throw new BizException(ApiEnum.DATA_ERROR, "翻译配置加密失败");
        }
    }

    public String decrypt(Long companyId, String encrypted) {
        try {
            ByteBuffer buffer = ByteBuffer.wrap(Base64.getDecoder().decode(encrypted));
            byte[] nonce = new byte[NONCE_SIZE];
            buffer.get(nonce);
            byte[] payload = new byte[buffer.remaining()];
            buffer.get(payload);
            return new String(cipher(Cipher.DECRYPT_MODE, companyId, nonce).doFinal(payload), StandardCharsets.UTF_8);
        } catch (java.security.GeneralSecurityException | IllegalArgumentException | java.nio.BufferUnderflowException error) {
            throw new BizException(ApiEnum.DATA_ERROR, "翻译配置无法解密，请检查部署密钥或重新配置");
        }
    }

    private Cipher cipher(int mode, Long companyId, byte[] nonce) throws java.security.GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, nonce));
        cipher.updateAAD(String.valueOf(companyId).getBytes(StandardCharsets.UTF_8));
        return cipher;
    }
}
