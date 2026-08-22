package dev.grabado.api

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
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively

/**
 * `GRABADO_READONLY=true` で起動したサーバに、契約表の `serverMode: "readonly"` を流す（段階5-3）。
 *
 * READONLY は**サーバの起動条件**なので同じインスタンスでは試せない。表は 1 つのまま、
 * 流す側を 2 つに分けた（[BackendContractTest] が通常、こちらが READONLY）。
 *
 * **落ちるのは保存・introspection・AI の 3 つだけ。** `list` / `load` は生きている ——
 * 編集ストアはブラウザ内なので、READONLY でも「読んで・描いて・DDL を出す」体験は完全に
 * 提供できる。公開デモ（grabado.dev）が READONLY 一択なのはこれが成り立つから。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReadOnlyContractTest {

    @Value("\${local.server.port}")
    private var port: Int = 0

    @BeforeEach
    fun clean() {
        Files.newDirectoryStream(schemaDir).use { stream -> stream.forEach(Files::delete) }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("readOnlyCases")
    fun contract(id: String, case: JsonNode) {
        case.path("seed").properties().forEach { (name, content) ->
            Files.write(schemaDir.resolve(name), content.asString().toByteArray(StandardCharsets.UTF_8))
        }

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
    }

    @Test
    fun `READONLY のケースが表に実在する`() {
        // 0 件のまま緑になると「READONLY を試している」という主張だけが残る。
        assertThat(readOnlyCases()).isNotEmpty()
    }

    @Test
    fun `保存を拒んでもファイルは 1 つも作られない`() {
        val response = BackendContractTest.send(
            request(action = "save", keyword = "orders.json", method = "POST", body = "{}"),
            port,
        )

        assertThat(response.statusCode()).isEqualTo(403)
        assertThat(Files.newDirectoryStream(schemaDir).use { it.toList() }).isEmpty()
    }

    /** 契約表を書かずに 1 リクエストを組む小道具（表に載せるほどでもない検査のため）。 */
    private fun request(action: String, keyword: String?, method: String, body: String): JsonNode {
        val node = tools.jackson.databind.json.JsonMapper().createObjectNode()
        node.put("method", method)
        node.put("action", action)
        if (keyword != null) node.put("keyword", keyword)
        node.put("body", body)
        return node
    }

    companion object {
        @JvmStatic
        val schemaDir: Path = Files.createTempDirectory("grabado-readonly-")

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("grabado.schema-dir") { schemaDir.toString() }
            registry.add("grabado.readonly") { "true" }
        }

        @JvmStatic
        fun readOnlyCases(): List<Arguments> = BackendContractTest.casesFor("readonly")

        @JvmStatic
        @AfterAll
        @OptIn(ExperimentalPathApi::class)
        fun cleanup(): Unit = schemaDir.deleteRecursively()
    }
}
