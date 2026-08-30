package io.propagandist.grabado.introspect

import java.sql.Connection
import java.sql.DriverManager
import java.sql.ResultSet
import java.util.Properties

/**
 * 方言をまたぐ JDBC の小道具（段階5-8a で [PostgresCatalogReader] から切り出した）。
 *
 * ## コネクションプールを持たない
 *
 * introspection は**人が押したときだけ走る**低頻度・一発読み。プールは外部 DB への
 * idle 接続を抱え続けることになり、可用性（相手 DB の再起動で全部腐る）と資格情報の
 * 露出時間の両方で損をする。
 *
 * 副次的に **`spring-boot-starter-jdbc` を入れずに済む** —— HikariCP が classpath に
 * 無いので `spring.datasource.*` の auto-configuration が存在せず、
 * **DB レス既定（CLAUDE.md 制約5）が構造で保証される**。
 */
internal object JdbcSupport {

    /**
     * 読み取り専用で繋ぐ。
     *
     * タイムアウトは**必ず付ける** —— 相手 DB が固まったときに Tomcat のスレッドを
     * 永久に握らせない。プロパティ名は方言ごとに違うので、共通のものだけを設定して
     * 残りは呼び手（`extra`）に任せる。
     */
    fun connect(source: IntrospectSource, extra: Map<String, String> = emptyMap()): Connection {
        val props = Properties()
        props.setProperty("user", source.user)
        props.setProperty("password", source.password)
        props.setProperty("connectTimeout", "5000")
        props.setProperty("socketTimeout", "30000")
        for ((key, value) in extra) {
            props.setProperty(key, value)
        }
        val connection = DriverManager.getConnection(source.url, props)
        connection.isReadOnly = true
        return connection
    }

    /** 1 引数（スキーマ名）の SELECT を流して行を写す。 */
    fun <T> query(
        connection: Connection,
        sql: String,
        schema: String,
        row: (ResultSet) -> T,
    ): List<T> = connection.prepareStatement(sql).use { statement ->
        statement.setString(1, schema)
        statement.executeQuery().use { rs ->
            buildList {
                while (rs.next()) {
                    add(row(rs))
                }
            }
        }
    }

    /** `getInt` は NULL を 0 で返すので、`wasNull` を見て潰す。 */
    fun ResultSet.intOrNull(column: String): Int? {
        val value = getInt(column)
        return if (wasNull()) null else value
    }
}
