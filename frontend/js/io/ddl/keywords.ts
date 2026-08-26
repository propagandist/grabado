/* ------------------------- ddl keywords ----------------------- */
/*
 * grabado: DDL 生成で「識別子を引用符で囲まなければならない語」の一覧（HANDOVER §6 段階6-5b）。
 *
 * js/io/ddl/naming.ts の quoteIdentifier() が唯一の読み手で、規則そのものは向こうにある。
 * ここは語彙表だけを持つ —— mysql の 262 語を同居させると規則本体が語彙に埋もれるため、
 * 最初からファイルを分けてある。**段階6-8d で 8 本そろった**（採取元はそれぞれ下）:
 *
 *   sql-standard 365 / mysql 262 / mariadb 247 / mssql 179 / postgresql 101 /
 *   h2 90 / oracle 92 / sqlite 59
 *
 * **1 本を除いて実物から総当たりで採ってある。** 例外は sql-standard（規格そのものが一次資料）。
 * ドキュメントやビューより実物が正しい、という結論は 6-8b（mssql はドキュメントが 5 語広い）と
 * 6-8c（oracle はビューが 11 語狭い）で**両方向に**確かめた。
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

/*
 * H2 2.4.240 の予約語（段階6-7b）。
 *
 * **H2 は INFORMATION_SCHEMA.KEYWORDS を持たない**（2.4 の 35 ビューを数えて確認した）ので、
 * PostgreSQL の pg_get_keywords() のように一覧を引くことができない。かわりに
 * **実物に総当たりで聞いた** —— 語ごとに列名として使えるかを試し、拒まれた語を採る。
 * 「列名に使えるか」で採るのは PG（catcode R / T）と同じ基準。
 *
 *   $ curl -O https://repo1.maven.org/maven2/com/h2database/h2/2.4.240/h2-2.4.240.jar
 *   $ java -cp h2-2.4.240.jar Kw.java <母集団> <出力>
 *       // 各語で CREATE TABLE t_probe(<語> INT) を試し、SQLException になった語を集める
 *
 *   採取日 2026-08-21 / H2 2.4.240 / 母集団 391 語 -> 90 語
 *
 * **母集団の作り方が採取の限界そのもの。** SQL:2016 の 365 語 ∪ PostgreSQL の 101 語 ∪
 * H2 のソース（org/h2/util/ParserUtil.java）の文字列リテラルを合わせた 391 語で、
 * ここに無い語は漏れる。ParserUtil を混ぜたのは標準にも PG にも無い H2 固有語を拾うためで、
 * 実際に 6 語（if / key / minus / qualify / rownum / _rowid_）がそこからしか出ていない。
 *
 * jar は採取時 1 回きりで、リポジトリにも配布物にも残していない（6-5b の postgres:18 と同じ扱い）。
 */

/** 列名・テーブル名として裸で書けない語（H2 2.4.240） */
export const H2_RESERVED: ReadonlySet<string> = new Set([
    "all", "and", "any", "array", "as", "asymmetric",
    "authorization", "between", "case", "cast", "check", "constraint",
    "cross", "current_catalog", "current_date", "current_path", "current_role", "current_schema",
    "current_time", "current_timestamp", "current_user", "day", "default", "distinct",
    "else", "end", "end-exec", "except", "exists", "false",
    "fetch", "for", "foreign", "from", "full", "group",
    "having", "hour", "if", "in", "inner", "intersect",
    "interval", "is", "join", "key", "left", "like",
    "limit", "localtime", "localtimestamp", "minus", "minute", "month",
    "natural", "not", "null", "offset", "on", "or",
    "order", "primary", "qualify", "right", "row", "rownum",
    "second", "select", "session_user", "set", "some", "symmetric",
    "system_user", "table", "to", "true", "uescape", "union",
    "unique", "unknown", "user", "using", "value", "values",
    "when", "where", "window", "with", "year", "_rowid_",
]);

