/* ------------------------- ddl: sqlite ------------------------ */
/*
 * grabado: DesignModel -> SQLite 3.51 STRICT の DDL（段階6-5a 移植 / 6-8d 現代化）。
 *
 * **独立実装。** js/io/ddl/ansi.ts にも mysql-style.ts にも載らない —— SQLite には
 * ALTER TABLE ADD CONSTRAINT が無く（実測: near "CONSTRAINT": syntax error）、
 * **すべての制約を CREATE TABLE の中に書くしかない**唯一のプロファイル。
 * mssql / oracle と共通なのも「キーを表定義に置く」1 点だけなので、8 本目に 3 つ目の
 * 骨格を作る根拠（6-7b が ansi.ts を作ったときの「170 行のコピーができる」）に当たらない。
 *
 * 6-8d で消えた upstream の粗さ（6-5a が逐語で持ち込んだもの）:
 *
 *   1. **複合 PRIMARY KEY が UNIQUE に落ち PRIMARY KEY が消える**（known-issue #13）
 *                                   -> 表内の CONSTRAINT <名> PRIMARY KEY (...)
 *   2. **識別子をシングルクォートで囲む**（SQLite では文字列リテラルにもなる記法）
 *                                   -> naming.ts の SQLITE_IDENTIFIER（" / "" / BARE_LOWER）
 *   3. **コメントを 1 つも出さない**   -> sql-standard / mssql と同じ行コメント
 *   4. **AUTOINCREMENT を単独で出す**  -> SQLite が受ける唯一の形だけに絞る（下）
 *   5. **NONE という実在しない型名**   -> パレット側で ANY になった（db/sqlite/datatypes.xml）
 *   6. 制約名が付かない                -> §6.3 の規約名（naming.ts）
 *
 * **STRICT テーブルを出す**（6-8d の決めたこと 1）。型の取り違えを DB 側で止められる
 * ようになるかわり、型パレットは 6 語（INT を除いて 5 型）に固定され、**サイズを 1 つも
 * 書けない**（TEXT(255) は unknown datatype。実測）。SQLite 3.37+（2021-11）が要る。
 *
 * **DEFAULT の関数呼び出しは括弧で包む。** SQLite の文法は DEFAULT ( expr ) か
 * DEFAULT literal か DEFAULT signed-number で、括弧の無い DEFAULT unixepoch() は
 * near "(": syntax error になる（実測）。**MySQL 8 とまったく同じ問題**なので、
 * 6-8a が shared.ts に切り出した isFunctionCall をそのまま使う
 * （キーワードを包んではいけないのも同じ理由）。
 */

import { isFunctionCall, replaceSubstring, type DdlRow, type DdlTable } from "./shared.ts";
import {
    SQLITE_IDENTIFIER,
    foreignKeyName,
    keyConstraintName,
    quoteIdentifier,
} from "./naming.ts";

/** 識別子を必要なときだけ " で囲む（語彙は SQLite 3.51.2 の実測 59 語） */
function q(name: string): string {
    return quoteIdentifier(name, SQLITE_IDENTIFIER);
}

/**
 * 行コメント 1 行に畳む（ansi.ts の lineComment と同じ理由）。
 * -- は行末までがコメントなので、値に改行が入ると 2 行目から SQL として解釈されて壊れる。
 */
function lineComment(text: string): string {
    return replaceSubstring(replaceSubstring(text, "\r", " "), "\n", " ");
}

/**
 * この行に AUTOINCREMENT を出せるか。**SQLite が受ける形は 1 通りしかない。**
 *
 * 実測（SQLite 3.51.2）:
 *   INTEGER PRIMARY KEY AUTOINCREMENT        OK（列内・表内のどちらでも）
 *   INT     PRIMARY KEY AUTOINCREMENT        AUTOINCREMENT is only allowed on an
 *   TEXT    PRIMARY KEY AUTOINCREMENT        INTEGER PRIMARY KEY
 *   PRIMARY KEY (id AUTOINCREMENT, y)        near ",": syntax error（複合には付かない）
 *   x INTEGER AUTOINCREMENT（PK でない列）    near "AUTOINCREMENT": syntax error
 *
 * **SQLite 公式は AUTOINCREMENT を非推奨としている**（rowid の再利用を止めるかわりに
 * CPU・メモリ・sqlite_sequence 表の維持コストを払う）。それでも出すのは、これが
 * **ユーザーが明示的にチェックを入れたときだけの経路**だから —— §6.2 のテンプレートは
 * ai を立てないので house 既定の新規テーブルには 1 つも出ず、公式の勧め（既定では使うな）は
 * 既定側で守られている。チェックを入れた人が欲しいのは「削除した id が二度と再利用されない」
 * ことで、それは AUTOINCREMENT でしか得られない。
 */
function canAutoincrement(table: DdlTable, row: DdlRow): boolean {
    if (!row.autoincrement || row.datatype !== "INTEGER") {
        return false;
    }
    const primary = table.keys.filter((k) => k.type === "PRIMARY" && k.parts.length > 0);
    return (
        primary.length === 1 && primary[0]!.parts.length === 1 && primary[0]!.parts[0] === row.name
    );
}

