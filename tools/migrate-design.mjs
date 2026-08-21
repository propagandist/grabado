/* ------------------------- migrate-design --------------------- */
/*
 * grabado: 設計 JSON を移行する（HANDOVER §4 段階4-2b ＋ §6 段階6-3）。
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
 * ## 何が変わるか（2 種類あり、同じ 1 パスで両方適用する）
 *
 * **A. 形式の移行（段階4-2b。formatVersion 1 -> 2）**
 *
 *   - formatVersion: 1 -> 2
 *   - db: 省略可 -> 必須（無いファイルは --db で補う）
 *   - columns[].type: 型パレットの label -> 同じ <type> の id
 *
 * 型の意味は 1 つも変えない（同じ <type> 要素を label で引いて id で書き直すだけ）ので、
 * 移行の前後で設計は完全に同値。
 *
 * **B. 型 id の移行（段階6-3。パレット現代化で型が消える / 意味が変わる）**
 *
 *   - columns[].type: 撤去された id -> 寄せ先の id（表は下の TYPE_MIGRATIONS）
 *   - columns[].size: 寄せ先がサイズを持たない型なら**キーごと落とす**
 *
 * A と違い**意味的判断を含む**（`serial` は int4 -> int8 に広がり、`char` は size が落ちる）。
 * だから表は 6-0 で設計し、6-3 が同じ PR でパレットと一緒に入れた —— 表とパレットが
 * 別 PR に分かれると、その間リポジトリの設計ファイルが読めない（CLAUDE.md 制約1）。
 * **formatVersion は上げない**: キーの構造は変わらず値だけが変わるうえ、移行漏れは
 * 「その id が現在のパレットに無い」で js/io/json-parser.ts が throw するので可視化される。
 *
 * ## 置き場所が js/ ではなく tools/ な理由
 *
 * 出荷バンドルに入れないため。互換コードを実行時に持たないというのが上の判断の要。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ----------------------------- 型 id の移行表 ----------------------------- */

/**
 * パレット現代化で撤去された型 id と、その寄せ先（段階6-3）。
 *
 * プロファイルごとに持つ —— 型 id はプロファイル内で一意なだけなので、db を見ずに
 * 適用すると別プロファイルの同名 id を巻き込む（js/io/json-parser.ts が db を照合するのと
 * 同じ論法）。6-3 で現代化したのは postgresql だけで、6-8 で残る 4 本が現代化された ——
 * **表に増えたのは id を撤去した sqlite（6-8d）だけ**で、mysql / mssql / oracle の分は
 * 6-8a〜6-8c が入れていない（撤去した id があるのに表が無い。6-9 の宿題）。
 *
 * `dropSize` は寄せ先が length="0"（サイズを持たない型）のとき。落とさないと `TEXT(10)` の
 * ような壊れた DDL が出る。**判断は db/<db>/datatypes.xml の length と一致していなければ
 * ならない** —— 同じ規則を読み込み側（js/io/xml-parser.ts）も持っており、食い違うと
 * 「移行したファイル」と「XML から読み直したファイル」が別物になる。一致は golden が見る。
 *
 * **この表は「旧 id -> 新 id」で、db/postgresql/datatypes.xml の aka（「旧 sql 名 -> 新型」）
 * とは別物。** 前者は正本ファイルの移行、後者は互換で読む XML の照合。
 * 判断の根拠は CUSTOMIZATIONS.md の段階6-0（移行表）と段階6-3（実装）。
 */
