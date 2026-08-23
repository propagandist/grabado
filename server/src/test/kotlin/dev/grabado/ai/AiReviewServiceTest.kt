package dev.grabado.ai

import dev.grabado.config.AiProperties
import dev.grabado.config.GrabadoProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

/**
 * AI proxy の判断を **HTTP なしで**見る（段階11-2a）。
 *
 * READONLY のときに Bean ごと消す作りの副産物で、[AiReviewService] は Spring を 1 ミリも
 * 起こさずに組める（[GrabadoProperties] が data class なのと同じ理由）。HTTP に載せた形は
 * [AiContractTest] が契約表で見る。
 *
 * ★ **時間に依存するもの（キャッシュの TTL・レート制限のウィンドウ）は [Clock] を渡して
 *   その場で進める。** `Thread.sleep` で待つと、テストが遅くなるうえに落ちる日が来る。
 */
class AiReviewServiceTest {

    private val mapper = JsonMapper()

    private fun properties(ai: AiProperties) =
        GrabadoProperties(schemaDir = Path.of("."), ai = ai)

    private fun enabled(
        maxTables: Int = 100,
        maxRequestBytes: Int = 256 * 1024,
        ratePerMinute: Int = 10,
    ) = AiProperties(
        apiKey = "test-key",
        model = "test-model",
        maxTables = maxTables,
        maxRequestBytes = maxRequestBytes,
        ratePerMinute = ratePerMinute,
    )

    private fun body(json: String): ByteArray = json.toByteArray(StandardCharsets.UTF_8)

    private val minimal =
        """{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"t"}]}"""

    /** 呼ばれた回数を数え、固定の 1 件を返す。 */
    private class Stub(private val mapper: JsonMapper = JsonMapper()) : SuggestionSource {
        var calls = 0

        override fun review(request: JsonNode): List<JsonNode> {
            calls++
            return listOf(mapper.readTree("""{"category":"naming","severity":"info"}"""))
        }
    }

    /* ------------------------- 使えるかどうか ---------------------- */

    @Test
    fun `実装が無ければ使えない（main には SuggestionSource の実装が 1 つも無い）`() {
        val service = AiReviewService(properties(enabled()), source = null)

        assertThat(service.isConfigured()).isFalse()
        assertThatThrownBy { service.review(body(minimal)) }
            .isInstanceOf(AiUnavailableException::class.java)
    }

    @Test
    fun `キーとモデル名は両方そろって初めて有効`() {
        val onlyKey = AiReviewService(properties(AiProperties(apiKey = "k")), Stub())
        val onlyModel = AiReviewService(properties(AiProperties(model = "m")), Stub())
        val both = AiReviewService(properties(enabled()), Stub())

        assertThat(onlyKey.isConfigured()).isFalse()
        assertThat(onlyModel.isConfigured()).isFalse()
        assertThat(both.isConfigured()).isTrue()
    }

    @Test
    fun `キーが無ければ 403 相当（入力が正しくても通さない）`() {
        val service = AiReviewService(properties(AiProperties(model = "m")), Stub())

        assertThatThrownBy { service.review(body(minimal)) }
            .isInstanceOf(AiUnavailableException::class.java)
    }

    /* ------------------------- 入力の検査 -------------------------- */

    @Test
    fun `大きすぎる入力はパースの前に落とす`() {
        val stub = Stub()
        val service = AiReviewService(properties(enabled(maxRequestBytes = 16)), stub)

        assertThatThrownBy { service.review(body(minimal)) }
            .isInstanceOf(AiBadRequestException::class.java)
        assertThat(stub.calls).describedAs("上流まで行かない").isZero()
    }

    @Test
    fun `テーブル数の上限を超えたら落とす`() {
        val service = AiReviewService(properties(enabled(maxTables = 1)), Stub())
        val two = """{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"a"},{"name":"b"}]}"""

        assertThatThrownBy { service.review(body(two)) }
            .isInstanceOf(AiBadRequestException::class.java)
    }

