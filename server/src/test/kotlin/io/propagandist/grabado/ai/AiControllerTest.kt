package io.propagandist.grabado.ai

import io.propagandist.grabado.config.AiProperties
import io.propagandist.grabado.config.GrabadoProperties
import jakarta.servlet.ReadListener
import jakarta.servlet.ServletInputStream
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.nio.charset.StandardCharsets
import java.nio.file.Path

/**
 * `POST /api/ai/review` が **body をどこまで読むか**を見る（#273）。
 *
 * save（`DesignController`、#215）は上限 + 1 バイトまでしか読まない。AI も同じにする ——
 * **全部読んでから大きさを見ると、上限はメモリを守らない**。さらに **「使えるか」は body を
 * 1 バイトも読まずに決まる**（キー・モデル名・実装の有無だけで決まる）ので、使えないなら
 * 読む前に断る。
 *
 * status の写像は [AiContractTest] が契約表で見る。ここが見るのは**読んだバイト数**で、
 * 契約表（1 リクエスト 1 レスポンス）には書けない。
 */
class AiControllerTest {

    private val mapper = JsonMapper()

    private val minimal =
        """{"aiRequestVersion":1,"dialect":"postgresql","tables":[{"name":"t"}]}"""
            .toByteArray(StandardCharsets.UTF_8)

    /** 読まれたバイト数を数える入力。`readAllBytes` / `readNBytes` はどちらも下の 2 つを通る。 */
    private class CountingInput(private val bytes: ByteArray) : ServletInputStream() {
        var consumed = 0
            private set

        override fun read(): Int =
            if (consumed >= bytes.size) -1 else bytes[consumed++].toInt() and 0xff

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (len == 0) return 0
            if (consumed >= bytes.size) return -1
            val n = minOf(len, bytes.size - consumed)
            System.arraycopy(bytes, consumed, b, off, n)
            consumed += n
            return n
        }

        override fun isFinished(): Boolean = consumed >= bytes.size
        override fun isReady(): Boolean = true
        override fun setReadListener(listener: ReadListener?): Unit = throw UnsupportedOperationException()
    }

    private class Request(val input: CountingInput) : MockHttpServletRequest("POST", "/api/ai/review") {
        override fun getInputStream(): ServletInputStream = input
    }

    private class Stub(private val mapper: JsonMapper) : SuggestionSource {
        override fun review(request: JsonNode): List<JsonNode> =
            listOf(mapper.readTree("""{"category":"naming","severity":"info"}"""))
    }

    private fun controller(ai: AiProperties, source: SuggestionSource? = Stub(mapper)) =
        AiController(AiReviewService(GrabadoProperties(schemaDir = Path.of("."), ai = ai), source))

    private fun enabled(maxRequestBytes: Int = 256 * 1024) =
        AiProperties(apiKey = "test-key", model = "test-model", maxRequestBytes = maxRequestBytes)

    @Test
    fun `使えないなら body を 1 バイトも読まずに断る（キーが無い）`() {
        val request = Request(CountingInput(ByteArray(10_000) { 'x'.code.toByte() }))

        assertThatThrownBy { controller(AiProperties(model = "test-model")).review(request) }
            .isInstanceOf(AiUnavailableException::class.java)
        assertThat(request.input.consumed).describedAs("読んだバイト数").isZero()
    }

    @Test
    fun `使えないなら body を 1 バイトも読まずに断る（実装が無い）`() {
        val request = Request(CountingInput(ByteArray(10_000) { 'x'.code.toByte() }))

        assertThatThrownBy { controller(enabled(), source = null).review(request) }
            .isInstanceOf(AiUnavailableException::class.java)
        assertThat(request.input.consumed).describedAs("読んだバイト数").isZero()
    }

    @Test
    fun `上限を超える body は、上限 + 1 バイトまでしか読まない`() {
        val request = Request(CountingInput(ByteArray(10_000) { 'x'.code.toByte() }))

        assertThatThrownBy { controller(enabled(maxRequestBytes = 16)).review(request) }
            .isInstanceOf(AiTooLargeException::class.java)
        assertThat(request.input.consumed).describedAs("読んだバイト数").isEqualTo(17)
    }

    @Test
    fun `上限ちょうどの body は読み切って通す`() {
        // 境界の片側。「上限 + 1 まで読む」を「上限まで読む」と取り違えると、ここが 413 になる
        val request = Request(CountingInput(minimal))

        val response = controller(enabled(maxRequestBytes = minimal.size)).review(request)

        assertThat(response.statusCode.value()).isEqualTo(200)
        assertThat(response.body).hasSize(1)
        assertThat(request.input.consumed).isEqualTo(minimal.size)
    }
}
