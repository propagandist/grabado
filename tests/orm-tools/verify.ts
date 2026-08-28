/* --------------------- orm-tools: ドライバ --------------------- */
/*
 * grabado: ORM 出力 42 本を**実物の道具**に通す（issue #120）。
 *
 *   npm run test:orm-tools             3 本とも
 *   npm run test:orm-tools -- drizzle  1 本だけ
 *
 * ★ **要 Docker ＋ ネットワーク。** 道具は使い捨てコンテナに都度入れる ——
 *   `devDependencies` を増やさないため（`npm ci` を重くしてまで常設する検査ではない）。
 *   **`npm test` にも CI にも入らない**（手元で回す層）。
 *
 * ★ **repo へは 1 バイトも書かない。** golden は `:ro` でマウントし、作業はコンテナ内。
 *   prelude 付きのファイルだけ OS の一時ディレクトリに作り、終わったら消す。
 *
 * ★ **確かめるのは構文と型だけ。** `drizzle-kit generate` / `prisma migrate diff` はやらない
 *   （設定と接続情報が要り、使い捨てで完結しなくなる）。**「情報が落ちていないか」は
 *   この層では捕まらない** —— 型検査は複合 PK が欠けていても通る（issue #123）。
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GOLDEN_DIR, REPO_ROOT } from "../support/fixtures.ts";
import type { ToolSpec } from "./cases.ts";
import { EXCLUSIONS, PRISMA_PRELUDE, PRISMA_URLS, TOOLS } from "./cases.ts";

const ORM_GOLDEN = join(GOLDEN_DIR, "orm");

interface Case {
    readonly db: string;
    readonly fixture: string;
    /** `<db>/<fixture>.<ext>` */
    readonly rel: string;
    readonly bytes: number;
}

/** `tests/golden/orm/<target>/` を走査する。**一覧は書かない**（cases.ts の★） */
function scan(target: string): Case[] {
    const root = join(ORM_GOLDEN, target);
    const out: Case[] = [];
    for (const db of readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()) {
        for (const file of readdirSync(join(root, db)).sort()) {
            const dot = file.lastIndexOf(".");
            out.push({
                db: db,
                fixture: dot < 0 ? file : file.slice(0, dot),
                rel: db + "/" + file,
                bytes: statSync(join(root, db, file)).size,
            });
        }
    }
    return out;
}

/**
 * 手元のシェルに残った値で条件が変わらないようにする（`tests/image/compose.ts` の `baseEnv`
 * と同じ思想）。**`DATABASE_URL` が生きていると Prisma の検証条件が人によって変わる。**
 */
function baseEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    delete env["DATABASE_URL"];
    delete env["NODE_OPTIONS"];
    for (const key of Object.keys(env)) {
        if (key.startsWith("NPM_CONFIG_")) {
            delete env[key];
        }
    }
    return env;
}

/** イメージの digest を印字する（タグ止めなので、**再現に要る情報はログに残す**） */
function reportDigest(image: string): void {
    try {
        const out = execFileSync(
            "docker",
            ["image", "inspect", "--format", "{{index .RepoDigests 0}}", image],
            { env: baseEnv(), encoding: "utf8" },
        );
        console.log("  digest: " + out.trim());
    } catch {
        console.log("  digest: (取得できず)");
    }
}

