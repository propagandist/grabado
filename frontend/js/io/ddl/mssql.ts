/* ------------------------- ddl: mssql ------------------------- */
/*
 * grabado: DesignModel -> SQL Server 2022 の DDL（段階6-5a 移植 / 6-8b 現代化）。
 *
 * **独立実装。** js/io/ddl/ansi.ts にも mysql-style.ts にも載らない —— T-SQL は
 * バッチ区切り `GO` を要し、識別子を `[ ]` で囲み、identity が `IDENTITY (1, 1)` で、
 * コメントの持ち方が他のどれとも違う（下）。
 *
 * 6-8b で消えた upstream の粗さ（6-5a が記録し、うち 2 件は known-issues に隔離していた）:
 *
 *   1. **最終列にコメントがあると区切りカンマが `--` に飲まれる**（known-issue #12）
 *                                   -> コメントを列定義の**後ろの行**に出す
 *   2. **UNIQUE キーが T-SQL に無い `UNIQUE KEY (...)` で出る**（known-issue #14）
 *                                   -> `CONSTRAINT <name> UNIQUE (...)`
 *   3. DEFAULT を一切出力しない（分岐がそもそも無い）  -> 出す
 *   4. FK の参照元列だけ引用符が付かない               -> 規則が 1 本になったので揃う
 *   5. 複数列 INDEX の 2 列目以降に `[` が付かない      -> 列ごとに囲む
 *   6. FK 文の後にタブ 4 個の行                        -> 出さない
 *   7. 識別子を常に `[ ]` で囲む                       -> 必要なときだけ（naming.ts）
 *   8. `ON [PRIMARY]`（ファイルグループ指定）           -> 出さない（設計の情報ではない）
 *
 * **コメントは行コメントで出す。** T-SQL に列コメントの構文は無く、正式には
 * `EXEC sp_addextendedproperty` を使うが、6 引数（スキーマ名・オブジェクト種別…）を要求し
 * 設計モデルが持たない前提まで埋めることになる。**情報は落とさず、実行できる形で出す**
 * という sql-standard と同じ判断（CUSTOMIZATIONS.md の段階6-8b）。
 */

import { replaceSubstring, type DdlTable } from "./shared.ts";
import {
    MSSQL_IDENTIFIER,
    foreignKeyName,
    keyConstraintName,
    quoteIdentifier,
} from "./naming.ts";

/** 識別子を必要なときだけ [ ] で囲む。語彙は SQL Server 2022 の実測値 */
function q(name: string): string {
    return quoteIdentifier(name, MSSQL_IDENTIFIER);
}

/** 行コメント 1 行に畳む（改行が入ると 2 行目から T-SQL として解釈されるため） */
function lineComment(text: string): string {
    return replaceSubstring(replaceSubstring(text, "\r", " "), "\n", " ");
}

export function generateMssql(tables: readonly DdlTable[]): string {
    let out = "";

    for (const table of tables) {
        out += "CREATE TABLE " + q(table.name) + " (\n";

        const lines: string[] = [];
        for (const row of table.rows) {
            let line = "  " + q(row.name) + " " + row.datatype;

            /*
             * IDENTITY は型の後ろ・NOT NULL の前（T-SQL の並び）。**型は捨てない** ——
             * upstream も型を残していたので、postgresql（6-5b の決定 3）と同じ形になる。
             */
            if (row.autoincrement) {
                line += " IDENTITY (1, 1)";
            }
            if (!row.nullable) {
                line += " NOT NULL";
            }
            /* identity 列に DEFAULT は付けられない（SQL Server が拒む） */
            if (row.hasDefault && row.def !== "NULL" && !row.autoincrement) {
                line += " DEFAULT " + row.def;
            }
            lines.push(line);
        }

        /*
         * キーはテーブル定義の中。**PRIMARY / UNIQUE だけが制約**で、INDEX / FULLTEXT は
         * 下の CREATE INDEX / CREATE FULLTEXT INDEX が拾う（T-SQL は表定義の中に索引も
         * 書けるが、6-5a まで拾えていなかった型を落とさないことを優先した）。
         */
        for (const key of table.keys) {
            if (key.parts.length === 0) {
                continue;
            }
            if (key.type !== "PRIMARY" && key.type !== "UNIQUE") {
                continue;
            }
            const name = q(keyConstraintName(key, table.name));
            const cols = key.parts.map(q).join(", ");
            const kind = key.type === "PRIMARY" ? "PRIMARY KEY" : "UNIQUE";
            lines.push("  CONSTRAINT " + name + " " + kind + " (" + cols + ")");
        }

        out += lines.join(",\n");
        out += "\n);\nGO\n\n";

        /*
         * コメントは表定義の後ろ。**列定義の行末に置くと区切りカンマを飲む**（#12）ので、
         * 位置そのものが是正の本体。
         */
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
        if (table.comment || table.rows.some((r) => r.comment)) {
            out += "\n";
        }
    }

    /* 索引。PRIMARY / UNIQUE 以外がここへ来る（FULLTEXT は SQL Server もネイティブに持つ） */
    for (const table of tables) {
        for (const key of table.keys) {
            if (key.parts.length === 0) {
                continue;
            }
            if (key.type === "PRIMARY" || key.type === "UNIQUE") {
                continue;
            }
            const name = q(keyConstraintName(key, table.name));
            const cols = key.parts.map(q).join(", ");
            const kind = key.type === "FULLTEXT" ? "CREATE FULLTEXT INDEX" : "CREATE INDEX";
            out += kind + " " + name + " ON " + q(table.name) + " (" + cols + ");\nGO\n\n";
        }
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
                    ");\nGO\n\n";
            }
        }
    }

    return out;
}
