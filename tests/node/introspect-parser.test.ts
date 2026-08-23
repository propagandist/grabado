import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { REPO_ROOT } from "../support/fixtures.ts";
import { TypePalette } from "../../js/io/palette.ts";
import { introspectionToModel } from "../../js/io/introspect-parser.ts";
import type { IntrospectionResult } from "../../js/io/introspect-model.ts";

/*
 * introspection JSON -> DesignModel（HANDOVER §5.2 / 段階5-6）。
 *
 * **ハーネスを使わない。** introspectionToModel() は形式側の純関数で、ライブツリーにも
 * UI にも触らない（tests/node/ では detect.test.ts / conflict.test.ts と同じ立場）。
 * 要るのは TypePalette 1 つだけなので、jsdom で datatypes.xml を parse して直接渡す。
 *
 * ★ 本段階では **UI に配線しない**。`serverimport` は今も XML を受けており、
 *   JSON 化は 5-7（backend の実装と同じ PR）。ここで先に純関数とテストを置くのは
 *   4-2（形式側を先に足して安全網 → 4-3 で UI）と同じ形。
 */

const FIXTURE = join(REPO_ROOT, "tests", "fixtures", "introspection", "postgresql.json");

function loadPalette(db: string): TypePalette {
    const xml = readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8");
    const doc = new JSDOM("", { contentType: "text/html" }).window.DOMParser;
    const parsed = new doc().parseFromString(xml, "text/xml");
    const palette = new TypePalette();
    palette.setRoot(parsed.documentElement);
    return palette;
}

