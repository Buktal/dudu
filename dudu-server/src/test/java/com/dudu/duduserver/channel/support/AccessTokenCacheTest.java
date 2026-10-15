package com.dudu.duduserver.channel.support;

import com.dudu.duduserver.channel.support.AccessTokenCache.FetchedToken;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * AccessTokenCache 单飞缓存验收（小红书失效规则的动机见
 * docs/research/channels/xiaohongshu.md §12.2）：有效期内复用不再执行 loader、剩余寿命
 * 不足提前量时换新、loader 失败与异常不写缓存以便重试、同键并发未命中只执行一次
 * loader 且各线程拿到同值、异键互不阻塞。纯 Supplier + latch，不涉及 HTTP。
 */
class AccessTokenCacheTest {

    private static final String KEY = "credentials";
    private static final long TWO_HOURS_MILLIS = Duration.ofHours(2).toMillis();

    @Test
    void reusesTokenWithinValidityWithoutRunningTheLoaderAgain() {
        AccessTokenCache<String> cache = new AccessTokenCache<>();
        AtomicInteger loads = new AtomicInteger();
        Supplier<FetchedToken> loader =
            () -> FetchedToken.fetched("token-" + loads.incrementAndGet(), TWO_HOURS_MILLIS);

        TokenResult first = cache.getOrLoad(KEY, loader);
        TokenResult second = cache.getOrLoad(KEY, loader);

        assertThat(first.succeeded()).isTrue();
        assertThat(first.accessToken()).isEqualTo("token-1");
        // 有效期内复用：第二次直接命中缓存，loader 不再执行
        assertThat(second.accessToken()).isEqualTo("token-1");
        assertThat(loads.get()).isOne();
    }

    @Test
    void refetchesWhenRemainingLifetimeFallsWithinTheRefreshAheadWindow() {
        // 默认提前量 30 分钟；loader 给出的寿命只有 20 分钟，写缓存即已临期
        AccessTokenCache<String> cache = new AccessTokenCache<>();
        AtomicInteger loads = new AtomicInteger();
        Supplier<FetchedToken> loader = () -> FetchedToken.fetched("short-" + loads.incrementAndGet(),
            Duration.ofMinutes(20).toMillis());

        TokenResult first = cache.getOrLoad(KEY, loader);
        TokenResult second = cache.getOrLoad(KEY, loader);

        assertThat(first.accessToken()).isEqualTo("short-1");
        // 寿命 ≤ 提前量：不复用、loader 重新执行换新
        assertThat(second.accessToken()).isEqualTo("short-2");
        assertThat(loads.get()).isEqualTo(2);
    }

    @Test
    void doesNotCacheLoaderFailuresSoTheNextCallRunsTheLoaderAgain() {
        AccessTokenCache<String> cache = new AccessTokenCache<>();
        AtomicInteger loads = new AtomicInteger();

        TokenResult failed = cache.getOrLoad(KEY,
            () -> FetchedToken.failed("渠道拒绝：" + loads.incrementAndGet()));

        assertThat(failed.succeeded()).isFalse();
        assertThat(failed.failureReason()).isEqualTo("渠道拒绝：1");

        TokenResult retried = cache.getOrLoad(KEY, () -> FetchedToken.fetched("token-2", TWO_HOURS_MILLIS));

        // 失败不缓存：下次调用重新执行 loader 并可成功
        assertThat(retried.succeeded()).isTrue();
        assertThat(retried.accessToken()).isEqualTo("token-2");
        assertThat(loads.get()).isOne();
    }

    @Test
    void propagatesLoaderExceptionsWithoutCachingTheKey() {
        AccessTokenCache<String> cache = new AccessTokenCache<>();
        AtomicInteger loads = new AtomicInteger();
        Supplier<FetchedToken> failing = () -> {
            loads.incrementAndGet();
            throw new IllegalStateException("网络不可达");
        };

        // 异常原样上抛由调用方兜底
        assertThatThrownBy(() -> cache.getOrLoad(KEY, failing))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("网络不可达");

        TokenResult recovered = cache.getOrLoad(KEY, () -> FetchedToken.fetched("token-after", TWO_HOURS_MILLIS));

        // 异常不写缓存：下次调用重新执行 loader 并可成功
        assertThat(recovered.accessToken()).isEqualTo("token-after");
        assertThat(loads.get()).isOne();
    }

