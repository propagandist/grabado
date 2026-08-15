/* ------------------------- migrate-design --------------------- */
/*
 * grabado: 設計 JSON を formatVersion 1 -> 2 に移行する（HANDOVER §4 段階4-2b）。
 *
 *   node tools/migrate-design.mjs <ファイル> [<ファイル> ...]
 *   npm run migrate:design -- tests/golden/json/*.json
 *
 * ## なぜツールなのか（parser の後方互換読みにしない理由）
 *
 * 正本は git 管理のファイル（CLAUDE.md 制約2）。実行時に黙ってアップグレードすると、
 * 開いて保存し直すまでファイルは旧世代のままで、リポジトリ内に 2 世代が混在し
 * 「どれが移行済みか」を機械判定できない。かつ**意味の変化が git diff に出ない** ——
 * これは制約3（決定論・diff フレンドリー）が避けたい形そのもの。
 * 移行は 1 コミットとして出す。js/io/json-parser.ts が持つ後方互換は、
 * このコマンドを名指しする例外メッセージ 1 つだけ。
 *
 * ## 何が変わるか
 *
 *   - formatVersion: 1 -> 2
 *   - db: 省略可 -> 必須（無いファイルは --db で補う）
 *   - columns[].type: 型パレットの label -> 同じ <type> の id
 *
 * 型の意味は 1 つも変えない（同じ <type> 要素を label で引いて id で書き直すだけ）ので、
 * 移行の前後で設計は完全に同値。§6 のパレット現代化で起きる「型が消える・意味が変わる」
 * 移行はこれとは別物で、その表と規則は 6-7 の着手時に決める。
 *
 * ## 置き場所が js/ ではなく tools/ な理由
 *
 * 出荷バンドルに入れないため。互換コードを実行時に持たないというのが上の判断の要。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ----------------------------- 型パレット ----------------------------- */

/**
 * db/<db>/datatypes.xml から label -> id の対応を読む。
 *
 * XML パーサを使わず属性を正規表現で拾うのは、読むのが <type> の 2 属性だけで、
 * かつ XML の属性値には " が入らないため。tools/ に jsdom を持ち込む理由が無い。
 *
 * @param {string} db
 * @returns {{ db: string, labelToId: Map<string, string>, ids: Set<string> }}
 */
export function readPalette(db) {
    const path = join(REPO_ROOT, "db", db, "datatypes.xml");
    const xml = readFileSync(path, "utf8");

    const labelToId = new Map();
    const ids = new Set();
    for (const tag of xml.match(/<type\s[^>]*?\/>/g) ?? []) {
        const id = /\sid="([^"]*)"/.exec(tag)?.[1];
        const label = /\slabel="([^"]*)"/.exec(tag)?.[1];
        if (id === undefined || label === undefined) {
            throw new Error(`${db}: id か label の無い <type> がある: ${tag}`);
        }
        if (ids.has(id)) {
            throw new Error(`${db}: id が重複している: ${id}`);
        }
        ids.add(id);
        /*
         * label は先勝ちで入れる。パレット内で label は一意である前提だが、
         * 万一重複しても「黙って後の型に化ける」ことがないようにする
         * （js/io/json-parser.ts の照合が最初の一致を採るのと同じ立場）。
         */
        if (!labelToId.has(label)) {
            labelToId.set(label, id);
        }
    }
    if (labelToId.size === 0) {
        throw new Error(`${db}: <type> が 1 つも読めなかった（${path}）`);
    }
    return { db: db, labelToId: labelToId, ids: ids };
}

/* ------------------------------ 変換 ------------------------------ */

/**
 * 設計 JSON の文字列を v1 -> v2 に移行する。
 *
 * すでに v2 なら**入力をそのまま返す**（冪等。同じファイルに 2 回流しても差分が出ない）。
 *
 * @param {string} text 設計 JSON の全文
 * @param {(db: string) => { labelToId: Map<string, string> }} loadPalette
 *   db 名からパレットを引く関数。テストが差し替えられるように引数で受ける
 * @param {{ db?: string, where?: string }} [options]
 *   db: ファイルに db キーが無いときに補う値 / where: 例外メッセージに出す名前
 * @returns {{ text: string, changed: boolean, db: string }}
 */
