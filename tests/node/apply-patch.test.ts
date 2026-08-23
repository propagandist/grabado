import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { applyPatch, applyPatches } from "../../js/io/ai/apply-patch.ts";
import type { PatchRejection, PatchResult } from "../../js/io/ai/apply-patch.ts";
import type { AiPatch, AiSuggestion, AiTarget } from "../../js/io/ai/suggestion.ts";
import { generateDdl } from "../../js/io/ddl/generate.ts";
import { parseDesignJson } from "../../js/io/json-parser.ts";
import { serializeDesignJson } from "../../js/io/json-serializer.ts";
import type { DesignModel, RowModel, TableModel } from "../../js/io/model.ts";
import { TypePalette } from "../../js/io/palette.ts";
import { parseDesignXml } from "../../js/io/xml-parser.ts";
import { REPO_ROOT, readFixture } from "../support/fixtures.ts";

/*
 * AI patch の適用（HANDOVER §11 段階11-1）。
 *
 * **ハーネスを使わない。** js/io/ai/apply-patch.ts が触るのは palette / model だけで、
 * どれも js/ の描画側に依存しない（convert.test.ts / introspect-parser.test.ts と同じ立場）。
 * DOM は jsdom から借りる。
 *
 * **golden は 1 本も作らない。** 返るのはバイト列ではなくモデルで、同じ性質の既存 2 本も
 * 素の vitest アサーションで書いてある。golden を足すと tests/browser/ に spec を 1 本
 * 増やすことになり、「既存 golden 114 本が 1 バイトも動かない」という 11-1 の完了判定が濁る。
 *
 * 主戦場は tests/fixtures/postgresql/relations.xml —— 自己参照 FK・1 テーブルに複数 FK・
 * 多対多の中間テーブルが 1 本に入っており、**rename の巻き込みすぎと取りこぼしの両方**が
 * 1 つの入力で出る。
 */

const dom = new JSDOM("");
const parser = new dom.window.DOMParser();

function paletteOf(db: string): TypePalette {
    const xml = readFileSync(join(REPO_ROOT, "db", db, "datatypes.xml"), "utf8");
    const palette = new TypePalette();
    palette.setRoot(parser.parseFromString(xml, "text/xml").documentElement as unknown as Element);
    return palette;
}

const palette = paletteOf("postgresql");

function parse(xml: string): DesignModel {
    const doc = parser.parseFromString(xml, "text/xml");
    return parseDesignXml(doc.documentElement as unknown as Element, palette);
}

/** そのプロファイルの fixture を、そのパレットで読む（convert.test.ts の modelOf と同じ） */
function modelOf(fixture: string): DesignModel {
    return parse(readFixture("postgresql", fixture));
}

const relations = (): DesignModel => modelOf("relations");

/** 1 テーブル 1 列。**サイズは datatype の括弧で書く**（fixture と同じ形） */
function oneColumn(datatype: string): DesignModel {
    return parse(
        `<sql db="postgresql"><table x="0" y="0" name="t">` +
            `<row name="c" null="1" autoincrement="0">` +
            `<datatype>${datatype}</datatype></row>` +
            `</table></sql>`,
    );
}

/**
 * **FK がまだ張られていない**列を持つ 2 テーブル。
 *
 * relations.xml には「参照していそうで宣言が無い列」が 1 つも無い（すべて張ってある）ので、
 * add-key FOREIGN を単独で当てるにはここで組むしかない。
 */
function unlinked(): DesignModel {
    return parse(
        `<sql db="postgresql">` +
            `<table x="0" y="0" name="teams">` +
            `<row name="id" null="0" autoincrement="0"><datatype>INTEGER</datatype></row>` +
            `</table>` +
            `<table x="0" y="0" name="employees">` +
            `<row name="team_id" null="1" autoincrement="0"><datatype>INTEGER</datatype></row>` +
            `</table>` +
            `</sql>`,
    );
}

