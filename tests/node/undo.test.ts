import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { createHarness, type NodeHarness } from "./harness.ts";
import { SERIALIZER_DB } from "../support/fixtures.ts";
import type { Row } from "../../frontend/js/row.ts";
import type { Table } from "../../frontend/js/table.ts";

/*
 * undo / redo の確定と復元（#288）。js/historymanager.ts の棚。
 *
 * ★★ **ここが押さえるのは「1 ジェスチャ = 1 手」。** 確定点（commit の呼び出し）は
 *   6 ファイルに 16 箇所あり、**人が撒いている**。漏れを目視やレビューに頼らないために、
 *   下の PATHS が経路の表を持ち、各行で次の 4 つを見る:
 *
 *     1. そのジェスチャで**ちょうど 1 手**増える（0 でも 2 でもない）
 *     2. 終わった時点で isCommitted()（＝ライブツリーが最後の手と一致している）
 *     3. undo で toJson() が**バイト単位で**元に戻る
 *     4. redo でまた進む
 *
 * ★ **fixture を足さない**（tests/node/live-tree.test.ts と同じ規律）。設計 JSON は
 *   ここで組む。tests/fixtures/ に置くと 8 プロファイル分が要り、DDL golden が連動する。
 *
 * ★ ドラッグ（js/table.ts の down -> move -> up）はここに置けない —— jsdom は
 *   offsetWidth が常に 0 でドラッグが成立しない（tests/node/harness.ts の構造差 2 つ）。
 *   実 Chromium 側（#289）が受け持つ。
 */

const J = (tables: unknown[]): string =>
    JSON.stringify({ formatVersion: 2, db: SERIALIZER_DB, tables }, null, 2);

const ONE = J([
    {
        name: "orders",
        x: 20,
        y: 20,
        columns: [
            { name: "id", type: "integer" },
            { name: "total", type: "integer" },
        ],
        keys: [{ type: "PRIMARY", name: "orders_pkey", columns: ["id"] }],
    },
]);

const TWO = J([
    {
        name: "orders",
        x: 20,
        y: 20,
        columns: [{ name: "id", type: "integer" }],
        keys: [{ type: "PRIMARY", name: "orders_pkey", columns: ["id"] }],
    },
    {
        name: "items",
        x: 320,
        y: 20,
        columns: [{ name: "id", type: "integer" }],
        keys: [{ type: "PRIMARY", name: "items_pkey", columns: ["id"] }],
    },
]);

let h: NodeHarness;

beforeAll(async () => {
    h = await createHarness();
});

afterAll(() => {
    h.close();
});

/** 設計を読み、**履歴を空にしてから**テストを始める */
function fresh(json: string): void {
    h.loadJson(json);
    h.designer.historyManager.reset();
}

function history() {
    return h.designer.historyManager;
}

function tableNamed(name: string): Table {
    const t = h.designer.tables.find((x) => x.getTitle() === name);
    if (!t) {
        throw new Error(`テーブル ${name} が無い`);
    }
    return t;
}

describe("往復", () => {
    test("編集 -> undo で JSON がバイト単位で戻り、redo でまた進む", () => {
        fresh(ONE);
        const before = h.toJson();

        h.designer.addTable("extra", 100, 100);
        history().commit();
        const after = h.toJson();

        expect(after).not.toBe(before);
        expect(history().depth()).toBe(1);

        history().undo();
        expect(h.toJson()).toBe(before);

        history().redo();
        expect(h.toJson()).toBe(after);
    });

    test("戻れるものが無ければ何も起きない", () => {
        fresh(ONE);
        const before = h.toJson();

        history().undo();
        history().redo();

        expect(h.toJson()).toBe(before);
        expect(h.takeAlerts()).toEqual([]);
    });

    test("複数手を積んで 1 手ずつ戻る", () => {
        fresh(ONE);
        const snapshots = [h.toJson()];

        for (const name of ["a", "b", "c"]) {
            h.designer.addTable(name, 100, 100);
            history().commit();
            snapshots.push(h.toJson());
        }

        expect(history().depth()).toBe(3);
        for (let i = snapshots.length - 2; i >= 0; i--) {
            history().undo();
            expect(h.toJson()).toBe(snapshots[i]);
        }
    });

    test("★ 設計名（document.title）は undo で消えない", () => {
        fresh(ONE);
        h.designer.setTitle("orders");
        const title = h.window.document.title;

        h.designer.addTable("extra", 100, 100);
        history().commit();
        history().undo();

        /* clearTables() が setTitle(false) を呼ぶので、退避していないとここで落ちる */
        expect(h.window.document.title).toBe(title);
    });
});