    @Test
    fun `形が違うものは 400 相当`() {
        val service = AiReviewService(properties(enabled()), Stub())
        val broken = listOf(
            "not json",
            "[]",
            """{"dialect":"postgresql","tables":[]}""",
            """{"aiRequestVersion":2,"dialect":"postgresql","tables":[]}""",
            """{"aiRequestVersion":"1","dialect":"postgresql","tables":[]}""",
            """{"aiRequestVersion":1,"dialect":"","tables":[]}""",
            """{"aiRequestVersion":1,"dialect":"postgresql"}""",
            """{"aiRequestVersion":1,"dialect":"postgresql","tables":{}}""",
        )

        for (one in broken) {
            assertThatThrownBy { service.review(body(one)) }
                .describedAs(one)
                .isInstanceOf(AiBadRequestException::class.java)
        }
    }

    @Test
    fun `知らない dialect は通す（プロファイル名の写しを backend に持たせない）`() {
        val service = AiReviewService(properties(enabled()), Stub())
        val unknown = """{"aiRequestVersion":1,"dialect":"duckdb","tables":[]}"""

        assertThat(service.review(body(unknown))).isNotNull()
    }

    @Test
    fun `テーブルが 0 件でも通す（指摘が無い設計は正常）`() {
        val service = AiReviewService(properties(enabled()), Stub())

        assertThat(service.review(body("""{"aiRequestVersion":1,"dialect":"postgresql","tables":[]}""")))
            .hasSize(1)
    }

    /* ------------------------- キャッシュ -------------------------- */

    @Test
    fun `同じバイト列は上流を 1 回しか呼ばない`() {
        val stub = Stub()
        val service = AiReviewService(properties(enabled()), stub)

        val first = service.review(body(minimal))
        val second = service.review(body(minimal))

        assertThat(second).isEqualTo(first)
        assertThat(stub.calls).isEqualTo(1)
    }

    @Test
    fun `キャッシュに当たった呼び出しはレート制限を消費しない`() {
        val stub = Stub()
        /* 受付は 1 分に 1 件。2 回目がキャッシュを通らなければ 429 になる */
        val service = AiReviewService(properties(enabled(ratePerMinute = 1)), stub)

        service.review(body(minimal))
        service.review(body(minimal))
        service.review(body(minimal))

        assertThat(stub.calls).isEqualTo(1)
    }

    @Test
    fun `壊れた入力はキャッシュに入らない（次も同じ 400 になる）`() {
        val stub = Stub()
        val service = AiReviewService(properties(enabled()), stub)

        repeat(2) {
            assertThatThrownBy { service.review(body("not json")) }
                .isInstanceOf(AiBadRequestException::class.java)
        }
        assertThat(stub.calls).isZero()
    }

    /* ------------------------- レート制限 -------------------------- */

    @Test
    fun `単位時間あたりの上限を超えたら 429 相当`() {
        val stub = Stub()
        val service = AiReviewService(properties(enabled(ratePerMinute = 2)), stub)

        service.review(body("""{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"a"}]}"""))
        service.review(body("""{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"b"}]}"""))

        assertThatThrownBy {
            service.review(body("""{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"c"}]}"""))
        }.isInstanceOf(AiRateLimitedException::class.java)
    }

    @Test
    fun `1 分たてばウィンドウが空く`() {
        val clock = MovableClock(Instant.parse("2026-08-23T00:00:00Z"))
        val limiter = RateLimiter(perMinute = 1, maxConcurrent = 2, clock = clock)

        limiter.withPermit { }
        assertThatThrownBy { limiter.withPermit { } }.isInstanceOf(AiRateLimitedException::class.java)

        clock.advance(Duration.ofSeconds(61))
        assertThat(limiter.withPermit { "ok" }).isEqualTo("ok")
    }

    @Test
    fun `同時実行の上限を超えたら 429 相当（待たせない）`() {
        val limiter = RateLimiter(perMinute = 100, maxConcurrent = 1, clock = Clock.systemUTC())

        limiter.withPermit {
            assertThatThrownBy { limiter.withPermit { } }
                .isInstanceOf(AiRateLimitedException::class.java)
        }
        /* 抜けたら空く */
        assertThat(limiter.withPermit { "ok" }).isEqualTo("ok")
    }

    /* ------------------------- キャッシュの寿命と上限 ---------------- */