/**
 * 提案 1 件を組む。**category / severity は適用に影響しない**ので固定値を使う
 * （そのこと自体は「決定論」の describe で 1 本押さえる）。
 */
function suggest(target: AiTarget, patch?: AiPatch): AiSuggestion {
    return {
        category: "naming",
        severity: "info",
        target: target,
        rationale: "テスト用の理由",
        patch: patch,
    };
}

function applyOne(model: DesignModel, target: AiTarget, patch?: AiPatch): PatchResult {
    return applyPatch(model, suggest(target, patch), palette);
}

/** 適用できたことを主張してモデルを取り出す */
function appliedModel(result: PatchResult): DesignModel {
    if (!result.applied) {
        throw new Error(`適用できてしまっていない: ${result.rejection.kind}`);
    }
    return result.model;
}

/** 落ちたことを主張して理由を取り出す */
function rejectionOf(result: PatchResult): PatchRejection {
    if (result.applied) {
        throw new Error("適用できてしまった");
    }
    return result.rejection;
}

function tableOf(model: DesignModel, name: string): TableModel {
    const table = model.tables.find((t) => t.title === name);
    if (table === undefined) {
        throw new Error(`テーブルが無い: ${name}`);
    }
    return table;
}

function rowOf(model: DesignModel, table: string, column: string): RowModel {
    const row = tableOf(model, table).rows.find((r) => r.title === column);
    if (row === undefined) {
        throw new Error(`列が無い: ${table}.${column}`);
    }
    return row;
}

/** 全テーブルの参照を「子 -> 親」の 1 行にして並べる（rename の追随を丸ごと見る） */
function allRelations(model: DesignModel): string[] {
    return model.tables.flatMap((t) =>
        t.rows.flatMap((r) =>
            r.relations.map((ref) => `${t.title}.${r.title} -> ${ref.table}.${ref.row}`),
        ),
    );
}

/** relations.xml の初期状態（このファイルの rename テストはすべてここからの差分） */
const RELATIONS_BEFORE = [
    "employees.manager_id -> employees.id",
    "projects.owner_id -> employees.id",
    "projects.team_id -> teams.id",
    "employee_projects.employee_id -> employees.id",
    "employee_projects.project_id -> projects.id",
];

