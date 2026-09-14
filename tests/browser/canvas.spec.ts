import { test, expect, type Page } from "@playwright/test";
import { SERIALIZER_DB, readFixture } from "../support/fixtures.ts";
import {
    captureGeometry,
    loadFixture,
    openDesigner,
    useDatatypes,
} from "./harness.ts";
import type {
    GeometrySnapshot,
    RowAnchor,
} from "../support/geometry.ts";

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

/* ============================ 幾何の棚（#236） ============================
 *
 * ★★ **性能 PR 群（#207 / #208 / #209 / #210）が「値を変えていない」と言うための器。**
 *   tests/support/state.ts の golden は**レイアウト由来の値を 1 つも採っていない**ので、
 *   コネクタのジオメトリとミニマップの写像を壊しても緑のまま通る（#236 の発端）。
 *
 * ★ **golden を増やさない。** 端点もアンカーも**同じページの同じレイアウト**から出るので、
 *   突き合わせはページ内で閉じる —— フォントにも viewport にも OS にも依らない。
 *
 * ★ **d 属性の値を焼かない。** 焼くと「テーブルの幅が変わった日」に赤くなるだけで、
 *   コネクタが正しい場所に繋がっているかは何も言えない。
 */

/**
 * 端点が乗りうる場所（js/relation.ts:247-269）。
 *
 * **左右どちらの縁を選ぶかは relation.ts の分岐**（テーブルが離れているか隣り合うか）で、
 * ここは**両方を候補として持つ**。分岐まで写すと、テストが実装の言い換えになる。
 */
function anchorCandidates(a: RowAnchor): { xs: [number, number]; y: number } {
    /* 選択中のテーブルは左＋1 / 右−1 / 中心＋1（relation.ts:260-269） */
    const bump = a.selected ? 1 : 0;
    return {
        xs: [a.tableLeft + bump, a.tableRight - bump],
        y: a.tableTop + a.rowTop + Math.round(a.rowHeight / 2) + bump,
    };
}

function onAnchor(pt: [number, number], a: RowAnchor): boolean {
    const c = anchorCandidates(a);
    return c.xs.indexOf(pt[0]) !== -1 && c.y === pt[1];
}

function label(rel: GeometrySnapshot["relations"][number]): string {
    const [a, b] = rel.anchors;
    return `${a.table}.${a.row} -> ${b.table}.${b.row}`;
}

/**
 * **この棚の中心**。すべての relation について、両端が「テーブルの縁 × 行の中心」に
 * 乗っていることを見る。**順序は分岐で入れ替わる**（近いほうの組を p1 に採る）ので集合で見る。
 */
function expectEndpointsOnAnchors(snap: GeometrySnapshot): void {
    expect(snap.vector, "非 vector では d が 1 本も採れない").toBe(true);
    expect(snap.relations.length).toBeGreaterThan(0);
    for (const rel of snap.relations) {
        if (rel.hidden) {
            /* hide 中は redraw() が先頭で戻るので d は最後の可視状態のまま */
            continue;
        }
        expect(rel.ends, `${label(rel)} の d が読めない: ${rel.d}`).not.toBeNull();
        const [p, q] = rel.ends!;
        const [a1, a2] = rel.anchors;
        const ok =
            (onAnchor(p, a1) && onAnchor(q, a2)) ||
            (onAnchor(p, a2) && onAnchor(q, a1));
        expect(
            ok,
            `${label(rel)} の端点 ${JSON.stringify(rel.ends)} が` +
                ` アンカーに乗っていない: ${JSON.stringify(rel.anchors)}`,
        ).toBe(true);
    }
}

