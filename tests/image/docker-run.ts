import { execFileSync } from "node:child_process";
import type { APIRequestContext } from "@playwright/test";
import { imageName, REPO_ROOT } from "./compose.ts";

/*
 * **公開デモと同じ起こし方**（issue #286）。**compose を通さない。**
 *
 * ★ **なぜ compose ではないのか。** 公開デモ（Railway）は `Dockerfile` から build した
 *   イメージを **env 2 本だけ・mount 無し**で起こす（docs/ARCHITECTURE.md §9.7）。compose 経由だと
 *   `environment:` のリストも healthcheck も mount も挟まるので、**#286 が「誰も 1 度も叩いて
 *   いなかった」と言っている形にならない** —— 実際、この形は #202 / #246 の実測表にも
 *   `tests/image/` にも 1 行も無く、**2026-09-12 に grabado.dev で初めて踏まれた**。
 *
 * ★ **副産物: README の「compose を使わない」経路を CI が初めて叩く。** ただし叩かれるのは
 *   **compose を経由しない起こし方**までで、**`-v` 付きの形は依然 `release-image.yml` の担当**。
 *
 * ★ **起こす側に `--rm` を付けない。** 付けると**起動に失敗した瞬間にコンテナが消えてログが
 *   取れない** —— #286 を再現したときに読みたいものがそれである（`release-image.yml` の
 *   `docker run -d --name smoke` と同じ形）。
 * ★ **`--pull never`。** イメージ名を取り違えたとき、docker が Docker Hub を引きに行って
 *   「pull access denied」という無関係なエラーになるのを、**「ローカルに無い」で即座に落とす**。
 */

/** 公開デモの形のコンテナ。compose の project と同じ前綴りにして、残骸を見分けられるようにする */
export const DEMO_CONTAINER = "grabado-image-e2e-demo";

/** #202 の fail-fast を見るコンテナ（`--rm` だが、CLI が殺されたときのために名前を付ける） */
const FAILFAST_CONTAINER = "grabado-image-e2e-failfast";

function docker(args: string[]): string {
    return execFileSync("docker", args, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
    });
}

/** 起きているか。**待ち合わせ中に落ちたことを即座に見つける口**（タイムアウトまで待たない） */
export function isRunning(name: string): boolean {
    try {
        return docker(["inspect", "-f", "{{.State.Running}}", name]).trim() === "true";
    } catch {
        return false; /* そもそも存在しない */
    }
}

export function logs(name: string): string {
    try {
        return docker(["logs", "--tail", "100", name]);
    } catch {
        return "(ログを取れなかった)";
    }
}

/**
 * 残骸を消す。**globalSetup の先頭と globalTeardown の両方から呼ぶ** ——
 * **compose の外で起こしたものは compose では片付かない**。前回の残骸が 8080 を掴んだままだと、
 * 次回は compose の `up` が謎のポート衝突で落ちる。
 *
 * ★ **stderr を飲む。** `docker rm -f` は**無いコンテナに対してもエラーを書く**（2026-09-12 実測:
 *   `Error response from daemon: No such container: ...`）—— **緑の run に毎回 3 行の赤い文字が
 *   出る**のは、**本物の失敗を見つけにくくする**（org `writing-baseline.md` §8 の
 *   「守れているのに赤が出る検査は、無視する習慣を作る」と同じ形）。
 */
export function removeContainers(): void {
    for (const name of [DEMO_CONTAINER, FAILFAST_CONTAINER]) {
        try {
            execFileSync("docker", ["rm", "-f", name], {
                cwd: REPO_ROOT,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            });
        } catch {
            /* 無ければよい */
        }
    }
}

/**
 * **§9.7 の形で起こす** —— env 2 本だけ、`-v` 無し。
 * 引数の並びは docs/ARCHITECTURE.md §9.7 の表と 1 対 1（**増やすときは表も直す**）。
 */
export function startDemo(): void {
    docker([
        "run",
        "-d",
        "--name",
        DEMO_CONTAINER,
        "--pull",
        "never",
        "-p",
        "8080:8080",
        "-e",
        "GRABADO_READONLY=true",
        "-e",
        "GRABADO_HSTS=true",
        imageName(),
    ]);
}

/**
 * 受け付けるまで待つ。**compose の healthcheck が使えないので自前で持つ。**
 *
 * ★ **落ちたら待たずに落とす。** 毎回 `State.Running` を見るので、#286 の回帰（起動せずに
 *   exit する）は**タイムアウトではなく、ログ付きの即死**として出る。
 */
export async function waitUntilReady(
    request: APIRequestContext,
    path = "/backend/file/?action=capabilities",
    timeoutMs = 120_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (!isRunning(DEMO_CONTAINER)) {
            throw new Error(`公開デモの形で起動しなかった（issue #286）。\n${logs(DEMO_CONTAINER)}`);
        }
        try {
            const response = await request.get(path, { timeout: 2_000 });
            if (response.ok()) {
                return;
            }
        } catch {
            /* まだ受け付けていない */
        }
        if (Date.now() > deadline) {
            throw new Error(
                `起動を ${timeoutMs}ms 待ったが応答しない。\n${logs(DEMO_CONTAINER)}`,
            );
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

/**
 * **mount 無しで起こして、終了コードを見る**（issue #202 の fail-fast が保たれていること）。
 *
 * ★ `-p` を付けない —— 公開デモの形のコンテナが 8080 を掴んだままでも同居できる。
 * ★ **stdout も読む。** Spring Boot の起動失敗は**ロガー経由＝ stdout** に出るので、
 *   stderr だけ見ると空振りする。
 */
export function runWithoutMount(env: Record<string, string>): { status: number; output: string } {
    const args = ["run", "--rm", "--name", FAILFAST_CONTAINER, "--pull", "never"];
    for (const [key, value] of Object.entries(env)) {
        args.push("-e", `${key}=${value}`);
    }
    args.push(imageName());

    try {
        const stdout = execFileSync("docker", args, {
            cwd: REPO_ROOT,
            encoding: "utf8",
            timeout: 90_000,
            stdio: ["ignore", "pipe", "pipe"],
        });
        return { status: 0, output: stdout };
    } catch (error) {
        const failure = error as { status?: number; stdout?: string; stderr?: string };
        return {
            status: failure.status ?? -1,
            output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
        };
    }
}
