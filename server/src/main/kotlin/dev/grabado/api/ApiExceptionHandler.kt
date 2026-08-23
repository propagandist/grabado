package dev.grabado.api

import dev.grabado.ai.AiBadRequestException
import dev.grabado.ai.AiRateLimitedException
import dev.grabado.ai.AiUnavailableException
import dev.grabado.ai.AiUpstreamException
import dev.grabado.design.InvalidDesignNameException
import dev.grabado.design.PreconditionFailedException
import dev.grabado.design.ReadOnlyException
import dev.grabado.introspect.IntrospectionFailedException
import dev.grabado.introspect.UnknownSourceException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

/**
 * 例外 → HTTP status の**唯一の表**。
 *
 * ★ 段階5-1b が新しく返す status は **400 だけ**。§5 が最終的に増やすのは
 *   400 / 403 / 412 / 413 で、**そのどれも `js/io.ts` の `check()`（201/404/500/501/503）に
 *   無く、`default: return true` で「成功」に倒れる**。status を増やす PR では
 *   `check()` と `locale` を**同じ PR で**広げること（分けると無言で成功扱いの期間が
 *   できる＝ CLAUDE.md 制約1 違反）。
 *
 *   5-1b で 400 を足しても既存フロントに影響しないのは、`js/io.ts` の `jsonKeyword()` が
 *   必ず `keyword` を付けるので**そもそも到達しない**から。最初に人の目に触れるのは 5-2。
 */
@RestControllerAdvice
class ApiExceptionHandler {

    /** `keyword` が受け取れない形（[dev.grabado.design.NameRejection]）。body は返さない。 */
    @ExceptionHandler(InvalidDesignNameException::class)
    fun invalidName(e: InvalidDesignNameException): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).build()

    /**
     * `grabado.readonly` が真のデプロイで副作用を求められた（段階5-3）。
     *
     * **403**（このデプロイでは禁止）であって 501（実装が無い）でも 503（一時的に不能）でもない。
     * 詳細は [ReadOnlyException] の KDoc。
     */
    @ExceptionHandler(ReadOnlyException::class)
    fun readOnly(): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).build()

    /**
     * 条件付き更新の前提が崩れていた（段階5-4）。
     *
     * ★ **412 は `js/io.ts` の `check()` に通さない。** フロントが握って confirm に流す
     * （プリフライトの 404 を通さないのと同じ理屈）——「衝突したので上書きするか？」は
     * エラー表示ではなく**分岐**だから。
     */
    @ExceptionHandler(PreconditionFailedException::class)
    fun preconditionFailed(): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.PRECONDITION_FAILED).build()

    /**
     * `?action=import&database=<name>` の名前が env の表に無い（段階5-7a）。
     *
     * **404**（「そのデータベースはここに無い」）。接続先が 1 つも設定されていない場合も同じ ——
     * 「設定していない」と「その名前が無い」を外から区別させない。
     */
    @ExceptionHandler(UnknownSourceException::class)
    fun unknownSource(): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).build()

    /**
     * introspection の接続や読み取りに失敗（段階5-7a）。
     *
     * **503**。意味論では 502 が近いが、`js/io.ts` の `check()` が文言を持つのは 501 / 503 だけで
     * **502 は素通しして無反応になる**。現行 PHP の実測も 503 だった。
     *
     * ★ **例外の中身を body に出さない。** JDBC の例外メッセージには URL や接続情報が入りうる
     * （org security-baseline §4.5）。
     */
    @ExceptionHandler(IntrospectionFailedException::class)
    fun introspectionFailed(): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build()

    /**
     * AI が使えないデプロイで `POST /api/ai/review` を呼ばれた（段階11-2a）。
     *
     * **403**。READONLY / キー未設定 / モデル名未設定 / 実装が無い を**区別させない** ——
     * どれも「このデプロイでは禁止されている」で、5-3 と同じ扱い。
     */
    @ExceptionHandler(AiUnavailableException::class)
    fun aiUnavailable(): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).build()

    /**
     * AI への入力が壊れている・大きすぎる（段階11-2a）。
     *
     * **400**（413 ではない —— `check()` が 413 を持たないので 5-1c で足した 400 に寄せる）。
     * ★ **message を body に出さない。** 入力の断片が載りうる。
     */
    @ExceptionHandler(AiBadRequestException::class)
    fun aiBadRequest(): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).build()

    /**
     * AI の受付上限に当たった（段階11-2a）。
     *
     * ★ **429 は `js/io.ts` の `check()` に無い status。** 増やす PR で `check()` と `locale` を
     * 同じ PR で広げるのが上の規律だが、**11-2a はフロントが `/api/ai/review` を 1 度も
     * 呼ばないので、この status がフロントに届く経路が無い**（5-1b で 400 を足したときと同じ形）。
     * 配線と同時に広げるのが 11-3 で、そこが `case 429` と `http429` を持つ。
     *
     * **503 に倒さない** —— 待てば通るものを故障に見せない。
     */
    @ExceptionHandler(AiRateLimitedException::class)
    fun aiRateLimited(): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build()

    /**
     * 上流の AI 呼び出しが失敗した（段階11-2a）。
     *
     * **503**。[IntrospectionFailedException] と同じ扱いで、★ **例外の中身を body に出さない**
     * —— API キーやリクエスト内容が上流のエラーに載りうる。
     */
    @ExceptionHandler(AiUpstreamException::class)
    fun aiUpstream(): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build()
}
