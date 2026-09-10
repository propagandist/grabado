import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import { SERIALIZER_DB } from "../support/fixtures.ts";
import { syntheticDesign } from "../support/synthetic.ts";
import {
    installScaleProbe,
    readScaleProbe,
    resetScaleProbe,
} from "../support/probe.ts";

/*
 * リスナー登録簿が単調増加しないことを見る棚（#209）。
 *
 * ★★ **アプリから観測できる面が 1 つも無い層。** OZ.Event._byID / _byName は
 *   `Map` ではなく**素のオブジェクト**（js/oz.ts:60-61）なので、削除されない限り
 *   デタッチ済みの要素と bind クロージャを**永久に保持する** —— GC も効かない。
 *   golden にも state スナップショットにも 1 ビットも出ない。
 *
 * ★ **数えるのは登録の件数だけ。** どの要素に何が張られているかは見ない ——
 *   それは「今の実装がこう張っている」であって、守りたい不変条件ではない。
 *   守るのは「**同じ操作を繰り返しても増えない**」の 1 つ。
 *
 * ★ **fixture を足さない**（tests/node/live-tree.test.ts と同じ理由）。
 *   必要な形は設計 JSON をテスト内で組む。
 */

/** N テーブル × C 列。先頭列を PRIMARY にして、キー経由の後始末も踏ませる */
function design(tables: number, columns: number): string {
    return JSON.stringify(
        {
            formatVersion: 2,
            db: SERIALIZER_DB,
            tables: Array.from({ length: tables }, (_unused, t) => ({
                name: `t${t}`,
                x: 20 + t * 220,
                y: 20,
                columns: Array.from({ length: columns }, (_c, c) => ({
                    name: `c${c}`,
                    type: "integer",
                })),
                keys: [{ type: "PRIMARY", name: `t${t}_pkey`, columns: ["c0"] }],
            })),
        },
        null,
        2,
    );
}

const DESIGN = design(4, 6);

describe("リスナー登録が単調増加しない（#209）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
        h.useDatatypes(SERIALIZER_DB);
    }, 60_000);

    /** 登録簿の件数。_byName は同じ id を event 名ごとに持つので別に数える */
    const byId = (): number => Object.keys(h.oz.Event._byID).length;
    const byName = (): number =>
        Object.keys(h.oz.Event._byName).reduce(
            (n, name) => n + Object.keys(h.oz.Event._byName[name]!).length,
            0,
        );

    it("読み込みを 2 回しても登録が増えない", () => {
        h.designer.clearTables();
        h.loadJson(DESIGN);
        const ids = byId();
        const names = byName();

        h.loadJson(DESIGN);

        expect(byId()).toBe(ids);
        expect(byName()).toBe(names);
    });

    it("clearTables() で読み込み前の水準へ戻る", () => {
        h.designer.clearTables();
        const empty = byId();

        h.loadJson(DESIGN);
        /* 実際に増えていることを先に見る（0 と 0 を比べていたら何も言えない） */
        expect(byId()).toBeGreaterThan(empty);

        h.designer.clearTables();
        expect(byId()).toBe(empty);
        expect(byName()).toBe(byId());
    });

    it("行を開いて閉じるのを繰り返しても増えない（buildEdit の 3 本）", () => {
        h.designer.clearTables();
        h.loadJson(DESIGN);
        const row = h.designer.tables[0]!.rows[0]!;

        /* 1 巡目で開閉の分を確定させてから基準を採る */
        row.expand();
        row.collapse();
        const base = byId();

        for (let i = 0; i < 5; i++) {
            row.expand();
            row.collapse();
        }

        expect(byId()).toBe(base);
    });

    it("開いたまま破棄しても残らない（collapse を通らない経路）", () => {
        h.designer.clearTables();
        const empty = byId();

        h.loadJson(DESIGN);
        h.designer.tables[0]!.rows[0]!.expand();
        h.designer.clearTables();

        expect(byId()).toBe(empty);
    });
});

describe("clearTables() の費用（#209）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
        h.useDatatypes(SERIALIZER_DB);
        /*
         * 計装は**生きている実体からプロトタイプを辿る**ので、先に relation を持つ
         * 設計を読む（tests/node/scale.test.ts と同じ形）。アプリに面は足さない。
         */
        h.loadJson(syntheticDesign(2));
        installScaleProbe(h.window, {
            table: h.designer.tables[0]!,
            row: h.designer.tables[0]!.rows[0]!,
            relation: h.designer.relations[0]!,
        });
    }, 60_000);

    /**
     * ★★ **これが Table.destroy() から removeRow() を外した根拠。**
     *   removeRow() は 1 列ごとに Table.redraw() を呼ぶので、破棄の費用が
     *   O(N x C) 回の強制同期レイアウトになっていた。**列数を 4 倍にしても
     *   回数が動かない**なら、列に比例する項が消えている。
     */
    it("Table.redraw の回数が列数に依存しない", () => {
        const measure = (columns: number): number => {
            h.designer.clearTables();
            h.loadJson(design(5, columns));
            resetScaleProbe(h.window);
            h.designer.clearTables();
            return readScaleProbe(h.window).tableRedraw;
        };

        const few = measure(4);
        const many = measure(16);
        expect(many).toBe(few);
    });
});
