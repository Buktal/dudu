package com.dudu.duduserver.channel.support;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 渠道接口凭据进程内缓存骨架（口径与飞书/抖音实现一致）：命中且剩余有效期大于提前量
 * 直接复用，临期或过期返回空、由调用方重新换取；换取失败不写缓存，下次自然重试。
 * 缓存键由调用方提供，须能区分不同凭据组——凭据 record 的值等即键，换密或换绑后旧
 * 缓存自然失效；实例由各令牌客户端持有（发送与素材读取各建各的客户端，互不共享）。
 */
public final class AccessTokenCache<K> {

    // 剩余有效期不足 30 分钟即换新（与飞书/抖音缓存窗口口径一致）
    private static final long REFRESH_AHEAD_MILLIS = Duration.ofMinutes(30).toMillis();

    // 缓存条目：令牌与到期时刻（毫秒）
    private record Entry(String token, long expiresAtMillis) {
    }

    private final Map<K, Entry> cache = new ConcurrentHashMap<>();

    // 命中且剩余有效期充足时返回缓存令牌，否则空
    public Optional<String> get(K key) {
        Entry cached = cache.get(key);
        if (cached == null || cached.expiresAtMillis() - System.currentTimeMillis() <= REFRESH_AHEAD_MILLIS) {
            return Optional.empty();
        }
        return Optional.of(cached.token());
    }

    // 换取成功后写入缓存；寿命取响应口径（毫秒），失败不得调用以便下次重试
    public void put(K key, String token, long lifetimeMillis) {
        cache.put(key, new Entry(token, System.currentTimeMillis() + lifetimeMillis));
    }
}