describe("正常系 —— 8 つの op", () => {
    test("入力が何も変わっていないこと（fixture の前提）", () => {
        expect(allRelations(relations())).toEqual(RELATIONS_BEFORE);
    });

    test("rename-table: title だけが変わり、座標・コメント・行・キーは同一参照", () => {
        const model = relations();
        const before = tableOf(model, "teams");
        const next = appliedModel(
            applyOne(model, { table: "teams" }, { op: "rename-table", name: "squads" }),
        );

        const after = tableOf(next, "squads");
        expect(after.x).toBe(before.x);
        expect(after.y).toBe(before.y);
        expect(after.comment).toBe(before.comment);
        expect(after.rows).toBe(before.rows);
        expect(after.keys).toBe(before.keys);
    });

    test("rename-table: その名前を指す参照がすべて追随し、無関係な参照は動かない", () => {
        const next = appliedModel(
            applyOne(relations(), { table: "employees" }, { op: "rename-table", name: "staff" }),
        );

        expect(allRelations(next)).toEqual([
            "staff.manager_id -> staff.id",
            "projects.owner_id -> staff.id",
            /* teams への参照は 1 バイトも動かない */
            "projects.team_id -> teams.id",
            "employee_projects.employee_id -> staff.id",
            "employee_projects.project_id -> projects.id",
        ]);
    });

    test("rename-table: 参照を持たないテーブルは同一参照のまま（構造共有）", () => {
        const model = relations();
        const next = appliedModel(
            applyOne(model, { table: "employees" }, { op: "rename-table", name: "staff" }),
        );

        expect(tableOf(next, "teams")).toBe(tableOf(model, "teams"));
        expect(tableOf(next, "projects")).not.toBe(tableOf(model, "projects"));
    });

    test("rename-table: 同じ名前への改名は恒等（モデルごと同一参照）", () => {
        const model = relations();
        const result = applyOne(model, { table: "teams" }, { op: "rename-table", name: "teams" });

        expect(result.applied).toBe(true);
        expect(result.model).toBe(model);
    });

    test("rename-column: 行名と、同じテーブルのキーの part が追随する", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "employees", column: "id" },
                { op: "rename-column", name: "employee_id" },
            ),
        );

        expect(tableOf(next, "employees").rows.map((r) => r.title)).toEqual([
            "employee_id",
            "name",
            "manager_id",
        ]);
        expect(tableOf(next, "employees").keys[0]!.parts).toEqual(["employee_id"]);
    });

    test("rename-column: この列を親とする参照だけが追随する（同名の別テーブル列は無関係）", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "employees", column: "id" },
                { op: "rename-column", name: "employee_id" },
            ),
        );

        expect(allRelations(next)).toEqual([
            "employees.manager_id -> employees.employee_id",
            "projects.owner_id -> employees.employee_id",
            /* projects.id / teams.id も "id" だが、テーブルが違うので巻き込まない */
            "projects.team_id -> teams.id",
            "employee_projects.employee_id -> employees.employee_id",
            "employee_projects.project_id -> projects.id",
        ]);
    });

    test("rename-column: 子側（自分が持つ参照）は動かない", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "employees", column: "manager_id" },
                { op: "rename-column", name: "supervisor_id" },
            ),
        );

        expect(rowOf(next, "employees", "supervisor_id").relations).toEqual([
            { table: "employees", row: "id" },
        ]);
        expect(allRelations(next)[0]).toBe("employees.supervisor_id -> employees.id");
    });

    test("change-type: SQL 名をパレットの添字に解決する", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "employees", column: "id" },
                { op: "change-type", sqlType: "UUID" },
            ),
        );

        expect(rowOf(next, "employees", "id").type).toBe(palette.indexOfTypeName("UUID"));
    });

    test("change-type: 寄せ先がサイズを取らないなら size を捨てる", () => {
        const model = oneColumn("VARCHAR(255)");
        expect(rowOf(model, "t", "c").size).toBe("255");

        const next = appliedModel(
            applyOne(model, { table: "t", column: "c" }, { op: "change-type", sqlType: "TEXT" }),
        );
        expect(rowOf(next, "t", "c").size).toBe("");
    });

    test("change-type: サイズを取る型どうしなら据え置き。patch.size があればそちらが勝つ", () => {
        const kept = appliedModel(
            applyOne(
                oneColumn("VARCHAR(255)"),
                { table: "t", column: "c" },
                { op: "change-type", sqlType: "NUMERIC" },
            ),
        );
        expect(rowOf(kept, "t", "c").size).toBe("255");

        const given = appliedModel(
            applyOne(
                oneColumn("VARCHAR(255)"),
                { table: "t", column: "c" },
                { op: "change-type", sqlType: "VARCHAR", size: "64" },
            ),
        );
        expect(rowOf(given, "t", "c").size).toBe("64");
    });

    test("change-type: 既定値は 1 バイトも触らない", () => {
        const model = modelOf("house-defaults");
        expect(rowOf(model, "users", "id").def).toBe("uuidv7()");

        const next = appliedModel(
            applyOne(
                model,
                { table: "users", column: "id" },
                { op: "change-type", sqlType: "TEXT" },
            ),
        );
        expect(rowOf(next, "users", "id").def).toBe("uuidv7()");
    });

    test("add-column: 末尾に足り、省略した項目は NOT NULL / 既定なし / autoincrement なし", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "teams" },
                { op: "add-column", name: "created_at", sqlType: "TIMESTAMPTZ" },
            ),
        );

        expect(tableOf(next, "teams").rows.map((r) => r.title)).toEqual([
            "id",
            "name",
            "created_at",
        ]);
        expect(rowOf(next, "teams", "created_at")).toEqual({
            title: "created_at",
            type: palette.indexOfTypeName("TIMESTAMPTZ"),
            size: "",
            def: "",
            nll: false,
            ai: false,
            comment: "",
            relations: [],
        });
    });

    test("add-column: nullable / default / comment はそのまま入る", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "teams" },
                {
                    op: "add-column",
                    name: "note",
                    sqlType: "TEXT",
                    nullable: true,
                    default: "''",
                    comment: "備考",
                },
            ),
        );

        const added = rowOf(next, "teams", "note");
        expect(added.nll).toBe(true);
        expect(added.def).toBe("''");
        expect(added.comment).toBe("備考");
    });

    test("add-key: keys の末尾に付き、**name は空のまま**（規約名を焼き込まない）", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "projects" },
                { op: "add-key", keyType: "INDEX", columns: ["owner_id"] },
            ),
        );

        expect(tableOf(next, "projects").keys).toEqual([
            { type: "PRIMARY", name: "projects_pkey", parts: ["id"] },
            { type: "INDEX", name: "", parts: ["owner_id"] },
        ]);
    });

    test("add-key: 名前は DDL 生成が §6.3 の規約で組む（idx_<table>_<cols>）", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "projects" },
                { op: "add-key", keyType: "INDEX", columns: ["owner_id", "team_id"] },
            ),
        );

        expect(generateDdl(next, palette)).toContain("idx_projects_owner_id_team_id");
    });

    test("add-key FOREIGN: 子の行の relations に付き、型と autoincrement は動かない", () => {
        const model = unlinked();
        const before = rowOf(model, "employees", "team_id");
        const next = appliedModel(
            applyOne(
                model,
                { table: "employees", column: "team_id" },
                {
                    op: "add-key",
                    keyType: "FOREIGN",
                    references: { table: "teams", column: "id" },
                },
            ),
        );

        const after = rowOf(next, "employees", "team_id");
        expect(after.relations).toEqual([{ table: "teams", row: "id" }]);
        /* UI 経路（js/rowmanager.ts）の型寄せと autoincrement 落としは再現しない */
        expect(after.type).toBe(before.type);
        expect(after.ai).toBe(before.ai);
        /* keys には 1 つも足さない（モデルは FK を relations で持つ） */
        expect(tableOf(next, "employees").keys).toEqual([]);
    });

    test("add-key FOREIGN: 名前は DDL 生成が組む（fk_<table>_<column>）", () => {
        const next = appliedModel(
            applyOne(
                unlinked(),
                { table: "employees", column: "team_id" },
                {
                    op: "add-key",
                    keyType: "FOREIGN",
                    references: { table: "teams", column: "id" },
                },
            ),
        );

        expect(generateDdl(next, palette)).toContain("fk_employees_team_id");
    });

    test("set-nullable: nll だけが動く", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "projects", column: "team_id" },
                { op: "set-nullable", nullable: false },
            ),
        );

        expect(rowOf(next, "projects", "team_id").nll).toBe(false);
        expect(rowOf(next, "projects", "team_id").relations).toEqual([
            { table: "teams", row: "id" },
        ]);
    });

    test("set-default: 値がそのまま入り、空文字は「既定を外す」", () => {
        const set = appliedModel(
            applyOne(
                relations(),
                { table: "employees", column: "id" },
                { op: "set-default", value: "uuidv7()" },
            ),
        );
        expect(rowOf(set, "employees", "id").def).toBe("uuidv7()");

        const cleared = appliedModel(
            applyOne(
                modelOf("house-defaults"),
                { table: "users", column: "id" },
                { op: "set-default", value: "" },
            ),
        );
        expect(rowOf(cleared, "users", "id").def).toBe("");
    });

    test('set-default: "NULL" はここでは正規化しない（Row.update() の 1 箇所に残す）', () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "employees", column: "manager_id" },
                { op: "set-default", value: "NULL" },
            ),
        );

        expect(rowOf(next, "employees", "manager_id").def).toBe("NULL");
    });

    test("add-comment: target.column の有無でテーブルと列に振り分ける", () => {
        const onTable = appliedModel(
            applyOne(relations(), { table: "teams" }, { op: "add-comment", value: "チーム" }),
        );
        expect(tableOf(onTable, "teams").comment).toBe("チーム");
        expect(rowOf(onTable, "teams", "name").comment).toBe("");

        const onColumn = appliedModel(
            applyOne(
                relations(),
                { table: "teams", column: "name" },
                { op: "add-comment", value: "チーム名" },
            ),
        );
        expect(rowOf(onColumn, "teams", "name").comment).toBe("チーム名");
        expect(tableOf(onColumn, "teams").comment).toBe("");
    });

    test("add-comment: 既存のコメントは上書きできる", () => {
        const next = appliedModel(
            applyOne(
                relations(),
                { table: "employees", column: "manager_id" },
                { op: "add-comment", value: "直属の上長" },
            ),
        );

        expect(rowOf(next, "employees", "manager_id").comment).toBe("直属の上長");
    });
});

