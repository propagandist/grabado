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
import type { TypeLoss } from "../convert.ts";
import { convertDesign } from "../convert.ts";
import { buildDdlModel } from "./shared.ts";
import { generatePostgresql } from "./postgresql.ts";
import { generateMysql } from "./mysql.ts";
import { generateMssql } from "./mssql.ts";
import { generateOracle } from "./oracle.ts";
import { generateSqlite } from "./sqlite.ts";
import { generateSqlStandard } from "./sql-standard.ts";
import { generateH2 } from "./h2.ts";
import { generateMariadb } from "./mariadb.ts";

/**
 * DDL を生成する。
 *
 * **`target` は出力先の型パレット（段階6-10a）。** 省略すると設計のパレットで出す ——
 * 6-10a まではそれしか無く、`db` の 1 文字列が設計と出力の両方を決めていた。渡すと
 * js/io/convert.ts が正規型（kind）を介してモデルの写しを作り、**設計そのものには
 * 1 バイトも触らずに**別プロファイルの DDL を出す。
 *
 * 引数を足しただけなので**呼び手が 1 つも変わらない**（tests/browser/harness.ts の
 * generateDdl も known-issue #15 も従来の呼び形のまま）。既存 golden 56 本が動かない
 * 根拠は convertDesign が同じ db を恒等で返すこと。
 */
export function generateDdl(
    model: DesignModel,
    palette: TypePalette,
    target?: TypePalette,
): string {
    const output = target ?? palette;
    const db = output.db();
    if (db === null) {
        throw new Error("型パレットに db 属性が無い（DDL を生成できない）");
    }

    const converted = convertDesign(model, palette, output);
    const tables = buildDdlModel(converted.model, output);
    const body = generateFor(db, tables);

    /*
     * **テーブルが 0 件なら 1 バイトも出さない。** 変換した旨だけの DDL は意味が無く、
     * empty の golden が 0 バイトである契約（6-9d が ORM でも踏襲した）を保つ。
     */
    if (body === "") {
        return body;
    }
    return conversionNotice(palette, output, converted.losses, hasDefaults(converted.model)) + body;
}

function generateFor(db: string, tables: ReturnType<typeof buildDdlModel>): string {
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

/**
 * 何が起きたかを人が読む 1 語にする。**黙って落とさない**のが変換層の要件（6-9c）。
 *
 * `kind-widened` に語が無いのは、**行に正規型そのものが出るから**
 * （`UUID (uuid) -> TEXT (string)`）。「値の種類が変わった」と書き添えても
 * 同じことを 2 回言うだけになる。
 */
const LOSS_LABELS: Readonly<Record<TypeLoss["reason"], string>> = {
    unmappable: "写せる型が無いので既定型に置いた",
    "kind-widened": "",
    "size-dropped": "サイズが落ちた",
    "size-required": "**寄せ先はサイズを要求する。流す前に長さを足すこと**",
};

/**
 * 変換したときだけ先頭に付ける説明（段階6-10a）。**同じ db なら 1 バイトも足さない**
 * ので、既存の golden 56 本は無差分のまま。
 *
 * **一覧を先頭にまとめ、列ごとの行コメントは出さない。** 行コメントにすると 8 本の
 * 生成器すべてに差し込み口が要り、「既存 golden が 1 バイトも動かない」という本段階の
 * 完了判定を自分で危うくする。情報量は同じ（table.column で場所が分かる）。
 *
 * locale は通さない —— js/io/ は locale を知らない（docs/ARCHITECTURE.md §5.6 の規約3）。
 * ORM 出力（6-9d / 6-9e）が生成物のコメントを日本語で出しているのと同じ立場。
 */
function conversionNotice(
    from: TypePalette,
    to: TypePalette,
    losses: readonly TypeLoss[],
    hasDefault: boolean,
): string {
    const fromDb = from.db();
    const toDb = to.db();
    if (fromDb === null || fromDb === toDb) {
        return "";
    }

    const out = [`-- grabado: ${fromDb} の設計を ${toDb} 向けに変換して出力した。`];
    if (losses.length === 0) {
        out.push("-- 型はすべてそのまま写っている（意味が動いた列は無い）。");
    } else {
        /*
         * **1 列 1 行にまとめる。** 1 つの列に理由が 2 つ付くことがある
         * （NUMERIC(12,2) -> TEXT は「型が変わった」と「サイズが落ちた」の両方）ので、
         * 素直に losses を並べると同じ列が 2 行に出て読みにくい。
         */
        const order: string[] = [];
        const byColumn = new Map<string, TypeLoss[]>();
        for (const loss of losses) {
            const key = loss.table + "." + loss.column;
            const found = byColumn.get(key);
            if (found) {
                found.push(loss);
            } else {
                order.push(key);
                byColumn.set(key, [loss]);
            }
        }

        out.push("--");
        out.push(`-- **${order.length} 列で型が動いている。** DDL としては通るが、`);
        out.push("-- 設計が持っていた意味はここに挙げたぶんだけ変わっている:");
        out.push("--");
        for (const key of order) {
            const group = byColumn.get(key)!;
            const head = group[0]!;
            const notes = group
                .map((l) => LOSS_LABELS[l.reason])
                .filter((label) => label !== "");
            out.push(
                `--   ${oneLine(head.table)}.${oneLine(head.column)}: ` +
                    `${withKind(head.from, head.fromKind)} -> ${withKind(head.to, head.toKind)}` +
                    (notes.length ? " / " + notes.join(" / ") : ""),
            );
        }
    }

    /*
     * **既定値は写していない**（js/io/convert.ts の判断）。`uuidv7()` や `'{}'::jsonb` は
     * postgresql 固有で、mysql に出せばそこで落ちる —— **型より先に踏む問題**なので
     * 損失が 0 件でも言う。既定値を 1 つも持たない設計では黙る。
     */
    if (hasDefault) {
        out.push("--");
        out.push(
            "-- 既定値（DEFAULT）は変換していない —— DB 固有の関数やキャストはそのまま出る。",
        );
        out.push("-- 出力先で通るかは確認すること。");
    }
    return out.join("\n") + "\n\n";
}

/** 既定値を持つ列が 1 つでもあるか（上の注意を出すかどうか） */
function hasDefaults(model: DesignModel): boolean {
    return model.tables.some((t) => t.rows.some((r) => r.def !== ""));
}

/** `TEXT (string)`。sql 名だけでは名前が同じまま値の域が動いたことが見えない */
function withKind(sql: string, kind: string | null): string {
    return kind === null ? sql : `${sql} (${kind})`;
}

/** 識別子に改行が入っていてもコメントが本文に漏れないようにする */
function oneLine(text: string): string {
    return text.split("\r").join(" ").split("\n").join(" ");
}
