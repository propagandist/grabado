import { chmodSync, mkdirSync, rmSync } from "node:fs";
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

    /*
     * ★ **mount 先を誰でも書けるようにする**（段階2-5 の実測）。
     *
     *   コンテナは**非 root**（uid 100）で走り、`FileDesignStore` が起動時に
     *   `Files.isWritable` を確かめて**駄目なら起動しない**（段階5-3 の fail-fast）。
     *   **bind mount の所有権はホスト側のものがそのまま見える**ので、**Linux では
     *   ここで作ったディレクトリ（作った人の uid）にコンテナが書けない** ——
     *   CI の初回 run が `正本ディレクトリに書けない: /data/schema` で落ちた。
     *
     *   **Docker Desktop for Windows / Mac は所有権を偽装する**ので当たらない。
     *   2-1 から 2-4 まで手元で一度も踏まなかったのはそのため。Windows では
     *   この呼び出し自体がほぼ no-op になる。
     *
     * ★★ **これはテストを通すための細工で、利用者の条件とは違う。**
     *   利用者が Linux で `docker compose up` すると `schema/`（clone した人の uid）で
     *   **同じことが起きる** —— **配布物の側の問題**で、正本は
     *   https://github.com/propagandist/grabado/issues/103 が持つ。
     *   **ここで直したことにしない。** **この行がある限り、E2E はその欠陥を捕まえない。**
     *   #103 が配布物を直したら、**この行は消す**（消せることが #103 の受け入れ基準）。
     */
    chmodSync(dir, 0o777);

    up({}, { build: true });
}