/*
 * MariaDB 11.8.8 の予約語（段階6-7c）。
 *
 * **MariaDB の INFORMATION_SCHEMA.KEYWORDS は WORD 列しか持たない**（MySQL 8.0 の同名ビューに
 * ある RESERVED 列が無い）ので、702 語のうちどれが予約語かはそこから分からない。
 * H2 と同じく**実物に総当たりで聞いた** —— 語ごとに列名として使えるかを試し、拒まれた語を採る。
 *
 *   $ docker run -d --rm --name mdb -e MARIADB_ROOT_PASSWORD=x mariadb:11
 *   $ // 母集団の各語で CREATE TABLE p<n>(<語> INT) を流し、作れなかった n を予約語とする
 *   $ mariadb -uroot -px --force < probe.sql
 *
 *   採取日 2026-08-21 / MariaDB 11.8.8 / 母集団 874 語 -> **247 語**
 *
 * 母集団は KEYWORDS の 702 語 ∪ SQL:2016 の 365 語 ∪ PostgreSQL の 101 語。
 *
 * **PostgreSQL の 101 語や H2 の 90 語より遥かに多いのは、型名まで予約されているため**
 * （bigint / char / character / blob / binary …）。house 標準の snake_case な列名は
 * ここに当たらないが、char や binary という列名を書くと引用される。
 */

/** 列名・テーブル名として裸で書けない語（MariaDB 11.8.8） */
export const MARIADB_RESERVED: ReadonlySet<string> = new Set([
    "accessible", "add", "all", "alter", "analyze", "and",
    "as", "asc", "asensitive", "before", "between", "bigint",
    "binary", "blob", "both", "by", "call", "cascade",
    "case", "change", "char", "character", "check", "collate",
    "column", "condition", "constraint", "continue", "convert", "create",
    "cross", "current_date", "current_role", "current_time", "current_timestamp", "current_user",
    "cursor", "databases", "day_hour", "day_microsecond", "day_minute", "day_second",
    "dec", "decimal", "declare", "default", "delayed", "delete",
    "delete_domain_id", "desc", "describe", "deterministic", "distinct", "distinctrow",
    "div", "double", "do_domain_ids", "drop", "dual", "each",
    "else", "elseif", "enclosed", "escaped", "except", "exists",
    "exit", "explain", "false", "fetch", "float", "float4",
    "float8", "for", "force", "foreign", "from", "fulltext",
    "grant", "group", "having", "high_priority", "hour_microsecond", "hour_minute",
    "hour_second", "if", "ignore", "ignore_domain_ids", "in", "index",
    "infile", "inner", "inout", "insensitive", "insert", "int",
    "int1", "int2", "int3", "int4", "int8", "integer",
    "intersect", "interval", "into", "is", "iterate", "join",
    "key", "keys", "kill", "leading", "leave", "left",
    "like", "limit", "linear", "lines", "load", "localtime",
    "localtimestamp", "lock", "long", "longblob", "longtext", "loop",
    "low_priority", "master_demote_to_replica", "master_demote_to_slave", "match", "maxvalue", "mediumblob",
    "mediumint", "mediumtext", "middleint", "minute_microsecond", "minute_second", "mod",
    "modifies", "natural", "not", "no_write_to_binlog", "null", "numeric",
    "offset", "on", "optimize", "optionally", "or", "order",
    "out", "outer", "outfile", "over", "page_checksum", "parse_vcol_expr",
    "partition", "portion", "precision", "primary", "procedure", "purge",
    "range", "read", "reads", "read_write", "real", "recursive",
    "references", "ref_system_id", "regexp", "release", "rename", "repeat",
    "replace", "require", "resignal", "restrict", "return", "returning",
    "revoke", "right", "rlike", "rows", "row_number", "schemas",
    "second_microsecond", "select", "sensitive", "separator", "set", "show",
    "signal", "smallint", "spatial", "specific", "sql", "sqlexception",
    "sqlstate", "sqlwarning", "sql_after_gtids", "sql_before_gtids", "sql_big_result", "sql_calc_found_rows",
    "sql_small_result", "ssl", "starting", "stats_auto_recalc", "stats_persistent", "stats_sample_pages",
    "straight_join", "table", "terminated", "then", "tinyblob", "tinyint",
    "tinytext", "to", "trailing", "trigger", "true", "undo",
    "union", "unique", "unlock", "unsigned", "update", "usage",
    "use", "using", "utc_date", "utc_time", "utc_timestamp", "values",
    "varbinary", "varchar", "varcharacter", "varying", "vector", "when",
    "where", "while", "with", "write", "xor", "year_month",
    "zerofill",
]);