/* ------------------------------------------------------------------ *
 * 経路の表
 * ------------------------------------------------------------------ */

interface Path {
    /** テスト名。そのまま「1 手」の単位の宣言になる */
    readonly name: string;
    /** 既定は TWO */
    readonly design?: string;
    /** 履歴に数えたくない準備（選択・confirm の答えなど） */
    readonly setup?: () => void;
    readonly run: () => void | Promise<void>;
}

/** イベントループを 1 回回す（<dialog> の close イベントが同期とは限らない） */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** 整列で必ず座標が動くよう、格子から外した位置に置く */
const CROOKED = J([
    {
        name: "orders",
        x: 37,
        y: 53,
        columns: [{ name: "id", type: "integer" }],
        keys: [],
    },
    {
        name: "items",
        x: 411,
        y: 97,
        columns: [{ name: "id", type: "integer" }],
        keys: [],
    },
]);

function rowOf(table: string, row: string): Row {
    const r = tableNamed(table).rows.find((x) => x.getTitle() === row);
    if (!r) {
        throw new Error(`行 ${table}.${row} が無い`);
    }
    return r;
}

const PATHS: Path[] = [
    {
        name: "自動整列",
        design: CROOKED,
        run: () => h.designer.tableManager.align(),
    },
    {
        name: "行の上移動（★ 連打を畳まない）",
        design: ONE,
        setup: () => h.designer.rowManager.select(rowOf("orders", "total")),
        run: () => h.designer.rowManager.up(),
    },
    {
        name: "行の下移動",
        design: ONE,
        setup: () => h.designer.rowManager.select(rowOf("orders", "id")),
        run: () => h.designer.rowManager.down(),
    },
    {
        name: "リレーション作成（1 クリックで 4 変更 = 1 手）",
        setup: () => {
            h.designer.rowManager.select(rowOf("orders", "id"));
            h.designer.rowManager.creating = true;
        },
        run: () => {
            h.designer.rowManager.tableClick({
                target: tableNamed("items"),
                data: null,
            });
        },
    },
    {
        name: "リレーション接続",
        setup: () => {
            h.designer.rowManager.select(rowOf("orders", "id"));
            h.designer.rowManager.connecting = true;
        },
        run: () => {
            h.designer.rowManager.rowClick({
                target: rowOf("items", "id"),
                data: null,
            });
            h.designer.rowManager.connecting = false;
        },
    },
    {
        name: "テーブル削除",
        setup: () => {
            h.setConfirm(true);
            h.designer.tableManager.select(tableNamed("items"));
        },
        run: () => h.designer.tableManager.remove(),
    },
    {
        name: "全消し",
        setup: () => h.setConfirm(true),
        run: () => h.designer.tableManager.clear(),
    },
    {
        name: "行削除",
        design: ONE,
        setup: () => {
            h.setConfirm(true);
            h.designer.rowManager.select(rowOf("orders", "total"));
        },
        run: () => h.designer.rowManager.remove(),
    },
    {
        name: "設計の読み込み（★ 読み直しても前の設計に戻れる）",
        design: ONE,
        run: () => h.designer.io.loadDesignText(TWO),
    },
    {
        name: "リレーション削除",
        setup: () => {
            /* 先に 1 本張る（この変更は上の reset で履歴から外れる） */
            h.designer.rowManager.select(rowOf("orders", "id"));
            h.designer.rowManager.creating = true;
            h.designer.rowManager.tableClick({
                target: tableNamed("items"),
                data: null,
            });
            const items = tableNamed("items");
            h.designer.rowManager.select(items.rows[items.rows.length - 1]!);
        },
        run: () => h.designer.rowManager.foreigndisconnect(),
    },
    {
        name: "行の属性編集（開いて閉じるまでで 1 手）",
        design: ONE,
        run: () => {
            const r = rowOf("orders", "total");
            r.expand();
            r.dom.name.value = "amount";
            r.collapse();
        },
    },
    {
        name: "行追加（追加 ＋ 初回編集で 1 手）",
        design: ONE,
        setup: () => h.designer.tableManager.select(tableNamed("orders")),
        run: () => {
            h.designer.tableManager.addRow();
            /* addRow が expand() するので、閉じたところで確定する */
            (h.designer.rowManager.selected as Row).collapse();
        },
    },
];