test.describe("幾何の棚", () => {
    /*
     * relations fixture は 2 つの分岐を両方踏む —— employees.manager_id -> employees.id が
     * 自己参照（隣り合う ＝ redrawSide）、他の 4 本が離れたテーブル間（redrawNormal）。
     */
    test.beforeAll(async () => {
        await loadFixture(page, readFixture(SERIALIZER_DB, "relations"));
    });

    test.afterAll(async () => {
        await page.evaluate(() => {
            window.d!.clearTables();
            window.d!.sync();
        });
    });

    test("両端がテーブルの縁と行の中心に接続している", async () => {
        const snap = await captureGeometry(page);
        /* 自己参照 1 ＋ projects 2 ＋ employee_projects 2 */
        expect(snap.relations.length).toBe(5);
        expectEndpointsOnAnchors(snap);
    });

    test("テーブルを動かすと、両端が追随する", async () => {
        const before = await captureGeometry(page);
        const moved = before.tables.findIndex((t) => t.title === "projects");
        expect(moved).toBeGreaterThanOrEqual(0);

        const saved = await page.evaluate((i) => {
            const t = window.d!.tables[i]!;
            const at: [number, number] = [t.x, t.y];
            t.moveTo(t.x + 120, t.y + 90);
            return at;
        }, moved);

        try {
            const after = await captureGeometry(page);

            /* snap が効けば 120/90 とは限らないので、実際に動いた量を読む */
            const dx = after.tables[moved]!.x - before.tables[moved]!.x;
            const dy = after.tables[moved]!.y - before.tables[moved]!.y;
            expect([dx, dy]).not.toEqual([0, 0]);

            /* モデルの座標と実測が同じだけ動く（style.left への書き込みが効いている） */
            expect(after.tables[moved]!.left - before.tables[moved]!.left).toBe(dx);
            expect(after.tables[moved]!.top - before.tables[moved]!.top).toBe(dy);

            /* ★ 動かした後も不変条件が成り立つ。これが「追随した」の中身 */
            expectEndpointsOnAnchors(after);

            /* 動いたテーブルに繋がるコネクタは、実際に引き直されている */
            const touched = after.relations.filter((r) =>
                r.anchors.some((a) => a.table === "projects"),
            );
            expect(touched.length).toBe(3);
            for (const rel of touched) {
                const was = before.relations.find(
                    (b) => label(b) === label(rel),
                );
                expect(was).toBeDefined();
                expect(rel.d).not.toBe(was!.d);
            }
        } finally {
            await page.evaluate(
                ([i, x, y]) => {
                    window.d!.tables[i as number]!.moveTo(x as number, y as number);
                },
                [moved, saved[0], saved[1]] as const,
            );
        }
    });

    test("relation を極端な位置へ描いても、テーブルの実測は動かない（#207 の 2 パス化の前提）", async () => {
        /*
         * ★★ **#207 が 2 パス（全部読んでから全部書く）へ分けられる根拠そのもの。**
         *   relation の書き先がテーブルの実測に影響するなら、1 本目の書き込みが
         *   2 本目の読み出しを汚すので 2 パス化は不正になる。
         *
         *   **同じ値で描き直しても何も言えない**（書き込みが影響していても値が同じなら
         *   レイアウトは動かない）。だから**現実には出ない極端な値**を叩き込んで測る。
         */
        const seen = await page.evaluate(() => {
            const d = window.d!;
            const measure = () =>
                d.tables.map((t) => {
                    const el = t.dom.container;
                    return [
                        el.offsetLeft,
                        el.offsetTop,
                        el.offsetWidth,
                        el.offsetHeight,
                    ];
                });
            const paths = () =>
                d.tables
                    .flatMap((t) => t.getRelations())
                    .map((r) => r.dom[0].getAttribute("d"));

            const before = measure();
            const wasPaths = paths();

            for (const t of d.tables) {
                for (const r of t.getRelations()) {
                    for (const node of r.dom) {
                        if (d.vector) {
                            node.setAttribute(
                                "d",
                                "M 0 0 C 9000 9000 9000 9000 9000 9000",
                            );
                        } else {
                            node.style.left = "9000px";
                            node.style.top = "9000px";
                            node.style.width = "9000px";
                            node.style.height = "9000px";
                        }
                    }
                }
            }
            const after = measure();

            /* 元に戻す。戻せることは redraw() が決定論であることでもある */
            for (const t of d.tables) {
                for (const r of t.getRelations()) {
                    r.redraw();
                }
            }
            return { before, after, wasPaths, restored: paths() };
        });

        expect(seen.after).toEqual(seen.before);
        expect(seen.restored).toEqual(seen.wasPaths);
    });

    test("ミニマップ上のテーブルは、designer の縦横に別々に追随する", async () => {
        /*
         * Table.redraw() は ratioX = map.width / designer.width、ratioY = map.height /
         * designer.height で分身を置く（js/table.ts:313-324）。designer の高さだけを
         * 2 倍にすれば、**縦の 2 値だけ**が半分になる —— 縦横が同じ比を読んでいたら
         * この差は出ない（#207 が触る 4 行そのもの）。
         *
         * ★ Designer.sync() は Table.redraw() を呼ばない（wwwsqldesigner.ts:208-232）。
         *   分身が縮尺を読み直すのは redraw() の中だけなので、明示的に回す。
         */
        const seen = await page.evaluate(() => {
            const d = window.d!;
            const saved: [number, number] = [d.minSize[0], d.minSize[1]];
            const read = (w: number, h: number) => {
                d.minSize = [w, h];
                d.sync();
                d.tables.forEach((t) => t.redraw());
                return d.tables.map((t) => ({
                    title: t.getTitle(),
                    left: parseFloat(t.dom.mini.style.left),
                    top: parseFloat(t.dom.mini.style.top),
                    width: parseFloat(t.dom.mini.style.width),
                    height: parseFloat(t.dom.mini.style.height),
                }));
            };
            try {
                return { base: read(1000, 1000), taller: read(1000, 2000) };
            } finally {
                d.minSize = saved;
                d.sync();
                d.tables.forEach((t) => t.redraw());
            }
        });

        expect(seen.taller.length).toBe(seen.base.length);
        /* 高さの差が丸めに埋もれない大きさであることを先に確かめる */
        expect(Math.max(...seen.base.map((t) => t.top))).toBeGreaterThan(8);

        for (let i = 0; i < seen.base.length; i++) {
            const b = seen.base[i]!;
            const t = seen.taller[i]!;
            expect(t.title).toBe(b.title);
            /* 横は動かない */
            expect(t.left).toBe(b.left);
            expect(t.width).toBe(b.width);
            /* 縦だけが半分になる（Math.round の 1px ぶんを許す） */
            expect(Math.abs(t.top - b.top / 2)).toBeLessThanOrEqual(1);
            expect(Math.abs(t.height - b.height / 2)).toBeLessThanOrEqual(1);
        }
    });

    test("ミニマップを極端な位置へ描いても、テーブルの実測は動かない（#207 の読み 1 回化の前提）", async () => {
        /*
         * ★★ **Table.redraw() が offsetWidth を 2 回読んでいた根拠を消す条件。**
         *   1 回目と 2 回目のあいだにあるのは dom.mini への書き込みだけで、
         *   #minimap は position: fixed（styles/base.css の material-* ／
         *   styles/original.css）。**fixed なら中身をどう書いてもフローに戻らない**ので
         *   2 回目の読みは必ず 1 回目と同値になる。
         *
         *   ★ **CSS を読んで判定しない。** position の値を assert すると
         *   「その宣言があること」しか言えず、テーマが増えた日に落ちる。
         *   **実際に極端な値を書いて、テーブルが動かないことを見る。**
         */
        const seen = await page.evaluate(() => {
            const d = window.d!;
            const measure = () =>
                d.tables.map((t) => {
                    const el = t.dom.container;
                    return [
                        el.offsetLeft,
                        el.offsetTop,
                        el.offsetWidth,
                        el.offsetHeight,
                    ];
                });

            const before = measure();
            for (const t of d.tables) {
                const mini = t.dom.mini.style;
                mini.width = "9000px";
                mini.height = "9000px";
                mini.left = "9000px";
                mini.top = "9000px";
            }
            const after = measure();

            /* 元に戻す（redraw() が mini の 4 値を全部書き直す） */
            d.tables.forEach((t) => t.redraw());
            return { before, after, restored: measure() };
        });

        expect(seen.after).toEqual(seen.before);
        expect(seen.restored).toEqual(seen.before);
    });

    test("2 パスで描いた d と、1 本ずつ描いた d が一致する（#207 の等価性）", async () => {
        /*
         * ★★ **#207 の主張「出力を 1 ビットも変えていない」そのもの。**
         *   Table.redraw() は全 relation を measure() してから paint() する（2 パス）。
         *   1 本ずつ redraw()（読み → 書きを交互）した結果と一致するなら、
         *   **relation の書き込みが他の relation の読み出しを汚していない**。
         *
         *   ★ **同一ページ内で突き合わせる**ので、フォントにも viewport にも依らない。
         *   一致しないなら 2 パス化が不正、と読める。
         */
        const seen = await page.evaluate(() => {
            const d = window.d!;
            /*
             * 読むのは Designer.relations（正本の一覧）。テーブル越しに集めると
             * 2 テーブルにまたがる relation が 2 回出る（5 本が 9 要素になる）。
             */
            const paths = () => d.relations.map((r) => r.dom[0].getAttribute("d"));

            /*
             * ★ **動かした直後に採る。** 落ち着いた盤面で 2 回描き直しても
             *   「読みが古い値を掴んでいる」形の壊れ方は出ない ——
             *   moveTo() が style.left を書いた後で measure() しているか、が争点。
             */
            const moved = d.tables[1]!;
            const at: [number, number] = [moved.x, moved.y];
            moved.moveTo(moved.x + 120, moved.y + 90);
            const twoPass = paths();

            /* 1 パス（#207 より前の順序。Relation.redraw() は measure + paint のまま） */
            for (const r of d.relations) {
                r.redraw();
            }
            const onePass = paths();

            moved.moveTo(at[0], at[1]);
            return { twoPass, onePass };
        });

        expect(seen.twoPass.length).toBe(5);
        expect(seen.onePass).toEqual(seen.twoPass);
    });
});

