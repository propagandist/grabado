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

    test("sqlite: house 既定を STRICT で表せる 3 列（段階6-8d）", async () => {
        /*
         * **段階6-8d で反転した主張。** 6-8c まではここが「未現代化なので従来どおり
         * id 1 列 ＋ autoincrement」で、寄せ先は 6-8a / 6-8c で mysql -> oracle -> sqlite と
         * 動いてきた。8 本すべてが <template> を持つようになったので、寄せ先は要らない。
         *
         * **UI から新規テーブルを作る経路は golden に 1 ビットも写らない**（golden はすべて
         * toDdl / toJson 経由）。8 本目のテンプレートが UI に届いたことを見るのはここだけ。
         *
         * house 既定が SQLite で何を失うかがそのまま出る —— **PK は TEXT で既定値なし**
         * （uuid 生成関数が無い）、監査列も TEXT（STRICT に日時型が無い）。
         *
         * パレットを差し替える前に空にする儀式は useDatatypes() の中へ畳んだ
         * （tests/browser/harness.ts。段階6-8d）。
         */
        await useDatatypes(page, "sqlite");

        const added = await addTableByUi(page);

        expect(added.rows).toEqual([
            { title: "id", type: "text", def: "", nll: false, ai: false },
            {
                title: "created_at",
                type: "text",
                def: "CURRENT_TIMESTAMP",
                nll: false,
                ai: false,
            },
            {
                title: "updated_at",
                type: "text",
                def: "CURRENT_TIMESTAMP",
                nll: false,
                ai: false,
            },
        ]);
        expect(added.keys).toEqual([{ type: "PRIMARY", parts: ["id"] }]);
        /* newrowtype="text"（添字 0 は integer なので、この属性が効いていることの証拠） */
        expect(await addRowByUi(page)).toBe("text");
    });
});
