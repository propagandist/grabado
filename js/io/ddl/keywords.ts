/* ------------------------- ddl keywords ----------------------- */
/*
 * grabado: DDL 生成で「識別子を引用符で囲まなければならない語」の一覧（HANDOVER §6 段階6-5b）。
 *
 * js/io/ddl/naming.ts の quoteIdentifier() が唯一の読み手で、規則そのものは向こうにある。
 * ここは語彙表だけを持つ —— 6-8 で mysql（約 260 語）/ mssql / oracle / sqlite が足されると
 * 規則本体が語彙に埋もれるため、最初からファイルを分けてある。
 * **段階6-7a で sql-standard が 2 本目として入った**（採取元は下）。
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

/*
 * SQL:2016 の予約語（段階6-7a）。
 *
 * **規格そのものは有料なので、一次資料は PostgreSQL のソースツリーから採った** ——
 * doc/src/sgml/keywords/ には各版の予約語が規格から転記されて置いてあり、付録 C
 * 「SQL Key Words」の表がそこから生成されている。
 *
 *   $ curl https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/ *       doc/src/sgml/keywords/sql2016-02-reserved.txt
 *
 *   採取日 2026-08-20 / ISO/IEC 9075-2:2016 の <reserved word> / 365 語
 *
 * **PostgreSQL の 101 語より遥かに多いのは、標準が関数名まで予約しているため**
 * （abs / acos / avg / count …）。それでも落とさないのは、標準準拠を名乗るプロファイルで
 * 「この DDL は SQL:2016 として妥当」と言えることが sql-standard の存在理由そのものだから。
 * 実害は year や value のような**ありふれた列名が引用される**ことだが、囲めば必ず通る。
 */

/** 列名・テーブル名として裸で書けない語（ISO/IEC 9075-2:2016） */
export const SQL_STANDARD_RESERVED: ReadonlySet<string> = new Set([
    "abs", "absent", "acos", "all", "allocate", "alter",
    "and", "any", "are", "array", "array_agg", "array_max_cardinality",
    "as", "asensitive", "asin", "asymmetric", "at", "atan",
    "atomic", "authorization", "avg", "begin", "begin_frame", "begin_partition",
    "between", "bigint", "binary", "blob", "boolean", "both",
    "by", "call", "called", "cardinality", "cascaded", "case",
    "cast", "ceil", "ceiling", "char", "char_length", "character",
    "character_length", "check", "classifier", "clob", "close", "coalesce",
    "collate", "collect", "column", "commit", "condition", "connect",
    "constraint", "contains", "convert", "copy", "corr", "corresponding",
    "cos", "cosh", "count", "covar_pop", "covar_samp", "create",
    "cross", "cube", "cume_dist", "current", "current_catalog", "current_date",
    "current_default_transform_group", "current_path", "current_role", "current_row", "current_schema", "current_time",
    "current_timestamp", "current_transform_group_for_type", "current_user", "cursor", "cycle", "date",
    "day", "deallocate", "dec", "decimal", "decfloat", "declare",
    "default", "define", "delete", "dense_rank", "deref", "describe",
    "deterministic", "disconnect", "distinct", "double", "drop", "dynamic",
    "each", "element", "else", "empty", "end", "end_frame",
    "end_partition", "end-exec", "equals", "escape", "every", "except",
    "exec", "execute", "exists", "exp", "external", "extract",
    "false", "fetch", "filter", "first_value", "float", "floor",
    "for", "foreign", "frame_row", "free", "from", "full",
    "function", "fusion", "get", "global", "grant", "group",
    "grouping", "groups", "having", "hold", "hour", "identity",
    "in", "indicator", "initial", "inner", "inout", "insensitive",
    "insert", "int", "integer", "intersect", "intersection", "interval",
    "into", "is", "join", "json_array", "json_arrayagg", "json_exists",
    "json_object", "json_objectagg", "json_query", "json_table", "json_table_primitive", "json_value",
    "lag", "language", "large", "last_value", "lateral", "lead",
    "leading", "left", "like", "like_regex", "listagg", "ln",
    "local", "localtime", "localtimestamp", "log", "log10", "lower",
    "match", "match_number", "match_recognize", "matches", "max", "member",
    "merge", "method", "min", "minute", "mod", "modifies",
    "module", "month", "multiset", "national", "natural", "nchar",
    "nclob", "new", "no", "none", "normalize", "not",
    "nth_value", "ntile", "null", "nullif", "numeric", "octet_length",
    "occurrences_regex", "of", "offset", "old", "omit", "on",
    "one", "only", "open", "or", "order", "out",
    "outer", "over", "overlaps", "overlay", "parameter", "partition",
    "pattern", "per", "percent", "percent_rank", "percentile_cont", "percentile_disc",
    "period", "portion", "position", "position_regex", "power", "precedes",
    "precision", "prepare", "primary", "procedure", "ptf", "range",
    "rank", "reads", "real", "recursive", "ref", "references",
    "referencing", "regr_avgx", "regr_avgy", "regr_count", "regr_intercept", "regr_r2",
    "regr_slope", "regr_sxx", "regr_sxy", "regr_syy", "release", "result",
    "return", "returns", "revoke", "right", "rollback", "rollup",
    "row", "row_number", "rows", "running", "savepoint", "scope",
    "scroll", "search", "second", "seek", "select", "sensitive",
    "session_user", "set", "show", "similar", "sin", "sinh",
    "skip", "smallint", "some", "specific", "specifictype", "sql",
    "sqlexception", "sqlstate", "sqlwarning", "sqrt", "start", "static",
    "stddev_pop", "stddev_samp", "submultiset", "subset", "substring", "substring_regex",
    "succeeds", "sum", "symmetric", "system", "system_time", "system_user",
    "table", "tablesample", "tan", "tanh", "then", "time",
    "timestamp", "timezone_hour", "timezone_minute", "to", "trailing", "translate",
    "translate_regex", "translation", "treat", "trigger", "trim", "trim_array",
    "true", "truncate", "uescape", "union", "unique", "unknown",
    "unnest", "update", "upper", "user", "using", "value",
    "values", "value_of", "var_pop", "var_samp", "varbinary", "varchar",
    "varying", "versioning", "when", "whenever", "where", "width_bucket",
    "window", "with", "within", "without", "year",
]);
