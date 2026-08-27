/* ------------------------- json parser ------------------------ */
/*
 * grabado: 設計 JSON -> DesignModel（HANDOVER §4 段階4-2）。
 *
 * js/io/json-serializer.ts の鏡。ライブツリー（描画クラスのインスタンス）には一切
 * 触らない —— 触る側は js/io/apply.ts（4-1b で確定。本段階では 1 行も触らない）。
 *
 * ## xml-parser.ts と規則が違うところ（意図的）
 *
 * xml-parser.ts は「現行の挙動を 1 バイトも変えない」ことが要件の逐語移設なので、
 * 壊れた入力を黙って受け流す癖（未知の型は添字 0 / 最後の一致が勝つ / 属性が無ければ
 * 実行時 null）をそのまま持っている。本ファイルは**新しい形式**の読み手で、しかも
 * 読む対象は **git 管理の正本ファイル**（CLAUDE.md 制約2）なので、逆に振る:
 *
 *   - 未知の型 id は **throw**（known-issue #4 の「一致が無ければ添字 0」を持ち込まない。
 *     正本を黙って別の型で開くのが最悪の失敗）。
 *   - **db が実行中のパレットと違えば throw**（4-2b）。id はプロファイル内で一意なだけなので、
 *     db を見ないと別プロファイルのファイルを黙って読んでしまう。
 *   - **formatVersion 1 は読まない**（4-2b）。移行コマンドを名指しして落とす。
 *   - 型・必須キーが食い違えば throw。**壊れた JSON は部分的に読み込まない。**
 *
 * 例外の message は開発者向けで locale を通さない。ユーザーへの見せ方（alert か
 * ダイアログか）は UI を配線する 4-3 の判断。
 *
 * 内部関数の parseJsonTable / parseJsonKey は js/io/xml-parser.ts の同名関数との
 * バンドル上の衝突を避けるための命名（理由の正本は js/io/json-serializer.ts の冒頭）。
 *
 * 形式の定義とキー順の契約は js/io/json-format.ts、散文は docs/FORMAT.md。
 */

import type { TypePalette } from "./palette.ts";
import type {
    DesignModel,
    TableModel,
    RowModel,
    KeyModel,
    RelationRef,
} from "./model.ts";

export function parseDesignJson(
    text: string,
    palette: TypePalette
): DesignModel {
    /* 構文エラーは JSON.parse の SyntaxError がそのまま出る（位置が入るので包まない） */
    const root = asObject(JSON.parse(text), "ルート");

    const version = root["formatVersion"];
    /*
     * 版 1 は後方互換で読まない（段階4-2b）。実行時に黙ってアップグレードすると、
     * 開いて保存し直すまでファイルは旧世代のままで、リポジトリ内に 2 世代が混在し
     * 「どれが移行済みか」を機械判定できなくなる（CLAUDE.md 制約2 は正本が git 管理の
     * ファイルであることを要求している）。移行は 1 コミットとして git diff に出す。
     * ここに置く後方互換は、この**例外メッセージ 1 つだけ**。
     */
    if (version === 1) {
        throw new Error(
            "設計 JSON: formatVersion 1 は段階4-2b で廃止された" +
                "（型キーが型パレットの label から id に変わった）。" +
                "`npm run migrate:design -- <ファイル>` を通してからコミットすること"
        );
    }
    if (version !== 2) {
        throw new Error(
            `設計 JSON: formatVersion が 2 ではない（${JSON.stringify(version)}）`
        );
    }

    /*
     * db は必須で、実行中のパレットと照合する（4-2b。4-2 は読んで捨てていた）。
     *
     * 型キーの id はプロファイル内で一意なだけなので、db を見ないと別プロファイルの
     * ファイルを黙って読んでしまう。label 時代はこれが**実害のある穴**で、実測すると
     * postgresql と mysql は label を 12 個共有しており（Integer / Text / Timestamp /
     * Char / Varchar / Decimal / Date / Time / Bit / Binary / 単精度 / 倍精度）、
     * PG の設計を mysql パレットで開くと 12 型が例外にならず別の型に解決されていた。
     * id にしても衝突の可能性は消えない（integer / text などは複数プロファイルにある）ので、
     * **db の照合と id 化はセットで初めて安全になる**。
     *
     * 食い違ったときに UI が何をするかは **段階4-3b で「拒む」に確定した**。
     * パレットを取り直して開き直す案は却下 —— 読込 5 経路の非同期化が要るうえ、
     * cookie の db は変わらないのでリロードで元に戻る半端な状態も作る。現行 UI も
     * 「db の変更にはリロードが要る」という契約を明示している（locale の optionsnotice）
     * ので、そちらに揃える。4-3b 時点ではもう 1 つ「typeIndex / fkTypeFor の古い
     * キャッシュを新パレットに当てる癖」を理由に挙げていたが、**段階6-2 でその
     * キャッシュごと廃止した**ので現在は成立しない（残る 2 つで結論は変わらない）。
     *
     * そのぶん**例外メッセージに導線を持たせる**。ここが実質ユーザー向けの唯一の
     * 出口になる（js/io.ts の loadDesignText がそのまま alert に流す）。ただし
     * locale は通さない（本ファイル冒頭の規約）ので、Options の項目名は訳語ではなく
     * 設定キーの `db` で指す —— 訳語を焼くと 21 言語のどれか 1 つと必ず食い違う。
     */
    const db = asString(root["db"], "db");
    const current = palette.db();
    if (db !== current) {
        throw new Error(
            `設計 JSON: db が実行中の型パレットと違う` +
                `（ファイル="${db}" / 実行中="${current}"）。` +
                `Options の db を "${db}" に変えてページを再読み込みすること`
        );
    }

    const tables = asArray(root["tables"], "tables").map((t, i) =>
        parseJsonTable(t, `tables[${i}]`, palette)
    );
    return { tables: tables };
}

