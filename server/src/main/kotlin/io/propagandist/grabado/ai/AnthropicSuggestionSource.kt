package io.propagandist.grabado.ai

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.errors.RateLimitException
import com.anthropic.models.messages.CacheControlEphemeral
import com.anthropic.models.messages.JsonOutputFormat
import com.anthropic.models.messages.Message
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.TextBlockParam
import io.propagandist.grabado.config.GrabadoProperties
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/**
 * 上流（Anthropic API）を実際に叩く [SuggestionSource]（段階11-2b）。
 *
 * ★ **READONLY のときは Bean ごと存在しない**（`@ConditionalOnProperty`）。[AiReviewService] と
 *   同じ形で、**外部ホストへ出る唯一の経路をまるごと消す**のがいちばん確実。
 *
 * ★ **キーが空でも Bean は作る。** 判定は `AiReviewService.isConfigured()` の 1 か所に集め、
 *   ここでは持たない（同じ判断が 2 か所に分かれると片方だけ直す事故ができる）。クライアントは
 *   `by lazy` なので、**キーが無ければ 1 度も生成されない**。
 *
 * ## 送るもの
 *
 * - **system は [Rubric] の定数 1 つだけ。** `cache_control` を置いてプレフィックスを固定する
 *   —— dialect ごとに切り替えないのは、1 バイト動くとキャッシュが無効になるため（決めたこと 8）
 * - **user は `aiRequestVersion: 1` の JSON をそのまま。** 設計ファイルでも introspection JSON
 *   でもない 3 つ目の形式で、座標を持たず型は SQL 名（§8.2）
 * - **出力は [ReviewSchema] で拘束する。** 自由テキストを 1 バイトもパースしない（制約7）
 *
 * ## 例外の写像
 *
 * 上流の 429 は**自分の 429 に写す**（`AiRateLimitedException`）—— 待てば通るものを故障に
 * 見せない。それ以外とタイムアウトは 503（`AiUpstreamException`）。
 *
 * ★ **SDK の例外 message を body にもログにも出さない。** URL・ヘッダ・リクエストの断片を
 *   含みうる（org security-baseline §5.2「エラー応答に鍵の一部を含める」）。出すのは
 *   **例外の型名だけ**。
 */
@Service
@ConditionalOnProperty(name = ["grabado.readonly"], havingValue = "false", matchIfMissing = true)
class AnthropicSuggestionSource(
    private val properties: GrabadoProperties,
) : SuggestionSource {

    private val log = LoggerFactory.getLogger(javaClass)
    private val mapper = JsonMapper()

    /**
     * 起動時に解決する（env が壊れていたら**その場で落とす**）。
     *
     * 空なら上流の既定に任せる。**黙って別の深さで走らせない** —— 費用が理由なく動く。
     */
    private val effort: OutputConfig.Effort? = parseEffort(properties.ai.effort)

    /** キーが空のときに作らないよう遅延させる（`isConfigured()` が false なら 1 度も呼ばれない）。 */
    private val client: AnthropicClient by lazy {
        AnthropicOkHttpClient.builder()
            .apiKey(properties.ai.apiKey)
            .timeout(properties.ai.timeout)
            .build()
    }

    override fun review(request: JsonNode): List<JsonNode> {
        val message = try {
            client.messages().create(params(request))
        } catch (e: RateLimitException) {
            /* 上流の 429 は自分の 429 に写す（503 に倒さない） */
            throw AiRateLimitedException("上流のレート制限（${e.javaClass.simpleName}）")
        } catch (e: Exception) {
            throw AiUpstreamException(e)
        }

        report(message)
        return extract(message)
    }

    private fun params(request: JsonNode): MessageCreateParams {
        val output = OutputConfig.builder()
            .format(JsonOutputFormat.builder().schema(ReviewSchema.asJsonValue()).build())
        if (effort != null) {
            output.effort(effort)
        }

        return MessageCreateParams.builder()
            /* ★ String オーバーロード。Model の定数を使うとモデル名の焼き込みになる（決めたこと 7） */
            .model(properties.ai.model)
            .maxTokens(MAX_TOKENS)
            .systemOfTextBlockParams(
                listOf(
                    TextBlockParam.builder()
                        .text(Rubric.SYSTEM)
                        .cacheControl(CacheControlEphemeral.builder().build())
                        .build(),
                ),
            )
            .outputConfig(output.build())
            .addUserMessage(request.toString())
            .build()
    }

    /**
     * 使った量をログに出す（org security-baseline §5.2「利用者ごとの使用量を数えない」への答え）。
     *
     * **費用の実測もここから採る**（`CUSTOMIZATIONS.md` の段階11-2b）。
     */
    private fun report(message: Message) {
        val usage = message.usage()
        log.info(
            "ai review: input={} output={} cacheWrite={} cacheRead={} stop={}",
            usage.inputTokens(),
            usage.outputTokens(),
            usage.cacheCreationInputTokens().orElse(0),
            usage.cacheReadInputTokens().orElse(0),
            message.stopReason().map { it.toString() }.orElse("-"),
        )
    }

    /**
     * 応答から提案の配列を取り出す。
     *
     * structured outputs が効いているので text ブロックは**スキーマに拘束された JSON**。
     * それでも読めなければ 503 にする —— `refusal`（安全上の拒否）と `max_tokens`（途中で
     * 切れた）はスキーマに従わないことがあり、**そのときは「提案が得られなかった」が正しい**。
     */
    private fun extract(message: Message): List<JsonNode> {
        val text = message.content()
            .mapNotNull { block -> block.text().orElse(null)?.text() }
            .joinToString("")
        if (text.isBlank()) {
            throw AiUpstreamException(IllegalStateException("応答に本文が無い"))
        }

        val root = try {
            mapper.readTree(text)
        } catch (e: Exception) {
            throw AiUpstreamException(e)
        }
        val suggestions = root.path(ReviewSchema.ROOT_PROPERTY)
        if (!suggestions.isArray) {
            throw AiUpstreamException(IllegalStateException("${ReviewSchema.ROOT_PROPERTY} が配列ではない"))
        }
        return buildList { for (one in suggestions) add(one) }
    }

    private fun parseEffort(name: String): OutputConfig.Effort? = when (name.trim().lowercase()) {
        "" -> null
        "low" -> OutputConfig.Effort.LOW
        "medium" -> OutputConfig.Effort.MEDIUM
        "high" -> OutputConfig.Effort.HIGH
        "xhigh" -> OutputConfig.Effort.XHIGH
        "max" -> OutputConfig.Effort.MAX
        else -> error("grabado.ai.effort が不正: $name（low / medium / high / xhigh / max か空）")
    }

    private companion object {
        /**
         * 出力の上限。**提案 10 件と thinking が収まる大きさ**にしてある。
         *
         * 足りないと `stop_reason: max_tokens` で途中で切れ、スキーマに従わない JSON が返る
         * （[extract] が 503 にする）。ストリーミングにしないのは、この大きさなら HTTP の
         * タイムアウトに当たらないため。
         */
        const val MAX_TOKENS: Long = 16000
    }
}
