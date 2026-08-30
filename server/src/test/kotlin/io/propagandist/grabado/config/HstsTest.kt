package io.propagandist.grabado.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/**
 * HSTS の**値そのもの**（issue #84）。**HTTP を 1 バイトも流さない純粋なテスト。**
 *
 * 実 HTTP で出ている／出ていないことは [HstsEnabledTest]（出る側）と
 * `BackendBehaviourTest`（既定で出ない側）が見る。ここが固定するのは
 * **org security-baseline §4.3 が名指しした 2 つ**——`preload` を付けないことと、
 * `max-age` を短くしないこと——だけである。
 *
 * イディオムは [CacheControlTest]（規則を、イメージを起こさずに固定する）と同じ。
 */
class HstsTest {

    /**
     * org security-baseline §4.3:「**HSTS に `preload` を付けない**——付けると取り消しに
     * 数か月かかる」。**足した日に赤くする**のがこのテストの役目で、
     * `tests/node/csp.test.ts` の「`script-src` を緩めていない」と同じ形。
     */
    @Test
    fun `preload を付けていない`() {
        assertThat(SecurityHeadersFilter.HSTS)
            .describedAs("preload は取り消しに数か月かかる（org security-baseline §4.3）")
            .doesNotContain("preload")
    }

    /**
     * 同 §4.3 の「崩れる変更」に **`max-age` を短くする**が挙がっている。
     * 短い値は「設定してある」ように見えて実質的に効かない。
     */
    @Test
    fun `max-age が 1 年ある`() {
        val maxAge = Regex("""max-age=(\d+)""").find(SecurityHeadersFilter.HSTS)?.groupValues?.get(1)
        assertThat(maxAge).describedAs("max-age が読めない: %s", SecurityHeadersFilter.HSTS).isNotNull()
        assertThat(maxAge!!.toLong()).isGreaterThanOrEqualTo(31_536_000L)
    }

    /**
     * **[SecurityHeadersFilter.HEADERS] へ移した瞬間に、既定でも出るようになる**——
     * それは手元の `http://localhost:8080` を壊す変更で、しかも
     * `vite.config.ts` の写し（`vite preview` は http）にも波及する。
     *
     * `Cache-Control` について [CacheControlTest] が持っているのと同じ見張りを、
     * **条件で出る／出ないが変わる**側にも置く。
     */
    @Test
    fun `共通の 5 本に入っていない`() {
        assertThat(SecurityHeadersFilter.HEADERS)
            .doesNotContainKey(SecurityHeadersFilter.STRICT_TRANSPORT_SECURITY)
        assertThat(SecurityHeadersFilter.HEADERS).hasSize(5)
    }
}
