/* ------------------------- ddl: sql-standard ------------------ */
/*
 * grabado: DesignModel -> ANSI SQL の DDL（HANDOVER §6 段階6-7a で新設）。
 *
 * **ベンダ非依存のプロファイル。** 出すのは ISO/IEC 9075（SQL:2016 / SQL:2023）が定める
 * 構文だけで、どの製品の拡張も使わない。db/sql-standard/datatypes.xml と対になる。
 *
 * 骨格は js/io/ddl/postgresql.ts（6-5b で §6.3 の規約へ寄せたもの）と同じで、
 * **標準に無い 2 つだけが違う**:
 *
 *   COMMENT ON      標準に無い（PostgreSQL / Oracle の拡張）-> 行コメントで出す
 *   CREATE INDEX    **索引は標準の範囲外**（実装依存）-> 行コメントで出す
 *
 * どちらも「出さない」ではなく「コメントで出す」を採った。設計が持っている情報を
 * 落とすと、このプロファイルの用途（ベンダ非依存で書いて各製品へ持っていく出発点）で
 * 移し先に渡すものが減るため。**コメントなので標準 SQL として実行できることは変わらない。**
 *
 * **5 本の共通骨格の抽出はまだしていない**（6-5a が 6-7 へ送った項目）。h2 / mariadb を
 * 書いてから括るほうが正しい抽象になるので、3 本そろった時点でやる（CUSTOMIZATIONS.md 段階6-7a）。
 */

import { replaceSubstring, type DdlTable } from "./shared.ts";
import {
    SQL_STANDARD_IDENTIFIER,
    foreignKeyName,
    keyConstraintName,
    quoteIdentifier,
} from "./naming.ts";

/** 識別子を必要なときだけ " で囲む。語彙は SQL:2016 の 365 語（js/io/ddl/keywords.ts） */
function q(name: string): string {
    return quoteIdentifier(name, SQL_STANDARD_IDENTIFIER);
}

/**
 * 行コメント 1 行に畳む。
 *
 * **改行を空白へ潰すのがここの仕事。** -- は行末までがコメントなので、値に改行が入ると
 * 2 行目から SQL として解釈されて壊れる（postgresql は '...' で囲むので同じ危険が無い）。
 * CR も LF も潰すのは、設計 JSON が CRLF の環境を通ってくることがあるため。
 */
function lineComment(text: string): string {
    return replaceSubstring(replaceSubstring(text, "\r", " "), "\n", " ");
}

/**
 * 型名そのものが identity 句を持つか（パレットの bigint_identity）。
 * 句の綴りは SQL:2003 のもので、postgresql.ts と同じ判定になる。
 */
function hasIdentityClause(datatype: string): boolean {
    return /GENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY/i.test(datatype);
}

export function generateSqlStandard(tables: readonly DdlTable[]): string {
    let out = "";

    for (const table of tables) {
        out += "CREATE TABLE " + q(table.name) + " (\n";

        for (let i = 0; i < table.rows.length; i++) {
            const row = table.rows[i]!;
            out += " " + q(row.name) + " ";

            const hasClause = hasIdentityClause(row.datatype);
            const identity = row.autoincrement || hasClause;
            out += identity && !hasClause
                ? row.datatype + " GENERATED ALWAYS AS IDENTITY"
                : row.datatype;

            /* identity 列は暗黙で NOT NULL。DEFAULT との併用も標準が禁じている */
            if (!row.nullable && !identity) {
                out += " NOT NULL";
            }
            if (row.hasDefault && row.def !== "NULL" && !identity) {
                out += " DEFAULT " + row.def;
            }
            if (i !== table.rows.length - 1) {
                out += ",\n";
            }
        }

        out += "\n);\n";
        out += "\n\n";

        for (const key of table.keys) {
            /* 列を 1 つも持たないキーは 1 文字も出さない（postgresql.ts と同じ判断） */
            if (key.parts.length === 0) {
                continue;
            }

            const name = q(keyConstraintName(key, table.name));
            const cols = key.parts.map(q).join(", ");
            const alter = "ALTER TABLE " + q(table.name) + " ADD CONSTRAINT " + name;

            if (key.type === "PRIMARY") {
                out += alter + " PRIMARY KEY (" + cols + ");\n";
            } else if (key.type === "UNIQUE") {
                out += alter + " UNIQUE (" + cols + ");\n";
            } else {
                /*
                 * **索引は SQL 標準の範囲外**（どの版にも CREATE INDEX は無い）。
                 * 設計が持っている情報なので、移し先で使えるようコメントとして出す。
                 */
                out +=
                    "-- CREATE INDEX " +
                    name +
                    " ON " +
                    q(table.name) +
                    " (" +
                    cols +
                    "); (索引は SQL 標準の範囲外)\n";
            }
        }

        /* COMMENT ON は標準に無いので行コメントで出す（上の注記） */
        if (table.comment) {
            out += "-- " + q(table.name) + ": " + lineComment(table.comment) + "\n";
        }
        for (const row of table.rows) {
            if (row.comment) {
                out +=
                    "-- " +
                    q(table.name) +
                    "." +
                    q(row.name) +
                    ": " +
                    lineComment(row.comment) +
                    "\n";
            }
        }

        out += "\n";
    }

    /* FK は全テーブルを作り終えてから（前方参照を許すため）*/
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
                    "(" +
                    q(rel.row) +
                    ");\n";
            }
        }
    }

    return out;
}