/*
 * 適用できない提案。**1 つも例外を投げず、モデルを 1 バイトも動かさない。**
 *
 * 表で持つのは、全ケースに同じ 2 つ（同一参照・非 throw）を掛けたいから。
 * model を関数で持てるのは「1 度適用した結果に対して」を書くケース（重複の検出）があるため。
 */
const REJECTIONS: ReadonlyArray<{
    readonly name: string;
    readonly model?: () => DesignModel;
    readonly target: AiTarget;
    readonly patch?: AiPatch;
    readonly expected: PatchRejection;
}> = [
    {
        name: "patch を持たない提案（§8.3 が明示的に許した形）",
        target: { table: "employees" },
        expected: { kind: "patchnopatch" },
    },
    {
        name: "対象のテーブルが無い",
        target: { table: "departments" },
        patch: { op: "rename-table", name: "teams2" },
        expected: { kind: "patchtablemissing", table: "departments" },
    },
    {
        name: "対象の列が無い",
        target: { table: "employees", column: "salary" },
        patch: { op: "set-nullable", nullable: true },
        expected: { kind: "patchcolumnmissing", table: "employees", column: "salary" },
    },
    {
        name: "列に掛かる op なのに target.column が無い",
        target: { table: "employees" },
        patch: { op: "set-nullable", nullable: true },
        expected: { kind: "patchtargetcolumn" },
    },
    {
        name: "rename-table の改名先が既にある",
        target: { table: "employees" },
        patch: { op: "rename-table", name: "teams" },
        expected: { kind: "patchnametaken", name: "teams" },
    },
    {
        name: "rename-column の改名先が同じテーブルに既にある",
        target: { table: "employees", column: "id" },
        patch: { op: "rename-column", name: "name" },
        expected: { kind: "patchnametaken", name: "name" },
    },
    {
        name: "change-type の型がパレットに無い（先頭型に落とさない）",
        target: { table: "employees", column: "id" },
        patch: { op: "change-type", sqlType: "MONEY" },
        expected: { kind: "patchunknowntype", sqlType: "MONEY" },
    },
    {
        name: "add-column の名前が既にある",
        target: { table: "employees" },
        patch: { op: "add-column", name: "name", sqlType: "TEXT" },
        expected: { kind: "patchnametaken", name: "name" },
    },
    {
        name: "add-column の型がパレットに無い",
        target: { table: "employees" },
        patch: { op: "add-column", name: "salary", sqlType: "MONEY" },
        expected: { kind: "patchunknowntype", sqlType: "MONEY" },
    },
    {
        name: "add-key の columns に実在しない列がある",
        target: { table: "employees" },
        patch: { op: "add-key", keyType: "INDEX", columns: ["id", "salary"] },
        expected: { kind: "patchcolumnmissing", table: "employees", column: "salary" },
    },
    {
        name: "add-key PRIMARY だが PRIMARY が既にある",
        target: { table: "employees" },
        patch: { op: "add-key", keyType: "PRIMARY", columns: ["name"] },
        expected: { kind: "patchkeyexists", keyType: "PRIMARY" },
    },
    {
        name: "add-key が同じ種類・同じ列の重複",
        model: () =>
            appliedModel(
                applyOne(
                    relations(),
                    { table: "projects" },
                    { op: "add-key", keyType: "INDEX", columns: ["owner_id"] },
                ),
            ),
        target: { table: "projects" },
        patch: { op: "add-key", keyType: "INDEX", columns: ["owner_id"] },
        expected: { kind: "patchkeyexists", keyType: "INDEX" },
    },
    {
        name: "add-key に columns が無い",
        target: { table: "employees" },
        patch: { op: "add-key", keyType: "INDEX" },
        expected: { kind: "patchmalformed", op: "add-key" },
    },
    {
        name: "add-key FOREIGN に references が無い",
        target: { table: "employees", column: "manager_id" },
        patch: { op: "add-key", keyType: "FOREIGN" },
        expected: { kind: "patchmalformed", op: "add-key" },
    },
    {
        name: "add-key FOREIGN の参照先テーブルが無い",
        target: { table: "employees", column: "manager_id" },
        patch: {
            op: "add-key",
            keyType: "FOREIGN",
            references: { table: "departments", column: "id" },
        },
        expected: { kind: "patchrefmissing", table: "departments", column: "id" },
    },
    {
        name: "add-key FOREIGN の参照先の列が無い",
        target: { table: "employees", column: "manager_id" },
        patch: {
            op: "add-key",
            keyType: "FOREIGN",
            references: { table: "teams", column: "code" },
        },
        expected: { kind: "patchrefmissing", table: "teams", column: "code" },
    },
    {
        name: "add-key FOREIGN が既にある参照と同じ",
        target: { table: "employees", column: "manager_id" },
        patch: {
            op: "add-key",
            keyType: "FOREIGN",
            references: { table: "employees", column: "id" },
        },
        expected: { kind: "patchrefexists", table: "employees", column: "id" },
    },
    {
        name: "add-comment に空文字（add- という名の op で実質の削除を通さない）",
        target: { table: "teams" },
        patch: { op: "add-comment", value: "" },
        expected: { kind: "patchemptyvalue" },
    },
];

