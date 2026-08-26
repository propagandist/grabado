import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { down, IMAGE_SCHEMA_DIR, REPO_ROOT, up } from "./compose.ts";

/*
 * イメージを build して起こす（段階2-4）。**通常モード** —— READONLY は
 * tests/image/readonly.setup.ts が同じ compose を起こし直して作る。
 */
export default function globalSetup(): void {
    /*
     * ★ **前回の残りを先に落とす。** 落とさずに mount 先を消すと、動いているコンテナが
     *   掴んだままのディレクトリを消すことになる（Windows では失敗する）。
     */
    down();

    /*
     * ★ **ディレクトリは先に作る。** 無いと compose が root 所有で作り、
     *   **非 root（uid=100）のコンテナが書けない**（2026-08-26 実測）。
     *   前回の残りを消すのは、テストが「空から始める」ことを前提にしているため。
     */
    const dir = join(REPO_ROOT, IMAGE_SCHEMA_DIR);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    up({}, { build: true });
}