describe("1 ジェスチャ = 1 手", () => {
    for (const path of PATHS) {
        test(path.name, async () => {
            fresh(path.design ?? TWO);
            path.setup?.();
            /* setup が設計を変えても履歴に数えない（リレーションを先に張る経路がある） */
            history().reset();
            const before = h.toJson();

            await path.run();
            await tick();

            expect(history().depth(), "ちょうど 1 手であること").toBe(1);
            expect(history().isCommitted(), "確定点が漏れていないこと").toBe(true);

            const after = h.toJson();
            expect(after).not.toBe(before);

            history().undo();
            expect(h.toJson()).toBe(before);

            history().redo();
            expect(h.toJson()).toBe(after);
        });
    }
});

describe("ダイアログ", () => {
    /*
     * ★ **jsdom は showModal() を持たない**ので、ダイアログを開く 3 経路
     * （テーブル追加・テーブル名/コメント編集・キー編集）はここでは駆動できない。
     * 実 Chromium 側（#289）が受け持つ。ここで押さえるのは**確定点が close に
     * あること**だけ —— close イベントを直に投げれば、そこは試せる。
     */
    test("閉じたときに確定する（OK を待たずにモデルが変わる経路のため）", () => {
        fresh(ONE);
        const before = h.toJson();

        /* キー編集はダイアログの中で即座にモデルを変える。その状態を模す */
        tableNamed("orders").setTitle("renamed");
        expect(history().depth(), "閉じるまでは積まれない").toBe(0);

        h.designer.window.dom.container.dispatchEvent(new h.window.Event("close"));

        expect(history().depth()).toBe(1);
        history().undo();
        expect(h.toJson()).toBe(before);
    });
});

describe("★ 確定点の撒き忘れに対する耐性", () => {
    /*
     * ★★ **この 2 本が「漏れても壊れない」の実体。** 確定点は人が撒くので、
     *   漏れは「起きるか」ではなく「起きたとき何が壊れるか」で設計してある。
     *   undo() の入口の commit() が、撒き忘れた変更を 1 手として確定させる。
     */
    test("commit を一度も呼ばずに編集しても、undo が正しく戻す", () => {
        fresh(ONE);
        const before = h.toJson();

        /* 確定点が無い経路を模す */
        h.designer.addTable("orphan", 100, 100);
        expect(history().depth(), "まだ積まれていない").toBe(0);

        history().undo();

        expect(h.toJson()).toBe(before);
    });

    test("撒き忘れた変更は、直前の手を飛ばさずに戻る", () => {
        fresh(ONE);
        const before = h.toJson();

        h.designer.addTable("a", 100, 100);
        history().commit();
        const withA = h.toJson();

        /* ここから先が「確定点の無い経路」 */
        h.designer.addTable("b", 200, 200);

        history().undo();
        expect(h.toJson(), "b だけが戻る（a は残る）").toBe(withA);

        history().undo();
        expect(h.toJson(), "さらに戻ると a も消える").toBe(before);
    });
});