describe("異常系 —— 例外を投げずに理由を返す", () => {
    for (const one of REJECTIONS) {
        test(one.name, () => {
            const model = (one.model ?? relations)();
            const result = applyOne(model, one.target, one.patch);

            expect(rejectionOf(result)).toEqual(one.expected);
            /* **部分適用を作らない** —— 落ちたらモデルは入力そのもの */
            expect(result.model).toBe(model);
        });
    }

    test("表のすべてのケースで 1 つも例外を投げない", () => {
        for (const one of REJECTIONS) {
            const model = (one.model ?? relations)();
            expect(() => applyOne(model, one.target, one.patch)).not.toThrow();
        }
    });

    test("テーブルが 0 件の設計には、どの op も patchtablemissing で落ちる", () => {
        const empty = modelOf("empty");
        const patches: AiPatch[] = [
            { op: "rename-table", name: "t" },
            { op: "rename-column", name: "c" },
            { op: "change-type", sqlType: "TEXT" },
            { op: "add-column", name: "c", sqlType: "TEXT" },
            { op: "add-key", keyType: "INDEX", columns: ["c"] },
            { op: "set-nullable", nullable: true },
            { op: "set-default", value: "" },
            { op: "add-comment", value: "x" },
        ];

        for (const patch of patches) {
            const result = applyOne(empty, { table: "t", column: "c" }, patch);
            expect(rejectionOf(result)).toEqual({ kind: "patchtablemissing", table: "t" });
        }
    });
});