export function generateSqlite(tables: readonly DdlTable[]): string {
    let out = "";

    /*
     * **FK を 1 本でも持つ設計にだけ出す**（段階6-8d）。SQLite の foreign_keys は
     * **接続ごとの設定で既定が OFF** なので、これを書かないと生成 DDL の FK が
     * 「作られるが 1 度も検査されない」状態になる —— 出力が嘘になる。
     * 関係が無い設計に出さないのは、意味を持たない 1 行を全ファイルの先頭に置かないため。
     */
    if (tables.some((t) => t.rows.some((r) => r.relations.length > 0))) {
        out += "PRAGMA foreign_keys = ON;\n\n";
    }

    for (const table of tables) {
        out += "CREATE TABLE " + q(table.name) + " (\n";

        const lines: string[] = [];
        const notes: string[] = [];

        for (const row of table.rows) {
            let line = "  " + q(row.name) + " " + row.datatype;
            if (!row.nullable) {
                line += " NOT NULL";
            }
            /* DEFAULT NULL は句ごと落とす（postgresql / mssql / oracle と同じ） */
            if (row.hasDefault && row.def !== "NULL") {
                line += " DEFAULT " + (isFunctionCall(row.def) ? "(" + row.def + ")" : row.def);
            }
            lines.push(line);

            /*
             * **要求された AUTOINCREMENT が合法形でないときは黙って落とさず理由を残す。**
             * 6-8c が ??INDEX?? を「黙って落とすよりは目に見える形で」と書いたのと同じ立場を、
             * 実行できる形（行コメント）でやる。
             */
            if (row.autoincrement && !canAutoincrement(table, row)) {
                notes.push(
                    "-- " +
                        q(table.name) +
                        "." +
                        q(row.name) +
                        ": AUTOINCREMENT は単一列の INTEGER PRIMARY KEY にしか付けられない（SQLite）",
                );
            }
        }

        /*
         * キーはテーブル定義の中。**PRIMARY / UNIQUE だけが制約**で、他は下の CREATE INDEX。
         * 列を持たないキーを 1 文字も出さないのは 8 本共通（段階6-5b の決定 7）。
         *
         * **SQLite は PRIMARY KEY / UNIQUE の制約名を保持しない**（実測: 自動索引が
         * sqlite_autoindex_<t>_<n> になり、別テーブルで同名を再利用しても通る）。それでも
         * CONSTRAINT <名> を出すのは、key/@name が **UI で編集できるモデルの値**（known-issue
         * #6 の是正で優先すると決めた値）で、出さないと生成物から消えてしまうため。
         * 生成 DDL は人が読んでから実行する成果物なので、DB に残らなくても書く。
         */
        for (const key of table.keys) {
            if (key.parts.length === 0 || (key.type !== "PRIMARY" && key.type !== "UNIQUE")) {
                continue;
            }
            const cols = key.parts
                .map((part) => {
                    const row = table.rows.find((r) => r.name === part);
                    /* AUTOINCREMENT は表内 PRIMARY KEY の**列名の後ろ**に置く（実測で合法） */
                    return key.type === "PRIMARY" && row && canAutoincrement(table, row)
                        ? q(part) + " AUTOINCREMENT"
                        : q(part);
                })
                .join(", ");
            lines.push(
                "  CONSTRAINT " +
                    q(keyConstraintName(key, table.name)) +
                    (key.type === "PRIMARY" ? " PRIMARY KEY (" : " UNIQUE (") +
                    cols +
                    ")",
            );
        }

        /*
         * **FK もテーブル定義の中。SQLite だけが後から足せない。** 前方参照は許される ——
         * foreign_keys=ON でも、まだ存在しない表への FK を宣言する CREATE TABLE は成功し、
         * 違反が出るのは INSERT 時（実測）。したがって他 7 本のように「全テーブルを作り
         * 終えてから」の 2 周目に回す必要が無い。名前は §6.3 の fk_<table>_<列>
         * （PRIMARY / UNIQUE と違い、**FK の名前は sqlite_master に原文のまま残る**）。
         */
        for (const row of table.rows) {
            for (const rel of row.relations) {
                lines.push(
                    "  CONSTRAINT " +
                        q(foreignKeyName(table.name, row.name)) +
                        " FOREIGN KEY (" +
                        q(row.name) +
                        ") REFERENCES " +
                        q(rel.table) +
                        " (" +
                        q(rel.row) +
                        ")",
                );
            }
        }

        out += lines.join(",\n");
        /* STRICT は表オプション。列リストの ) の後ろに置く */
        out += "\n) STRICT;\n\n";

        /*
         * コメントは表定義の**後ろ**。**SQLite に COMMENT ON は無い**ので sql-standard /
         * mssql と同じ行コメントに落とす（情報は落とさず、実行できる形で出す）。
         * 列定義の行末に置くと区切りカンマを飲む —— mssql の known-issue #12 と同じ形。
         */
        const comments = notes.slice();
        if (table.comment) {
            comments.push("-- " + q(table.name) + ": " + lineComment(table.comment));
        }
        for (const row of table.rows) {
            if (row.comment) {
                comments.push(
                    "-- " + q(table.name) + "." + q(row.name) + ": " + lineComment(row.comment),
                );
            }
        }
        if (comments.length) {
            out += comments.join("\n") + "\n\n";
        }
    }

    /*
     * 索引。PRIMARY / UNIQUE 以外がここへ来る。**FULLTEXT も CREATE INDEX に倒す** ——
     * SQLite の全文検索は FTS5 の**仮想テーブル**で索引ではなく、元表との同期トリガーまで
     * 書くことになる。モデル（keys[].columns は列名の配列）が持たない前提を埋めてしまうので
     * 採らない（ansi.ts / oracle.ts と同じ判断。docs/FORMAT.md）。
     */
    for (const table of tables) {
        for (const key of table.keys) {
            if (key.parts.length === 0 || key.type === "PRIMARY" || key.type === "UNIQUE") {
                continue;
            }
            out +=
                "CREATE INDEX " +
                q(keyConstraintName(key, table.name)) +
                " ON " +
                q(table.name) +
                " (" +
                key.parts.map(q).join(", ") +
                ");\n";
        }
    }

    return out;
}