describe("★ パレット関門", () => {
    /* ★ 差し替えたまま抜けると、後続の loadJson が「db が違う」で落ちる */
    afterEach(() => {
        h.useDatatypes(SERIALIZER_DB);
    });

    test("型パレットが差し替わると履歴ごと捨てる", () => {
        fresh(ONE);
        h.designer.addTable("extra", 100, 100);
        history().commit();
        expect(history().canUndo()).toBe(true);

        /*
         * RowModel.type は添字なので、パレットが動くと古い手は別の型を指す
         * （範囲外なら Row.update() が TypeError、範囲内なら**黙って別の型になる**）。
         *
         * ★ ハーネスの useDatatypes() は clearTables() してから差し替える
         *   （実アプリの dbResponse() は clear しない）ので、ここで見るのは履歴の側だけ。
         */
        h.useDatatypes("mysql");
        history().undo();

        expect(history().canUndo(), "履歴は捨てられている").toBe(false);
        expect(history().canRedo()).toBe(false);
    });

    test("差し替えの後に積んだ手は、そこから戻る", () => {
        /* fresh() を呼ばない —— 読み込む JSON の db が実行中のパレットと食い違う */
        h.useDatatypes("mysql");
        history().commit();
        const base = h.toJson();

        h.designer.addTable("extra", 100, 100);
        history().commit();
        expect(history().depth()).toBe(1);

        history().undo();
        expect(h.toJson()).toBe(base);
    });
});

describe("★ 同名テーブル", () => {
    /*
     * js/tablemanager.ts の click() が新規テーブルに _("newtable") を付けるので、
     * **同名テーブルは普通の操作で作れる**。その状態を復元すると relation が
     * 先頭のテーブルへ寄る（js/io/apply.ts の既知の不具合）ので、積む側で弾く。
     */
    test("同名のあいだは積まない", () => {
        fresh(ONE);
        h.designer.addTable("orders", 300, 300);

        history().commit();

        expect(history().depth(), "壊れた状態は積まない").toBe(0);
    });

    test("名前を直すと、そこまでが 1 手にまとまる", () => {
        fresh(ONE);
        const before = h.toJson();

        h.designer.addTable("orders", 300, 300);
        history().commit();
        h.designer.tables[h.designer.tables.length - 1]!.setTitle("shipments");
        history().commit();

        expect(history().depth()).toBe(1);
        history().undo();
        expect(h.toJson()).toBe(before);
    });
});

describe("★ AI の適用", () => {
    /** キーを持たない設計（missing_pk の提案が当たる形） */
    const NOKEY = J([
        {
            name: "orders",
            x: 20,
            y: 20,
            columns: [{ name: "id", type: "integer" }],
            keys: [],
        },
    ]);

    test("何件当たっても、undo 1 回で丸ごと戻る", async () => {
        fresh(NOKEY);
        const before = h.toJson();

        h.io.applyCapabilities({ ai: true });
        h.setConfirm(true);
        h.setAiReview(
            JSON.stringify([
                {
                    category: "missing_pk",
                    severity: "error",
                    target: { table: "orders" },
                    rationale: "主キーが無い",
                    patch: { op: "add-key", keyType: "PRIMARY", columns: ["id"] },
                },
            ])
        );
        await h.io.aireview();
        /* 提案を取るだけでは設計は変わらない。ここまでを起点にする */
        history().reset();

        h.setPrompt("all");
        await h.io.aiapply();

        expect(h.toJson(), "適用で設計が変わっていること").not.toBe(before);
        expect(history().depth(), "★ 適用 1 回 = 1 手").toBe(1);

        history().undo();
        expect(h.toJson()).toBe(before);
    });
});
