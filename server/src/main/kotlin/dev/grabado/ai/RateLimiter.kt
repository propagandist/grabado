package dev.grabado.ai

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.ArrayDeque
import java.util.concurrent.Semaphore

/**
 * 上流へ流す量の上限（段階11-2a。`docs/ARCHITECTURE.md` §8.1 の 429）。
 *
 * **費用が自社負担なので、上限はサーバが持つ**（段階11-0 の決めたこと 9）。見るのは 2 つ:
 *
 * - **単位時間あたりの受付数** —— 直近 1 分の受付時刻を持つスライディングウィンドウ
 * - **同時実行数** —— [Semaphore]。上流が遅いときに待ち行列が伸びるのを止める
 *
 * ★ **どちらも待たせない。超えたらその場で 429。** 待たせると、上流のタイムアウトと
 *   「自分が詰まっている」が呼び手から区別できなくなる。**429 は待てば通る**という意味で、
 *   503（故障）に倒さないのが 5-3 から続く status の使い分け。
 *
 * ★ **キャッシュに当たったリクエストはここを通らない**（[AiReviewService]）。費用が
 *   発生しない呼び出しを費用の上限で止める理由が無い。
 *
 * @param perMinute 1 分あたりの受付数
 * @param maxConcurrent 同時に上流へ流す数
 * @param clock ウィンドウの判定に使う。テストが時間を進めるために外から渡す
 */
class RateLimiter(
    private val perMinute: Int,
    maxConcurrent: Int,
    private val clock: Clock = Clock.systemUTC(),
) {

    private val window = ArrayDeque<Instant>()
    private val concurrency = Semaphore(maxConcurrent)

    /**
     * 上限の内側なら [block] を実行する。
     *
     * @throws AiRateLimitedException どちらかの上限を超えた（HTTP 429）
     */
    fun <T> withPermit(block: () -> T): T {
        admit()
        if (!concurrency.tryAcquire()) {
            throw AiRateLimitedException("同時実行の上限")
        }
        try {
            return block()
        } finally {
            concurrency.release()
        }
    }

    /** 直近 1 分の受付数を数え、上限内なら now を積む。 */
    @Synchronized
    private fun admit() {
        val now = clock.instant()
        val edge = now.minus(WINDOW)
        while (true) {
            val oldest = window.peekFirst() ?: break
            if (oldest.isAfter(edge)) {
                break
            }
            window.removeFirst()
        }
        if (window.size >= perMinute) {
            throw AiRateLimitedException("単位時間あたりの上限")
        }
        window.addLast(now)
    }

    private companion object {
        val WINDOW: Duration = Duration.ofMinutes(1)
    }
}
