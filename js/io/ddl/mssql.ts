/* ------------------------- ddl: mssql ------------------------- */
/*
 * grabado: db/mssql/output.xsl（132 行）の逐語移植（HANDOVER §6 段階6-5a）。
 *
 * 逐語で持ち込んだ粗さ（直すのは 6-8。CUSTOMIZATIONS.md の段階6-5a の記録）:
 *   - **最終列にコメントがあると区切りカンマが -- に飲まれ T-SQL が構文エラーになる**
 *     （カンマをコメントより先に出すため。known-issues に新設した）
 *   - DEFAULT を一切出力しない（分岐がそもそも無い）
 *   - FK の参照元列だけ引用符が付かない
 *   - 複数列 INDEX の 2 列目以降に [ が付かない（([c1], c2])）
 *   - FK 文の後に「タブ 4 個の行」が出る
 *
 * PRIMARY / FULLTEXT / UNIQUE 以外の key type は**意図的に落としている**
 * （XSLT 側に "No otherwise for MSSQL" のコメントがある）。INDEX は下の
 * CREATE INDEX ループが拾うので、抜けるのは実質 FULLTEXT 以外の独自 type だけ。
 */

import type { DdlTable } from "./shared.ts";

export function generateMssql(tables: readonly DdlTable[]): string {
    let out = "";

    /* <!-- tables --> */
    for (const table of tables) {
        out += "CREATE TABLE [" + table.name + "] (\n";

        for (let i = 0; i < table.rows.length; i++) {
            const row = table.rows[i]!;
            const last = i === table.rows.length - 1;

            out += "  [" + row.name + "] " + row.datatype + " ";
            if (!row.nullable) {
                out += "NOT NULL ";
            }
            if (row.autoincrement) {
                out += "IDENTITY (1, 1) ";
            }
            /* カンマがコメントより先に出るので、最終列以外でコメントがあると壊れる */
            if (!last) {
                out += ",";
            }
            if (row.comment) {
                out += " -- " + row.comment;
            }
            if (!last) {
                out += "\n";
            }
        }

        for (const key of table.keys) {
            if (key.type !== "PRIMARY" && key.type !== "FULLTEXT" && key.type !== "UNIQUE") {
                continue;
            }
            out += ", \n";
            if (key.name !== "") {
                out += "CONSTRAINT " + key.name;
            }
            if (key.type === "PRIMARY") {
                out += " PRIMARY KEY (";
            } else if (key.type === "FULLTEXT") {
                out += " FULLTEXT KEY (";
            } else {
                out += " UNIQUE KEY (";
            }
            out += key.parts.map((p) => "[" + p + "]").join(", ");
            out += ")";
        }

        out += "\n) ON [PRIMARY]\nGO\n\n";
    }

    /* <!-- fk --> */
    for (const table of tables) {
        for (const row of table.rows) {
            for (const rel of row.relations) {
                out +=
                    "ALTER TABLE [" +
                    table.name +
                    "] ADD FOREIGN KEY (" +
                    row.name +
                    ") REFERENCES [" +
                    rel.table +
                    "] ([" +
                    rel.row +
                    "]);\n\t\t\t\t\n";
            }
        }
    }

    /* INDEX（XSLT 側のコメントは <!-- fk --> のままだが中身は CREATE INDEX） */
    for (const table of tables) {
        for (const key of table.keys) {
            if (key.type !== "INDEX") {
                continue;
            }
            out += "CREATE INDEX " + key.name + " ON [" + table.name + "] ([";
            /* 開き [ は 1 回しか出ないので 2 列目以降は c2] になる（現行どおり） */
            out += key.parts.join("], ") + "]";
            out += ");\n";
        }
    }

    return out;
}
