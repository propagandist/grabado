/* ------------------------- ddl: mysql 系の共通骨格 ------------ */
/*
 * grabado: MySQL 系プロファイルの共通実装（HANDOVER §6 段階6-8a）。
 *
 * 6-7c が「MySQL 系の骨格を括るのは 6-8」として送ったもの。**js/io/ddl/ansi.ts の対** で、
 * あちらが「CREATE TABLE ＋ ALTER TABLE ADD CONSTRAINT で組み立てる系」
 * （postgresql / sql-standard / h2）、こちらが MySQL 系（mariadb / mysql）。
 *
 *   キー      **テーブル定義の中**（PRIMARY KEY (...) / UNIQUE KEY <name> (...)）
 *   コメント   COMMENT ON は無い。**列定義と表定義の COMMENT 属性**
 *   identity  **AUTO_INCREMENT**（列属性。GENERATED ALWAYS AS IDENTITY は無い）
 *   識別子     **バッククォート**
 *
 * 2 本の違いは**識別子の語彙だけ**（mariadb 247 語 / mysql は 6-8a の採取値）。
 * 型の違いはパレット（db/<db>/datatypes.xml）が持つのでここには出ない。
 *
 * **6-7c で mariadb を書いた時点ではまだ括らなかった** —— 当時 mysql は未現代化で、
 * 両方を満たす形にすると 6-8 で作り直しになるため。mysql を現代化する本段階が正しい時期。
 */

import { isFunctionCall, replaceSubstring, type DdlTable } from "./shared.ts";
import {
    foreignKeyName,
    keyConstraintName,
    quoteIdentifier,
    type IdentifierRules,
} from "./naming.ts";

export interface MysqlDialect {
    /** 識別子の囲み方（バッククォート）と、裸で書けない語の集合 */
    readonly rules: IdentifierRules;
    /**
     * 関数呼び出しの既定値を括弧で包むか。
     *
     * **MySQL 8 は包むことを要求し（`DEFAULT (UUID())`）、MariaDB はどちらでも受ける。**
     * 包まないと MySQL は構文エラーになる —— 段階6-8a で生成 DDL を実物に流して見つけた。
     * キーワード（CURRENT_TIMESTAMP）を包まない理由は shared.ts の isFunctionCall。
     */
    readonly parenthesizeFunctionDefaults: boolean;
}

/** COMMENT 属性の文字列リテラル。切り詰めない（upstream の mysql は 60 字で切っていた） */
function comment(text: string): string {
    return "'" + replaceSubstring(text, "'", "''") + "'";
}

export function generateMysqlStyle(
    tables: readonly DdlTable[],
    dialect: MysqlDialect,
): string {
    const q = (name: string): string => quoteIdentifier(name, dialect.rules);
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
                const def =
                    dialect.parenthesizeFunctionDefaults && isFunctionCall(row.def)
                        ? "(" + row.def + ")"
                        : row.def;
                line += " DEFAULT " + def;
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
