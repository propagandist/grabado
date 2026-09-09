import { test, expect, type Page } from "@playwright/test";
import { SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import { loadFixture, openDesigner, useDatatypes } from "./harness.ts";

// 1 ページを beforeAll で作って使い回す（serialize.spec.ts と同じ流儀）。
// 各テストは minSize を自分で退避・復元する ―― 共有ページを次のテストへ汚さない。

let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
    await useDatatypes(page, SERIALIZER_DB);
});

test.afterAll(async () => {
    await page.close();
});

/*
 * 座標系（Designer.sync -> Minimap.sync -> <svg> の寸法）を見る。
 *
 * ★★ **ここは jsdom では成立しない。** minSize は #area の offsetWidth/offsetHeight から
 *   採られる（js/wwwsqldesigner.ts:176-179）が、jsdom はレイアウトしないので両方 0 になる
 *   （docs/ARCHITECTURE.md §5）。tests/support/state.ts も同じ理由でレイアウト由来の値を
 *   golden から全部除外しているので、**この層を見ているテストは #214 まで 1 本も無かった**。
 *
 * ★ **CSS の値を焼かない。** #area は現在 3000x3000 の正方形（styles/base.css の
 *   --area-size）で、**正方形であるあいだ minSize[0] と minSize[1] は等しい** ――
 *   #214（高さの下限に minSize[0] を読んでいた）が観測できなかったのはそのため。
 *   3000 をハードコードすると、縦横比を変えた日にこのテストが「通ったまま」意味を失う。
 *
 * ★ 退避と復元を各テストが自分で書いているのは冗長に見えるが、page.evaluate へ渡せるのは
 *   シリアライズできる値だけで、「読む式」を引数で受け取る共通ヘルパにはできない
 *   （eval は CSP が禁じている ―― 段階2-2 で unsafe-eval を撤去した）。
 */

test("minSize は #area の実寸から採られる（CSS を変えても意味が保たれる）", async () => {
    const seen = await page.evaluate(() => {
        const d = window.d!;
        const area = d.dom.container as HTMLElement;
        return {
            minSize: [d.minSize[0], d.minSize[1]],
            offset: [area.offsetWidth, area.offsetHeight],
        };
    });
    expect(seen.minSize).toEqual(seen.offset);
    /* 実ブラウザではレイアウトが効くので 0 にはならない（jsdom との差そのもの） */
    expect(seen.minSize[0]).toBeGreaterThan(0);
    expect(seen.minSize[1]).toBeGreaterThan(0);
});

test("高さの下限は minSize[1] から来る（#214 の再現）", async () => {
    const seen = await page.evaluate(() => {
        const d = window.d!;
        const saved: [number, number] = [d.minSize[0], d.minSize[1]];
        try {
            d.minSize = [100, 200];
            d.sync();
            return { w: d.width, h: d.height };
        } finally {
            d.minSize = saved;
            d.sync();
        }
    });
    /* 修正前は h が 100（minSize[0]）になる */
    expect(seen).toEqual({ w: 100, h: 200 });
});

test("幅と高さの下限は独立している", async () => {
    const seen = await page.evaluate(() => {
        const d = window.d!;
        const saved: [number, number] = [d.minSize[0], d.minSize[1]];
        try {
            d.minSize = [200, 100];
            d.sync();
            return { w: d.width, h: d.height };
        } finally {
            d.minSize = saved;
            d.sync();
        }
    });
    expect(seen).toEqual({ w: 200, h: 100 });
});

test("テーブルがあれば下限を超えて広がる", async () => {
    await loadFixture(page, readFixture(SERIALIZER_DB, "relations"));
    try {
        const seen = await page.evaluate(() => {
            const d = window.d!;
            const saved: [number, number] = [d.minSize[0], d.minSize[1]];
            try {
                d.minSize = [10, 10];
                d.sync();
                return {
                    w: d.width,
                    h: d.height,
                    maxX: Math.max(...d.tables.map((t) => t.x + t.width)),
                    maxY: Math.max(...d.tables.map((t) => t.y + t.height)),
                };
            } finally {
                d.minSize = saved;
                d.sync();
            }
        });
        expect(seen.w).toBe(seen.maxX);
        expect(seen.h).toBe(seen.maxY);
        expect(seen.w).toBeGreaterThan(10);
        expect(seen.h).toBeGreaterThan(10);
    } finally {
        await page.evaluate(() => {
            window.d!.clearTables();
            window.d!.sync();
        });
    }
});

test("ミニマップの port が designer の寸法に追随する（縦横で別々に）", async () => {
    /*
     * Minimap.sync() は scaleX = map.width / designer.width、scaleY = map.height /
     * designer.height（js/map.ts:157-158）。designer 側の高さだけを 2 倍にすれば、
     * port の高さだけが縮む ―― 縦横が同じ値を読んでいたら、この差は出ない。
     */
    const seen = await page.evaluate(() => {
        const d = window.d!;
        const saved: [number, number] = [d.minSize[0], d.minSize[1]];
        const read = (w: number, h: number) => {
            d.minSize = [w, h];
            d.sync();
            return { w: d.map.w, h: d.map.h };
        };
        try {
            return { base: read(400, 400), taller: read(400, 800) };
        } finally {
            d.minSize = saved;
            d.sync();
        }
    });
    expect(seen.taller.w).toBeCloseTo(seen.base.w, 5);
    expect(seen.taller.h).toBeLessThan(seen.base.h);
});

test("vector 出力時、<svg> の寸法属性が designer の寸法と一致する", async () => {
    const seen = await page.evaluate(() => {
        const d = window.d!;
        const saved: [number, number] = [d.minSize[0], d.minSize[1]];
        try {
            d.minSize = [300, 500];
            d.sync();
            return {
                vector: !!d.vector,
                w: d.width,
                h: d.height,
                attrW: d.dom.svg.getAttribute("width"),
                attrH: d.dom.svg.getAttribute("height"),
            };
        } finally {
            d.minSize = saved;
            d.sync();
        }
    });
    expect(seen.vector).toBe(true);
    expect(seen.attrW).toBe(String(seen.w));
    expect(seen.attrH).toBe(String(seen.h));
    expect(seen.attrH).toBe("500");
});
