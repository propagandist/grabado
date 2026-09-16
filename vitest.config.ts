import { defineConfig } from "vitest/config";
import { assertCanonicalCwd } from "./scripts/canonical-cwd.mjs";

// WORKAROUND(vitest): npm test を経由せず npx vitest / IDE 拡張から起動された場合に、
// cwd のドライブレターが小文字だと「テスト 0 件 + reading 'config' の TypeError」に
// なる。原因の分かるエラーで先に止める。scripts/vitest.mjs とセットで撤去すること。
assertCanonicalCwd();

// Node 側（高速回帰）。jsdom は tests/node/harness.ts が自前で構築するため
// environment は "node" のまま（vitest の jsdom 環境は使わない）。
// golden の生成はブラウザ側の責務なので、ここでは読むだけ。
export default defineConfig({
    test: {
        include: ["tests/node/**/*.test.ts"],
        environment: "node",
        globals: false,
        // jsdom へ 18 本のスクリプトを流し込むため、既定より余裕を持たせる
        testTimeout: 30_000,
        hookTimeout: 30_000,

        /*
         * 到達の計測（#320）。**既定では走らない** —— `--coverage` を付けたときだけ動く
         * （`npm run test:coverage`）。付けないときの `npm test` は 1 ミリ秒も変わらない。
         *
         * ★★ **閾値を置かない。** 置いた時点で「閾値を守る作業」が始まり、**到達は増やすが
         *   意図を検査しないテスト**が生える —— #302 の「**幾何の不変条件は、意図の検査に
         *   ならない**」が、カバレッジでは一段ひどく出る（**呼ぶだけで数字が上がる**）。
         *   org writing-baseline §8 の裏返しで、**守れていないのに緑に見える数字**を作ることになる。
         *
         * ★★ **これは弱い測定である。** 2 実行系のうち **Node 側（jsdom）だけ**を測るので、
         *   実ブラウザ側でしか動かない層（`rubberband.ts` のポインタのドラッグなど）は
         *   **当然の 0** を返す。**「Node 側で到達 0」は穴の候補**であって、穴そのものではない
         *   （#320 の判断。測定結果は CUSTOMIZATIONS.md の 2026-09-16）。
         */
        coverage: {
            provider: "v8",
            /* **到達 0 のファイルも一覧に出す**ために include を明示する（測る対象の宣言） */
            include: ["frontend/js/**/*.ts"],
            reporter: ["text"],
        },
    },
});