describe("introspection JSON を設計モデルへ写す（段階5-6）", () => {
    let palette: TypePalette;
    let source: IntrospectionResult;

    beforeAll(() => {
        palette = loadPalette("postgresql");
        source = JSON.parse(readFileSync(FIXTURE, "utf8")) as IntrospectionResult;
    });

    test("テーブルと列が順序どおりに写る", () => {
        const { model } = introspectionToModel(source, palette);

        expect(model.tables.map((t) => t.title)).toEqual([
            "users",
            "articles",
            "article_tags",
        ]);
        expect(model.tables[0]!.rows.map((r) => r.title)).toEqual([
            "id",
            "email",
            "profile",
            "tags",
            "status",
            "created_at",
        ]);
    });

    test("座標は 0（直後に alignTables() が実測の幅で並べ直す）", () => {
        const { model } = introspectionToModel(source, palette);

        for (const table of model.tables) {
            expect(table.x).toBe(0);
            expect(table.y).toBe(0);
        }
    });

    test("コメントは写り、無ければ空文字", () => {
        const { model } = introspectionToModel(source, palette);

        expect(model.tables[0]!.comment).toBe("ユーザー");
        expect(model.tables[2]!.comment).toBe("");
        expect(model.tables[1]!.rows[1]!.comment).toBe("著者");
    });

    test("既定値は生のまま（NULL の正規化はしない）", () => {
        const { model } = introspectionToModel(source, palette);
        const id = model.tables[0]!.rows[0]!;

        expect(id.def).toBe("uuidv7()");
        expect(model.tables[0]!.rows[2]!.def).toBe("'{}'::jsonb");
        /* default が無い列は空文字（"NULL" という文字列にしない） */
        expect(model.tables[0]!.rows[1]!.def).toBe("");
    });

    test("NOT NULL が nll に写る", () => {
        const { model } = introspectionToModel(source, palette);

        expect(model.tables[0]!.rows[0]!.nll).toBe(false);
        expect(model.tables[0]!.rows[3]!.nll).toBe(true);
    });

    describe("型の解決", () => {
        test("data_type がパレットに当たれば損失なし", () => {
            const { model, losses } = introspectionToModel(source, palette);
            const users = model.tables[0]!;

            /* uuid / jsonb / timestamptz はいずれも PG パレットにある */
            for (const index of [0, 2, 5]) {
                const type = palette.typeAt(users.rows[index]!.type);
                expect(type.getAttribute("sql")).toBeTruthy();
            }
            /* 落ちたのは配列と enum の 2 列だけ */
            expect(losses.map((l) => l.column)).toEqual(["tags", "status"]);
        });

        test("introspection の実出力の型名で引ける（aka の 2 番目の基準）", () => {
            const { model } = introspectionToModel(source, palette);
            const createdAt = model.tables[0]!.rows[5]!;

            /* `timestamp with time zone` は data_type の綴りで、sql 名ではない */
            expect(palette.kindAt(createdAt.type)).toBe("timestamp_tz");
        });

        test("配列は要素型で引き直し、kind-widened として残す", () => {
            const { model, losses } = introspectionToModel(source, palette);
            const tags = model.tables[0]!.rows[3]!;

            /* text[] の要素型 text で引けた（現行 PHP は要素型ごと落としていた） */
            expect(palette.kindAt(tags.type)).toBe("string");
            const loss = losses.find((l) => l.column === "tags")!;
            expect(loss.from).toBe("ARRAY");
            expect(loss.reason).toBe("kind-widened");
        });

        test("enum は既定型へ落とし、unmappable として残す", () => {
            const { model, losses } = introspectionToModel(source, palette);
            const status = model.tables[0]!.rows[4]!;

            /* パレットに user_status は無い。落とし先はサイズを取らない文字列型 */
            expect(palette.hasSize(status.type)).toBe(false);
            const loss = losses.find((l) => l.column === "status")!;
            expect(loss.from).toBe("USER-DEFINED");
            expect(loss.reason).toBe("unmappable");
            expect(loss.table).toBe("users");
        });

        test("解決できない列があっても他の列は写る（1 列で全滅しない）", () => {
            /*
             * ★ これが本段階の要。indexOfTypeName() は段階6-8d から strict 一本で、
             *   一致しなければ -1。素直に throw すると **1 列のせいで import が全滅する**。
             */
            const { model } = introspectionToModel(source, palette);

            expect(model.tables[0]!.rows).toHaveLength(6);
            expect(model.tables).toHaveLength(3);
        });
    });

    describe("サイズ", () => {
        test("varchar(255) は長さが写る", () => {
            const { model } = introspectionToModel(source, palette);

            expect(model.tables[0]!.rows[1]!.size).toBe("255");
        });

        test("numeric(12,2) は精度とスケールが写る（PHP は両方落としていた）", () => {
            const { model } = introspectionToModel(source, palette);

            expect(model.tables[1]!.rows[2]!.size).toBe("12,2");
        });

        test("スケール 0 は精度だけにする", () => {
            const { model } = introspectionToModel(source, palette);
            const viewCount = model.tables[1]!.rows[3]!;

            /* integer は PG パレットで length="0" なのでそもそも空になる */
            expect(viewCount.size).toBe("");
        });

        test("サイズを取らない型には何も入れない（TEXT(10) を作らない）", () => {
            const { model } = introspectionToModel(source, palette);

            expect(model.tables[1]!.rows[4]!.size).toBe("");
            expect(model.tables[0]!.rows[0]!.size).toBe("");
        });
    });

    describe("キーと関係", () => {
        test("PRIMARY / UNIQUE / INDEX は写る", () => {
            const { model } = introspectionToModel(source, palette);

            expect(model.tables[0]!.keys.map((k) => k.type)).toEqual(["PRIMARY", "UNIQUE"]);
            expect(model.tables[1]!.keys.map((k) => k.type)).toEqual(["PRIMARY", "INDEX"]);
        });

        test("CHECK は最初から読まない（PG18 の NOT NULL 問題を構造的に不可能にする）", () => {
            /*
             * PG18 は NOT NULL を table_constraints に CHECK として出す。現行 PHP は
             * `_not_null` サフィックスの denylist で除外しようとして </key> を余分に出し、
             * **XML が well-formed でなくなった**（ARCHITECTURE §4.6-1）。denylist は必ず漏れる。
             */
            const { model } = introspectionToModel(source, palette);

            expect(model.tables[0]!.keys.map((k) => k.name)).not.toContain("users_id_not_null");
        });

        test("複合キーは列の並びを保つ", () => {
            const { model } = introspectionToModel(source, palette);

            expect(model.tables[2]!.keys[0]!.parts).toEqual(["article_id", "tag"]);
        });

        test("外部キーは子側の行に付く", () => {
            const { model } = introspectionToModel(source, palette);

            expect(model.tables[1]!.rows[1]!.relations).toEqual([
                { table: "users", row: "id" },
            ]);
            expect(model.tables[1]!.rows[0]!.relations).toEqual([]);
        });
    });

    test("自動採番は写さない（方言ごとに表れ方が違うので backend の判断に送る）", () => {
        const { model } = introspectionToModel(source, palette);

        for (const table of model.tables) {
            for (const row of table.rows) {
                expect(row.ai).toBe(false);
            }
        }
    });

    test("空の結果は空のモデルになる（落ちない）", () => {
        const { model, losses } = introspectionToModel(
            { introspectionVersion: 1, tables: [] },
            palette,
        );

        expect(model.tables).toEqual([]);
        expect(losses).toEqual([]);
    });

    test("別プロファイルのパレットへも写せる（dialect と照合しない）", () => {
        /*
         * 設計 JSON の `db` は「実行中パレットと違えば throw」（段階4-2b）だが、
         * introspection は情報として dialect を持つだけ。PG を読んで MySQL のパレットへ
         * 落とす経路も、寄せ先が決まっていれば成立する。
         */
        const mysql = loadPalette("mysql");
        const { model, losses } = introspectionToModel(source, mysql);

        expect(model.tables).toHaveLength(3);
        /* MySQL に jsonb は無いので、PG より落ちる列が増える */
        expect(losses.length).toBeGreaterThan(2);
    });
});
