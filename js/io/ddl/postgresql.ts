/* ------------------------- ddl: postgresql -------------------- */
/*
 * grabado: DesignModel -> PostgreSQL 18 の DDL（HANDOVER §6 段階6-5a 移植 / 6-5b 是正）。
 *
 * 6-5a が db/postgresql/output.xsl（170 行）を逐語移植した先。**6-5b で §6.3 の規約へ寄せた**
 * ので、ここはもう XSLT の写しではない。XSLT と違うのは次の 8 点で、どれが
 * tests/golden/ddl/postgresql/ のどの行に出るかまで CUSTOMIZATIONS.md の段階6-5b に対応表がある。
 *
 *   1. 制約名は key/@name を優先し、空のときだけ規約で組む（known-issues #6）
 *                                  house-defaults: users_pkey -> users_email_key / pk_article_tags
 *   2. PRIMARY / UNIQUE 以外は CREATE INDEX。PG に KEY (...) 構文は無い
 *                                  golden に fixture が無い（tests/node/ddl.test.ts と keys.spec.ts）
 *   3. 列を持たないキーは 1 文字も出さない（PRIMARY KEY (); を作らない）
 *                                  同上
 *   4. @autoincrement=1 は <datatype> を捨てず GENERATED ALWAYS AS IDENTITY を足す
 *                                  autoincrement: BIGSERIAL -> INTEGER GENERATED ALWAYS AS IDENTITY
 *   5. identity 列に NOT NULL / DEFAULT を出さない（PG が暗黙 NOT NULL・DEFAULT は併用不可）
 *                                  types-matrix: c_serial / c_bigserial の 2 行
 *   6. 識別子は必要なときだけ " で囲む（本体も COMMENT ON も同じ規則。js/io/ddl/naming.ts）
 *                                  quotes-i18n の 4 行 ＋ house-defaults / relations の COMMENT ON 8 行
 *   7. 列コメントは COMMENT ON COLUMN だけ。列定義の / * ... * / は二重なので出さない
 *                                  house-defaults 4 行 / relations 1 行 / quotes-i18n 3 行
 *   8. FK 名は fk_<table>_<参照元の列>（§6.3）。<table>_<column>_fkey ではない
 *                                  house-defaults 2 行 / relations 5 行
 *
 * **未現代化の 4 プロファイル（mysql / mssql / oracle / sqlite）は 6-8 まで動かさない。**
 * 共通で使える規則は js/io/ddl/naming.ts に置いてあり、6-8 は呼ぶだけで済む。
 */

import { replaceSubstring, type DdlTable } from "./shared.ts";
import {
    POSTGRESQL_IDENTIFIER,
    foreignKeyName,
    keyConstraintName,
    quoteIdentifier,
} from "./naming.ts";

/** 識別子を必要なときだけ " で囲む（js/io/ddl/naming.ts）。制約名・index 名も識別子 */
function q(name: string): string {
    return quoteIdentifier(name, POSTGRESQL_IDENTIFIER);
}

/**
 * 型名そのものが identity 句を持つか（パレットの bigint_identity = BIGINT GENERATED ALWAYS
 * AS IDENTITY）。**PG の文法語なので本ファイルに閉じる** —— mssql は IDENTITY(1,1)、
 * mysql は列属性 AUTO_INCREMENT と、6-8 では各プロファイルが別の判定を持つ。
 */
function hasIdentityClause(datatype: string): boolean {
    return /GENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY/i.test(datatype);
}

export function generatePostgresql(tables: readonly DdlTable[]): string {
    let out = "";

    /* <!-- tables --> */
    for (const table of tables) {
        out += "CREATE TABLE " + q(table.name) + " (\n";

        for (let i = 0; i < table.rows.length; i++) {
            const row = table.rows[i]!;
            out += " " + q(row.name) + " ";

            /*
             * identity 列（段階6-5b の決定 3）。identity には 2 つの入口がある:
             *   - @autoincrement=1     UI のチェック。型は <datatype> のまま句だけ足す
             *   - 型そのもの            パレットの bigint_identity（sql に句が入っている）
             * 6-5a まで前者は型を捨てて BIGSERIAL 固定、後者は句の後ろに NOT NULL を足していた。
             */
            const hasClause = hasIdentityClause(row.datatype);
            const identity = row.autoincrement || hasClause;
            out += identity && !hasClause
                ? row.datatype + " GENERATED ALWAYS AS IDENTITY"
                : row.datatype;

            /* identity は暗黙で NOT NULL。DEFAULT は PG が併用そのものを拒む */
            if (!row.nullable && !identity) {
                out += " NOT NULL";
            }
            /* XSLT は要素の存在（test="default"）と値（default != 'NULL'）を二段で見る */
            if (row.hasDefault && row.def !== "NULL" && !identity) {
                out += " DEFAULT " + row.def;
            }
            if (i !== table.rows.length - 1) {
                out += ",\n";
            }
        }

        out += "\n);\n";
        out += "\n\n";

        /* <!-- keys --> */
        for (const key of table.keys) {
            /*
             * 列を 1 つも持たないキーは 1 文字も出さない（段階6-5b の決定 7）。
             * KeyManager.add() が name も parts も空のキーを作るので UI から到達でき、
             * 6-5a まで PRIMARY KEY (); という構文エラーが出ていた。規約名も cols が
             * 空だと <table>__key / idx_<table>_ に退化する。
             */
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
                 * PRIMARY / UNIQUE 以外は制約ではなく index。PG に KEY (...) 構文は無く、
                 * 6-5a まで INDEX も FULLTEXT も壊れた ALTER TABLE に落ちていた。
                 * FULLTEXT を btree の CREATE INDEX に倒すのは決定（docs/FORMAT.md）——
                 * PG の全文検索索引は USING gin (to_tsvector(...)) という式インデックスで、
                 * モデルは式も config も持てない（keys[].columns は列名の配列）。
                 */
                out += "CREATE INDEX " + name + " ON " + q(table.name) + " (" + cols + ");\n";
            }
        }

        if (table.comment) {
            out +=
                "COMMENT ON TABLE " +
                q(table.name) +
                " IS '" +
                replaceSubstring(table.comment, "'", "''") +
                "';\n";
        }

        /* <!-- column comments --> */
        for (const row of table.rows) {
            if (row.comment) {
                out +=
                    "COMMENT ON COLUMN " +
                    q(table.name) +
                    "." +
                    q(row.name) +
                    " IS '" +
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
