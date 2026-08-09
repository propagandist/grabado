import { defineConfig } from "vitest/config";

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
