package io.propagandist.grabado.ai

import com.anthropic.core.JsonValue
import com.anthropic.core.http.Headers
import com.anthropic.core.jsonMapper
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.InternalServerException
import com.anthropic.errors.RateLimitException
import com.anthropic.models.messages.Message
import io.propagandist.grabado.config.AiProperties
import io.propagandist.grabado.config.GrabadoProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Import
import java.nio.file.Path

/**
 * [AnthropicSuggestionSource] のうち、**上流に出ずに済む部分**を覆う（#180）。
 *
 * [AnthropicIntegrationTest] は実キーが要る opt-in で、しかも正常系しか踏まない。
 * ここが持つのは「**そう作った**」ことが判断の中心なのに、どこからも通っていなかった 3 つ:
 *
 * - **応答から提案を取り出せなければ 503**（`refusal` や `max_tokens` はスキーマに従わないことがある）
 * - **上流の 429 は自分の 429**（待てば通るものを故障に見せない）。**それ以外は 503**
 * - **`effort` が不正なら起動しない**（黙って別の深さで走らせると、費用が理由なく動く）
 *
 * ★ **キーを空にしてあるので、クライアントは 1 度も作られない**（`by lazy`）。
 *   ここから上流に出る経路は無い。
 */
class AnthropicSuggestionSourceTest {

    private val source = AnthropicSuggestionSource(
        GrabadoProperties(schemaDir = Path.of("."), ai = AiProperties()),
    )

    /**
     * 上流の応答と同じ JSON から [Message] を組む。
     *
     * ★ **builder を使わない。** `Message` の必須は 8 つ（`usage` がさらに 9 つ）で、SDK の版が
     *   上がって必須が増えるたびに**テストだけが壊れる**。JSON からなら、`extract` が読まない
     *   フィールドは足りなくても組める（SDK は読んだ瞬間に初めて検査する）。
     */
    private fun message(vararg blocks: Map<String, Any>): Message {
        val json = jsonMapper().writeValueAsString(
            mapOf(
                "id" to "msg_test",
                "type" to "message",
                "role" to "assistant",
                "model" to "test-model",
                "content" to blocks.toList(),
                "stop_reason" to "end_turn",
                "usage" to mapOf("input_tokens" to 1, "output_tokens" to 1),
            ),
        )
        return jsonMapper().readValue(json, Message::class.java)
    }

    private fun text(value: String): Map<String, Any> = mapOf("type" to "text", "text" to value)

    /* ------------------------- 応答から取り出す -------------------------- */

    @Test
    fun `スキーマどおりの本文なら、提案の配列をそのまま返す`() {
        // 503 の 3 本が「組み立てに失敗して落ちている」のではないことを、ここで先に確かめる
        val suggestions = source.extract(
            message(text("""{"suggestions":[{"category":"naming"},{"category":"missing_pk"}]}""")),
        )

        assertThat(suggestions.map { it.path("category").asString() })
            .containsExactly("naming", "missing_pk")
    }

    @Test
    fun `text ブロックが分かれていても、繋げて 1 つの JSON として読む`() {
        val suggestions = source.extract(message(text("""{"suggestions":"""), text("""[]}""")))

        assertThat(suggestions).isEmpty()
    }

    @Test
    fun `本文が無ければ 503（提案が得られなかった）`() {
        val empty = listOf(
            message(),
            message(text("")),
            message(text("   ")),
            message(mapOf("type" to "thinking", "thinking" to "考えた", "signature" to "sig")),
        )

        for (one in empty) {
            assertThatThrownBy { source.extract(one) }
                .describedAs(one.content().toString())
                .isInstanceOf(AiUpstreamException::class.java)
        }
    }

    @Test
    fun `JSON として読めなければ 503`() {
        // max_tokens で途中で切れた形と、自由文が返った形
        for (body in listOf("""{"suggestions":[{"category":"nam""", "提案はありません")) {
            assertThatThrownBy { source.extract(message(text(body))) }
                .describedAs(body)
                .isInstanceOf(AiUpstreamException::class.java)
        }
    }

    @Test
    fun `ルートの suggestions が配列でなければ 503`() {
        for (body in listOf("""{"suggestions":{}}""", """{"suggestions":null}""", "{}", "[]")) {
            assertThatThrownBy { source.extract(message(text(body))) }
                .describedAs(body)
                .isInstanceOf(AiUpstreamException::class.java)
        }
    }

