package io.propagandist.grabado.api

import io.propagandist.grabado.ai.AiReviewService
import io.propagandist.grabado.config.GrabadoProperties
import io.propagandist.grabado.design.DesignName
import io.propagandist.grabado.design.DesignStore
import io.propagandist.grabado.design.ReadOnlyException
import io.propagandist.grabado.introspect.IntrospectionModel
import io.propagandist.grabado.introspect.IntrospectionService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * 現行フロントが投げる URL をそのまま受ける層。**契約（status / ヘッダ / body）を持つのは
 * ここだけ**で、ファイル I/O は [DesignStore] に、名前の検証は [DesignName] に出してある。
 *
 * ## URL の形は 1 文字も変えない（段階5-1b）
 *
 * `<xhrpath>backend/<backend名>/?action=<action>` は実測どおり（ARCHITECTURE §4.2）。
 * **`{backend}` の値は読まない。** `CONFIG.DEFAULT_BACKEND` が `["php-mysql"]`（配列バグ）の
 * ままでも、`?backend=` に何を渡されても同じハンドラに届く。おかげで 5-1b は
 * **フロントを 1 行も触らずに**「Kotlin が実測契約を満たす」を証明できる。
 * `backend/file/` への固定とセレクタ撤去は 5-5。
 *
 * ★ `{backend}` は **ファイルシステムに絶対に到達させない**。ここで受けて捨てる。
 *
 * ## 実装上の 3 つの罠（どれもテストが無いと「緑なのに契約違反」で通る）
 *
 * 1. **末尾スラッシュ。** 実測 URL は `backend/php-file/?action=list` とディレクトリ末尾に
 *    `/` が付く。Spring Boot 3 以降は trailing slash match が既定 off なので、
 *    スラッシュ有無の 2 パターンを登録する。
 * 2. **未知 action の 501。** `params = "action=..."` の条件に当たらないリクエストを Spring は
 *    **404** で返す。条件なしのフォールバック（[fallback]）を置かないと契約違反になる。
 * 3. **save の body は `inputStream` から直読みする。** `js/oz.ts` は POST のとき
 *    `Content-Type: application/x-www-form-urlencoded` を立てた**あと**に呼び手の
 *    `application/json` を足しており、XHR の `setRequestHeader` は同名ヘッダを `, ` で
 *    連結する。`@RequestBody` は `MediaType.parseMediaType` を通るので、結合値だと
 *    **415 で全滅**する。直読みは「backend は body を解釈しない」という実測契約の直訳でもある。
 *
 * @see docs/ARCHITECTURE.md §4.3（実測）/ §7.1（到達点の差分表）
 */
