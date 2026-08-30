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
    },
});