    /* ------------------------- 例外の写像 -------------------------- */

    @Test
    fun `上流の 429 は自分の 429 に写す（503 に倒さない）`() {
        val upstream = RateLimitException.builder()
            .headers(Headers.builder().build())
            .body(JsonValue.from(mapOf("error" to mapOf("type" to "rate_limit_error", "message" to "SENTINEL"))))
            .build()

        assertThat(upstream.message)
            .describedAs("前提: SDK の message には本文が載る（載らないなら下の検査は何も見ていない）")
            .contains("SENTINEL")

        assertThatThrownBy { source.callUpstream { throw upstream } }
            .isInstanceOf(AiRateLimitedException::class.java)
            // ★ SDK の例外 message を持ち出さない。出すのは型名だけ（クラス KDoc）
            .hasMessageContaining("RateLimitException")
            .hasMessageNotContaining("SENTINEL")
    }

    @Test
    fun `429 以外の上流の失敗とタイムアウトは 503`() {
        val failures = listOf(
            InternalServerException.builder()
                .statusCode(500)
                .headers(Headers.builder().build())
                .body(JsonValue.from(mapOf<String, Any>()))
                .build(),
            AnthropicIoException("timeout"),
            IllegalStateException("SDK の外で起きた失敗"),
        )

        for (one in failures) {
            assertThatThrownBy { source.callUpstream { throw one } }
                .describedAs(one.javaClass.simpleName)
                .isInstanceOf(AiUpstreamException::class.java)
        }
    }

    @Test
    fun `上流が応答を返せば、そのまま通す`() {
        val ok = message(text("""{"suggestions":[]}"""))

        assertThat(source.callUpstream { ok }).isSameAs(ok)
    }

    /* ------------------------- 起動時の検査 -------------------------- */

    /**
     * **Bean の生成だけを起こす最小の文脈。** Web サーバも他の Bean も起こさない。
     * `grabado.ai.effort` が env（`GRABADO_AI_EFFORT`）から Bean に届く経路は、
     * 本番と同じ `@ConfigurationProperties` の束縛を通る。
     */
    @Configuration
    @EnableConfigurationProperties(GrabadoProperties::class)
    @Import(AnthropicSuggestionSource::class)
    class SourceOnly

    private fun runner(schemaDir: Path) = ApplicationContextRunner()
        .withUserConfiguration(SourceOnly::class.java)
        .withPropertyValues("grabado.schema-dir=$schemaDir")

    @Test
    fun `effort が不正なら起動しない`(@TempDir schemaDir: Path) {
        runner(schemaDir)
            .withPropertyValues("grabado.ai.effort=hgih")
            .run { context ->
                assertThat(context).hasFailed()
                assertThat(context.startupFailure)
                    .rootCause()
                    .hasMessageContaining("grabado.ai.effort")
                    .hasMessageContaining("hgih")
            }
    }

    @Test
    fun `effort が正しい値なら起動する（空と大文字も）`(@TempDir schemaDir: Path) {
        // 上の 1 本が「何を渡しても落ちる」で緑になっていないことを、同じ文脈で確かめる
        for (effort in listOf("", "low", "medium", "high", "xhigh", "max", "HIGH")) {
            runner(schemaDir)
                .withPropertyValues("grabado.ai.effort=$effort")
                .run { context ->
                    assertThat(context).describedAs("effort=[%s]", effort).hasNotFailed()
                    assertThat(context).hasSingleBean(AnthropicSuggestionSource::class.java)
                }
        }
    }

    @Test
    fun `effort の前後の空白は落とす`() {
        // withPropertyValues は値を trim するので、ここだけ文脈を通さず直接組む
        val properties = GrabadoProperties(schemaDir = Path.of("."), ai = AiProperties(effort = " High "))

        assertThatCode { AnthropicSuggestionSource(properties) }.doesNotThrowAnyException()
    }

    @Test
    fun `READONLY なら Bean ごと無い（不正な effort でも起動する）`(@TempDir schemaDir: Path) {
        // 外部ホストへ出る唯一の経路をまるごと消す（クラス KDoc）。消えていれば検査も走らない
        runner(schemaDir)
            .withPropertyValues("grabado.readonly=true", "grabado.ai.effort=hgih")
            .run { context ->
                assertThat(context).hasNotFailed()
                assertThat(context).doesNotHaveBean(AnthropicSuggestionSource::class.java)
            }
    }
}