export function migrateDesignJson(text, loadPalette, options = {}) {
    const where = options.where ?? "設計 JSON";
    const root = JSON.parse(text);

    if (root === null || typeof root !== "object" || Array.isArray(root)) {
        throw new Error(`${where}: ルートがオブジェクトではない`);
    }
    if (root.formatVersion === 2) {
        return { text: text, changed: false, db: root.db };
    }
    if (root.formatVersion !== 1) {
        throw new Error(
            `${where}: formatVersion が 1 でも 2 でもない（${JSON.stringify(root.formatVersion)}）`
        );
    }

    /*
     * 前提検査。「何も変換せずに parse -> stringify した結果が原文と一致するか」を見る。
     * 一致しなければそのファイルは serializer が書いた正規形ではない（手で編集された、
     * 別のツールを通った等）ので、変換せずに落とす —— 数値リテラルの表記揺れ
     * （20.0 -> 20）のような、意図しない差分が移行コミットに紛れ込むのを防ぐ。
     */
    const normalized = `${JSON.stringify(root, null, 2)}\n`;
    if (normalized !== text) {
        throw new Error(
            `${where}: serializer が書いた正規形ではない` +
                `（2 スペース整形・末尾 LF 1 つ・キー順が一致しない）。手で直してから流すこと`
        );
    }

    const db = root.db ?? options.db;
    if (typeof db !== "string" || db === "") {
        throw new Error(
            `${where}: db キーが無い。--db <name> で補うこと（v2 では必須）`
        );
    }
    const { labelToId } = loadPalette(db);

    /* キー順を formatVersion -> db -> tables に固定する（js/io/json-format.ts の宣言順） */
    const out = {
        formatVersion: 2,
        db: db,
        tables: (root.tables ?? []).map((table, ti) =>
            migrateTable(table, labelToId, `${where}: tables[${ti}]`)
        ),
    };

    return { text: `${JSON.stringify(out, null, 2)}\n`, changed: true, db: db };
}

/**
 * テーブル 1 件。**columns[].type 以外は 1 つも触らない**ので、キーの並びは
 * 入力のオブジェクトをそのまま展開して保つ（serializer が書いた順序がそのまま残る）。
 */
function migrateTable(table, labelToId, where) {
    if (table === null || typeof table !== "object" || Array.isArray(table)) {
        throw new Error(`${where}: オブジェクトが必要`);
    }
    return {
        ...table,
        columns: (table.columns ?? []).map((column, ci) =>
            migrateColumn(column, labelToId, `${where}.columns[${ci}]`)
        ),
    };
}

function migrateColumn(column, labelToId, where) {
    if (column === null || typeof column !== "object" || Array.isArray(column)) {
        throw new Error(`${where}: オブジェクトが必要`);
    }
    const label = column.type;
    if (typeof label !== "string") {
        throw new Error(`${where}.type: 文字列が必要`);
    }
    const id = labelToId.get(label);
    if (id === undefined) {
        throw new Error(
            `${where}.type: 型 "${label}" が型パレットに無い（移行できない）`
        );
    }
    /*
     * スプレッドの後に type を書くと、キーの位置は**元のまま**で値だけ入れ替わる
     * （JS のオブジェクトは既存キーへの再代入で挿入順を変えない）。
     * これで diff が type の 1 行だけになる。
     */
    return { ...column, type: id };
}

/* ------------------------------ CLI ------------------------------ */

function main(argv) {
    const files = [];
    let db;

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--db") {
            db = argv[++i];
        } else {
            files.push(argv[i]);
        }
    }

    if (files.length === 0) {
        console.error(
            "usage: node tools/migrate-design.mjs [--db <name>] <ファイル> [...]"
        );
        process.exit(2);
    }

    const palettes = new Map();
    const loadPalette = (name) => {
        if (!palettes.has(name)) {
            palettes.set(name, readPalette(name));
        }
        return palettes.get(name);
    };

    let migrated = 0;
    let skipped = 0;
    for (const file of files) {
        const text = readFileSync(file, "utf8");
        const result = migrateDesignJson(text, loadPalette, {
            db: db,
            where: file,
        });
        if (result.changed) {
            writeFileSync(file, result.text, "utf8");
            console.log(`migrated: ${file} (db=${result.db})`);
            migrated++;
        } else {
            console.log(`skip (already v2): ${file}`);
            skipped++;
        }
    }
    console.log(`\n${migrated} migrated, ${skipped} skipped`);
}

/* import されたときは走らせない（テストが変換関数だけを使う） */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2));
}