/*
 * MySQL 8.4.11 の予約語（段階6-8a）。
 *
 * **ここだけは一覧が引ける** —— MySQL の INFORMATION_SCHEMA.KEYWORDS は MariaDB と違って
 * RESERVED 列を持つ。ただし**総当たりでも検算した**（他の 3 本と同じ手順で 914 語を試した）:
 *
 *   $ docker run -d --rm --name msq -e MYSQL_ROOT_PASSWORD=x mysql:8
 *   $ mysql -uroot -px -N -e "SELECT WORD FROM INFORMATION_SCHEMA.KEYWORDS WHERE RESERVED=1"
 *       -> 262 語
 *   $ // 母集団 914 語（KEYWORDS 734 ∪ SQL:2016 365 ∪ PG 101）で CREATE TABLE p<n>(<語> INT)
 *       -> 262 語。**両者は 1 語も違わない**
 *
 *   採取日 2026-08-21 / MySQL 8.4.11
 *
 * **ビューと総当たりが完全に一致したのはこのプロファイルだけ。** MariaDB は RESERVED 列を
 * 持たず、H2 は KEYWORDS ビュー自体が無いので、どちらも総当たりの結果しか根拠が無い。
 * ここで両者が一致したことは、**総当たり方式そのものが正しく採れている**ことの傍証になる。
 */

/** 列名・テーブル名として裸で書けない語（MySQL 8.4.11） */
export const MYSQL_RESERVED: ReadonlySet<string> = new Set([
    "accessible", "add", "all", "alter", "analyze", "and",
    "as", "asc", "asensitive", "before", "between", "bigint",
    "binary", "blob", "both", "by", "call", "cascade",
    "case", "change", "char", "character", "check", "collate",
    "column", "condition", "constraint", "continue", "convert", "create",
    "cross", "cube", "cume_dist", "current_date", "current_time", "current_timestamp",
    "current_user", "cursor", "database", "databases", "day_hour", "day_microsecond",
    "day_minute", "day_second", "dec", "decimal", "declare", "default",
    "delayed", "delete", "dense_rank", "desc", "describe", "deterministic",
    "distinct", "distinctrow", "div", "double", "drop", "dual",
    "each", "else", "elseif", "empty", "enclosed", "escaped",
    "except", "exists", "exit", "explain", "false", "fetch",
    "first_value", "float", "float4", "float8", "for", "force",
    "foreign", "from", "fulltext", "function", "generated", "get",
    "grant", "group", "grouping", "groups", "having", "high_priority",
    "hour_microsecond", "hour_minute", "hour_second", "if", "ignore", "in",
    "index", "infile", "inner", "inout", "insensitive", "insert",
    "int", "int1", "int2", "int3", "int4", "int8",
    "integer", "intersect", "interval", "into", "io_after_gtids", "io_before_gtids",
    "is", "iterate", "join", "json_table", "key", "keys",
    "kill", "lag", "last_value", "lateral", "lead", "leading",
    "leave", "left", "like", "limit", "linear", "lines",
    "load", "localtime", "localtimestamp", "lock", "long", "longblob",
    "longtext", "loop", "low_priority", "match", "maxvalue", "mediumblob",
    "mediumint", "mediumtext", "middleint", "minute_microsecond", "minute_second", "mod",
    "modifies", "natural", "not", "no_write_to_binlog", "nth_value", "ntile",
    "null", "numeric", "of", "on", "optimize", "optimizer_costs",
    "option", "optionally", "or", "order", "out", "outer",
    "outfile", "over", "partition", "percent_rank", "precision", "primary",
    "procedure", "purge", "qualify", "range", "rank", "read",
    "reads", "read_write", "real", "recursive", "references", "regexp",
    "release", "rename", "repeat", "replace", "require", "resignal",
    "restrict", "return", "revoke", "right", "rlike", "row",
    "rows", "row_number", "schema", "schemas", "second_microsecond", "select",
    "sensitive", "separator", "set", "show", "signal", "smallint",
    "spatial", "specific", "sql", "sqlexception", "sqlstate", "sqlwarning",
    "sql_big_result", "sql_calc_found_rows", "sql_small_result", "ssl", "starting", "stored",
    "straight_join", "system", "table", "tablesample", "terminated", "then",
    "tinyblob", "tinyint", "tinytext", "to", "trailing", "trigger",
    "true", "undo", "union", "unique", "unlock", "unsigned",
    "update", "usage", "use", "using", "utc_date", "utc_time",
    "utc_timestamp", "values", "varbinary", "varchar", "varcharacter", "varying",
    "virtual", "when", "where", "while", "window", "with",
    "write", "xor", "year_month", "zerofill",
]);

