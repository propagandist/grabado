package dev.grabado.introspect

import dev.grabado.config.GrabadoProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service

/**
 * introspection の入口（段階5-7a）。
 *
 * ★ **`grabado.readonly=true` のときは Bean ごと存在しない**（`@ConditionalOnProperty`）。
 *   READONLY の実現を「禁止したいものの直上」に置く方針（5-3 の `ReadOnlyDesignStore`）の
 *   introspection 版で、**外部到達性を持つ唯一の経路をまるごと消す**のがいちばん確実。
 *   `DesignController` は Bean が無ければ 403 を返す。
 */
@Service
@ConditionalOnProperty(name = ["grabado.readonly"], havingValue = "false", matchIfMissing = true)
class IntrospectionService(
    private val properties: GrabadoProperties,
    private val readers: List<CatalogReader> = listOf(PostgresCatalogReader(), MySqlCatalogReader(), H2CatalogReader()),
) {

    /** env に列挙された接続先が 1 つでもあるか（capabilities が読む）。 */
    fun isConfigured(): Boolean = properties.introspect.sources.isNotEmpty()

    /**
     * 名前で選んだ接続先を読む。
     *
     * @param name `?action=import&database=<name>`。**表のキーだけ**が有効
     * @throws UnknownSourceException 表に無い名前（HTTP 404）
     * @throws IntrospectionFailedException 接続や読み取りに失敗（HTTP 503）
     */
    fun read(name: String?): IntrospectionModel {
        val key = name?.trim().orEmpty()
        val source = properties.introspect.sources[key] ?: throw UnknownSourceException()
        val snapshot = try {
            CatalogReader.forUrl(source.url, readers).read(source)
        } catch (e: Exception) {
            /*
             * ★ 例外の中身を外に出さない。JDBC の例外メッセージには **URL と、実装によっては
             *   ユーザー名**が入る（org security-baseline §4.5）。呼び手には「読めなかった」
             *   だけを伝え、詳細はサーバのログに任せる。
             */
            throw IntrospectionFailedException(e)
        }
        return IntrospectionMapper.toModel(snapshot, key)
    }
}

/** 表に無い接続名。HTTP **404**（「そのデータベースはここに無い」）。 */
class UnknownSourceException : RuntimeException("設定されていない接続名")

/**
 * 接続や読み取りに失敗。HTTP **503**。
 *
 * 意味論では 502 が近いが、`js/io.ts` の `check()` が文言を持つのは 501 / 503 だけで、
 * **502 は素通しして無反応になる**（`default: return true`）。現行 PHP の実測も 503。
 */
class IntrospectionFailedException(cause: Throwable) :
    RuntimeException("introspection に失敗した", cause)
