package dev.grabado.api

import dev.grabado.design.InvalidDesignNameException
import dev.grabado.design.ReadOnlyException
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
}
