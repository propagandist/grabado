import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/*
 * イメージ E2E のコンテナ操作（HANDOVER §2 段階2-4）。
 *
 * ★ **compose で起こす。** 素の `docker run` ではなく compose を通すのは、段階2-3 の申し送り
 *   「**compose の起動を機械が見ていない**」をここで塞ぐため —— mount も env も healthcheck も
 *   配布物が持つものをそのまま使い、**利用者と同じ 1 行**で起こす。
 *
 * ★ **待ち合わせは `--wait`**（compose の healthcheck が healthy を返すまで待つ。2026-08-26 実測）。
 *   だから **Dockerfile に `HEALTHCHECK` を置いていない** —— 判定間隔と猶予の正本を
 *   compose.yaml の 1 か所に保つ（issue #93 の判断 3）。
 *
 * ★ **Playwright の `webServer` を使わない。** あれは終了時にプロセスを木ごと kill するので、
 *   Windows では**コンテナが残りうる**。docker のライフサイクルは docker のコマンドで閉じる。
 */

/** リポジトリルート（このファイルは tests/image/ にある） */
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * E2E がコンテナへ mount するホスト側ディレクトリ。**compose.e2e.yaml と 1 対 1。**
 * 正本ディレクトリ `schema/` には書かせない（issue #93 の判断 5）。
 */
export const IMAGE_SCHEMA_DIR = "tests/tmp-image-schema";

/**
 * 手元の `docker compose up` と**別のプロジェクトにする**。同じ名前にすると、人が起こした
 * コンテナを E2E が黙って置き換える。分けておけば、8080 が埋まっているときに
 * **ポート衝突として気づける失敗**になる。
 */
const PROJECT = "grabado-image-e2e";

/*
 * ★ **段階2-5 にあった Linux 専用の 3 枚目（compose.e2e.linux.yaml）は消えた**（issue #103）。
 *   コンテナ側が **mount 先の所有者へ降りる**ようになったので、**テストが条件を細工しなくて
 *   よくなった** —— いまここが起こすのは**利用者とまったく同じ 2 枚**である。
 */
function baseArgs(): string[] {
    return [
        "compose",
        // 手元の .env を変数展開に使わせない（tests/image/e2e.env の冒頭）
        "--env-file",
        "tests/image/e2e.env",
        "-f",
        "compose.yaml",
        "-f",
        "compose.e2e.yaml",
        "-p",
        PROJECT,
    ];
}

/**
 * **手元のシェルに残っている値で条件が変わらないようにする。**
 *
 * compose の `environment:` は「キーだけ」のリスト形式なので、**シェルに値があれば渡る**
 * （段階2-3 の決めたこと 1）。`GRABADO_READONLY` が残っていれば通常モードの一巡が
 * 丸ごと readonly になり、`ANTHROPIC_API_KEY` が残っていれば capabilities が変わる。
 */
function baseEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const name of [
        "GRABADO_READONLY",
        "GRABADO_SCHEMA_DIR",
        "ANTHROPIC_API_KEY",
        "GRABADO_AI_MODEL",
        "GRABADO_AI_EFFORT",
    ]) {
        delete env[name];
    }
    return env;
}

function run(args: string[], env: NodeJS.ProcessEnv = {}): void {
    execFileSync("docker", [...baseArgs(), ...args], {
        cwd: REPO_ROOT,
        env: { ...baseEnv(), ...env },
        stdio: "inherit",
    });
}

function capture(args: string[]): string {
    return execFileSync("docker", [...baseArgs(), ...args], {
        cwd: REPO_ROOT,
        env: baseEnv(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
    });
}

/**
 * 起こす（healthy まで待つ）。`env` はコンテナへ渡す値 —— **`GRABADO_READONLY` を渡す口**。
 *
 * 同じプロジェクトへ違う env で `up` すると、compose は設定の変化を見て**作り直す**。
 * READONLY の一巡はこれで入れ替える（issue #93 の判断 4）。
 */
export function up(env: NodeJS.ProcessEnv = {}, options: { build?: boolean } = {}): void {
    const args = options.build ? ["up", "-d", "--build", "--wait"] : ["up", "-d", "--wait"];
    try {
        run(args, env);
    } catch (error) {
        /*
         * ★ **落ちたらコンテナのログを出す。** `--wait` は「healthy にならなかった」としか
         *   言わないので、これが無いと**起動時の例外が 1 行も見えない** —— 段階2-5 で CI が
         *   `exited (1)` だけを残して赤くなり、原因を見るためだけに 1 往復した。
         *   **落ちたときにしか走らない**ので、緑のときの出力は 1 行も増えない。
         */
        try {
            run(["logs", "--no-color", "--tail", "100", "app"]);
        } catch {
            /* ログさえ取れないなら、元のエラーだけを投げる */
        }
        throw new Error(
            `docker compose up に失敗した。8080 を別のコンテナが掴んでいないか確認する` +
                `（docker ps --format '{{.Names}}\t{{.Ports}}'）。\n${String(error)}`,
        );
    }
}

/** 片付ける。**コンテナもネットワークも残さない**（volume は作っていない） */
export function down(): void {
    run(["down"]);
}

/** compose が見ている健康状態。**READONLY でも healthy であること**の観測点 */
export function health(): string {
    const raw = capture(["ps", "--format", "json"]).trim();
    if (raw === "") return "(コンテナが無い)";
    /* v2 以降は 1 行 1 JSON で返る（配列で返る版もあるので両方受ける） */
    const first = raw.startsWith("[")
        ? (JSON.parse(raw) as Array<{ Health?: string }>)[0]
        : (JSON.parse(raw.split("\n")[0]!) as { Health?: string });
    return first?.Health ?? "(Health が無い)";
}