/*
 * SQL Server 2022 の予約語（段階6-8b）。
 *
 * **SQL Server には予約語を返すシステムビューが無い**（PG の pg_get_keywords()、
 * MySQL の INFORMATION_SCHEMA.KEYWORDS にあたるものが存在しない）。他の 3 本と同じく
 * **実物に総当たりで聞き**、母集団に**公式ドキュメントのソース**を混ぜて広げた:
 *
 *   $ curl https://raw.githubusercontent.com/MicrosoftDocs/sql-docs/live/ *       docs/t-sql/language-elements/reserved-keywords-transact-sql.md      -> 184 語
 *   $ docker run -d --rm --name mss -e ACCEPT_EULA=Y ... mcr.microsoft.com/mssql/server:2022-latest
 *   $ // 母集団の各語で CREATE TABLE p<n>(<語> INT) を GO 区切りで流す
 *
 *   採取日 2026-08-21 / SQL Server 2022 (RTM-CU26) 16.0.4265.3
 *   母集団 575 語（他 4 プロファイルの予約語 ∪ SQL:2016 ∪ ドキュメント 184）-> **179 語**
 *
 * **ドキュメントとの差は 5 語**（DISK / DUMP / LOAD / PRECISION / SECURITYAUDIT）で、
 * どれも**ドキュメントは予約と書くが実物は列名に使える**。逆向き（ドキュメントに無いのに
 * 実物が拒む）は 0 語。**採るのは実物の 179 語**——基準は「列名に使えるか」で、
 * PG の catcode（C は入れない）と同じ考え方。
 *
 * **母集団の作り方が採取の限界そのもの**なのは H2 / MariaDB と同じ。ドキュメントを混ぜる前は
 * 118 語しか採れておらず、NONCLUSTERED / TOP / BROWSE / TEXTSIZE などが漏れていた。
 */

/** 列名・テーブル名として裸で書けない語（SQL Server 2022） */
export const MSSQL_RESERVED: ReadonlySet<string> = new Set([
    "add", "all", "alter", "and", "any", "as",
    "asc", "authorization", "backup", "begin", "between", "break",
    "browse", "bulk", "by", "cascade", "case", "check",
    "checkpoint", "close", "clustered", "coalesce", "collate", "column",
    "commit", "compute", "constraint", "contains", "containstable", "continue",
    "convert", "create", "cross", "current", "current_date", "current_time",
    "current_timestamp", "current_user", "cursor", "database", "dbcc", "deallocate",
    "declare", "default", "delete", "deny", "desc", "distinct",
    "distributed", "double", "drop", "else", "end", "errlvl",
    "escape", "except", "exec", "execute", "exists", "exit",
    "external", "fetch", "file", "fillfactor", "for", "foreign",
    "freetext", "freetexttable", "from", "full", "function", "goto",
    "grant", "group", "having", "holdlock", "identity", "identitycol",
    "identity_insert", "if", "in", "index", "inner", "insert",
    "intersect", "into", "is", "join", "key", "kill",
    "left", "like", "lineno", "merge", "national", "nocheck",
    "nonclustered", "not", "null", "nullif", "of", "off",
    "offsets", "on", "open", "opendatasource", "openquery", "openrowset",
    "openxml", "option", "or", "order", "outer", "over",
    "percent", "pivot", "plan", "primary", "print", "proc",
    "procedure", "public", "raiserror", "read", "readtext", "reconfigure",
    "references", "replication", "restore", "restrict", "return", "revert",
    "revoke", "right", "rollback", "rowcount", "rowguidcol", "rule",
    "save", "schema", "select", "semantickeyphrasetable", "semanticsimilaritydetailstable", "semanticsimilaritytable",
    "session_user", "set", "setuser", "shutdown", "some", "statistics",
    "system_user", "table", "tablesample", "textsize", "then", "to",
    "top", "tran", "transaction", "trigger", "truncate", "try_convert",
    "tsequal", "union", "unique", "unpivot", "update", "updatetext",
    "use", "user", "values", "varying", "view", "waitfor",
    "when", "where", "while", "with", "writetext",
]);

