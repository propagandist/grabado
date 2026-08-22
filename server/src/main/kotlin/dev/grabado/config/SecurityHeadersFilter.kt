package dev.grabado.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * 全応答に付ける最小のセキュリティヘッダ。
 *
 * `spring-boot-starter-security` は入れない —— 認証も認可も無い（単一ユーザーのローカル
 * コンテナ）ので、入れると全経路が 401 になって `permitAll` の列挙が判断対象として増える
 * だけになる（org security-baseline §3.11）。要るのはこの 3 本で、それは 20 行で書ける。
 *
 * ★ **CSP は今回入れない。** `index.html` にインラインスクリプトがあり、Vite ビルド後の
 *   inline 資産を棚卸ししないと `unsafe-inline` 付きの**見せかけの CSP** になる。
 *   「棚卸ししてから入れる」と書き残すほうが誠実。フロント dist を同梱する §2 の仕事。
 */
@Component
class SecurityHeadersFilter : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        // load が返すのは任意のユーザー内容（backend は body を解釈しない）。
        // 同一オリジンなので、ブラウザに中身を推測させない。
        response.setHeader("X-Content-Type-Options", "nosniff")
        response.setHeader("Referrer-Policy", "no-referrer")
        response.setHeader("X-Frame-Options", "DENY")
        filterChain.doFilter(request, response)
    }
}
