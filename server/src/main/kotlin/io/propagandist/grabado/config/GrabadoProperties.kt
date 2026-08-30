package io.propagandist.grabado.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.nio.file.Path
import java.time.Duration

/**
 * grabado backend の設定。
 *
 * data class にしているのは**テストのため**。`GrabadoProperties(tempDir)` と書けば
 * Spring 文脈を 1 ミリも起動せずに [io.propagandist.grabado.design.FileDesignStore] を組める。
 * `System.getenv` の直読みだと JVM 内で値を差し替えられず、`@Value` だとフィールドに
 * 散って結局 Spring の起動を要求する。
 *
 * @property schemaDir 正本ディレクトリ。git 管理の設計 JSON が置かれ、save は
 *   ここへ write-through する（CLAUDE.md 制約2）。既定 `/data/schema` は
 *   コンテナの mount 先（HANDOVER §2.1）。
 * @property readonly 副作用（保存・introspection・AI）を止める。**公開デモは `true` 一択** ——
 *   AI は API 費用が自社負担、introspection は SSRF の踏み台になるため。
 *   落ちるのはその 3 つだけで、`list` / `load` は生きている（読み取りビューア）。
 *   編集ストアはブラウザ内なので、READONLY でも「読んで・描いて・DDL を出す」体験は
 *   完全に提供できる。
 * @property hsts `Strict-Transport-Security` を出すか（issue #84）。**既定は `false`。**
 *   TLS を終端するのは前段（公開デモは Railway）で、**アプリが見るのは平文の口**だから
 *   —— `request.isSecure` では判断できない。**「このデプロイは TLS の後ろにいる」と
 *   人が宣言する env** にしてある。既定で出すと、手元の `http://localhost:8080` を
 *   1 度開いたブラウザが**以後 localhost を https へ強制する**（HSTS はホスト名に効く。
 *   IP には効かない）—— 消すには利用者が自分でブラウザの設定を触るしかない。
 *   値と `preload` を付けない理由は [SecurityHeadersFilter.HSTS] にある。
 */
@ConfigurationProperties("grabado")
data class GrabadoProperties(
    val schemaDir: Path,
    val readonly: Boolean = false,
    val hsts: Boolean = false,
    val introspect: IntrospectProperties = IntrospectProperties(),
    val ai: AiProperties = AiProperties(),
)

/**
 * AI proxy の設定（段階11-2a）。契約は `docs/ARCHITECTURE.md` §8.4。
 *
 * **キーとモデル名が両方そろって初めて有効**（段階11-0 の決めたこと 7）。どちらも既定は空で、
 * **モデル名の既定値をここに書かない** —— 書けばそれが事実上の焼き込みになり、書いた日から
 * 古くなる。選び方は docs から引く（`docs/ARCHITECTURE.md` §8.4 のリンク）。
 *
 * **上限はサーバが持つ**（決めたこと 9）。API の費用が自社負担なので、クライアントの
 * 自己申告を上限にしない。**下の既定値は実測ではなく判断**で、根拠を各プロパティに書いた
 * —— 実測が要る 2 つ（タイムアウトと `effort`）は上流を実際に叩く 11-2b が決める。
 *
 * @property apiKey `ANTHROPIC_API_KEY`。**空なら AI は無効**（実質のオプトイン ——
 *   env にキーを入れる行為がそれ自体で同意になる。決めたこと 3）
 * @property model `GRABADO_AI_MODEL`。**空なら AI は無効**
 * @property maxTables 1 リクエストのテーブル数。**100** は house の実運用（数個〜十数個）を
 *   大きく超える値で、それ以上は分割して送るべきもの。超えたら 400
 * @property maxRequestBytes リクエスト body の上限。**256 KiB** は 100 テーブル × 2 KiB強 で、
 *   `maxTables` と同じ側から来た値。超えたら 400
 * @property ratePerMinute 1 分あたりの受付数。**10** は「人が画面から押す」速度の上限で、
 *   自動化された連打を止めるためのもの。超えたら 429
 * @property maxConcurrent 同時に上流へ流す数。**2**。単一コンテナのローカル運用が前提で、
 *   ここを増やしても速くならず費用の山だけが立つ
 * @property cacheEntries 結果キャッシュの上限件数。**プロセス内メモリのみ**（DB レス既定）
 * @property cacheTtl 結果キャッシュの寿命。**設計を直して測り直す**間隔より短くする
 * @property timeout 上流 1 回あたりの制限時間（段階11-2b）。**SDK の既定は 10 分**で、
 *   公開プロダクトのリクエストとしては長すぎる。**120 秒**は 11-2b の実測から
 *   （`CUSTOMIZATIONS.md` の段階11-2b に測った値がある）
 * @property effort 思考の深さ（`low` / `medium` / `high` / `xhigh` / `max`。段階11-2b）。
 *   **コストの主要な変数。** 空なら上流の既定に任せる。値が不正なら**起動時に落とす**
 *   —— 黙って別の深さで走らせると、費用が理由なく動く
 */
data class AiProperties(
    val apiKey: String = "",
    val model: String = "",
    val maxTables: Int = 100,
    val maxRequestBytes: Int = 256 * 1024,
    val ratePerMinute: Int = 10,
    val maxConcurrent: Int = 2,
    val cacheEntries: Int = 64,
    val cacheTtl: Duration = Duration.ofHours(1),
    val timeout: Duration = Duration.ofSeconds(120),
    val effort: String = "",
) {
    /** キーとモデル名が両方そろっているか。**片方だけなら無効**（決めたこと 7）。 */
    fun hasCredentials(): Boolean = apiKey.isNotBlank() && model.isNotBlank()
}

/**
 * introspection の接続先（段階5-7a）。**env に列挙したものしか使えない。**
 *
 * ```yaml
 * grabado:
 *   introspect:
 *     sources:
 *       shop: { url: "jdbc:postgresql://db:5432/app", user: ro, password: "…", schema: public }
 * ```
 *
 * `?action=import&database=shop` の `shop` が選ぶのは**このキーだけ**で、
 * **ホスト名はクライアントから 1 バイトも渡らない** —— SSRF が「対策」ではなく
 * **不可能**になる（[io.propagandist.grabado.introspect.IntrospectSource] の KDoc）。
 *
 * 空（既定）なら introspection は無効。`capabilities` の `introspection` が false になり、
 * フロントはボタンを隠す。
 */
data class IntrospectProperties(
    val sources: Map<String, io.propagandist.grabado.introspect.IntrospectSource> = emptyMap(),
)
