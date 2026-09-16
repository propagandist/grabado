import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../support/fixtures.ts";

/*
 * **root の設定が指す先が実在すること**を固定する（issue #315）。
 *
 * root には他所の中身を**パスで名指しする**ファイルが並んでいる（`.gitattributes` /
 * `.gitignore` / `.dockerignore` / `tsconfig.json` / `vite.config.ts` ＋ CI の `paths`）。
 * **指し先が動くと、どれも黙って外れる** —— エラーにならず、テストも落ちない。
 *
 * 実際に外れた。**段階2-6（#107 / #108）で `db/` と `locale/` が `frontend/` 配下へ移ったとき、
 * `.gitattributes` の 2 行が root 基準のまま残り、19 日間どのファイルにも当たっていなかった**
 * （2026-09-15 実測。`git check-attr text eol -- frontend/locale/ko.xml` が `unspecified`）。
 * 同じ日の #112 で消した `compose.e2e.linux.yaml` も `ci-image.yml` の `paths` に残っていた。
 * **同型の取りこぼしは 2 度目**で、1 度目（#109。`ARCHITECTURE.md` のツリーが root のまま）は
 * 「2-6 の検証が frontend/ の中しか見ていなかった」と記録しただけで、**検査を置かなかった**。
 *
 * イディオムは tests/node/env-contract.test.ts と同じ（正本を読んで、ずれを赤くする）。
 *
 * ★ **見るのは「ワイルドカードの手前まで」だけ。** `db/**` なら `db`、`scripts/*.sh` なら
 *   `scripts`。**glob の展開には踏み込まない** —— 一致の規則を自前で持つと、**検査のほうが
 *   壊れる**。実際、調査中に `git ls-files` へ pathspec で server 配下の kts を渡したら 0 件が返り
 *   （**pathspec と gitignore 形式は `**` の解釈が違う**）、**生きているものを死んでいると
 *   言いかけた**。ここが捕まえるのは**事故の形**——「**ディレクトリごと動かして、指す側を
 *   直し忘れる**」——であって、パターンの正しさ一般ではない。
 *
 * ★ **git を呼ばない。** `git check-attr` に聞けば厳密に判定できるが、`npm test` の層は
 *   **外部プロセスを 1 つも起こしていない**（2026-09-15 実測）。厳密さのために層の性格を
 *   変えるより、**事故の形だけを捕まえて速いまま**にする。
 *
 * ★ **意図して対象外にしたもの**（漏れではない）
 *   - `.gitignore` —— **無視パターンは実在しないのが正常**（`.DS_Store` / `build` / `.idea` は
 *     先回りして無視するもの）。実在を要求すると、**正しいものが赤くなる**。
 *   - `.dockerignore` の `!` —— 指し先が消えればイメージに入らず、`ci-image.yml` の E2E 13 本が
 *     **実際にコンテナを起こして**落ちる。**既に機械が付いている。**
 *   - `tsconfig.json` の `include` と `vite.config.ts` の `root` —— **別の帯**。広げるなら、
 *     先に「root がパスで指すもの」の一覧そのものを決めること。
 *   - **先頭がワイルドカードのパターン**（`*.config.ts`）—— anchor が無いので何も言えない。
 *     下の [anchorOf] が `null` を返し、その項目は飛ばす。
 */

const GITATTRIBUTES = ".gitattributes";
const WORKFLOW_DIR = ".github/workflows";