describe("決定論と適用の順序", () => {
    test("同じ入力を 2 回適用すると同じモデルになる", () => {
        const patch: AiPatch = { op: "rename-table", name: "staff" };
        const first = appliedModel(applyOne(relations(), { table: "employees" }, patch));
        const second = appliedModel(applyOne(relations(), { table: "employees" }, patch));

        expect(second).toEqual(first);
    });

    test("category / severity は適用に影響しない", () => {
        const model = relations();
        const patch: AiPatch = { op: "set-nullable", nullable: true };
        const target: AiTarget = { table: "employees", column: "id" };

        const a = applyPatch(model, suggest(target, patch), palette);
        const b = applyPatch(
            model,
            { category: "missing_pk", severity: "error", target: target, rationale: "別", patch },
            palette,
        );

        expect(appliedModel(b)).toEqual(appliedModel(a));
    });

    test("触っていない枝は同一参照（列の変更は他の行にもキーにも届かない）", () => {
        const model = relations();
        const next = appliedModel(
            applyOne(
                model,
                { table: "employees", column: "id" },
                { op: "set-nullable", nullable: true },
            ),
        );

        expect(tableOf(next, "employees").keys).toBe(tableOf(model, "employees").keys);
        expect(rowOf(next, "employees", "name")).toBe(rowOf(model, "employees", "name"));
        expect(tableOf(next, "projects")).toBe(tableOf(model, "projects"));
    });

    test("applyPatches は配列順の畳み込み —— 後の提案は前の結果を見る", () => {
        const result = applyPatches(
            relations(),
            [
                suggest({ table: "employees" }, { op: "rename-table", name: "staff" }),
                suggest({ table: "staff" }, { op: "add-comment", value: "従業員" }),
            ],
            palette,
        );

        expect(result.rejections).toEqual([null, null]);
        expect(tableOf(result.model, "staff").comment).toBe("従業員");
    });

    test("applyPatches: 改名前の名前を指す提案は落ちる（並べ替えも依存解決もしない）", () => {
        const result = applyPatches(
            relations(),
            [
                suggest({ table: "employees" }, { op: "rename-table", name: "staff" }),
                suggest({ table: "employees" }, { op: "add-comment", value: "従業員" }),
            ],
            palette,
        );

        expect(result.rejections).toEqual([
            null,
            { kind: "patchtablemissing", table: "employees" },
        ]);
        expect(tableOf(result.model, "staff").comment).toBe("");
    });

    test("applyPatches: 途中で落ちても残りを中断しない。rejections は入力と 1 対 1", () => {
        const result = applyPatches(
            relations(),
            [
                suggest({ table: "teams" }, { op: "add-comment", value: "チーム" }),
                suggest({ table: "departments" }, { op: "add-comment", value: "部署" }),
                suggest({ table: "projects" }, { op: "add-comment", value: "案件" }),
            ],
            palette,
        );

        expect(result.rejections).toEqual([
            null,
            { kind: "patchtablemissing", table: "departments" },
            null,
        ]);
        expect(tableOf(result.model, "teams").comment).toBe("チーム");
        expect(tableOf(result.model, "projects").comment).toBe("案件");
    });

    test("applyPatches: 提案が 0 件なら入力のモデルがそのまま返る", () => {
        const model = relations();
        const result = applyPatches(model, [], palette);

        expect(result.model).toBe(model);
        expect(result.rejections).toEqual([]);
    });
});

