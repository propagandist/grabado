/* ------------------------- ddl generate ----------------------- */
/*
 * grabado: DesignModel -> DDL 文字列（HANDOVER §6 段階6-5a）。
 *
 * 段階4-1a で組んだ格子（docs/ARCHITECTURE.md §5.6）の**形式側にもう 1 本足した**もので、
 * ライブ側（js/io/extract.ts / js/io/apply.ts）とモデル（js/io/model.ts）には 1 行も触らない。
 *
 *            ライブ側（描画エンジンを触る）      形式側（バイト列を知る）
 *      出    extract.ts                        json-serializer.ts / **本ディレクトリ**
 *      入    apply.ts                          xml-parser.ts / json-parser.ts
 *
 * 6-5a まで、この位置には db/<db>/output.xsl（XSLT 1.0）が居た。DDL 生成だけが
 * 「モデル -> 中間 XML -> XSLT -> 文字列」という 3 段で、他の形式は 1 段だった。
 * 中間 XML（js/io/ddl-xml.ts と tests/golden/ddl-input/）はこの段階で消えている。
 *
 * **プロファイル間の共通化は 6-5a では行わない。** 5 本の文法差が大きく（DROP 文の
 * 有無・GO・trigger + sequence・桁揃え・inline FK）、逐語移植の最中に共通項を括ると
 * 「挙動不変」の主張が弱くなる。4-1a が toXML() 4 実装を移設したときと同じ立場で、
 * 共通骨格の抽出は sql-standard を基底に置く 6-7 の仕事（CUSTOMIZATIONS.md 段階6-7）。
 *
 * **段階6-7a で sql-standard、6-7b で h2 が入った。** どちらも骨格は postgresql と同じで、
 * 違うのは識別子の語彙と、標準に無い COMMENT ON / CREATE INDEX の有無だけ。**6-7b で
 * その 3 本を js/io/ddl/ansi.ts へ寄せた** —— h2 が postgresql と構文レベルで同一で、
 * 170 行のコピーを作るしかなくなったため。**段階6-8d で 8 本そろい、骨格は 3 通りに
 * 落ち着いた**: ansi.ts（postgresql / sql-standard / h2）／ mysql-style.ts
 * （mysql / mariadb）／ 独立実装（mssql / oracle / sqlite）。3 本目の骨格は作っていない ——
 * 独立の 3 本は「キーを表定義に置く」以外に共通点が無く、抽象の中身が boolean の束になる。
 *
 * export は 1 本だけにしてある。未使用の export を出すと、ツリーシェイクを切っている
 * Node ハーネス（tests/node/harness.ts）の束と dist の束が構造的にずれる。
 */

import type { TypePalette } from "../palette.ts";
import type { DesignModel } from "../model.ts";
import { buildDdlModel } from "./shared.ts";
import { generatePostgresql } from "./postgresql.ts";
import { generateMysql } from "./mysql.ts";
import { generateMssql } from "./mssql.ts";
import { generateOracle } from "./oracle.ts";
import { generateSqlite } from "./sqlite.ts";
import { generateSqlStandard } from "./sql-standard.ts";
import { generateH2 } from "./h2.ts";
import { generateMariadb } from "./mariadb.ts";

export function generateDdl(model: DesignModel, palette: TypePalette): string {
    const db = palette.db();
    if (db === null) {
        throw new Error("型パレットに db 属性が無い（DDL を生成できない）");
    }

    const tables = buildDdlModel(model, palette);

    /*
     * XSLT 経路では db/<db>/output.xsl の GET が 404 になっていた失敗が、
     * ここでは「対応していないプロファイル」という理由の分かる例外になる。
     */
    switch (db) {
        case "postgresql":
            return generatePostgresql(tables).trim();
        case "mysql":
            return generateMysql(tables).trim();
        case "mssql":
            return generateMssql(tables).trim();
        case "oracle":
            return generateOracle(tables).trim();
        case "sqlite":
            return generateSqlite(tables).trim();
        case "sql-standard":
            return generateSqlStandard(tables).trim();
        case "h2":
            return generateH2(tables).trim();
        case "mariadb":
            return generateMariadb(tables).trim();
        default:
            throw new Error(`DDL 生成に対応していない DB プロファイル: ${db}`);
    }
}
