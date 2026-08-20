/* ------------------------- ddl: mariadb ----------------------- */
/*
 * grabado: DesignModel -> MariaDB 11 の DDL（HANDOVER §6 段階6-7c で新設）。
 *
 * **MySQL のコピーではない**（6-7 の設計の決めたこと 2）。MariaDB だけが持つ型が
 * house 既定に直接効く —— **UUID（10.7+）と INET4 / INET6（10.5+ / 10.10+）**。
 * db/mariadb/datatypes.xml と対になる。
 *
 * **js/io/ddl/ansi.ts には載らない。** あちらは「CREATE TABLE ＋ ALTER TABLE ADD CONSTRAINT で
 * 組み立てる系」（postgresql / sql-standard / h2）で、MySQL 系は骨格からして違う:
 *
 *   キー      テーブル定義の中に置く（PRIMARY KEY (...) / UNIQUE KEY <name> (...)）
 *   コメント   COMMENT ON は無い。列定義と表定義の COMMENT 属性
 *   identity  AUTO_INCREMENT（列属性。GENERATED ALWAYS AS IDENTITY は無い）
 *   識別子     バッククォート
 *
 * **未現代化の js/io/ddl/mysql.ts とは別物として書いてある。** あちらは upstream の
 * output.xsl の逐語で、Globals / Table Properties / Test Data のコメントブロック・
 * DROP TABLE IF EXISTS・60 字でのコメント切り詰め・名前の無い FK を持つ。ここは §6.3 の
 * 規約に従う（命名・引用・コメントの完全保持）。**6-8 で mysql を現代化するときの型紙。**
 *
 * upstream の mysql から意図的に落としたもの:
 *   - **DROP TABLE IF EXISTS**（生成 DDL が既存データを消しうる。新設では出さない）
 *   - Globals / Table Properties / Test Data の飾りブロック（設計の情報ではない）
 *   - コメントの 60 字切り詰め（情報が黙って消える。6-5a が記録した粗さの 1 つ）
 */

import { replaceSubstring, type DdlTable } from "./shared.ts";
import {
    MARIADB_IDENTIFIER,
    foreignKeyName,
    keyConstraintName,
    quoteIdentifier,
} from "./naming.ts";

/** 識別子を必要なときだけ ` で囲む。語彙は MariaDB 11.8.8 の 247 語 */
function q(name: string): string {
    return quoteIdentifier(name, MARIADB_IDENTIFIER);
}

/** COMMENT 属性の文字列リテラル。切り詰めない（upstream の mysql は 60 字で切っていた） */
function comment(text: string): string {
    return "'" + replaceSubstring(text, "'", "''") + "'";
}

export function generateMariadb(tables: readonly DdlTable[]): string {
    let out = "";

    for (const table of tables) {
        out += "CREATE TABLE " + q(table.name) + " (\n";

        const lines: string[] = [];
        for (const row of table.rows) {
            let line = "  " + q(row.name) + " " + row.datatype;

            /* MySQL 系は NULL を明示する（upstream の mysql と同じ。他の 3 本は NOT NULL だけ） */
            line += row.nullable ? " NULL" : " NOT NULL";

            /*
             * AUTO_INCREMENT は列属性。**MariaDB は identity 列が PRIMARY か UNIQUE で
             * あることを要求する**が、それはモデル側（キーの有無）の話なのでここでは見ない。
             */
            if (row.autoincrement) {
                line += " AUTO_INCREMENT";
            }
            if (row.hasDefault && row.def !== "NULL") {
                line += " DEFAULT " + row.def;
            }
            if (row.comment) {
                line += " COMMENT " + comment(row.comment);
            }
            lines.push(line);
        }

        /*
         * キーはテーブル定義の中（MySQL 系の慣習）。**PRIMARY だけ名前を出さない** ——
         * MariaDB の主キー名は常に PRIMARY で、別名を付けると構文エラーになる。
         * 列を持たないキーを落とすのは 4 本共通（段階6-5b の決定 7）。
         */
        for (const key of table.keys) {
            if (key.parts.length === 0) {
                continue;
            }
            const cols = key.parts.map(q).join(", ");
            if (key.type === "PRIMARY") {
                lines.push("  PRIMARY KEY (" + cols + ")");
                continue;
            }
            const name = q(keyConstraintName(key, table.name));
            /* FULLTEXT は MariaDB がネイティブに持つ（postgresql は btree の索引に落とす） */
            const kind =
                key.type === "UNIQUE"
                    ? "UNIQUE KEY"
                    : key.type === "FULLTEXT"
                      ? "FULLTEXT KEY"
                      : "KEY";
            lines.push("  " + kind + " " + name + " (" + cols + ")");
        }

        out += lines.join(",\n");
        out += "\n)";
        if (table.comment) {
            out += " COMMENT " + comment(table.comment);
        }
        out += ";\n\n";
    }

    /* FK は全テーブルを作り終えてから（前方参照を許すため）。名前は §6.3 の規約 */
    for (const table of tables) {
        for (const row of table.rows) {
            for (const rel of row.relations) {
                out +=
                    "ALTER TABLE " +
                    q(table.name) +
                    " ADD CONSTRAINT " +
                    q(foreignKeyName(table.name, row.name)) +
                    " FOREIGN KEY (" +
                    q(row.name) +
                    ") REFERENCES " +
                    q(rel.table) +
                    " (" +
                    q(rel.row) +
                    ");\n";
            }
        }
    }

    return out;
}