/*
 * 固定の提案 JSON を丸ごと通す（CUSTOMIZATIONS.md 段階11-1 の「固定 JSON -> 適用 -> 差分」）。
 *
 * この fixture は **11-2 のモック LLM 応答としてそのまま再利用する**ので、形は
 * docs/ARCHITECTURE.md §8.3 の提案そのものにしてある（型は as で受ける ——
 * ランタイムの検証を持たないのは introspect-parser.test.ts と同じ立場）。
 */
describe("固定の提案 JSON（tests/fixtures/ai/review-response.json）", () => {
    const suggestions = JSON.parse(
        readFileSync(join(REPO_ROOT, "tests", "fixtures", "ai", "review-response.json"), "utf8"),
    ) as readonly AiSuggestion[];

    test("8 つの op がすべて 1 件以上入っている", () => {
        const ops = new Set(suggestions.map((s) => s.patch?.op).filter((op) => op !== undefined));

        expect([...ops].sort()).toEqual([
            "add-column",
            "add-comment",
            "add-key",
            "change-type",
            "rename-column",
            "rename-table",
            "set-default",
            "set-nullable",
        ]);
    });

    test("patch を持たない提案だけが落ち、残りはすべて適用できる", () => {
        const result = applyPatches(relations(), suggestions, palette);

        expect(result.rejections.filter((r) => r !== null)).toEqual([{ kind: "patchnopatch" }]);
    });

    test("適用後の設計が提案どおりになっている", () => {
        const { model } = applyPatches(relations(), suggestions, palette);

        expect(model.tables.map((t) => t.title)).toEqual([
            "employees",
            "projects",
            "teams",
            "employees_projects",
        ]);
        expect(rowOf(model, "employees", "full_name").title).toBe("full_name");
        expect(rowOf(model, "employees", "id").type).toBe(palette.indexOfTypeName("UUID"));
        expect(rowOf(model, "employees", "id").def).toBe("uuidv7()");
        expect(rowOf(model, "employees", "created_at").nll).toBe(false);
        expect(rowOf(model, "employees", "team_id").relations).toEqual([
            { table: "teams", row: "id" },
        ]);
        expect(tableOf(model, "projects").keys[1]).toEqual({
            type: "INDEX",
            name: "",
            parts: ["owner_id"],
        });
        expect(rowOf(model, "projects", "team_id").nll).toBe(false);
        expect(tableOf(model, "teams").comment).toBe("チーム。従業員とプロジェクトの所属先");
    });

    test("改名したテーブルを指す参照が追随している", () => {
        const { model } = applyPatches(relations(), suggestions, palette);

        expect(allRelations(model)).toEqual([
            "employees.manager_id -> employees.id",
            "employees.team_id -> teams.id",
            "projects.owner_id -> employees.id",
            "projects.team_id -> teams.id",
            "employees_projects.employee_id -> employees.id",
            "employees_projects.project_id -> projects.id",
        ]);
    });
});

