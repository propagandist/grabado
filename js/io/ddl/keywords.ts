/* ------------------------- ddl keywords ----------------------- */
/*
 * grabado: DDL 生成で「識別子を引用符で囲まなければならない語」の一覧（HANDOVER §6 段階6-5b）。
 *
 * js/io/ddl/naming.ts の quoteIdentifier() が唯一の読み手で、規則そのものは向こうにある。
 * ここは語彙表だけを持つ —— 6-8 で mysql（約 260 語）/ mssql / oracle / sqlite が足されると
 * 規則本体が語彙に埋もれるため、最初からファイルを分けてある。
 *
 * **一覧は推測ではなく実 PG18 から採った。** 採取手順（そのまま再現できる）:
 *
 *   $ docker run --rm -d --name kw -e POSTGRES_PASSWORD=x postgres:18
 *   $ docker exec kw psql -U postgres -Atc \
 *       "SELECT word FROM pg_get_keywords() WHERE catcode IN ('R','T') ORDER BY 1;"
 *
 *   採取日 2026-08-20 / PostgreSQL 18.4 (Debian 18.4-1.pgdg13+1) / R 78 語 ＋ T 23 語 = 101 語
 *
 * catcode の 4 分類（付録 C）と「列名・テーブル名に使えるか」の対応:
 *
 *   U  non-reserved                                    使える  -> 入れない
 *   C  non-reserved (cannot be function or type name)  使える  -> 入れない（integer / varchar /
 *                                                              between がここ。列名にはできる）
 *   T  reserved (can be function or type name)         使えない -> **入れる**（left / is / like /
 *                                                              join / full。関数名・型名には
 *                                                              なれるが列名にはなれない）
 *   R  reserved                                        使えない -> **入れる**
 *
 * 照合する側（quoteIdentifier）は「裸で出せるのは /^[a-z_][a-z0-9_]*$/ だけ」という判定を
 * 先に通すので、この集合は**小文字のまま**でよい（大文字を含む名前はその時点で囲まれる）。
 */

/** 列名・テーブル名として裸で書けない語（PostgreSQL 18・catcode R / T） */
export const POSTGRESQL_RESERVED: ReadonlySet<string> = new Set([
    "all", "analyse", "analyze", "and", "any", "array",
    "as", "asc", "asymmetric", "authorization", "binary", "both",
    "case", "cast", "check", "collate", "collation", "column",
    "concurrently", "constraint", "create", "cross", "current_catalog", "current_date",
    "current_role", "current_schema", "current_time", "current_timestamp", "current_user", "default",
    "deferrable", "desc", "distinct", "do", "else", "end",
    "except", "false", "fetch", "for", "foreign", "freeze",
    "from", "full", "grant", "group", "having", "ilike",
    "in", "initially", "inner", "intersect", "into", "is",
    "isnull", "join", "lateral", "leading", "left", "like",
    "limit", "localtime", "localtimestamp", "natural", "not", "notnull",
    "null", "offset", "on", "only", "or", "order",
    "outer", "overlaps", "placing", "primary", "references", "returning",
    "right", "select", "session_user", "similar", "some", "symmetric",
    "system_user", "table", "tablesample", "then", "to", "trailing",
    "true", "union", "unique", "user", "using", "variadic",
    "verbose", "when", "where", "window", "with",
]);
