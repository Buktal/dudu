package com.dudu.duduserver.channel.alipay;

import com.dudu.duduserver.channel.support.Texts;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

/**
 * 支付宝 RSA2 签名与验签（事实见 docs/research/channels/alipay.md §3.2、§4.1、§4.3）：
 * RSA2 = SHA256WithRSA（2048 位），sign 为 Base64。回调验签按官方口径用支付宝平台公钥
 * （§4.3 第 4 步、§3.2 rsaCheckV2 逐字），双口径——生活号口径待验签串**保留 sign_type**
 * （仅剔除 sign；官方示例工程 rsaCheckV2 实证，§4.3 生活号例外），通用口径剔除 sign 与
 * sign_type（rsaCheckV1，支付类通知与 mock-pulse 探测语义）；两条均为官方 02mse7 载明
 * 规则，任一通过即认定来自持密方。请求加签与握手回包签名用应用私钥，按官方规则剔除
 * sign 与空值参数（sign_type 参与）。§4.3 的 url_decode 在参数收集处完成（Servlet 表单
 * 解析已解码），本类不再二次解码。GBK 注意：待签串按 UTF-8 字节签名，官方网关实测
 * GBK——ASCII 参数两种编码字节一致，中文内容参数的真实环境行为见事实库 GBK 落地注意。
 * PKCS#1 私钥格式 JDK 不能直读（密钥工具 Java 版产出 PKCS#8），按无法解析如实失败；
 * 握手回包的开发者公钥由私钥推导（CRT 私钥自带模数与公钥指数；非 CRT 私钥按 RSA 应用
 * 实践取 65537）。
 */
final class AlipaySignature {

    // 待验签/待签名参数中必须剔除的 sign 键；sign_type 仅在通用口径剔除（生活号口径保留）
    static final String FIELD_SIGN = "sign";
    static final String FIELD_SIGN_TYPE = "sign_type";

    // RSA 公钥指数应用事实标准
    private static final BigInteger RSA_PUBLIC_EXPONENT = BigInteger.valueOf(65537);

    private AlipaySignature() {
    }

    /**
     * 回调验签双口径：验签钥为 channel_info 配置的支付宝平台公钥（§4.3 第 4 步）。
     * 生活号口径（保留 sign_type）优先，不通过再按通用口径（剔除 sign_type）复核；
     * 两者都失败才视为验签失败。公钥无法解析或签名损坏按失败返回。
     */
    static boolean verify(AlipayCredentials credentials, Map<String, String> params) {
        if (credentials == null || params == null || Texts.isBlank(params.get(FIELD_SIGN))) {
            return false;
        }
        PublicKey publicKey;
        try {
            publicKey = platformPublicKeyOf(credentials.alipayPublicKey());
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return false;
        }
        // 生活号口径优先（本渠道的官方规则），通用口径复核（mock-pulse 探测与支付类通知）
        return verifyByRule(params, publicKey, false) || verifyByRule(params, publicKey, true);
    }

    /**
     * 请求加签（商户 → 支付宝，§4.1）：剔除 sign 与空值参数、ASCII 升序 k=v& 拼接后
     * SHA256WithRSA，返回 Base64 签名。
     */
    static String sign(PrivateKey privateKey, Map<String, String> params) throws GeneralSecurityException {
        return signContent(privateKey, toVerifyString(params, true, false));
    }

    /**
     * 对原文直接加签（握手回包对 response 节点内容签名，§3.2）。
     */
    static String signContent(PrivateKey privateKey, String content) throws GeneralSecurityException {
        Signature signature = Signature.getInstance("SHA256withRSA");
        signature.initSign(privateKey);
        signature.update(content.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(signature.sign());
    }

    /**
     * 由应用私钥推导应用公钥（X.509 编码，Base64）——握手回包 biz_content 需要的
     * 「开发者公钥」即控制台上传的同一款编码（§3.2）。
     */
    static String publicKeyBase64(String appPrivateKey) throws GeneralSecurityException {
        return Base64.getMimeEncoder().encodeToString(publicKeyOf(appPrivateKey).getEncoded());
    }

    /**
     * 解析 channel_info 存放的应用私钥（PKCS#8 Base64/PEM）为 {@link PrivateKey}。
     */
    static PrivateKey privateKeyOf(String appPrivateKey) throws GeneralSecurityException {
        return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(storedKeyDer(appPrivateKey)));
    }

    /**
     * 解析 channel_info 存放的支付宝平台公钥（X.509 Base64/PEM）为 {@link PublicKey}。
     */
    static PublicKey platformPublicKeyOf(String alipayPublicKey) throws GeneralSecurityException {
        return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(storedKeyDer(alipayPublicKey)));
    }

    private static PublicKey publicKeyOf(String appPrivateKey) throws GeneralSecurityException {
        PrivateKey privateKey = KeyFactory.getInstance("RSA")
            .generatePrivate(new PKCS8EncodedKeySpec(storedKeyDer(appPrivateKey)));
        // CRT 私钥自带模数与公钥指数，公钥可严格推导
        if (privateKey instanceof RSAPrivateCrtKey crtKey) {
            return KeyFactory.getInstance("RSA")
                .generatePublic(new RSAPublicKeySpec(crtKey.getModulus(), crtKey.getPublicExponent()));
        }
        return KeyFactory.getInstance("RSA")
            .generatePublic(new RSAPublicKeySpec(((RSAPrivateKey) privateKey).getModulus(), RSA_PUBLIC_EXPONENT));
    }

    // channel_info 密钥值：兼容 PEM 盔甲（私钥 PKCS#8、公钥 X.509）与裸 Base64 DER 两种存放形态
    private static final Pattern PEM_LINE_BREAK = Pattern.compile("\\r?\\n");

    private static byte[] storedKeyDer(String stored) {
        StringBuilder base64 = new StringBuilder();
        for (String line : PEM_LINE_BREAK.split(stored)) {
            if (line.contains("-----")) {
                continue;
            }
            base64.append(line.trim());
        }
        return Base64.getMimeDecoder().decode(base64.toString());
    }

    private static boolean verifyByRule(Map<String, String> params, PublicKey publicKey, boolean dropSignType) {
        byte[] signatureBytes;
        try {
            signatureBytes = Base64.getDecoder().decode(params.get(FIELD_SIGN));
        } catch (IllegalArgumentException e) {
            return false;
        }
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initVerify(publicKey);
            signature.update(toVerifyString(params, false, dropSignType).getBytes(StandardCharsets.UTF_8));
            return signature.verify(signatureBytes);
        } catch (GeneralSecurityException e) {
            return false;
        }
    }

    // 待验签/待签名串：ASCII 升序 k=v& 拼接；请求加签剔空值，回调验签剔 sign（按口径剔 sign_type）
    private static String toVerifyString(Map<String, String> params, boolean dropEmpty, boolean dropSignType) {
        Map<String, String> sorted = new TreeMap<>(params);
        sorted.remove(FIELD_SIGN);
        if (dropSignType) {
            sorted.remove(FIELD_SIGN_TYPE);
        }
        StringBuilder toVerify = new StringBuilder();
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            if (dropEmpty && (entry.getValue() == null || entry.getValue().isEmpty())) {
                continue;
            }
            if (toVerify.length() > 0) {
                toVerify.append('&');
            }
            toVerify.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return toVerify.toString();
    }

}