@RestController
@RequestMapping(path = ["/backend/{backend}/", "/backend/{backend}"])
class DesignController(
    private val store: DesignStore,
    private val properties: GrabadoProperties,
    /**
     * introspection（段階5-7a）。**READONLY のときは Bean ごと存在しない**
     * （`IntrospectionService` の `ConditionalOnProperty`）ので、null なら 403 を返す。
     */
    private val introspection: IntrospectionService? = null,
    /**
     * AI proxy（段階11-2a）。**同じ形** —— READONLY のときは Bean ごと存在せず、
     * 実装（`SuggestionSource`）が無ければ `isConfigured()` が false になる。
     */
    private val aiReview: AiReviewService? = null,
) {

    /** 名前を `\n` 区切りで返す。**末尾にも改行**（実測）。空なら 0 バイト。 */
    @GetMapping(params = ["action=list"])
    fun list(): ResponseEntity<ByteArray> {
        val body = store.list().joinToString(separator = "") { "$it\n" }
        return ResponseEntity.ok()
            // 実測は `text/html`（PHP の既定で、指定していないだけ）。フロントは textarea に
            // 流すだけで Content-Type を見ないので、名乗るなら正直なほうを名乗る。
            .contentType(MediaType.parseMediaType("text/plain;charset=UTF-8"))
            .body(body.toByteArray(Charsets.UTF_8))
    }

    /**
     * 保存されたバイト列をそのまま返す。無ければ 404。
     *
     * Content-Type は **`application/octet-stream` ＋ `nosniff` ＋ `attachment`**。実測は
     * `text/xml` 固定だが、フロントは段階4-3b から `xml: true` を外して**中身の先頭 1 文字で
     * 判別**するので Content-Type を見ない。**つまり正直さのコストがゼロ**。一方ここは
     * 分類 B のリポジトリで**同一オリジンから任意のユーザー内容を返す唯一の経路**なので、
     * ブラウザで直接開いても描画されない形にしておく。
     */
    @GetMapping(params = ["action=load"])
    fun load(@RequestParam(required = false) keyword: String?): ResponseEntity<ByteArray> {
        val stored = store.load(DesignName.parse(keyword))
            ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok()
            // 段階5-4: 内容の SHA-256。フロントはこれを baseline として持ち、次の save に
            // If-Match で載せる（プリフライトの load が要らなくなる）。
            .eTag(stored.etag)
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment")
            .body(stored.bytes)
    }

    /**
     * body をそのまま書き、**201 Created** と空 body を返す。
     *
     * 201 を維持するのは、`locale` の `http201` が `Saved` で **21 言語ぶん訳されている**から。
     * 200 に倒すと `js/io.ts` の `check()` が黙り、**アプリ唯一の保存完了通知が消える**。
     */
    @PostMapping(params = ["action=save"])
    fun save(
        @RequestParam(required = false) keyword: String?,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) ifMatch: String?,
        @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) ifNoneMatch: String?,
        request: HttpServletRequest,
    ): ResponseEntity<Void> {
        val name = DesignName.parse(keyword)
        val bytes = request.inputStream.use { it.readAllBytes() }
        /*
         * 段階5-4: 条件ヘッダがあれば「読む → 比べる → 書く」を store 側のロックで囲んで
         * 評価する。不一致は 412。**条件ヘッダを送らない既存フロントは今までどおり上書きできる**
         * （5-4a は backend 先行。428 に締めるのはフロントが送るようになってから）。
         */
        val etag = store.save(name, bytes, ifMatch, ifNoneMatch)
        return ResponseEntity.status(HttpStatus.CREATED).eTag(etag).build()
    }

    /**
     * このデプロイで何ができるか（段階5-5）。
     *
     * フロントは起動時に 1 回引いて、できないことのボタンを隠す。**引けなければ
     * 「全部できる」に倒す**ので、backend を起こしていない `npm run dev` 単体でも
     * 5-5 以前と同じ画面になる。
     */
    @GetMapping(params = ["action=capabilities"])
    fun capabilities(): ResponseEntity<Capabilities> =
        ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .body(
                Capabilities(
                    readonly = properties.readonly,
                    /*
                     * 接続先が 1 つも設定されていなければ false（段階5-7a）。READONLY のときは
                     * Bean ごと存在しないので、そちらでも false になる。
                     * **実装があっても使えないなら false** —— 押せるボタンを出して 404 を
                     * 踏ませない。
                     */
                    introspection = introspection?.isConfigured() == true,
                    /*
                     * キー設定済み ∧ モデル設定済み ∧ 実装がある（段階11-2a）。READONLY の
                     * ときは Bean ごと存在しないので、そちらでも false になる。
                     * **11-2a の時点では main に SuggestionSource の実装が無いので常に false**
                     * —— 実装が入るのは 11-2b（`SuggestionSource` の KDoc）。
                     */
                    ai = aiReview?.isConfigured() == true,
                ),
            )

    /**
     * 既存 DB を読んで設計にする（段階5-7a）。
     *
     * `?action=import&database=<name>` の `<name>` は **env に列挙した接続名**で、
     * ホスト名はクライアントから渡らない（SSRF を不可能にする）。
     *
     * - READONLY → **403**（[IntrospectionService] の Bean が存在しない）
     * - 表に無い名前 / 接続先が 0 件 → **404**
     * - 接続や読み取りの失敗 → **503**（`check()` が文言を持つのは 501 / 503 だけ）
     *
     * 返すのは**設計 JSON ではない** —— 座標を持たず、型は SQL の生の情報。
     * 解決はフロントの `TypePalette` が引き受ける（`docs/FORMAT.md` の最終節）。
     */
    @GetMapping(params = ["action=import"])
    fun import(@RequestParam(required = false) database: String?): ResponseEntity<IntrospectionModel> {
        val service = introspection ?: throw ReadOnlyException()
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .body(service.read(database))
    }

    /**
     * `params` 条件に当たらなかったリクエスト。
     *
     * - 既知の action に**違う HTTP メソッド**で来た → **405**（PHP は method を見ていなかった
     *   ので、これは強化＝意図した挙動変更）
     * - 未知の action・action 指定なし → **501**（実測どおり）
     *
     * `remove` もここに落ちて 501。**作らない**と決めてある（実在せず、フロントに削除 UI も無い）。
     */
    @RequestMapping
    fun fallback(@RequestParam(required = false) action: String?): ResponseEntity<Void> =
        when (action) {
            "list", "load", "save", "capabilities", "import" ->
                ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).build()

            else -> ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build()
        }
}