function parseJsonTable(
    value: unknown,
    where: string,
    palette: TypePalette
): TableModel {
    const obj = asObject(value, where);
    return {
        title: asString(obj["name"], `${where}.name`),
        x: asNumber(obj["x"], `${where}.x`),
        y: asNumber(obj["y"], `${where}.y`),
        comment: asOptionalString(obj["comment"], `${where}.comment`),
        rows: asArray(obj["columns"], `${where}.columns`).map((c, i) =>
            parseColumn(c, `${where}.columns[${i}]`, palette)
        ),
        keys: asOptionalArray(obj["keys"], `${where}.keys`).map((k, i) =>
            parseJsonKey(k, `${where}.keys[${i}]`)
        ),
    };
}

function parseColumn(
    value: unknown,
    where: string,
    palette: TypePalette
): RowModel {
    const obj = asObject(value, where);
    const def = obj["default"];
    return {
        title: asString(obj["name"], `${where}.name`),
        type: typeIdIndex(
            asString(obj["type"], `${where}.type`),
            palette,
            `${where}.type`
        ),
        size: asOptionalString(obj["size"], `${where}.size`),
        /*
         * キーが無ければ ""（＝ Row のコンストラクタ既定と同じ。段階4-5 で null を
         * 撤去した）。"NULL" -> "" の正規化は Row.update() の中で起きるので、ここでは
         * 何もしない（4-1b の決めたこと 3 と同じ立場 —— 2 つの規則を離さない）。
         */
        def: def === undefined ? "" : asString(def, `${where}.default`),
        nll: asOptionalBoolean(obj["nullable"], `${where}.nullable`),
        ai: asOptionalBoolean(obj["autoincrement"], `${where}.autoincrement`),
        comment: asOptionalString(obj["comment"], `${where}.comment`),
        relations: asOptionalArray(
            obj["references"],
            `${where}.references`
        ).map((r, i) => parseReference(r, `${where}.references[${i}]`)),
    };
}

function parseReference(value: unknown, where: string): RelationRef {
    const obj = asObject(value, where);
    return {
        table: asString(obj["table"], `${where}.table`),
        row: asString(obj["column"], `${where}.column`),
    };
}

function parseJsonKey(value: unknown, where: string): KeyModel {
    const obj = asObject(value, where);
    return {
        type: asString(obj["type"], `${where}.type`),
        /* 省略時は ""（Key のコンストラクタ既定と同じ。setName("") は既定と同値） */
        name: asOptionalString(obj["name"], `${where}.name`),
        parts: asArray(obj["columns"], `${where}.columns`).map((p, i) =>
            asString(p, `${where}.columns[${i}]`)
        ),
    };
}

/*
 * 型パレットの id -> 添字（段階4-2b。それまでは label 照合だった）。
 * 見つからなければ throw する（known-issue #4 の「一致が無ければ添字 0」を持ち込まない）。
 *
 * §6 のパレット現代化で撤去される型（PG18 なら serial / char / json など）は、
 * その段階が同じ PR で移行表を持ち、リポジトリ内の設計ファイルを移行する。
 * ここで落ちるのは**移行し忘れたファイルだけ**で、それが移行漏れの可視化になる。
 */
function typeIdIndex(
    id: string,
    palette: TypePalette,
    where: string
): number {
    const index = palette.indexOfId(id);
    if (index < 0) {
        throw new Error(
            `設計 JSON ${where}: 型 "${id}" が現在の型パレット（db=${palette.db()}）に無い`
        );
    }
    return index;
}

/* --------------------------- 検証ヘルパー --------------------------- */
/*
 * どれも「型が違えば where 付きで throw」の 1 パターン。unknown から降ろす箇所を
 * ここに集約してあるので、上の parse* は as を 1 つも持たない。
 */

function asObject(value: unknown, where: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(
            `設計 JSON ${where}: オブジェクトが必要（${describe(value)}）`
        );
    }
    return value as Record<string, unknown>;
}

function asArray(value: unknown, where: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`設計 JSON ${where}: 配列が必要（${describe(value)}）`);
    }
    return value;
}

/** 省略可の配列。無ければ空配列（既定 []） */
function asOptionalArray(value: unknown, where: string): unknown[] {
    if (value === undefined) {
        return [];
    }
    return asArray(value, where);
}

function asString(value: unknown, where: string): string {
    if (typeof value !== "string") {
        throw new Error(`設計 JSON ${where}: 文字列が必要（${describe(value)}）`);
    }
    return value;
}

/** 省略可の文字列。無ければ ""（既定） */
function asOptionalString(value: unknown, where: string): string {
    if (value === undefined) {
        return "";
    }
    return asString(value, where);
}

function asNumber(value: unknown, where: string): number {
    if (typeof value !== "number" || !isFinite(value)) {
        throw new Error(
            `設計 JSON ${where}: 有限の数値が必要（${describe(value)}）`
        );
    }
    return value;
}

/** 省略可の真偽値。無ければ false（既定） */
function asOptionalBoolean(value: unknown, where: string): boolean {
    if (value === undefined) {
        return false;
    }
    if (typeof value !== "boolean") {
        throw new Error(`設計 JSON ${where}: 真偽値が必要（${describe(value)}）`);
    }
    return value;
}

/** 例外メッセージ用。値そのものではなく「何が来たか」を短く出す */
function describe(value: unknown): string {
    if (value === undefined) {
        return "未指定";
    }
    if (value === null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "配列";
    }
    return typeof value;
}