/** コンテナ内で走らせる sh スクリプト。**`${` を書かない**（テンプレートリテラルの都合） */
function script(tool: ToolSpec): string {
    const v = tool.versions;
    if (tool.target === "drizzle") {
        return [
            "set -u",
            "cd /work",
            /* golden を作業領域へ写す —— node_modules と同じ木に無いとモジュールを解決できない */
            "cp -r /golden /work/g",
            "npm init -y >/dev/null 2>&1",
            "npm i --no-audit --no-fund --loglevel=error drizzle-orm@" +
                v["drizzle-orm"] +
                " typescript@" +
                v["typescript"] +
                " >/dev/null 2>&1 || { echo 'ERROR: npm i に失敗した（ネットワークが要る）'; exit 9; }",
            "fail=0",
            "while read -r rel; do",
            /*
             * ★ --strict は必須。off だと自己参照 FK が暗黙 any に落ちて TS7022 が出ず、
             *   検査が素通りする。--skipLibCheck は on（drizzle-orm 自身の .d.ts の
             *   エラーは grabado の欠陥ではない。**export の有無は素通りしない**）。
             */
            '  if npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module esnext --moduleResolution bundler "/work/g/$rel" 2>&1 | sed "s|/work/g/||"; then',
            '    echo "PASS  $rel"',
            "  else",
            '    echo "FAIL  $rel"',
            "    fail=$((fail+1))",
            "  fi",
            "done < /cases/cases.txt",
            "exit $fail",
        ].join("\n");
    }
    if (tool.target === "prisma") {
        return [
            "set -u",
            "cd /work",
            "npm init -y >/dev/null 2>&1",
            "npm i --no-audit --no-fund --loglevel=error prisma@" +
                v["prisma"] +
                " >/dev/null 2>&1 || { echo 'ERROR: npm i に失敗した（ネットワークが要る）'; exit 9; }",
            "fail=0",
            "while IFS=\"$(printf '\\t')\" read -r rel schema url; do",
            '  if DATABASE_URL="$url" npx prisma validate --schema="$schema"; then',
            '    echo "PASS  $rel"',
            "  else",
            '    echo "FAIL  $rel"',
            "    fail=$((fail+1))",
            "  fi",
            "done < /cases/cases.txt",
            "exit $fail",
        ].join("\n");
    }
    return [
        "set -u",
        "command -v curl >/dev/null 2>&1 || { apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq curl >/dev/null 2>&1; }",
        "cd /tmp",
        "curl -fsSL -o k.zip https://github.com/JetBrains/kotlin/releases/download/v" +
            v["kotlin"] +
            "/kotlin-compiler-" +
            v["kotlin"] +
            ".zip || { echo 'ERROR: kotlin-compiler の取得に失敗した（ネットワークが要る）'; exit 9; }",
        "curl -fsSL -o jakarta.jar https://repo1.maven.org/maven2/jakarta/persistence/jakarta.persistence-api/" +
            v["jakarta.persistence-api"] +
            "/jakarta.persistence-api-" +
            v["jakarta.persistence-api"] +
            ".jar || { echo 'ERROR: jakarta.persistence-api の取得に失敗した'; exit 9; }",
        /* ★ jar xf は実行ビットを落とすので chmod が要る（unzip は temurin に無い） */
        "mkdir -p /opt/k && cd /opt/k && jar xf /tmp/k.zip && chmod +x /opt/k/kotlinc/bin/*",
        "fail=0",
        "while read -r rel; do",
        /* -nowarn は付ける —— allWarningsAsErrors は製品コードの規律で、生成物の合否ではない */
        '  if /opt/k/kotlinc/bin/kotlinc -nowarn -cp /tmp/jakarta.jar -d /tmp/out "/golden/$rel"; then',
        '    echo "PASS  $rel"',
        "  else",
        '    echo "FAIL  $rel"',
        "    fail=$((fail+1))",
        "  fi",
        "done < /cases/cases.txt",
        "exit $fail",
    ].join("\n");
}

/** `<db>/<fixture>.<ext>` -> 一時ディレクトリに置くときの平坦な名前 */
function flatten(rel: string): string {
    return rel.split("/").join("_");
}

/** cases.txt の 1 行を組む。Prisma だけ「スキーマの場所」と「URL」が要る */
function caseLine(tool: ToolSpec, one: Case, work: string): string {
    if (tool.target !== "prisma") {
        return one.rel;
    }
    const text = readFileSync(join(ORM_GOLDEN, tool.target, one.rel), "utf8");
    const datasource = /^datasource\s[\s\S]*?^\}/m.exec(text);
    if (datasource === null) {
        /* provider が無い golden は、検証時だけ prelude を末尾へ足す（cases.ts の★） */
        const flat = flatten(one.rel);
        writeFileSync(join(work, flat), text + PRISMA_PRELUDE, "utf8");
        return [one.rel, "/cases/" + flat, PRISMA_URLS["postgresql"]!].join("\t");
    }
    /* ★ provider は datasource ブロックの中から取る（generator client にも provider = がある） */
    const provider = /provider\s*=\s*"([^"]+)"/.exec(datasource[0]);
    const name = provider === null ? "postgresql" : provider[1]!;
    const url = PRISMA_URLS[name];
    if (url === undefined) {
        throw new Error("未知の Prisma provider: " + name + "（cases.ts の PRISMA_URLS に足す）");
    }
    return [one.rel, "/golden/" + one.rel, url].join("\t");
}

