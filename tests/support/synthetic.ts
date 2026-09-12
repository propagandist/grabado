import type {
    JsonColumn,
    JsonDesign,
    JsonKey,
    JsonTable,
} from "../../frontend/js/io/json-format.ts";
import type { ScaleCounts } from "./probe.ts";

/*
 * 規模の実測に使う合成設計（#206）。
 *
 * ★★ **測る対象で測る対象を作らない。** 型だけを `import type` で借り、値は 1 つも import
 *   しない —— serializer を通して生成すると、serializer のバグが入力に写って見えなくなる
 *   （tests/fixtures/** をすべて手書きにしているのと同じ規律。docs/TESTING.md）。
 *
 * ★★ **乱数を使わない。** すべて添字の算術で決まる。シードつき PRNG は「決定論だが読めば
 *   分かるとは限らない」形を持ち込む —— N を変えたときに何が変わったかを、コードを読むだけで
 *   言えるほうが大事。
 *
 * ★ **生成物はコミットしない。** SCALE_DUMP=1 のときだけ test-results/（gitignore 済み）へ
 *   落とす。既定で 1 バイトも書かない —— CI の最終ステップが `git diff --exit-code` を回す。
 */

/** 型パレットの id（frontend/db/postgresql/datatypes.xml）。値を import しないので文字列で持つ */
const DB = "postgresql";

/**
 * 1 テーブルあたりの列数。**house 既定に寄せた 9 列**（PK ／ 監査列 2 ／ 本体 5 ／ FK 1）で、
 * 実際に描く設計の重さに近づける。FK を持たない先頭テーブルだけ 8 列になる。
 */
export const COLUMNS_PER_TABLE = 9;

/** 横に並べる列数。格子に置くのは、テーブルが重ならず座標が添字だけで決まるから */
const GRID_COLUMNS = 10;
const GRID_X = 420;
const GRID_Y = 320;

/**
 * N テーブルの合成設計を JSON 文字列で返す。
 *
 * 形は N によらず同じ:
 *   - `t0` は FK を持たない（9 列のうち 8 列）
 *   - `t1` 以降は 1 つ前のテーブルの `id` を指す FK を 1 本持ち、その列に INDEX が付く
 *   - **関係は N-1 本**で、FK の本数が N に比例する
 *
 * ★★ **グラフとしては「深さ 1 の連なり」で、1 本鎖ではない**（2026-09-09 に実測して気づいた）。
 *   `t1.parent_id` が `t0.id` を指すので辺は `t0.id -> t1.parent_id` になるが、
 *   **`t1.parent_id` は誰からも指されない** —— `t2.parent_id` が指すのは `t1.id` のほう。
 *   したがって **FK の型伝播はどの N でも 2 段で止まる**。
 *
 *   深い鎖（N 段の伝播）を測るには `t(i).id` が `t(i-1).id` を指す形が要るが、それは
 *   「1 対 1 の継承チェーン」という別の設計で、読み込みの費用を測る目的からは外れる。
 *   **必要になった時点で 2 つ目の生成器を足す**（#206 の申し送り）。
 */
export function syntheticDesign(tableCount: number): string {
    if (!Number.isInteger(tableCount) || tableCount < 1) {
        throw new Error(`テーブル数は 1 以上の整数（受け取ったのは ${tableCount}）`);
    }

    const tables: JsonTable[] = [];
    for (let i = 0; i < tableCount; i++) {
        tables.push(syntheticTable(i));
    }

    const design: JsonDesign = { formatVersion: 2, db: DB, tables };
    /* 正準形に揃える（json-serializer.ts と同じ整形。末尾 LF 1 つ） */
    return JSON.stringify(design, null, 2) + "\n";
}

