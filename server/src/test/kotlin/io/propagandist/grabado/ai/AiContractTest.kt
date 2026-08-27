package io.propagandist.grabado.ai

import io.propagandist.grabado.api.BackendContractTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively

/**
 * AI を**有効にして**起動したサーバに、契約表の `serverMode: "ai"` を流す（段階11-2a）。
 *
 * READONLY と同じ形で、有効化は**起動条件**なので同じインスタンスでは試せない
 * （[io.propagandist.grabado.api.ReadOnlyContractTest] の兄弟）。表は 1 つのまま、流す側を 3 つに分けた。
 *
 * ★ **[SuggestionSource] の実装をここで初めて注入する。** main には実装が 1 つも無く
 *   （固定応答を返すコードを本番に置かない）、実物が入るのは 11-2b。ここが入れるのは
 *   呼ばれた回数を数えるだけのスタブで、**キャッシュが効いていることを回数で見る**。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AiContractTest {

    @Value("\${local.server.port}")
    private var port: Int = 0

    @ParameterizedTest(name = "{0}")
    @MethodSource("aiCases")
    fun contract(id: String, case: JsonNode) {
        val response = BackendContractTest.send(case.path("request"), port)
        val expect = case.path("expect")

        assertThat(response.statusCode())
            .describedAs("%s: status（%s）", id, case.path("note").asString(""))
            .isEqualTo(expect.path("status").asInt())

        if (expect.has("body")) {
            assertThat(String(response.body(), StandardCharsets.UTF_8))
                .describedAs("%s: body", id)
                .isEqualTo(expect.path("body").asString())
        }

        expect.path("headers").properties().forEach { (name, value) ->
            assertThat(response.headers().firstValue(name).orElse(null))
                .describedAs("%s: ヘッダ %s", id, name)
                .isEqualTo(value.asString())
        }
    }

    @Test
    fun `AI のケースが表に実在する`() {
        // 0 件のまま緑になると「AI を試している」という主張だけが残る（READONLY 側と同じ検査）。
        assertThat(aiCases()).isNotEmpty()
    }

    @Test
    fun `capabilities の ai が true になる`() {
        val response = BackendContractTest.send(request("action=capabilities"), port)

        assertThat(String(response.body(), StandardCharsets.UTF_8))
            .isEqualTo("""{"readonly":false,"introspection":false,"ai":true}""")
    }

    @Test
    fun `同じ入力の 2 回目は上流を呼ばない（結果キャッシュ）`() {
        val before = stub.calls.get()
        val body = """{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"cached"}]}"""

        val first = BackendContractTest.send(post(body), port)
        val second = BackendContractTest.send(post(body), port)

        assertThat(first.statusCode()).isEqualTo(200)
        assertThat(String(second.body(), StandardCharsets.UTF_8))
            .isEqualTo(String(first.body(), StandardCharsets.UTF_8))
        assertThat(stub.calls.get() - before)
            .describedAs("上流の呼び出し回数（2 回目はキャッシュに当たる）")
            .isEqualTo(1)
    }

    @Test
    fun `バイト列が 1 文字違えばキャッシュに当たらない`() {
        val before = stub.calls.get()

        BackendContractTest.send(post("""{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"x"}]}"""), port)
        BackendContractTest.send(post("""{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"y"}]}"""), port)

        assertThat(stub.calls.get() - before).isEqualTo(2)
    }

    @Test
    fun `上流が失敗したら 503（例外の中身は body に出さない）`() {
        stub.failNext.set(true)

        val response = BackendContractTest.send(
            post("""{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"boom"}]}"""),
            port,
        )

        assertThat(response.statusCode()).isEqualTo(503)
        assertThat(String(response.body(), StandardCharsets.UTF_8)).isEmpty()
    }

    /** 契約表に載せるほどでもない 1 リクエストを組む小道具（READONLY 側と同じ流儀）。 */
    private fun request(query: String): JsonNode {
        val node = JsonMapper().createObjectNode()
        node.put("method", "GET")
        node.put("action", query.substringAfter("action="))
        return node
    }

    private fun post(body: String): JsonNode {
        val node = JsonMapper().createObjectNode()
        node.put("method", "POST")
        node.put("path", "/api/ai/review")
        node.put("body", body)
        return node
    }

    /**
     * 呼ばれた回数を数えるだけの [SuggestionSource]。
     *
     * **main に置かないもの。** 固定応答を返す実装が本番に載ると「AI が動いているように見えて
     * 実は固定」になる（[SuggestionSource] の KDoc）。
     */
    class CountingStub : SuggestionSource {
        val calls = AtomicInteger()

        /** 次の 1 回だけ上流の失敗を模す（契約表には書けない —— 表は 1 リクエスト 1 レスポンス）。 */
        val failNext = AtomicBoolean(false)

        override fun review(request: JsonNode): List<JsonNode> {
            calls.incrementAndGet()
            if (failNext.getAndSet(false)) {
                throw AiUpstreamException(IllegalStateException("上流の失敗を模す"))
            }
            return listOf(JsonMapper().readTree(FIXED))
        }
    }

    /**
     * スタブを**本物より優先する**（段階11-2b で `AnthropicSuggestionSource` が main に入り、
     * `SuggestionSource` の Bean が 2 つになった）。`@Primary` が無いと
     * `NoUniqueBeanDefinitionException` で文脈ごと起動しない。
     *
     * **本物を除外する形は採らない** —— 除外すると「本物が居ても契約が保たれる」ことが
     * 試されなくなる。ここは**居るうえで、上流に出ない方を選んでいる**。
     */
    @TestConfiguration
    class StubConfiguration {
        @Bean
        @Primary
        fun suggestionSource(): SuggestionSource = stub
    }

    companion object {
        /** 契約表の `ai-review-ok` が期待する応答（バイト列で突き合わせる）。 */
        const val FIXED: String =
            """{"category":"missing_pk","severity":"error","target":{"table":"employees"},""" +
                """"rationale":"テスト用の固定応答（段階11-2a）"}"""

        @JvmStatic
        val stub = CountingStub()

        @JvmStatic
        val schemaDir: Path = Files.createTempDirectory("grabado-ai-")

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("grabado.schema-dir") { schemaDir.toString() }
            /* キーとモデル名が両方そろって初めて有効（段階11-0 の決めたこと 7） */
            registry.add("grabado.ai.api-key") { "test-key" }
            registry.add("grabado.ai.model") { "test-model" }
            /* 契約表の ai-too-many-tables が 3 件で落ちるように、上限をテスト側で絞る */
            registry.add("grabado.ai.max-tables") { "2" }
        }

        @JvmStatic
        fun aiCases(): List<Arguments> = BackendContractTest.casesFor("ai")

        @JvmStatic
        @AfterAll
        @OptIn(ExperimentalPathApi::class)
        fun cleanup(): Unit = schemaDir.deleteRecursively()
    }
}
