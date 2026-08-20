/* ------------------------- ddl: sqlite ------------------------ */
/*
 * grabado: db/sqlite/output.xsl（105 行）の逐語移植（HANDOVER §6 段階6-5a）。
 *
 * 逐語で持ち込んだ粗さ（直すのは 6-8。CUSTOMIZATIONS.md の段階6-5a の記録）:
 *   - **複合 PRIMARY KEY が UNIQUE に落ち、PRIMARY KEY が消える**
 *     （known-issues に新設した）
 *   - 識別子をシングルクォートで囲む（SQLite では文字列リテラル扱いになりうる）
 *   - コメントを一切出力しない
 *
 * 単一列 PK だけが列定義に inline され、複合 PK と UNIQUE はテーブル内の
 * UNIQUE (...) になる。FK も列定義に inline される（5 本のうちここだけ）。
 */

import type { DdlTable } from "./shared.ts";

export function generateSqlite(tables: readonly DdlTable[]): string {
    let out = "";

    for (const table of tables) {
        out += "CREATE TABLE '" + table.name + "' (\n";

        for (let i = 0; i < table.rows.length; i++) {
            const row = table.rows[i]!;

            out += "'" + row.name + "' " + row.datatype;

            if (!row.nullable) {
                out += " NOT NULL ";
            }
            if (row.hasDefault) {
                out += " DEFAULT " + row.def;
            }

            /*
             * autoincrement/primary key after column - only when composed of 1 part.
             * 該当する key が複数あれば複数回出る（XSLT の入れ子 for-each の逐語）
             */
            for (const key of table.keys) {
                if (key.type === "PRIMARY" && key.parts.length === 1) {
                    for (const part of key.parts) {
                        if (row.name === part) {
                            out += " PRIMARY KEY";
                        }
                    }
                }
            }

            if (row.autoincrement) {
                out += " AUTOINCREMENT";
            }

            /* <!-- fk --> 列定義に inline */
            for (const rel of row.relations) {
                out += " REFERENCES '" + rel.table + "' ('" + rel.row + "')";
            }

            if (i !== table.rows.length - 1) {
                out += ",\n";
            }
        }

        /* keys after table */
        for (const key of table.keys) {
            if (key.type === "UNIQUE" || (key.type === "PRIMARY" && key.parts.length > 1)) {
                out += ",\n";
                out += "UNIQUE (";
                out += key.parts.join(", ");
                out += ")";
            }
        }

        out += "\n);\n\n";
    }

    for (const table of tables) {
        for (const key of table.keys) {
            if (key.type !== "INDEX") {
                continue;
            }
            out += "CREATE INDEX '" + key.name + "' ON '" + table.name + "' ('";
            out += key.parts.join("', '");
            out += "');\n";
        }
    }

    return out;
}