    @Test
    fun `TTL を過ぎたら消える`() {
        val clock = MovableClock(Instant.parse("2026-08-23T00:00:00Z"))
        val cache = SuggestionCache(maxEntries = 8, ttl = Duration.ofHours(1), clock = clock)
        val value = listOf(mapper.readTree("""{"category":"naming"}"""))

        cache.put("k", value)
        clock.advance(Duration.ofMinutes(59))
        assertThat(cache.get("k")).isEqualTo(value)

        clock.advance(Duration.ofMinutes(2))
        assertThat(cache.get("k")).isNull()
    }

    @Test
    fun `上限を超えたら最も長く触られていないものから捨てる`() {
        val cache = SuggestionCache(maxEntries = 2, ttl = Duration.ofHours(1))
        val value = listOf(mapper.readTree("{}"))

        cache.put("a", value)
        cache.put("b", value)
        cache.get("a")
        cache.put("c", value)

        assertThat(cache.size()).isEqualTo(2)
        assertThat(cache.get("a")).describedAs("直前に触った a は残る").isNotNull()
        assertThat(cache.get("b")).describedAs("いちばん古い b が消える").isNull()
    }

    @Test
    fun `鍵は送られてきたバイト列そのものから作る`() {
        val same = SuggestionCache.keyOf(body(minimal))
        val spaced = SuggestionCache.keyOf(body(minimal.replace(":", ": ")))

        assertThat(SuggestionCache.keyOf(body(minimal))).isEqualTo(same)
        assertThat(spaced).describedAs("正規化しない（意味が同じでもバイト列が違えば別の鍵）")
            .isNotEqualTo(same)
        assertThat(same).hasSize(64)
    }

    /* ------------------------- 上流の失敗 -------------------------- */

    @Test
    fun `上流の例外はそのまま伝わる（503 への写像は ApiExceptionHandler が持つ）`() {
        val service = AiReviewService(
            properties(enabled()),
            SuggestionSource { throw AiUpstreamException(RuntimeException("boom")) },
        )

        assertThatThrownBy { service.review(body(minimal)) }
            .isInstanceOf(AiUpstreamException::class.java)
    }

    @Test
    fun `失敗した入力はキャッシュに入らない`() {
        var calls = 0
        val service = AiReviewService(
            properties(enabled()),
            SuggestionSource {
                calls++
                throw AiUpstreamException(RuntimeException("boom"))
            },
        )

        repeat(2) {
            assertThatThrownBy { service.review(body(minimal)) }
                .isInstanceOf(AiUpstreamException::class.java)
        }
        assertThat(calls).isEqualTo(2)
    }

    /* ------------------------- 11-1 の fixture ---------------------- */

    @Test
    fun `段階11-1 の提案 fixture をそのまま返せる`() {
        /*
         * tests/fixtures/ai/review-response.json は 11-1 が入れた 11 件で、**11-2b のモック
         * 応答を兼ねる**と決めてある。backend が中身を 1 フィールドも解釈しないことの実測 ——
         * patch の 8 op も、patch を持たない提案も、そのまま通る。
         */
        val repoRoot = Path.of(
            System.getProperty("grabado.repoRoot")
                ?: error("grabado.repoRoot が未設定（build.gradle.kts の test タスクを見ること）"),
        )
        val file = repoRoot.resolve("tests").resolve("fixtures").resolve("ai")
            .resolve("review-response.json")
        val suggestions = buildList<JsonNode> {
            for (one in Files.newInputStream(file).use { mapper.readTree(it) }) {
                add(one)
            }
        }
        val service = AiReviewService(properties(enabled()), SuggestionSource { suggestions })

        val returned = service.review(body(minimal))

        assertThat(returned).hasSize(11)
        assertThat(returned.count { it.has("patch") }).isEqualTo(10)
        assertThat(returned.filter { it.has("patch") }.map { it.path("patch").path("op").asString("") }.toSet())
            .containsExactlyInAnyOrder(
                "rename-table",
                "rename-column",
                "change-type",
                "set-default",
                "add-column",
                "add-key",
                "set-nullable",
                "add-comment",
            )
    }

    /** その場で進められる [Clock]（`Thread.sleep` で待たないため）。 */
    private class MovableClock(private var now: Instant) : Clock() {
        override fun getZone() = ZoneOffset.UTC

        override fun withZone(zone: java.time.ZoneId): Clock = this

        override fun instant(): Instant = now

        fun advance(by: Duration) {
            now = now.plus(by)
        }
    }
}
