package com.dudu.duduserver.channel.support;

import cn.hutool.json.JSONObject;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * 渠道接口凭据进程内缓存骨架：命中且剩余有效期大于提前量直接复用，临期或过期视为
 * 未命中、经 getOrLoad 在键锁内重新换取；换取失败不写缓存，下次自然重试。提前量默认
 * 30 分钟（飞书/抖音等渠道口径），渠道官方另有约束时经构造器指定（如钉钉 200 秒）。
 * 缓存键由调用方提供，须能区分不同凭据组——凭据 record 的值等即键，换密或换绑后旧
 * 缓存自然失效；键不可为 null（凭据未配置属「未配置」路径，调用方先行处理，不进缓存）。
 * 实例由各令牌客户端持有（发送与素材读取各建各的客户端，互不共享）。
 *
 * 同键并发未命中经 getOrLoad 单飞：键粒度 ReentrantLock 串行换取、锁内 double-check，
 * 后到者命中先到者刚写回的新值，同键同一时刻只发一次 HTTP。动机：小红书官方规则
 * 「重复获取使上次凭证失效」（docs/research/channels/xiaohongshu.md §12.2），并发双取
 * 会互相作废凭证、失效令牌滞留缓存整个窗口；钉钉频调拦截同族风险。异键各持各的锁
 * 互不阻塞——不用 ConcurrentHashMap.compute 承载 loader，网络调用会占住 bin 锁连累
 * 异键。loader 失败（failed 产物或 null）或抛异常一律不写缓存，异常原样上抛由调用方
 * 兜底，后到者随后各自重跑 loader 重试。
 */
public final class AccessTokenCache<K> {

    // 剩余有效期不足 30 分钟即换新（与飞书/抖音缓存窗口口径一致）
    private static final long DEFAULT_REFRESH_AHEAD_MILLIS = Duration.ofMinutes(30).toMillis();

    // 渠道响应的过期字段以秒计，缓存寿命以毫秒计
    private static final long MILLIS_PER_SECOND = 1000L;

    // 缓存条目：令牌与到期时刻（毫秒）
    private record Entry(String token, long expiresAtMillis) {
    }

    /**
     * 换取产物：成功带令牌与缓存寿命（毫秒），失败只带已成型的原因说明。
     */
    public record FetchedToken(String token, long lifetimeMillis, String failureReason) {

        // 成功产物：寿命按渠道响应口径（毫秒）
        public static FetchedToken fetched(String token, long lifetimeMillis) {
            return new FetchedToken(token, lifetimeMillis, null);
        }

        // 失败产物：不写缓存，原因原样带回调用方
        public static FetchedToken failed(String failureReason) {
            return new FetchedToken(null, 0L, failureReason);
        }
    }

    private final long refreshAheadMillis;
    private final Map<K, Entry> cache = new ConcurrentHashMap<>();

    // 键粒度锁：同键串行换取、异键互不阻塞；条目不回收，键空间是有限的凭据组
    private final Map<K, ReentrantLock> locks = new ConcurrentHashMap<>();

    public AccessTokenCache() {
        this(DEFAULT_REFRESH_AHEAD_MILLIS);
    }

    // 提前量由渠道官方约束给定的客户端使用
    public AccessTokenCache(long refreshAheadMillis) {
        this.refreshAheadMillis = refreshAheadMillis;
    }

    // 渠道响应的过期秒数转缓存寿命毫秒：报文（嵌套 data 等）或字段缺失、非正值一律回退默认毫秒
    public static long expiresInMillis(JSONObject response, String expiresKey, long defaultMillis) {
        Long expiresInSeconds = response == null ? null : response.getLong(expiresKey, null);
        return expiresInSeconds == null || expiresInSeconds <= 0 ? defaultMillis : expiresInSeconds * MILLIS_PER_SECOND;
    }

    // 取凭据：命中且剩余有效期充足直接复用；未命中在键锁内 double-check 后执行 loader，
    // 成功写缓存返回令牌，失败不写缓存返回失败说明，loader 抛异常不写缓存并原样上抛
    public TokenResult getOrLoad(K key, Supplier<FetchedToken> loader) {
        if (key == null) {
            // 键是凭据组身份：null 意味着调用方把未配置当成了换取请求，显式暴露而非 ConcurrentHashMap NPE
            throw new IllegalArgumentException("令牌缓存键不能为 null：凭据未配置时应先按未配置处理，不进入缓存");
        }
        Optional<String> cached = get(key);
        if (cached.isPresent()) {
            return new TokenResult(cached.get(), null);
        }
        ReentrantLock lock = locks.computeIfAbsent(key, k -> new ReentrantLock());
        lock.lock();
        try {
            // double-check：先到者可能刚写回新值，命中即免二次换取
            cached = get(key);
            if (cached.isPresent()) {
                return new TokenResult(cached.get(), null);
            }
            FetchedToken fetched = loader.get();
            // loader 返回 null 视为无原因说明的换取失败，同样不写缓存
            if (fetched == null || fetched.token() == null) {
                return new TokenResult(null, fetched == null ? null : fetched.failureReason());
            }
            cache.put(key, new Entry(fetched.token(), System.currentTimeMillis() + fetched.lifetimeMillis()));
            return new TokenResult(fetched.token(), null);
        } finally {
            lock.unlock();
        }
    }

    // 命中且剩余有效期充足时返回缓存令牌，否则空
    private Optional<String> get(K key) {
        Entry cached = cache.get(key);
        if (cached == null || cached.expiresAtMillis() - System.currentTimeMillis() <= refreshAheadMillis) {
            return Optional.empty();
        }
        return Optional.of(cached.token());
    }
}
