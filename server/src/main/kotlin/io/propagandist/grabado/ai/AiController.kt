package io.propagandist.grabado.ai

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode

/**
 * `POST /api/ai/review`（段階11-2a。契約は `docs/ARCHITECTURE.md` §8.1）。
 *
 * ★ **`/api/` を始めるのはここ。** `/backend/<name>/?action=` は upstream の語彙で、
 *   新機能を足す先ではない（5-0 で「REST 化は §5 ではやらない。`/api/` は §11 が始める」と
 *   決めてある）。将来の AI 機能は同じ名前空間の下に入る。
 *
 * ★ **body は生バイトで受ける。** 結果キャッシュの鍵が「送られてきたバイト列の SHA-256」
 *   （§8.5）なので、data class に写した時点で鍵の材料が失われる。`Content-Type` を要求しない
 *   のも同じ理由 —— 自前でパースするので見る必要が無く、**宣言だけして検査しないヘッダを
 *   増やさない**。
 *
 * ★ **`@RequestBody ByteArray` では受けられない**（段階11-5 で踏んだ）。ブラウザが送る
 *   `Content-Type: application/json` に対して **415 が返る** —— メッセージコンバータの
 *   選択がヘッダに依存するため。契約表のケースは Content-Type を送っていなかったので通り、
 *   **実 HTTP の E2E で初めて出た**。`HttpServletRequest` から直に読めば、宣言した契約
 *   （生バイトをそのまま受ける）と実装が一致する。再発防止として、契約表に
 *   `contentType` つきのケースを足してある。
 *
 * ★ **status を増やしたが `js/io.ts` の `check()` は広げていない。** 429 は §5 の語彙に無い
 *   新しい status で、`ApiExceptionHandler` の KDoc は「status を増やす PR では `check()` と
 *   `locale` を同じ PR で広げること」と書いている。ここでそれを守らないのは、**フロントが
 *   この URL を 1 度も呼ばないので 429 が `check()` に届く経路が無い**ため（5-1b で 400 を
 *   足したときと同じ形）。配線と同時に広げるのが 11-3 で、そこが `case 429` と `http429` を持つ。
 */
@RestController
@RequestMapping("/api/ai")
class AiController(
    /** READONLY のときは Bean ごと存在しないので、null なら 403（`DesignController` と同じ形）。 */
    private val service: AiReviewService? = null,
) {

    /**
     * 設計を見て提案を返す。
     *
     * - READONLY / キー未設定 / モデル名未設定 → **403**
     * - 入力が壊れている・大きすぎる → **400**
     * - 自分のレート制限 → **429**
     * - 上流の失敗・タイムアウト → **503**
     *
     * 返すのは提案の配列で、**backend は中身を 1 フィールドも解釈しない**
     * （[SuggestionSource] の KDoc）。適用は `js/io/ai/apply-patch.ts` の純関数。
     */
    @PostMapping("/review")
    fun review(request: HttpServletRequest): ResponseEntity<List<JsonNode>> {
        val upstream = service ?: throw AiUnavailableException()
        val body = request.inputStream.use { it.readAllBytes() }
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .body(upstream.review(body))
    }
}
