package io.propagandist.grabado.api

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively

/**
 * **公開デモと同じ形**（`GRABADO_READONLY=true` ＋ **正本ディレクトリが無い**）で起こしたサーバの
 * 実 HTTP（issue #286）。
 *
 * 起動条件が違うので同じインスタンスでは試せない —— [io.propagandist.grabado.config.HstsEnabledTest]
 * と同じ理由で**専用クラスを立て、契約表（`tests/contract/backend-cases.json`）には載せない**。
 * 表には「**ディレクトリが無い**」を書く語彙が無く、返る値は既存ケース（`list-empty` / 404 / 403）と
 * 1 バイトも違わないので、載せれば同じ契約が二重になる。
 *
 * ★ **§9.7 が「`list` は 0 件を返す」と宣言している形そのもの。** #286 の起票時点では、
 *   そこは「**ディレクトリが無い状態で保てるかは確認していない**」と書かれていた。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReadOnlyMissingSchemaDirTest {

    @Value("\${local.server.port}")
    private var port: Int = 0

    @Test
    fun `list は 200 の 0 バイト（§9-7 の「list は 0 件を返す」）`() {
        val response = get("/backend/file/?action=list")

        assertThat(response.statusCode()).isEqualTo(200)
        // PHP の glob と同じで、0 件は**改行 1 個ではなく 0 バイト**（契約表の list-empty）
        assertThat(String(response.body(), StandardCharsets.UTF_8)).isEmpty()
    }

    @Test
    fun `load は 404、save は 403（どちらも 500 ではない）`() {
        assertThat(get("/backend/file/?action=load&keyword=orders.json").statusCode()).isEqualTo(404)

        /*
         * ★ **403 であって 500 ではない** —— 書き先が無いことを、禁止より先に踏まない。
         *   ReadOnlyDesignStore が FileDesignStore の**外側**に居ることの、唯一の観測点。
         */
        assertThat(post("/backend/file/?action=save&keyword=orders.json", "{}").statusCode())
            .isEqualTo(403)
    }

    @Test
    fun `capabilities が readonly を立てる（起動した証拠）`() {
        val response = get("/backend/file/?action=capabilities")

        assertThat(response.statusCode()).isEqualTo(200)
        assertThat(String(response.body(), StandardCharsets.UTF_8))
            .isEqualTo("""{"readonly":true,"introspection":false,"ai":false}""")
    }

    private fun get(path: String): HttpResponse<ByteArray> =
        HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://localhost:$port$path")).GET().build(),
            HttpResponse.BodyHandlers.ofByteArray(),
        )

    private fun post(path: String, body: String): HttpResponse<ByteArray> =
        HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://localhost:$port$path"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build(),
            HttpResponse.BodyHandlers.ofByteArray(),
        )

    companion object {
        /** **作らない。** 親だけ作って、その下の名前を渡す（mount を忘れたコンテナと同じ形）。 */
        @JvmStatic
        val parent: Path = Files.createTempDirectory("grabado-missing-")

        @JvmStatic
        val schemaDir: Path = parent.resolve("schema")

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("grabado.schema-dir") { schemaDir.toString() }
            registry.add("grabado.readonly") { "true" }
        }

        @JvmStatic
        @AfterAll
        @OptIn(ExperimentalPathApi::class)
        fun cleanup(): Unit = parent.deleteRecursively()
    }
}