function syntheticTable(i: number): JsonTable {
    const columns: JsonColumn[] = [
        { name: "id", type: "uuid", default: "uuidv7()" },
        { name: "name", type: "text" },
        /*
         * ★ decimal は length="1"（size を取る型）。size を書かないと Row.update の
         *   hasSize 正規化が空に潰し、生成した JSON と読み戻した JSON がずれる。
         */
        { name: "amount", type: "decimal", size: "12,2" },
        { name: "is_active", type: "boolean", default: "true" },
        { name: "note", type: "text", nullable: true },
        { name: "payload", type: "jsonb", default: "'{}'::jsonb" },
        { name: "created_at", type: "timestamp_with_time_zone", default: "now()" },
        { name: "updated_at", type: "timestamp_with_time_zone", default: "now()" },
    ];

    const keys: JsonKey[] = [{ type: "PRIMARY", columns: ["id"] }];

    if (i > 0) {
        columns.push({
            name: "parent_id",
            type: "uuid",
            nullable: true,
            references: [{ table: tableName(i - 1), column: "id" }],
        });
        keys.push({ type: "INDEX", columns: ["parent_id"] });
    }

    return {
        name: tableName(i),
        x: 20 + (i % GRID_COLUMNS) * GRID_X,
        y: 20 + Math.floor(i / GRID_COLUMNS) * GRID_Y,
        columns,
        keys,
    };
}

/** ゼロ埋めしない。`t9` の次が `t10` で、名前の長さが増えることも入力の一部 */
function tableName(i: number): string {
    return `t${i}`;
}

/**
 * 合成設計 N 段の読み込みで、各カウンタが取る値（1 次式）。**この表が正本**。
 *
 * ★★ **2 か所に書かない。** 元は tests/node/scale.test.ts と tests/scale/load.spec.ts が
 *   同じ式を別々に持っており、**#207 で片方だけ直り、もう片方が赤くなって気づいた**
 *   （2026-09-10）。実行系は違うが**読み出し回数は同じ**でなければならず、
 *   それ自体が「2 実行系で同じ経路を通っている」証拠になる。
 *
 * 導出できるもの:
 *   - rowUpdate = 列の総数（1 テーブル 9 列で、先頭だけ FK が無く 8 列）
 *   - rowRedraw = 列の総数 ＋ キー登録数（PRIMARY が N 本、INDEX が N-1 本、各 1 列）
 *   - relationRedraw = 関係の本数（1 本鎖なので N-1）
 *   - offsetWidth / offsetHeight = **48N - 8 から tableRedraw を引いた値**（#207。
 *     Table.redraw() の 2 回読みが 1 回になった分）
 * 実測から当てはめたもの:
 *   - offsetTop / offsetLeft / tableRedraw
 */
export const SCALE_COUNTS: Record<keyof ScaleCounts, (n: number) => number> = {
    /*
     * ★ #210 で 25N - 5 から落ちた。**内訳は導出できる** ——
     *   実際に描いた Table.redraw() が 3N 回（各 1 回読む）＋
     *   Relation.measure() が N-1 本 x 2 回（両端のテーブル）＝ **5N - 2**。
     */
    offsetWidth: (n) => 5 * n - 2,
    offsetHeight: (n) => 5 * n - 2,
    offsetTop: (n) => 4 * n - 4,
    offsetLeft: (n) => 2 * n - 2,
    rowRedraw: (n) => 11 * n - 2,
    rowUpdate: (n) => COLUMNS_PER_TABLE * n - 1,
    /*
     * ★ #210 の後は「呼び出し回数」。早期 return で戻った分も入るので、
     *   resumeRedraw() の N 回ぶんだけ #207 時点（23N - 3）より増えている。
     */
    tableRedraw: (n) => 24 * n - 3,
    /**
     * 実際に描いた回数（#210）。**resumeRedraw() の N ＋ ff hack の 2N。**
     * 元は N(1 + 2C + P) + 2N で、house 既定の列数なら 1 桁違う。
     */
    tableRedrawWorked: (n) => 3 * n,
    relationRedraw: (n) => n - 1,
};

/**
 * DOM ノード数。読み込み後 **61N + 72**（72 は設計と無関係な UI の分）。
 *
 * ★ 定数項は **#289 で 67 -> 72 に動いた** —— ツールバーに undo / redo の 2 群
 *   （span 2 ＋ input 2 ＋ 区切りの hr 1）を足したため。**設計あたりの係数 61 は
 *   動いていない**ので、増えたのは「ページが最初から持っている要素」の側。
 */
export const SCALE_DOM_NODES = (n: number): number => 61 * n + 72;
