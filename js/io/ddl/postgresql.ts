/* ------------------------- ddl: postgresql -------------------- */
/*
 * grabado: db/postgresql/output.xsl（170 行）の逐語移植（HANDOVER §6 段階6-5a）。
 *
 * **出力バイト列を 1 バイトも変えないことが本段階の要件**なので、XSLT の粗さを
 * そのまま持ち込んでいる。整理したくなる箇所がそのまま危険箇所で、内訳は次のとおり
 * （どれも 6-5b で直す。CUSTOMIZATIONS.md の段階6-5a の記録）:
 *
 *   - 制約名が key/@name を無視して <table>_pkey 固定（known-issues #6）
 *   - PRIMARY / UNIQUE 以外の key type が PG に無い KEY (...) 構文に落ちる
 *   - @autoincrement=1 で <datatype> を捨てて BIGSERIAL 固定
 *   - 本体は識別子を裸で出すのに COMMENT ON だけ " で囲む
 *   - 列コメントが列定義（/* ... *\/）と COMMENT ON COLUMN の二重に出る
 *   - FK 名が <table>_<column>_fkey（§6.3 の fk_<table>_<ref> ではない）
 */

import { replaceSubstring, type DdlTable } from "./shared.ts";

export function generatePostgresql(tables: readonly DdlTable[]): string {
    let out = "";

    /* <!-- tables --> */
    for (const table of tables) {
        out += "CREATE TABLE " + table.name + " (\n";

        for (let i = 0; i < table.rows.length; i++) {
            const row = table.rows[i]!;
            out += " " + row.name + " ";

            /*
             * 6-3 が 6-5 へ送った項目。<datatype> を読まずに BIGSERIAL 固定なので、
             * PG18 パレットの bigint_identity（BIGINT GENERATED ALWAYS AS IDENTITY）と
             * 噛み合わない。直すのは 6-5b
             */
            out += row.autoincrement ? "BIGSERIAL" : row.datatype;

            if (!row.nullable) {
                out += " NOT NULL";
            }
            /* XSLT は要素の存在（test="default"）と値（default != 'NULL'）を二段で見る */
            if (row.hasDefault && row.def !== "NULL") {
                out += " DEFAULT " + row.def;
            }
            if (row.comment) {
                out += "/* " + row.comment + " */";
            }
            if (i !== table.rows.length - 1) {
                out += ",\n";
            }
        }

        out += "\n);\n";
        out += "\n\n";

        /* <!-- keys --> */
        for (const key of table.keys) {
            out += "ALTER TABLE " + table.name + " ADD CONSTRAINT " + table.name + "_pkey ";
            if (key.type === "PRIMARY") {
                out += "PRIMARY KEY (";
            } else if (key.type === "UNIQUE") {
                out += "UNIQUE (";
            } else {
                out += "KEY (";
            }
            out += key.parts.join(", ");
            out += ");\n";
        }

        if (table.comment) {
            out +=
                'COMMENT ON TABLE "' +
                table.name +
                "\" IS '" +
                replaceSubstring(table.comment, "'", "''") +
                "';\n";
        }

        /* <!-- column comments --> */
        for (const row of table.rows) {
            if (row.comment) {
                out +=
                    'COMMENT ON COLUMN "' +
                    table.name +
                    '"."' +
                    row.name +
                    "\" IS '" +
                    replaceSubstring(row.comment, "'", "''") +
                    "';\n";
            }
        }

        out += "\n";
    }

    /* <!-- tables --> <!-- fk --> 全テーブルを再走査する 2 周目 */
    for (const table of tables) {
        for (const row of table.rows) {
            for (const rel of row.relations) {
                out +=
                    "ALTER TABLE " +
                    table.name +
                    " ADD CONSTRAINT " +
                    table.name +
                    "_" +
                    row.name +
                    "_fkey FOREIGN KEY (" +
                    row.name +
                    ") REFERENCES " +
                    rel.table +
                    "(" +
                    rel.row +
                    ");\n";
            }
        }
    }

    return out;
}