const TYPE_MIGRATIONS = {
    postgresql: {
        /* HANDOVER §6.1「serial -> identity」。int4 -> int8 に広がる（安全側） */
        serial: { to: "bigint_identity" },
        bigserial: { to: "bigint_identity" },
        /* 実態は sql="BIGINT" を出力していた（label の Real は upstream の誤記＝ #3 の本体） */
        x_real: { to: "bigint" },
        /* HANDOVER §6.1「char(n) -> text」。**size が落ちる**（情報の損失） */
        char: { to: "text", dropSize: true },
        /*
         * HANDOVER §6.1「timestamp -> timestamptz」。
         * **size は落とさない** —— 6-0 の移行表は落ちる側に書いていたが、PG の
         * timestamptz(p) は秒精度を取れるので保つほうが情報を失わない（6-3 で訂正）。
         */
        timestamp: { to: "timestamp_with_time_zone" },
        timestamp_without_time_zone: { to: "timestamp_with_time_zone" },
        /* HANDOVER §6.1「json -> jsonb」 */
        json: { to: "jsonb" },
    },
    /*
     * 段階6-8d。STRICT テーブルが受ける型名は 6 語しか無く、**括弧も書けない**
     * （TEXT(255) は unknown datatype。実測）ので、**id が変わらない text にも dropSize が
     * 要る** —— 旧パレットの text は length="1" で、設計 JSON に size を持てた。
     * integer / real は旧パレットでも length="0" なので表に入れない。
     */
    sqlite: {
        /* STRICT に NUMERIC 親和性の型は無い。ANY は値を変換せずそのまま格納する */
        numeric: { to: "any" },
        /* NONE は SQLite に実在しない型名だった（upstream が親和性の名前を型として出していた） */
        none: { to: "any" },
        /* id も意味も変わらないが、STRICT は型名に括弧を書けないので size だけ落とす */
        text: { to: "text", dropSize: true },
    },
};

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
 * 設計 JSON の文字列を移行する（形式 v1 -> v2 ＋ 型 id の移行。冒頭の A / B）。
 *
 * **v2 で移行対象の型 id を 1 つも持たないファイルは入力をそのまま返す**
 * （冪等。同じファイルに 2 回流しても差分が出ない）。
 *
 * @param {string} text 設計 JSON の全文
 * @param {(db: string) => { labelToId: Map<string, string>, ids: Set<string> }} loadPalette
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
    const version = root.formatVersion;
    if (version !== 1 && version !== 2) {
        throw new Error(
            `${where}: formatVersion が 1 でも 2 でもない（${JSON.stringify(version)}）`
        );
    }

    const db = root.db ?? options.db;
    if (typeof db !== "string" || db === "") {
        throw new Error(
            `${where}: db キーが無い。--db <name> で補うこと（v2 では必須）`
        );
    }
    const migrations = TYPE_MIGRATIONS[db] ?? {};

    /*
     * v2 かつ型 id の移行対象が 1 つも無ければ、**触らずに返す**。
     *
     * 下の正規形検査を通さないのは段階4-2b からの挙動をそのまま保つため —— 手編集された
     * v2 ファイルに glob でこのコマンドを当てても、移行するものが無ければ黙って通る。
     * 検査は「これから書き換えるファイル」にだけ掛ける。
     */
    if (version === 2 && !hasMigratableType(root, migrations)) {
        return { text: text, changed: false, db: db };
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

    const palette = loadPalette(db);
    /*
     * v1 だけが label 照合を通る（v2 の type は既に id）。
     *
     * **label はパレット現代化で動く**（docs/FORMAT.md の規則3）ので、段階6-3 で消えた
     * label（Serial / Char / Timestamp w/ TZ / Real ほか）を持つ v1 ファイルはここで
     * 落ちる。実在するファイルは 0 本であることを 6-3 で確認済み（4-2 が書いた形式で、
     * リポジトリ内の 7 本はすべて 4-2b で v2 に移行してある）。歴史的な label 表を
     * ツールに焼くより、落ちて気づく形を採る。
     */
    const labelToId = version === 1 ? palette.labelToId : null;

    /* キー順を formatVersion -> db -> tables に固定する（js/io/json-format.ts の宣言順） */
    const out = {
        formatVersion: 2,
        db: db,
        tables: (root.tables ?? []).map((table, ti) =>
            migrateTable(
                table,
                { labelToId: labelToId, migrations: migrations, ids: palette.ids },
                `${where}: tables[${ti}]`
            )
        ),
    };

    const text2 = `${JSON.stringify(out, null, 2)}\n`;
    return { text: text2, changed: text2 !== text, db: db };
}

/** 移行対象の型 id が 1 つでもあるか（v2 を触るかどうかの判定だけに使う） */
function hasMigratableType(root, migrations) {
    for (const table of root.tables ?? []) {
        for (const column of table?.columns ?? []) {
            if (Object.hasOwn(migrations, column?.type)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * テーブル 1 件。**columns[].type / size 以外は 1 つも触らない**ので、キーの並びは
 * 入力のオブジェクトをそのまま展開して保つ（serializer が書いた順序がそのまま残る）。
 */
function migrateTable(table, ctx, where) {
    if (table === null || typeof table !== "object" || Array.isArray(table)) {
        throw new Error(`${where}: オブジェクトが必要`);
    }
    return {
        ...table,
        columns: (table.columns ?? []).map((column, ci) =>
            migrateColumn(column, ctx, `${where}.columns[${ci}]`)
        ),
    };
}

function migrateColumn(column, ctx, where) {
    if (column === null || typeof column !== "object" || Array.isArray(column)) {
        throw new Error(`${where}: オブジェクトが必要`);
    }
    const key = column.type;
    if (typeof key !== "string") {
        throw new Error(`${where}.type: 文字列が必要`);
    }

    /* A. 形式の移行（v1 のみ）: 型パレットの label -> 同じ <type> の id */
    let id = key;
    if (ctx.labelToId) {
        id = ctx.labelToId.get(key);
        if (id === undefined) {
            throw new Error(
                `${where}.type: 型 "${key}" が型パレットに無い（移行できない）`
            );
        }
    }

    /* B. 型 id の移行（段階6-3）: 撤去された id -> 寄せ先 */
    const rule = ctx.migrations[id];
    const out = { ...column };
    if (rule) {
        /*
         * 寄せ先が実在することを毎回検算する。表とパレットは同じ PR に入る決まりだが、
         * 片方だけ動いたときに**黙って読めないファイルを書く**のが最悪の失敗なので、
         * ツール側でも止める（js/io/json-parser.ts の未知 id throw と二重化）。
         */
        if (!ctx.ids.has(rule.to)) {
            throw new Error(
                `${where}.type: 移行先 "${rule.to}" が型パレットに無い（移行表とパレットが食い違っている）`
            );
        }
        id = rule.to;
        if (rule.dropSize) {
            delete out.size;
        }
    }

    /*
     * スプレッドの後に type を書くと、キーの位置は**元のまま**で値だけ入れ替わる
     * （JS のオブジェクトは既存キーへの再代入で挿入順を変えない）。
     * これで diff が type の 1 行（＋ size を落とす場合はその 1 行）だけになる。
     */
    out.type = id;
    return out;
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
            console.log(`skip (移行するものが無い): ${file}`);
            skipped++;
        }
    }
    console.log(`\n${migrated} migrated, ${skipped} skipped`);
}

/* import されたときは走らせない（テストが変換関数だけを使う） */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2));
}