interface Outcome {
    readonly target: string;
    readonly ran: number;
    readonly skipped: number;
    readonly ok: boolean;
}

function runTool(tool: ToolSpec): Outcome {
    console.log("");
    console.log("=== " + tool.target + " —— " + tool.what + " ===");
    console.log(
        "  " +
            Object.entries(tool.versions)
                .map(([k, ver]) => k + " " + ver)
                .join(" / ") +
            "  on " +
            tool.image,
    );

    const cases = scan(tool.target);
    const lines: string[] = [];
    let skipped = 0;
    const work = mkdtempSync(join(tmpdir(), "grabado-orm-"));
    try {
        for (const one of cases) {
            if (one.bytes === 0) {
                /* 「空なら道具に渡すものが無い」は規則。除外リストには書かない */
                console.log("  SKIP  " + one.rel + "  (0 バイト)");
                skipped++;
                continue;
            }
            const excluded = EXCLUSIONS.find(
                (e) => e.target === tool.target && e.db === one.db && e.fixture === one.fixture,
            );
            if (excluded !== undefined) {
                console.log("  SKIP  " + one.rel + "  (" + excluded.reason + ")");
                skipped++;
                continue;
            }
            lines.push(caseLine(tool, one, work));
        }
        writeFileSync(join(work, "cases.txt"), lines.join("\n") + "\n", "utf8");

        const args = [
            "run",
            "--rm",
            "-e",
            "CHECKPOINT_DISABLE=1",
            "-e",
            "PRISMA_HIDE_UPDATE_MESSAGE=1",
            "-v",
            join(ORM_GOLDEN, tool.target) + ":/golden:ro",
            "-v",
            work + ":/cases:ro",
            "-w",
            tool.target === "jpa" ? "/tmp" : "/work",
            tool.image,
            "sh",
            "-c",
            script(tool),
        ];
        /* ★ argv を全文出す —— 「コマンドと結果がログに出る」が受け入れ基準（#120） */
        console.log("  $ docker " + args.slice(0, -1).join(" ") + " <script>");
        reportDigest(tool.image);

        try {
            execFileSync("docker", args, { cwd: REPO_ROOT, env: baseEnv(), stdio: "inherit" });
            return { target: tool.target, ran: lines.length, skipped: skipped, ok: true };
        } catch {
            return { target: tool.target, ran: lines.length, skipped: skipped, ok: false };
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

function main(): void {
    if (!existsSync(ORM_GOLDEN)) {
        console.error("ORM の golden が見つからない: " + ORM_GOLDEN);
        process.exitCode = 1;
        return;
    }

    const only = process.argv.slice(2);
    const targets = only.length === 0 ? TOOLS : TOOLS.filter((t) => only.includes(t.target));
    if (targets.length === 0) {
        console.error(
            "知らない道具: " + only.join(" ") + "（" + TOOLS.map((t) => t.target).join(" / ") + "）",
        );
        process.exitCode = 1;
        return;
    }

    /* ★ 1 本目が落ちても止めない —— 「残り 2 本が分からない」状態を作らない */
    const outcomes = targets.map(runTool);

    console.log("");
    console.log("=== まとめ ===");
    for (const one of outcomes) {
        console.log(
            "  " +
                (one.ok ? "OK  " : "NG  ") +
                one.target.padEnd(8) +
                " 走らせた " +
                String(one.ran) +
                " 本 / 飛ばした " +
                String(one.skipped) +
                " 本",
        );
    }
    if (outcomes.some((one) => !one.ok)) {
        console.log("");
        console.log("落ちたものの切り分けは tests/orm-tools/README.md の判定木を見ること。");
        process.exitCode = 1;
    }
}

main();
