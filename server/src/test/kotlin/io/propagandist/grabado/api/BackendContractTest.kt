package io.propagandist.grabado.api

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively

/**
 * `tests/contract/backend-cases.json` を 1 ケース 1 テストとして流す。
 *
 * **契約を 2 言語で二重に書かないための仕掛け。** 同じ表を段階5-1c で `tests/node/` の
 * 仮想 backend にも流し、harness が「サーバについての手書きの推測」から「同じ表で検証された
 * 第 2 実装」になる。散文の正は `docs/ARCHITECTURE.md` §4（実測）/ §7（到達点）。
 *
 * ## MockMvc ではなく実サーバを使う
 *
 * 契約には**日本語の keyword が URL エンコードで往復すること**と `%2F` の扱いが含まれる。
 * どちらもサーブレットコンテナの URL デコード層の話で、**MockMvc はその層を素通りする**。
 * `RANDOM_PORT` ＋ JDK 標準の [HttpClient] なら実際に通り、しかも依存が 1 つも増えない
 * （Boot 4 では `@AutoConfigureMockMvc` が `spring-boot-starter-test` の外に出ている）。
 *
 * 「1 リクエスト 1 レスポンス」で表せないもの —— 往復のバイト一致、トラバーサルで
 * **外にファイルができないこと**、原子的置換 —— は [BackendBehaviourTest] と
 * `FileDesignStoreTest` が直接書く。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BackendContractTest {

    @Value("\${local.server.port}")
    private var port: Int = 0

    @BeforeEach
    fun clean() = clearSchemaDir()

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    fun contract(id: String, case: JsonNode) {
        seed(case)

        val response = send(case.path("request"), port)
        val expect = case.path("expect")
        val note = case.path("note").asString("")

        assertThat(response.statusCode())
            .describedAs("%s: status（%s）", id, note)
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

    /** 表そのものの健全性。ケースが 0 件のまま緑になる事故を防ぐ。 */
    @Test
    fun `契約表は空でなく、id が重複していない`() {
        // JsonNode 自身が map(...) を持つので、Kotlin の Iterable.map は使わない（for で回す）。
        val ids = buildList { for (case in table().path("cases")) add(case.path("id").asString()) }
        assertThat(ids).hasSizeGreaterThan(15)
        assertThat(ids).doesNotHaveDuplicates()
        assertThat(table().path("contractVersion").asInt()).isEqualTo(1)
    }

    private fun seed(case: JsonNode) {
        case.path("seed").properties().forEach { (name, content) ->
            Files.write(schemaDir.resolve(name), content.asString().toByteArray(StandardCharsets.UTF_8))
        }
    }

    companion object {
        /**
         * 正本ディレクトリ。`@TempDir` ではなく自前で作るのは、[DynamicPropertySource] が
         * コンテキスト生成前（＝ `@TempDir` の注入より前）に読まれるため。
         */
        @JvmStatic
        val schemaDir: Path = Files.createTempDirectory("grabado-contract-")

        private val http: HttpClient = HttpClient.newHttpClient()

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("grabado.schema-dir") { schemaDir.toString() }
        }

        @JvmStatic
        fun clearSchemaDir() {
            Files.newDirectoryStream(schemaDir).use { stream -> stream.forEach(Files::delete) }
        }

        @JvmStatic
        @AfterAll
        @OptIn(ExperimentalPathApi::class)
        fun cleanup(): Unit = schemaDir.deleteRecursively()

        /** 契約表。repo ルートは Gradle が system property で渡す（build.gradle.kts）。 */
        @JvmStatic
        fun table(): JsonNode {
            val repoRoot = Path.of(
                System.getProperty("grabado.repoRoot")
                    ?: error("grabado.repoRoot が未設定（build.gradle.kts の test タスクを見ること）"),
            )
            val file = repoRoot.resolve("tests").resolve("contract").resolve("backend-cases.json")
            check(Files.isRegularFile(file)) { "契約表が無い: $file" }
            return Files.newInputStream(file).use { JsonMapper().readTree(it) }
        }

        /**
         * `@MethodSource` は Iterable も受けるので Stream に変換しない。
         *
         * ★ `JsonNode` は自前の `map(...)` を持つため、Kotlin の `Iterable.map` は解決されない。
         *   `for` で回すのが確実（同じ罠が [contract] の ids 側にもある）。
         */
        @JvmStatic
        fun cases(): List<Arguments> = casesFor(null)

        /**
         * 指定した `serverMode` のケースだけを返す（`null` は「モード指定なし」＝通常起動）。
         *
         * `serverMode` を持つケースは別の起動条件を要求するので、通常のテストでは流さない
         * —— `readonly` は [ReadOnlyContractTest] が持つ。
         */
        fun casesFor(serverMode: String?): List<Arguments> = buildList {
            for (case in table().path("cases")) {
                val mode = if (case.has("serverMode")) case.path("serverMode").asString() else null
                if (mode == serverMode) {
                    add(Arguments.of(case.path("id").asString(), case))
                }
            }
        }

        /**
         * 契約表の `request` を実 HTTP に変換して投げる。
         *
         * URL の形は実測どおり `<xhrpath>backend/<backend名>/?action=...`
         * （`ARCHITECTURE.md` §4.2）。`keyword` は `encodeURIComponent` 相当でエンコードする。
         *
         * ★ **`path` があればそれを使う**（段階11-2a）。`/api/ai/review` は
         *   `/backend/<name>/?action=` の形を取らない —— `/api/` は §11 が始める名前空間で、
         *   upstream の語彙に乗せない（5-0 の決定）。表の側で URL の組み立て方が 2 通りに
         *   なるが、**どちらなのかはデータで分かる**（`request.path` の有無）。
         */
        fun send(request: JsonNode, port: Int): HttpResponse<ByteArray> {
            val backend = request.path("backend").asString("file")
            val slash = if (request.path("trailingSlash").asBoolean(true)) "/" else ""
            val query = buildList {
                if (request.has("action") && !request.path("action").isNull) {
                    add("action=" + request.path("action").asString())
                }
                if (request.has("keyword") && !request.path("keyword").isNull) {
                    add("keyword=" + URLEncoder.encode(request.path("keyword").asString(), StandardCharsets.UTF_8))
                }
            }.joinToString("&")

            val uri = if (request.has("path")) {
                URI.create("http://127.0.0.1:$port" + request.path("path").asString())
            } else {
                URI.create(
                    "http://127.0.0.1:$port/backend/$backend$slash" + if (query.isEmpty()) "" else "?$query",
                )
            }
            val builder = HttpRequest.newBuilder(uri)
            when (val method = request.path("method").asString("GET")) {
                "GET" -> builder.GET()
                "POST" -> builder.POST(
                    HttpRequest.BodyPublishers.ofByteArray(
                        request.path("body").asString("").toByteArray(StandardCharsets.UTF_8),
                    ),
                )

                else -> error("契約表が未対応の method を使っている: $method")
            }
            // 条件付き更新（段階5-4）。表に書けるのは固定文字列だけなので、
            // 「一致する etag を送る」側は BackendBehaviourTest が持つ。
            /* Content-Type（段階11-5）。ブラウザが送るヘッダで 415 にならないことを固定する */
            if (request.has("contentType")) {
                builder.header("Content-Type", request.path("contentType").asString())
            }
            if (request.has("ifMatch")) {
                builder.header("If-Match", request.path("ifMatch").asString())
            }
            if (request.has("ifNoneMatch")) {
                builder.header("If-None-Match", request.path("ifNoneMatch").asString())
            }
            return http.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray())
        }
    }
}