/*
 * Oracle 23ai の予約語（段階6-8c）。
 *
 * **一覧を引けるのに、それだけでは足りなかった唯一のプロファイル。** Oracle は
 * V を持ち reserved='Y' で 81 語を返すが、**総当たりでは 92 語が拒まれた**:
 *
 *   $ docker run -d --rm --name ora -e ORACLE_PASSWORD=... gvenzl/oracle-free:slim
 *   $ sqlplus ... "SELECT keyword FROM v WHERE reserved='Y'"   -> 81 語
 *   $ // 母集団 588 語（ビュー 81 ∪ SQL:2016 ∪ 他 5 本の予約語）で CREATE TABLE p<n>(<語> NUMBER)
 *                                                                              -> **92 語**
 *
 *   採取日 2026-08-21 / Oracle AI Database 26ai Free Release 23.26.2.0.0
 *
 * **ビューに無いのに列名として拒まれた 11 語**: add / column / current / file / initial /
 * row / rownum / rows / user / whenever / _rowid_。**実物のほうが厳しい**ので実測を採る
 * （mssql はドキュメントのほうが広く、逆向きだった）。基準は他の 5 本と同じ「列名に使えるか」。
 */

/** 列名・テーブル名として裸で書けない語（Oracle 23ai） */
export const ORACLE_RESERVED: ReadonlySet<string> = new Set([
    "add", "all", "alter", "and", "any", "as",
    "asc", "between", "by", "char", "check", "cluster",
    "column", "compress", "connect", "create", "current", "date",
    "decimal", "default", "delete", "desc", "distinct", "drop",
    "else", "except", "exclusive", "exists", "file", "float",
    "for", "from", "grant", "group", "having", "identified",
    "in", "index", "initial", "insert", "integer", "intersect",
    "into", "is", "like", "lock", "long", "minus",
    "mode", "nocompress", "not", "nowait", "null", "number",
    "of", "on", "option", "or", "order", "pctfree",
    "prior", "public", "raw", "rename", "resource", "revoke",
    "row", "rownum", "rows", "select", "set", "share",
    "size", "smallint", "start", "synonym", "table", "then",
    "to", "trigger", "union", "unique", "update", "user",
    "values", "varchar", "varchar2", "view", "whenever", "where",
    "with", "_rowid_",
]);

/*
 * SQLite 3.51.2 の予約語（段階6-8d）。
 *
 * **一覧を返す SQL 関数もビューも無い。** sqlite_keyword_count() / sqlite_keyword_name() は
 * C API 専用で SQL からは no such function（pragma_function_list にも 0 件。実測）。
 * 他の 4 本と同じ総当たりだが、**母集団だけは実物から完全に採れた唯一のプロファイル**:
 *
 *   $ // node の実行ファイルに静的リンクされた SQLite の zKWText[]（mkkeywordhash.c が
 *   $ //   生成するキーワード連結文字列）を binary から /[A-Z_]{120,}/ で拾う -> 666 文字
 *   $ // その全部分文字列（長さ 2〜20）11,000 語 ∪ 他 7 本の予約語 ∪ SQL:2016 = 12,297 語
 *   $ // 各語を 3 位置で試す: 列名 / 表名 / 索引名
 *
 *   採取日 2026-08-22 / SQLite 3.51.2（node v24.14.0 組み込みの node:sqlite）
 *   列名 58 語 ∪ 表名 59 語 ∪ 索引名 59 語 -> **59 語**
 *
 * **母集団の完全性を主張できるのはここだけ。** zKWText は SQLite のパーサが持つキーワード表
 * そのものなので、その全部分文字列を試している以上どの語も漏れない（h2 / mariadb / mssql は
 * 「母集団の作り方が採取の限界」だった）。
 *
 * **基準を「列名に使えるか」から「表名・列名・索引名のどれかに使えないか」へ広げた** ——
 * quoteIdentifier() は 3 位置すべてに同じ規則で当たるため。差は 1 語だけで、
 * `if` は列名にはできるが CREATE TABLE if(...) / CREATE INDEX if ON ... が構文エラーになる
 * （CREATE TABLE IF NOT EXISTS と衝突する）。逆向き（列名では拒まれるが表名では通る）は 0 語。
 */

/** 表名・列名・索引名として裸で書けない語（SQLite 3.51.2） */
export const SQLITE_RESERVED: ReadonlySet<string> = new Set([
    "add", "all", "alter", "and", "as", "autoincrement",
    "between", "case", "check", "collate", "commit", "constraint",
    "create", "default", "deferrable", "delete", "distinct", "drop",
    "else", "escape", "except", "exists", "foreign", "from",
    "group", "having", "if", "in", "index", "insert",
    "intersect", "into", "is", "isnull", "join", "limit",
    "not", "nothing", "notnull", "null", "on", "or",
    "order", "primary", "references", "returning", "select", "set",
    "table", "then", "to", "transaction", "union", "unique",
    "update", "using", "values", "when", "where",
]);
