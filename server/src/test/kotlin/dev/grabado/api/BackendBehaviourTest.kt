package dev.grabado.api

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
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
 * 契約表（`tests/contract/backend-cases.json`）が「1 リクエスト 1 レスポンス」では
 * 表せないもの。**副作用の有無**と**往復**がここに来る。
 *
 * @see BackendContractTest 表そのものを流すほう
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BackendBehaviourTest {

    @Value("\${local.server.port}")
    private var port: Int = 0

    @BeforeEach
    fun clean() {
        Files.newDirectoryStream(schemaDir).use { stream -> stream.forEach(Files::delete) }
    }

    @Test
    fun `save したものが load でバイト一致して返る`() {
        val body = "{\"formatVersion\":2,\"db\":\"postgresql\",\"tables\":[]}\n"

        val saved = post("save", "orders.json", body)
        assertThat(saved.statusCode()).isEqualTo(201)

        val loaded = get("load", "orders.json")
        assertThat(loaded.statusCode()).isEqualTo(200)
        assertThat(String(loaded.body(), StandardCharsets.UTF_8)).isEqualTo(body)
    }

    @Test
    fun `save したものが list に現れる`() {
        post("save", "orders.json", "{}")
        post("save", "articles.json", "{}")

        val listed = String(get("list", null).body(), StandardCharsets.UTF_8)
        assertThat(listed).isEqualTo("articles.json\norders.json\n")
    }

    @Test
    fun `日本語の keyword が URL エンコードで往復する`() {
        // MockMvc では素通りしてしまうサーブレットコンテナの URL デコード層を、実サーバで通す。
        post("save", "受注.json", "{\"ja\":true}")

        assertThat(String(get("load", "受注.json").body(), StandardCharsets.UTF_8)).isEqualTo("{\"ja\":true}")
        assertThat(Files.exists(schemaDir.resolve("受注.json"))).isTrue()
    }

    @Test
    fun `トラバーサルは 400 で、正本ディレクトリの外にも中にもファイルを作らない`() {
        val response = post("save", "../escaped.json", "{}")

        assertThat(response.statusCode()).isEqualTo(400)
        assertThat(Files.exists(schemaDir.parent.resolve("escaped.json"))).isFalse()
        assertThat(Files.newDirectoryStream(schemaDir).use { it.toList() }).isEmpty()
    }

    @Test
    fun `パスの backend 名はファイルシステムに到達しない`() {
        // <backend名> を変えても同じ正本ディレクトリを見る。ディレクトリも作らない。
        post("save", "orders.json", "{}", backend = "php-mysql")
        val viaOtherBackend = get("load", "orders.json", backend = "php-file")

        assertThat(viaOtherBackend.statusCode()).isEqualTo(200)
        assertThat(Files.exists(schemaDir.resolve("php-file"))).isFalse()
    }

    @Test
    fun `body は解釈されない（壊れた JSON もそのまま保存されて返る）`() {
        // 「backend は内容を一切解釈しない」は実測契約。@RequestBody を使わず
        // inputStream を直読みしているのはこのため（Content-Type にも依存しない）。
        val broken = "{ this is not json at all "
        post("save", "broken.json", broken)

        assertThat(String(get("load", "broken.json").body(), StandardCharsets.UTF_8)).isEqualTo(broken)
    }

    @Test
    fun `空の body も保存できる`() {
        assertThat(post("save", "empty.json", "").statusCode()).isEqualTo(201)
        assertThat(get("load", "empty.json").statusCode()).isEqualTo(200)
        assertThat(get("load", "empty.json").body()).isEmpty()
    }

    @Test
    fun `load が ETag を返し、同じ内容なら同じ値になる`() {
        // 段階5-4。内容の SHA-256 なので、mtime が動いても（git checkout / pull）値は変わらない。
        post("save", "orders.json", "{\"v\":1}")
        val first = get("load", "orders.json").headers().firstValue("ETag")
        post("save", "same.json", "{\"v\":1}")
        val second = get("load", "same.json").headers().firstValue("ETag")

        assertThat(first).isPresent()
        assertThat(first.get()).startsWith("\"").endsWith("\"")
        assertThat(second).hasValue(first.get())
    }

    @Test
    fun `内容が変われば ETag も変わる`() {
        post("save", "orders.json", "{\"v\":1}")
        val before = get("load", "orders.json").headers().firstValue("ETag").get()
        post("save", "orders.json", "{\"v\":2}")
        val after = get("load", "orders.json").headers().firstValue("ETag").get()

        assertThat(after).isNotEqualTo(before)
    }

    @Test
    fun `save も新しい ETag を返す（load し直さずに baseline を更新できる）`() {
        val saved = post("save", "orders.json", "{\"v\":1}")
        val loaded = get("load", "orders.json")

        assertThat(saved.headers().firstValue("ETag")).hasValue(loaded.headers().firstValue("ETag").get())
    }

    @Test
    fun `一致する If-Match なら通り、その後は古い ETag が弾かれる`() {
        // これが「save を 1 往復にする」の実体。プリフライトの load を投げずに、
        // 前回観測した etag を条件として載せるだけでよくなる。
        post("save", "orders.json", "{\"v\":1}")
        val etag = get("load", "orders.json").headers().firstValue("ETag").get()

        val ok = post("save", "orders.json", "{\"v\":2}", ifMatch = etag)
        assertThat(ok.statusCode()).isEqualTo(201)

        // 同じ etag をもう一度使うと、内容が変わっているので 412。
        val stale = post("save", "orders.json", "{\"v\":3}", ifMatch = etag)
        assertThat(stale.statusCode()).isEqualTo(412)
        assertThat(String(get("load", "orders.json").body(), StandardCharsets.UTF_8)).isEqualTo("{\"v\":2}")
    }

    @Test
    fun `412 のとき内容は 1 バイトも書き換わらない`() {
        post("save", "orders.json", "{\"v\":1}")

        val rejected = post("save", "orders.json", "{\"v\":999}", ifMatch = "\"deadbeef\"")

        assertThat(rejected.statusCode()).isEqualTo(412)
        assertThat(String(get("load", "orders.json").body(), StandardCharsets.UTF_8)).isEqualTo("{\"v\":1}")
    }

    @Test
    fun `セキュリティヘッダが全応答に付く`() {
        val response = get("list", null)

        assertThat(response.headers().firstValue("X-Content-Type-Options")).hasValue("nosniff")
        assertThat(response.headers().firstValue("Referrer-Policy")).hasValue("no-referrer")
        assertThat(response.headers().firstValue("X-Frame-Options")).hasValue("DENY")
    }

    @Test
    fun `プリフライト load から save までの往復が段階4-6 の流れどおり動く`() {
        // フロント（js/io/conflict.ts）は save の前に同じ keyword で load を投げる。
        // 新規なら 404（正常系）→ save。既存なら 200 でバイト列を比べてから save。
        assertThat(get("load", "orders.json").statusCode()).isEqualTo(404)
        assertThat(post("save", "orders.json", "{\"v\":1}").statusCode()).isEqualTo(201)

        val preflight = get("load", "orders.json")
        assertThat(preflight.statusCode()).isEqualTo(200)
        assertThat(String(preflight.body(), StandardCharsets.UTF_8)).isEqualTo("{\"v\":1}")
        assertThat(post("save", "orders.json", "{\"v\":2}").statusCode()).isEqualTo(201)
    }

    private fun get(action: String, keyword: String?, backend: String = "php-mysql") =
        send(HttpRequest.newBuilder(uri(action, keyword, backend)).GET().build())

    private fun post(
        action: String,
        keyword: String?,
        body: String,
        backend: String = "php-mysql",
        ifMatch: String? = null,
    ) = send(
        HttpRequest.newBuilder(uri(action, keyword, backend))
            .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray(StandardCharsets.UTF_8)))
            .apply { if (ifMatch != null) header("If-Match", ifMatch) }
            .build(),
    )

    private fun uri(action: String, keyword: String?, backend: String): URI {
        val query = buildString {
            append("action=").append(action)
            if (keyword != null) {
                append("&keyword=").append(URLEncoder.encode(keyword, StandardCharsets.UTF_8))
            }
        }
        return URI.create("http://127.0.0.1:$port/backend/$backend/?$query")
    }

    private fun send(request: HttpRequest): HttpResponse<ByteArray> =
        http.send(request, HttpResponse.BodyHandlers.ofByteArray())

    companion object {
        @JvmStatic
        val schemaDir: Path = Files.createTempDirectory("grabado-behaviour-")

        private val http: HttpClient = HttpClient.newHttpClient()

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("grabado.schema-dir") { schemaDir.toString() }
        }

        @JvmStatic
        @AfterAll
        @OptIn(ExperimentalPathApi::class)
        fun cleanup(): Unit = schemaDir.deleteRecursively()
    }
}
