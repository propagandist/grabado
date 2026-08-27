package io.propagandist.grabado.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

/**
 * 経路 → `Cache-Control` の表（段階2-4）。**HTTP を 1 バイトも流さない純粋なテスト。**
 *
 * **静的資産の側は手元の jar に入らない**（dist を static へ入れるのは Dockerfile の COPY。
 * 段階2-0 の決めたこと 2）ので、`/assets/` と `/` の実物が確かめられるのは `tests/image/` だけ。
 * ここは**規則そのもの**を、イメージを起こさずに固定する。
 *
 * 実 HTTP で出ていることは `BackendBehaviourTest`（`/backend/` 配下）と
 * `tests/image/smoke.spec.ts`（4 経路すべて）が見る。
 */
class CacheControlTest {

    @ParameterizedTest
    @ValueSource(
        strings = [
            "/assets/index-CMMaIrwQ.js",
            "/assets/index-BvKZ0nT1.css",
            "/assets/print-D4x9.css",
        ],
    )
    fun `ハッシュ付きの資産は immutable`(path: String) {
        // 中身が変われば名前も変わる（Vite）。期限内は条件付き GET も送らせない。
        assertThat(SecurityHeadersFilter.cacheControlFor(path))
            .isEqualTo(SecurityHeadersFilter.IMMUTABLE)
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "/backend/file/", // ?action=list / load / save。クエリは requestURI に入らない
            "/backend/php-file/", // 撤去済みの名前でも、届けば同じ扱い（段階5-2）
            "/api/ai/review",
        ],
    )
    fun `設計データと AI の応答は no-store`(path: String) {
        assertThat(SecurityHeadersFilter.cacheControlFor(path))
            .isEqualTo(SecurityHeadersFilter.NO_STORE)
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "/",
            "/index.html",
            "/db/postgresql/datatypes.xml",
            "/locale/ja.xml",
            "/images/back.png",
            "/styles/default.css",
        ],
    )
    fun `ハッシュを持たない資産は毎回検証させる`(path: String) {
        // Last-Modified を持つので、実際には 304 で返る（2026-08-26 実測）。
        assertThat(SecurityHeadersFilter.cacheControlFor(path))
            .isEqualTo(SecurityHeadersFilter.REVALIDATE)
    }

    /*
     * ★ **知らない経路は `no-cache` に倒れる。** 増えた経路が黙って `immutable` になると、
     *   **1 年間ブラウザに焼き付く**（利用者に「キャッシュを消してくれ」と言うしかなくなる）。
     *   前綴りに 1 文字でも足りなければ落ちる側へ寄せてある。
     */
    @ParameterizedTest
    @ValueSource(
        strings = [
            "/assets", // ディレクトリそのもの（末尾の / が無い）
            "/assetsx/index.js", // 前綴りの見かけだけ似ている
            "/backend", // 同上
            "/apiary/x", // /api で始まるが /api/ ではない
            "/no-such-path", // 404 になる経路
        ],
    )
    fun `前綴りに一致しないものは no-cache へ倒れる`(path: String) {
        assertThat(SecurityHeadersFilter.cacheControlFor(path))
            .isEqualTo(SecurityHeadersFilter.REVALIDATE)
    }

    /*
     * `Cache-Control` を HEADERS（全応答共通の 5 本）へ入れると、**経路別の値を表せない**
     * うえに vite.config.ts の preview.headers へ写す義務が生まれる（tests/node/csp.test.ts が
     * 突き合わせている）。**静的サーバの固定ヘッダでは経路別を表現できない**ので、
     * 写しを増やさない側を選んだ —— その判断をここで固定する。
     */
    @Test
    fun `Cache-Control は共通の 5 本に入っていない`() {
        assertThat(SecurityHeadersFilter.HEADERS).doesNotContainKey(SecurityHeadersFilter.CACHE_CONTROL)
        assertThat(SecurityHeadersFilter.HEADERS).hasSize(5)
    }
}