/*
 * 整列（#297）。**採取側（tests/support/geometry.ts）に 1 行も足していない** ――
 * 見たいものは既に採れている（実測の left/top/width/height、モデルの x/y、designer の寸法、
 * relation の端点）。
 *
 * ★★ **実ブラウザでしか見られないのは「実測寸法での重なり」と「2 回で動かないこと」。**
 *   純関数は渡された寸法の上では重ならないことを Node で保証しているが、**その寸法が
 *   実際の DOM と一致しているか**はここでしか分からない。とくに shrink-to-fit
 *   （js/table.ts の「left によって上限が変わりうる」）は、**置いた後に測り直して初めて出る**。
 */
test.describe("整列", () => {
    test.beforeAll(async () => {
        await loadFixture(page, readFixture(SERIALIZER_DB, "relations"));
    });

    test.afterAll(async () => {
        await page.evaluate(() => {
            window.d!.clearTables();
            window.d!.sync();
        });
    });

    async function align(): Promise<void> {
        await page.evaluate(() => {
            window.d!.alignTables();
        });
    }

    /** 実測の矩形で 1 対も重ならないこと。**モデルの x/y ではなく left/top を見る** */
    function expectNoOverlap(snap: GeometrySnapshot): void {
        for (let i = 0; i < snap.tables.length; i++) {
            for (let j = i + 1; j < snap.tables.length; j++) {
                const a = snap.tables[i]!;
                const b = snap.tables[j]!;
                const apart =
                    a.left + a.width <= b.left ||
                    b.left + b.width <= a.left ||
                    a.top + a.height <= b.top ||
                    b.top + b.height <= a.top;
                expect(
                    apart,
                    `${a.title} と ${b.title} が重なっている`,
                ).toBe(true);
            }
        }
    }

    test("実測寸法で箱が 1 対も重ならない", async () => {
        await align();
        expectNoOverlap(await captureGeometry(page));
    });

    test("2 回続けて整列しても座標が 1 つも動かない", async () => {
        await align();
        const first = await captureGeometry(page);
        await align();
        const second = await captureGeometry(page);

        /*
         * ★ shrink-to-fit を捕まえるのはこの 1 本だけ。折り返し幅が #area の右端に
         * 届くと、置いた後の実測幅が置く前と違い、2 回目が別の結果を出す。
         */
        expect(second.tables.map((t) => [t.title, t.x, t.y])).toEqual(
            first.tables.map((t) => [t.title, t.x, t.y]),
        );
        expect(second.tables.map((t) => [t.left, t.top, t.width])).toEqual(
            first.tables.map((t) => [t.left, t.top, t.width]),
        );
    });

    test("端点がアンカーに乗り続ける", async () => {
        await align();
        const snap = await captureGeometry(page);
        expect(snap.relations.length).toBe(5);
        /* 新しい判定を書かない ―― 既存の不変条件をそのまま当てる */
        expectEndpointsOnAnchors(snap);
    });

    test("盤面寸法が全テーブルを含む", async () => {
        /*
         * ★ **この 1 本は現状の fixture では弱い。** sync() の下限は minSize（#area の
         * 実寸 3000x3000）なので、**4 テーブルでは sync() を呼ばなくても通る**
         * （2026-09-13 に変異で実測）。**効きはじめるのは盤面を超える規模から**。
         * それでも置くのは、「整列が盤面の外へ置く」が起きたときに**最初に落ちる場所**
         * だからで、**捕まえられない変異があることを承知で残している**。
         */
        await align();
        const snap = await captureGeometry(page);
        for (const t of snap.tables) {
            expect(snap.designer.width).toBeGreaterThanOrEqual(t.x + t.width);
            expect(snap.designer.height).toBeGreaterThanOrEqual(t.y + t.height);
        }
    });

    test("選択中のテーブルがあっても、上が全部成り立つ", async () => {
        /* 選択中は縁も中心も 1px ずれる（relation.ts の分岐）。整列がそれを壊さないこと */
        await page.evaluate(() => {
            window.d!.tables[0]!.select();
        });
        try {
            await align();
            const first = await captureGeometry(page);
            expect(first.tables.some((t) => t.selected)).toBe(true);
            expectNoOverlap(first);
            expectEndpointsOnAnchors(first);

            await align();
            const second = await captureGeometry(page);
            expect(second.tables.map((t) => [t.x, t.y])).toEqual(
                first.tables.map((t) => [t.x, t.y]),
            );
        } finally {
            await page.evaluate(() => {
                window.d!.tables[0]!.deselect();
            });
        }
    });
});
