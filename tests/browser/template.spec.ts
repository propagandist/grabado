import { test, expect, type Page } from "@playwright/test";
import { readFixture, SERIALIZER_DB } from "../support/fixtures.ts";
import { generateDdl, loadFixture, openDesigner, useDatatypes } from "./harness.ts";

/**
 * §6.2 初期テーブルテンプレートの実操作（HANDOVER §6 段階6-4）。
 *
 * テンプレートの読み取りそのものは tests/node/template.test.ts が押さえる。ここが見るのは
 * **UI から新規テーブルを作る経路**で、そこは golden に 1 ビットも写らない ——
 * golden はすべて fixture を読み込んでから toDdl() / toJson() で採るので、
 * 「テーブル追加ボタンを押したときに何ができるか」はどのファイルにも現れない。
 * 6-3 が Row.buildTypeSelect だけを恒久テストに残したのと同じ位置づけ。
 *
 * TableManager.click() はマウスイベントを受けるので、`#area` の実クリックの代わりに
 * 同じ入口を window.d 越しに叩く（座標だけを持つ event で足りる）。マウス操作そのものを
 * 張るテストは 6-4 でも 0 本のまま（docs/TESTING.md）。
 */
let page: Page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openDesigner(page);
});

test.afterAll(async () => {
    await page.close();
});

interface AddedTable {
    readonly rows: ReadonlyArray<{
        title: string;
        type: string | null;
        def: string;
        nll: boolean;
        ai: boolean;
    }>;
    readonly keys: ReadonlyArray<{ type: string; parts: string[] }>;
}

/** 「テーブル追加」ボタン → キャンバスのクリック、と同じ経路で 1 つ作る */
function addTableByUi(page: Page): Promise<AddedTable> {
    return page.evaluate(() => {
        const d = window.d!;
        d.tableManager.preAdd();
        d.tableManager.click({
            clientX: 300,
            clientY: 200,
        } as unknown as MouseEvent);
        /* click() は最後に edit() を呼んで編集ウィンドウを開く（現行どおり） */
        d.window.close();

        const table = d.tables[d.tables.length - 1]!;
        return {
            rows: table.rows.map((row) => ({
                title: row.getTitle(),
                type: d.palette.idAt(row.data.type),
                def: row.data.def,
                nll: row.data.nll,
                ai: row.data.ai,
            })),
            keys: table.keys.map((key) => ({
                type: key.getType(),
                parts: key.rows.map((row) => row.getTitle()),
            })),
        };
    });
}

/** 選択中のテーブルに Add row（＝ #addrow ボタン）で 1 行足し、その型 id を返す */
function addRowByUi(page: Page): Promise<string | null> {
    return page.evaluate(() => {
        const d = window.d!;
        d.tableManager.select(d.tables[d.tables.length - 1]!);
        d.tableManager.addRow();

        const table = d.tables[d.tables.length - 1]!;
        return d.palette.idAt(table.rows[table.rows.length - 1]!.data.type);
    });
}

test.describe("初期テーブルテンプレート（段階6-4）", () => {
    test("postgresql: house 既定の 3 列と PRIMARY ができる", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture(SERIALIZER_DB, "empty"));

        const added = await addTableByUi(page);

        /* HANDOVER §6.2: id uuid PK DEFAULT uuidv7() ＋ 監査列 timestamptz NOT NULL DEFAULT now() */
        expect(added.rows).toEqual([
            { title: "id", type: "uuid", def: "uuidv7()", nll: false, ai: false },
            {
                title: "created_at",
                type: "timestamp_with_time_zone",
                def: "now()",
                nll: false,
                ai: false,
            },
            {
                title: "updated_at",
                type: "timestamp_with_time_zone",
                def: "now()",
                nll: false,
                ai: false,
            },
        ]);
        expect(added.keys).toEqual([{ type: "PRIMARY", parts: ["id"] }]);
    });

    test("postgresql: 作った直後の DDL がそのまま PG に流せる形で出る", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture(SERIALIZER_DB, "empty"));
        await addTableByUi(page);

        const ddl = await generateDdl(page, SERIALIZER_DB);

        /*
         * 引用符が付かないことが 6-4 の要点（段階6-3 まで DEFAULT 'uuidv7()' になっていた）。
         * uuid 列に文字列リテラルを入れる DDL は PG が実行時に弾くので、テンプレートを
         * 入れるなら式判定を同じ段階で直す必要があった（CUSTOMIZATIONS.md の段階6-4）。
         */
        expect(ddl).toContain("id UUID NOT NULL DEFAULT uuidv7()");
        expect(ddl).toContain("created_at TIMESTAMPTZ NOT NULL DEFAULT now()");
        expect(ddl).toContain("updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
        expect(ddl).not.toContain("'uuidv7()'");
        expect(ddl).not.toContain("'now()'");
    });

    test("postgresql: Add row の既定型は text（6-3 が 6-4 へ送った判断）", async () => {
        await useDatatypes(page, SERIALIZER_DB);
        await loadFixture(page, readFixture(SERIALIZER_DB, "empty"));
        await addTableByUi(page);

        expect(await addRowByUi(page)).toBe("text");
    });

    test("oracle（未現代化）: 従来どおり id 1 列 ＋ autoincrement", async () => {
        /*
         * **6-8a で mysql が現代化されたので寄せ先を oracle に移した**（6-8c で消える）。
         *
         * **空にしてからパレットを差し替える**のが要点。逆にすると、前のテストが
         * postgresql のテンプレート（24 型）で作ったテーブルが残ったまま oracle（15 型）に
         * 切り替わり、clearTables() の後始末が範囲外の型添字を引いて Row.getColor で落ちる。
         * mysql（23 型）が寄せ先だった間は添字が収まっていたので露出しなかった。
         * UI では db の切り替えにリロードが要る（現行契約）ので、この順序はテスト側の制約。
         */
        await loadFixture(page, readFixture(SERIALIZER_DB, "empty"));
        await useDatatypes(page, "oracle");

        const added = await addTableByUi(page);

        /* テンプレートを持たないプロファイルは 6-3 以前と 1 バイトも変わらない */
        expect(added.rows).toEqual([
            { title: "id", type: "integer", def: "", nll: true, ai: true },
        ]);
        expect(added.keys).toEqual([{ type: "PRIMARY", parts: ["id"] }]);
        /* 既定型も先頭の型のまま（newrowtype を持たない） */
        expect(await addRowByUi(page)).toBe("integer");
    });
});
