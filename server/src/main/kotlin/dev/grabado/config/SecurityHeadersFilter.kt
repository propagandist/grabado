package dev.grabado.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * 全応答に付けるセキュリティヘッダ。**イメージでは静的資産も API も同じプロセスが配る**
 * （段階2-1）ので、このフィルタ 1 本で両方に付く。
 *
 * `spring-boot-starter-security` は入れない —— 認証も認可も無い（単一ユーザーのローカル
 * コンテナ）ので、入れると全経路が 401 になって `permitAll` の列挙が判断対象として増える
 * だけになる（org security-baseline §3.11）。要るのはこれだけで、それは短く書ける。
 *
 * ★ **CSP は段階2-2 で入れた**（issue #89）。`script-src` を 1 つも緩めていない ——
 *   そのために `js/wwwsqldesigner.ts` の cookie 読み取りから eval を撤去し、
 *   `vite.config.ts` の `assetsInlineLimit` を 0 にして `data:text/css` の inline を止めた。
 *   org security-baseline §3.5 は「`script-src` に `'unsafe-inline'` や `'unsafe-eval'` を
 *   足す変更が、実質的な無効化」と名指ししている。
 *
 * ★ **HSTS はここに入れない。** ローカルは `http://localhost:8080` で動く（公開デモの
 *   置き場所と TLS は issue #84）。入れると手元が壊れる。
 */
@Component
class SecurityHeadersFilter : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        HEADERS.forEach { (name, value) -> response.setHeader(name, value) }
        filterChain.doFilter(request, response)
    }

    companion object {
        /**
         * ★ **ヘッダの正本はここ。**
         *
         * `vite.config.ts` の `preview.headers` が同じ値を持ち（手元の `vite preview` を
         * 配布時と同じヘッダで回すため）、`tests/node/csp.test.ts` が**ずれたら赤くする**。
         * 写しを許すのは、Spring だけが出す形にすると CSP 下の動作をブラウザで確かめる手段が
         * イメージ E2E（2-4）まで無いため —— 壊れても誰も気づかない期間ができる。
         *
         * 値の理由:
         * - `default-src 'none'` —— **使う先だけを明示で開ける。** worker / manifest / media /
         *   frame はどれも使っていないので、増えた日に「違反として気づける失敗」になる
         * - `script-src 'self'` / `style-src 'self'` —— dist に inline は 1 つも無い（2026-08-25
         *   実測。inline `<script>` 0 本 / `style` 属性 0 個 / modulePreload polyfill 0 本）
         * - `img-src` の `data:` —— throbber（`index.html` にベタ書き）と material-inspired の
         *   svg（CSS ソースに元からある）。外すと upstream 資産の作り替えが混ざる。**奪取の
         *   経路は大半が `script-src` 側**（org security-baseline §3.5）なので防御は成立する
         * - `connect-src 'self'` —— `db/` `locale/` の fetch と `/backend` `/api`。外部へは出ない
         * - `base-uri` / `form-action` / `frame-ancestors` —— `default-src` に落ちないので明示が要る。
         *   `frame-ancestors 'none'` が分類 B に掛かるクリックジャッキングの値（同 §3.9）で、
         *   `X-Frame-Options` はそれを解さない実装向けの重ね置き
         */
        val HEADERS: Map<String, String> = linkedMapOf(
            // load が返すのは任意のユーザー内容（backend は body を解釈しない）。
            // 同一オリジンなので、ブラウザに中身を推測させない。
            "X-Content-Type-Options" to "nosniff",
            "Referrer-Policy" to "no-referrer",
            "X-Frame-Options" to "DENY",
            "Content-Security-Policy" to "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            // ER 設計ツールはどの機能も使わない。使い出した日に、ここが判断の場所になる。
            "Permissions-Policy" to "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
        )
    }
}
