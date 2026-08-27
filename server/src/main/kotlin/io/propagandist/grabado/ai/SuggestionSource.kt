package io.propagandist.grabado.ai

import tools.jackson.databind.JsonNode

/**
 * 提案を作る側の境界（段階11-2a）。
 *
 * ## main にはインタフェースしか置かない
 *
 * 実装（Anthropic API を実際に叩くもの）は **11-2b で入る**。固定応答を返すスタブを main に
 * 置かないのは、消し忘れると「**AI が動いているように見えて実は固定**」が本番に載るため ——
 * スタブはテスト側にだけ置く。実装 Bean が 1 つも無ければ [AiReviewService] は「使えない」に
 * 倒れ、`capabilities.ai` も false のままになる。**実装があっても使えないなら false**（5-7a）の
 * 裏返しで、実装が無いならなおさら false。
 *
 * ## 提案の中身を型に写さない
 *
 * 返すのは [JsonNode] の配列で、backend は 1 フィールドも解釈しない。**適用は
 * `js/io/ai/apply-patch.ts` の純関数が持ち、ここは運ぶだけ。** 型に写すと patch の 8 op の
 * union が Kotlin と TypeScript の 2 か所に生まれ、片方だけ動かす事故ができる
 * （5-0 の決めたこと 3「backend に型パレットを持たせない」と同じ理屈で、**持たせた瞬間に
 * 写しができる**）。形の保証は 11-2b の structured outputs —— スキーマは定数として持ち、
 * 動的に組み立てない（段階11-0 の決めたこと 1）。
 */
fun interface SuggestionSource {

    /**
     * 設計を見て提案を作る。
     *
     * @param request `aiRequestVersion: 1`（[AiRequestCheck] が形を確かめたもの）
     * @return 提案の配列。**0 件もありうる**（指摘が無い設計は正常）
     * @throws AiUpstreamException 上流の失敗・タイムアウト（HTTP 503）
     */
    fun review(request: JsonNode): List<JsonNode>
}
