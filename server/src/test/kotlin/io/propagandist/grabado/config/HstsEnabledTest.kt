package io.propagandist.grabado.config

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
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteRecursively

/**
 * `GRABADO_HSTS=true` で起動したサーバが、実際に 1 本余分に出すこと（issue #84）。
 *
 * HSTS は**サーバの起動条件**なので同じインスタンスでは試せない——`ReadOnlyContractTest` を
 * 別に持っているのと同じ理由で、**出る側だけをここで起こす**。**出ない側（既定）は
 * `BackendBehaviourTest` が見る**ので、両方が同じ場所に無いことに意味がある。
 *
 * ★ **公開デモの受け入れ基準そのもの**（issue #84）——「`Strict-Transport-Security` が
 *   出ている。**`preload` が付いていない**」。値の中身は [HstsTest] が持ち、
 *   ここが見るのは**実 HTTP に載ること**だけである。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HstsEnabledTest {

    @Value("\${local.server.port}")
    private var port: Int = 0

    @Test
    fun `HSTS が出る`() {
        assertThat(get("/backend/file/?action=capabilities").headers()
            .firstValue(SecurityHeadersFilter.STRICT_TRANSPORT_SECURITY))
            .hasValue(SecurityHeadersFilter.HSTS)
    }

    /**
     * **ヘッダが落ちるのは、たいてい正常系ではない経路。** 404 にも付いていること——
     * 段階2-4 が `Cache-Control` について同じ確かめ方をしている。
     */
    @Test
    fun `異常系の応答にも付く`() {
        assertThat(get("/does-not-exist").headers()
            .firstValue(SecurityHeadersFilter.STRICT_TRANSPORT_SECURITY))
            .hasValue(SecurityHeadersFilter.HSTS)
    }

    /** 共通の 5 本を追い出していないこと（1 本足す変更が、他を消していない）。 */
    @Test
    fun `共通の 5 本は残っている`() {
        val response = get("/backend/file/?action=capabilities")
        SecurityHeadersFilter.HEADERS.forEach { (name, value) ->
            assertThat(response.headers().firstValue(name))
                .describedAs("%s が消えている", name)
                .hasValue(value)
        }
    }

    private fun get(path: String): HttpResponse<ByteArray> =
        HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://localhost:$port$path")).GET().build(),
            HttpResponse.BodyHandlers.ofByteArray(),
        )

    companion object {
        @JvmStatic
        val schemaDir: Path = Files.createTempDirectory("grabado-hsts-")

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("grabado.schema-dir") { schemaDir.toString() }
            registry.add("grabado.hsts") { "true" }
        }

        @JvmStatic
        @AfterAll
        @OptIn(ExperimentalPathApi::class)
        fun cleanup(): Unit = schemaDir.deleteRecursively()
    }
}
