/* ------------------------- ddl: mysql ------------------------- */
/*
 * grabado: db/mysql/output.xsl（218 行）の逐語移植（HANDOVER §6 段階6-5a）。
 *
 * 5 本のうち唯一「テーブル 0 件でも出力が空にならない」プロファイル。Globals /
 * Foreign Keys / Table Properties / Test Data の 4 ブロックが無条件に出るので、
 * empty fixture の golden が 192 バイトある。
 *
 * 逐語で持ち込んだ粗さ（直すのは 6-8。CUSTOMIZATIONS.md の段階6-5a の記録）:
 *   - DROP TABLE IF EXISTS の直後に「タブ 2 個だけの行」が出る
 *   - コメントを 60 字で無言に切り詰める（substring(comment, 1, 60)）
 *   - FK の参照元列だけ引用符が付かない（テーブル名には付く）
 *   - PRIMARY / FULLTEXT / UNIQUE 以外が KEY (...) に落ちる
 *
 * なお XSLT 側には <xsl-text>（正しくは xsl:text）というタイポが 7 箇所あり、
 * 非名前空間のリテラル結果要素として扱われた結果 method="text" では中身だけが出て
 * **たまたま動いていた**。移植でその区別は消える。
 */

import { replaceSubstring, type DdlTable } from "./shared.ts";

/** XPath の substring(s, 1, 60)。現行 fixture に 60 字を超えるコメントは無い */
function truncate60(comment: string): string {
    return comment.substring(0, 60);
}

function quoteComment(comment: string): string {
    return replaceSubstring(truncate60(comment), "'", "''");
}

export function generateMysql(tables: readonly DdlTable[]): string {
    let out = "";

    out += "\n-- ---\n-- Globals\n-- ---\n\n";
    out += '-- SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";\n';
    out += "-- SET FOREIGN_KEY_CHECKS=0;\n\n";

    /* <!-- tables --> */
    for (const table of tables) {
        out += "-- ---\n-- Table '" + table.name + "'\n-- ";
        if (table.comment) {
            out += quoteComment(table.comment);
        }
        out += "\n-- ---\n\n";

        /* xsl:text 内のリテラルなので、タブ 2 個の行がそのまま出る */
        out += "DROP TABLE IF EXISTS `" + table.name + "`;\n\t\t\n";
        out += "CREATE TABLE `" + table.name + "` (\n";

        for (let i = 0; i < table.rows.length; i++) {
            const row = table.rows[i]!;
            out += "  `" + row.name + "` " + row.datatype;

            /* 5 本のうち NULL を明示するのは mysql だけ（xsl:otherwise を持つ） */
            out += row.nullable ? " NULL" : " NOT NULL";

            if (row.autoincrement) {
                out += " AUTO_INCREMENT";
            }
            if (row.hasDefault) {
                out += " DEFAULT " + row.def;
            }
            if (row.comment) {
                out += " COMMENT '" + quoteComment(row.comment) + "'";
            }
            if (i !== table.rows.length - 1) {
                out += ",\n";
            }
        }

        /* <!-- keys --> テーブル定義の中に置かれる */
        for (const key of table.keys) {
            out += ",\n";
            if (key.type === "PRIMARY") {
                out += "  PRIMARY KEY (";
            } else if (key.type === "FULLTEXT") {
                out += "  FULLTEXT KEY (";
            } else if (key.type === "UNIQUE") {
                out += "  UNIQUE KEY (";
            } else {
                out += "KEY (";
            }
            out += key.parts.map((p) => "`" + p + "`").join(", ");
            out += ")";
        }

        out += "\n)";
        if (table.comment) {
            out += " COMMENT '" + quoteComment(table.comment) + "'";
        }
        out += ";\n\n";
    }

    /* 末尾のスペースまで含めて現行どおり（"-- Foreign Keys "） */
    out += "-- ---\n-- Foreign Keys \n-- ---\n\n";

    /* <!-- fk --> */
    for (const table of tables) {
        for (const row of table.rows) {
            for (const rel of row.relations) {
                out +=
                    "ALTER TABLE `" +
                    table.name +
                    "` ADD FOREIGN KEY (" +
                    row.name +
                    ") REFERENCES `" +
                    rel.table +
                    "` (`" +
                    rel.row +
                    "`);\n";
            }
        }
    }

    out += "\n-- ---\n-- Table Properties\n-- ---\n\n";
    for (const table of tables) {
        out +=
            "-- ALTER TABLE `" +
            table.name +
            "` ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;\n";
    }

    out += "\n-- ---\n-- Test Data\n-- ---\n\n";
    for (const table of tables) {
        out += "-- INSERT INTO `" + table.name + "` (";
        out += table.rows.map((r) => "`" + r.name + "`").join(",");
        out += ") VALUES\n-- (";
        out += table.rows.map(() => "''").join(",");
        out += ");\n";
    }

    return out;
}