    @Test
    void singleFlightsConcurrentMissesOnTheSameKey() throws Exception {
        int threads = 8;
        AccessTokenCache<String> cache = new AccessTokenCache<>();
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch loaderEntered = new CountDownLatch(1);
        CountDownLatch releaseLoader = new CountDownLatch(1);
        AtomicInteger loads = new AtomicInteger();
        AtomicReference<Thread> loaderThread = new AtomicReference<>();
        Set<Thread> workers = ConcurrentHashMap.newKeySet();
        Supplier<FetchedToken> loader = () -> {
            loaderThread.set(Thread.currentThread());
            loads.incrementAndGet();
            loaderEntered.countDown();
            awaitUninterruptibly(releaseLoader);
            return FetchedToken.fetched("single-flight", TWO_HOURS_MILLIS);
        };

        ExecutorService executor = Executors.newFixedThreadPool(threads);
        try {
            List<Future<TokenResult>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                results.add(executor.submit(() -> {
                    workers.add(Thread.currentThread());
                    ready.countDown();
                    awaitUninterruptibly(startGate);
                    return cache.getOrLoad(KEY, loader);
                }));
            }
            // 全部工作线程就位后同时放行，保证 N 线程同时 miss
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            startGate.countDown();
            assertThat(loaderEntered.await(5, TimeUnit.SECONDS)).isTrue();
            awaitOthersParkedOnTheKeyLock(workers, loaderThread.get());
            releaseLoader.countDown();

            for (Future<TokenResult> result : results) {
                TokenResult token = result.get(5, TimeUnit.SECONDS);
                assertThat(token.succeeded()).isTrue();
                assertThat(token.accessToken()).isEqualTo("single-flight");
            }
            // 同键并发 miss 单飞：loader 恰执行一次，后到者命中先到者刚写回的新值
            assertThat(loads.get()).isOne();
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void doesNotBlockDifferentKeysBehindEachOthersLoads() throws Exception {
        AccessTokenCache<String> cache = new AccessTokenCache<>();
        CountDownLatch aEntered = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        CountDownLatch bLoaded = new CountDownLatch(1);
        AtomicInteger loadsA = new AtomicInteger();
        AtomicInteger loadsB = new AtomicInteger();

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            // key-a 的 loader 挂住持有键锁；key-b 必须仍能完成自己的换取
            Future<TokenResult> pendingOnA = executor.submit(() ->
                cache.getOrLoad("key-a", () -> {
                    loadsA.incrementAndGet();
                    aEntered.countDown();
                    awaitUninterruptibly(releaseA);
                    return FetchedToken.fetched("token-a", TWO_HOURS_MILLIS);
                }));
            assertThat(aEntered.await(5, TimeUnit.SECONDS)).isTrue();
            Future<TokenResult> loadedB = executor.submit(() ->
                cache.getOrLoad("key-b", () -> {
                    loadsB.incrementAndGet();
                    bLoaded.countDown();
                    return FetchedToken.fetched("token-b", TWO_HOURS_MILLIS);
                }));
            // 若异键共用锁，key-b 会阻塞在 key-a 的键锁上，此处超时失败
            assertThat(bLoaded.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(loadedB.get(5, TimeUnit.SECONDS).accessToken()).isEqualTo("token-b");
            releaseA.countDown();
            assertThat(pendingOnA.get(5, TimeUnit.SECONDS).accessToken()).isEqualTo("token-a");
            // 异键各走各的 loader，计数互不影响
            assertThat(loadsA.get()).isOne();
            assertThat(loadsB.get()).isOne();
        } finally {
            executor.shutdownNow();
        }
    }

    // ---- 夹具 ----

    // 无中断等待：被中断时恢复标志并继续等到 latch 归零，测试线程不因中断提前放行
    private static void awaitUninterruptibly(CountDownLatch latch) {
        boolean interrupted = false;
        while (latch.getCount() > 0) {
            try {
                latch.await();
            } catch (InterruptedException e) {
                interrupted = true;
            }
        }
        if (interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    // 给其余线程时间到达键锁：先到者持锁停留在 loader 内，其余 miss 后 park 在
    // lock()（WAITING）；软等待有期限，不强断言线程状态，单飞不变量由 loads 断言保证
    private static void awaitOthersParkedOnTheKeyLock(Set<Thread> workers, Thread loaderThread)
        throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5_000;
        while (System.currentTimeMillis() < deadline && workers.stream()
            .anyMatch(t -> t != loaderThread && t.getState() != Thread.State.WAITING)) {
            Thread.sleep(10);
        }
    }
}