/*
 * §4 の決定論パスへの合流（CLAUDE.md 制約3・制約7）。
 *
 * 適用結果は「AI が触ったモデル」ではなく**ただの DesignModel** で、既存の serializer が
 * そのまま受ける。ここが緑であることが「適用は §4 の決定論パスに合流する」の実測。
 */
describe("適用後のモデルは既存の決定論パスに乗る", () => {
    const patched = (): DesignModel => {
        const { model } = applyPatches(
            relations(),
            JSON.parse(
                readFileSync(
                    join(REPO_ROOT, "tests", "fixtures", "ai", "review-response.json"),
                    "utf8",
                ),
            ) as readonly AiSuggestion[],
            palette,
        );
        return model;
    };

    test("同じモデルからは同じバイト列が出る", () => {
        expect(serializeDesignJson(patched(), palette)).toBe(
            serializeDesignJson(patched(), palette),
        );
    });

    test("設計 JSON として書き出し、読み直し、もう一度書いてもバイト一致", () => {
        const once = serializeDesignJson(patched(), palette);
        const twice = serializeDesignJson(parseDesignJson(once, palette), palette);

        expect(twice).toBe(once);
    });

    test("DDL も出せる（キー名は生成器が規約で組む）", () => {
        const ddl = generateDdl(patched(), palette);

        expect(ddl).toContain("idx_projects_owner_id");
        expect(ddl).toContain("fk_employees_team_id");
        expect(ddl).toContain("employees_projects");
    });
});
