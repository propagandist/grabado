/* ------------------------- ddl: ansi 系の共通骨格 ------------- */
/*
 * grabado: ALTER TABLE 系プロファイルの共通実装（HANDOVER §6 段階6-7b）。
 *
 * 6-5a が「プロファイル間の共通化は 6-7 の仕事」として送り、6-7a が「3 本そろってから」と
 * 保留した骨格の**前半**。`h2` を書く段になって、**postgresql と構文レベルで同一**だと
 * 分かったので、170 行のコピーを作るかわりにここへ寄せた。
 *
 * **6-7a の「3 本そろうまで待つ」は 8 本の一般化の話。** `mysql` / `mssql` / `oracle` /
 * `sqlite` / `mariadb` は DROP 文・GO・trigger + sequence・inline FK と骨格からして違うので、
 * それらを含めた抽象は 6-7c（mariadb）と 6-8（既存 4 本の現代化）で決める。
 * ここが受け持つのは「**CREATE TABLE ＋ ALTER TABLE ADD CONSTRAINT で組み立てる系**」だけ。
 *
 * 3 本の違いは 2 つに畳める:
 *
 *   識別子の語彙   IdentifierRules（囲む記号は 3 本とも "。中身の語彙だけが違う）
 *   標準に無い構文  COMMENT ON と CREATE INDEX。sql-standard だけが持たず行コメントに落ちる
 *
 * **postgresql の出力はバイト単位で不変。** それを保証しているのは
 * tests/golden/ddl/postgresql/ の 7 本で、この抽出でも 1 バイトも動いていない。
 */

import { replaceSubstring, type DdlTable } from "./shared.ts";
import {
    foreignKeyName,
    keyConstraintName,
    quoteIdentifier,
    type IdentifierRules,
} from "./naming.ts";

export interface AnsiDialect {
    /** 識別子の囲み方と、裸で書けない語の集合 */
    readonly rules: IdentifierRules;
    /**
     * COMMENT ON TABLE / COLUMN を出せるか。
     * **SQL 標準には無い**（PostgreSQL / Oracle / H2 の拡張）ので sql-standard だけ false。
     */
    readonly hasCommentOn: boolean;
    /**
     * CREATE INDEX を出せるか。
     * **索引は SQL 標準の範囲外**（どの版にも構文が無い）ので sql-standard だけ false。
     */
    readonly hasCreateIndex: boolean;
}

/**
 * 型名そのものが identity 句を持つか（パレットの bigint_identity）。
 *
 * 綴りは SQL:2003 のもので、3 本とも同じ。**mssql の IDENTITY(1,1) や mysql の
 * 列属性 AUTO_INCREMENT は別の判定**なので、それらは各プロファイルが自分で持つ。
 */
function hasIdentityClause(datatype: string): boolean {
    return /GENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY/i.test(datatype);
}

/**
 * 行コメント 1 行に畳む（sql-standard 用）。
 *
 * **改行を空白へ潰すのがここの仕事。** `--` は行末までがコメントなので、値に改行が入ると
 * 2 行目から SQL として解釈されて壊れる（COMMENT ON は '...' で囲むので同じ危険が無い）。
 * CR も LF も潰すのは、設計 JSON が CRLF の環境を通ってくることがあるため。
 */
function lineComment(text: string): string {
    return replaceSubstring(replaceSubstring(text, "\r", " "), "\n", " ");
}

export function generateAnsi(tables: readonly DdlTable[], dialect: AnsiDialect): string {
    const q = (name: string): string => quoteIdentifier(name, dialect.rules);
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

            /* identity は暗黙で NOT NULL。DEFAULT は併用そのものを拒まれる */
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
                 * モデルは式も config も持てない（keys[].columns は列名の配列）。
                 */
                const create = "CREATE INDEX " + name + " ON " + q(table.name) + " (" + cols + ");";
                out += dialect.hasCreateIndex
                    ? create + "\n"
                    : "-- " + create + " (索引は SQL 標準の範囲外)\n";
            }
        }

        /*
         * コメント。COMMENT ON を持たない sql-standard は行コメントに落とす ——
         * 「出さない」ではなく「コメントで出す」のは、ベンダ非依存で書いて各製品へ
         * 持っていく用途で移し先に渡すものが減るため（段階6-7a の決定 2）。
         */
        if (table.comment) {
            out += dialect.hasCommentOn
                ? "COMMENT ON TABLE " +
                  q(table.name) +
                  " IS '" +
                  replaceSubstring(table.comment, "'", "''") +
                  "';\n"
                : "-- " + q(table.name) + ": " + lineComment(table.comment) + "\n";
        }

        /* <!-- column comments --> */
        for (const row of table.rows) {
            if (row.comment) {
                out += dialect.hasCommentOn
                    ? "COMMENT ON COLUMN " +
                      q(table.name) +
                      "." +
                      q(row.name) +
                      " IS '" +
                      replaceSubstring(row.comment, "'", "''") +
                      "';\n"
                    : "-- " +
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