/** 改行は LF に寄せて読む（`$` が CR に引っかかると、書式ではなく OS で結果が変わる）。 */
function read(rel: string): string {
    return readFileSync(join(REPO_ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

/**
 * パターンから**ワイルドカードの手前まで**を取り出す。`db/**` → `db`、
 * `docs/samples/*.json` → `docs/samples`、`Dockerfile` → `Dockerfile`。
 *
 * **先頭のセグメントが既にワイルドカードなら `null`**（`*.config.ts`）——
 * 言えることが無いので、呼ぶ側が飛ばす。
 */
function anchorOf(pattern: string): string | null {
    const fixed: string[] = [];
    for (const segment of pattern.split("/")) {
        if (/[*?[\]]/.test(segment)) break;
        fixed.push(segment);
    }
    return fixed.length > 0 ? fixed.join("/") : null;
}

/** anchor が実在しないものだけを返す（anchor を持たないものは対象外）。 */
function stale<T>(items: T[], patternOf: (item: T) => string): T[] {
    return items.filter((item) => {
        const anchor = anchorOf(patternOf(item));
        return anchor !== null && !existsSync(join(REPO_ROOT, anchor));
    });
}

/** `.gitattributes` の各行の**先頭の語**（＝パターン）。コメントと空行を除く。 */
function gitattributesPatterns(): string[] {
    return read(GITATTRIBUTES)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"))
        .map((line) => line.split(/\s+/)[0]!);
}

/**
 * ワークフローの `paths:` ブロックが列挙しているパス。
 *
 * **YAML としては読まない** —— 依存を足さずに済み、見たいのが「`paths:` の下の `- '…'`」
 * だけだから。イディオムは env-contract.test.ts の `blockUnder` と同じ
 * （**より深いインデントが続くあいだを 1 ブロックとして読む**）。
 * **クォート付きの項目だけを拾う**ので、`- uses:` や `- name:` を取り違えない。
 */
function pathsOf(rel: string): string[] {
    const lines = read(rel).split("\n");
    const found: string[] = [];
    lines.forEach((line, index) => {
        if (!/^\s*paths:\s*$/.test(line)) return;
        const outer = line.match(/^\s*/)![0].length;
        for (const next of lines.slice(index + 1)) {
            if (next.trim() === "") continue;
            if (next.match(/^\s*/)![0].length <= outer) break;
            const hit = next.trim().match(/^-\s*'([^']+)'\s*$/);
            if (hit) found.push(hit[1]!);
        }
    });
    return found;
}

/** `.github/workflows/` の全ワークフロー（**列挙を写さない** —— 増えた日に自動で入る）。 */
function workflows(): string[] {
    return readdirSync(join(REPO_ROOT, WORKFLOW_DIR))
        .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
        .map((name) => `${WORKFLOW_DIR}/${name}`);
}

describe("root の設定が指す先が実在すること（issue #315）", () => {
    /*
     * ★ **空振りを緑にしない。** 書式が変わって 1 件も読めなくなったとき、
     *   「ずれが無い」ではなく「**読めなかった**」と言わせる ——
     *   **読み取りが壊れたまま緑になる検査は、無いのと同じ**（toolchain.test.ts と同じ規律）。
     */
    test(".gitattributes のパターンが、実在するパスを指している", () => {
        const patterns = gitattributesPatterns();
        expect(
            patterns.length,
            ".gitattributes からパターンが 1 つも読めなかった（書式が変わった？）",
        ).toBeGreaterThan(0);

        expect(
            stale(patterns, (pattern) => pattern),
            [
                ".gitattributes のパターンが、実在しないパスを指している。",
                "**指し先が動いたのに、こちらを直していない** —— パターンは黙って",
                "何にも当たらなくなるので、改行の固定が外れても赤くならない。",
                "段階2-6 で db/ と locale/ が frontend/ へ移ったときに実際に起きた（#315）。",
            ].join("\n"),
        ).toEqual([]);
    });

    test("CI の paths が、実在するパスを指している", () => {
        const listed = workflows().flatMap((workflow) =>
            pathsOf(workflow).map((pattern) => `${workflow}: ${pattern}`),
        );
        expect(
            listed.length,
            `${WORKFLOW_DIR} から paths が 1 つも読めなかった（書式が変わった？）`,
        ).toBeGreaterThan(0);

        expect(
            stale(listed, (entry) => entry.slice(entry.indexOf(": ") + 2)),
            [
                "CI の paths が、実在しないパスを指している。",
                "**消したファイルを paths に残しても、ジョブは静かに動き続ける** ——",
                "行が死んだことは誰にも見えない。#112 で消した compose.e2e.linux.yaml が",
                "ci-image.yml に 19 日残っていた（#315）。",
            ].join("\n"),
        ).toEqual([]);
    });
});
