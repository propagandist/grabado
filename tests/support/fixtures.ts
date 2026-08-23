import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** リポジトリルート（テストはすべてここを基準に解決する） */
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const FIXTURE_DIR = join(REPO_ROOT, "tests", "fixtures");
export const GOLDEN_DIR = join(REPO_ROOT, "tests", "golden");

/**
 * db/ 配下に実在する DB プロファイル。
 * テストは CONFIG.AVAILABLE_DBS ではなくディレクトリ実体を正とする —— リストは
 * 人が書き写すもので実体とずれうるため（4-2b 時点では "web2py" が重複していた。
 * その重複は段階6-1 の撤去で消えたが、実体を正とする判断は変えない）。
 */
export const DB_PROFILES: readonly string[] = Object.freeze(
    readdirSync(join(REPO_ROOT, "db"), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort(),
);

/** serializer の golden を採る際に使う DB プロファイル（house 到達点） */
export const SERIALIZER_DB = "postgresql";

/**
 * `tests/fixtures/` の下にある、**DB プロファイルではない**ディレクトリ（段階5-6）。
 *
 * `tests/fixtures/<db>/` は「DB × 名前」の設計 XML で、`fixture-set.test.ts` が
 * `db/` の実体と 1 対 1 であることを守っている（撤去した DB の残骸を捕まえるため）。
 * introspection の入力はその軸に乗らない別種の fixture なので、**ここに宣言して
 * 検査から外す** —— 除外を暗黙にすると「知らないディレクトリが増えても気づかない」
 * 状態になる。5-1c で契約表に `virtual: false` を宣言したのと同じ流儀。
 */
export const NON_PROFILE_FIXTURE_DIRS: readonly string[] = Object.freeze(["introspection"]);

export interface Fixture {
    /** ファイル名から拡張子を除いたもの。golden のキーになる */
    readonly name: string;
    /** このテストで何を押さえるのか */
    readonly purpose: string;
    /** DDL golden を全 DB で採る対象か */
    readonly ddl: boolean;
}

/**
 * 正常系 fixture。既知の不具合を踏むケースはここに入れず tests/known-issues/ に隔離する
 * （golden がバグを正当化して見えるのを避けるため）。
 *
 * **段階6-6a で fixture は DB 別になった**（tests/fixtures/<db>/<name>.xml）。この表は
 * 「どのプロファイルにも同じ名前で存在する 7 本」という母集団の定義で、中身は DB ごとに違う
 * （6-6a の時点では 4 本が postgresql 版の暫定コピーで、実型へ書き直すのは 6-6b）。
 * 全プロファイル分が実在することは tests/node/fixture-set.test.ts が機械的に押さえる。
 */
export const FIXTURES: readonly Fixture[] = Object.freeze([
    { name: "empty", purpose: "テーブル 0 件", ddl: true },
    { name: "minimal", purpose: "1 テーブル / 1 カラム", ddl: true },
    {
        name: "house-defaults",
        purpose: "house 既定をそのプロファイルで表せる範囲・複合 PK・UNIQUE key・日本語コメント",
        ddl: true,
    },
    { name: "relations", purpose: "自己参照 FK・多対多・1 テーブルに複数 FK", ddl: true },
    {
        name: "types-matrix",
        purpose: "そのプロファイルの型パレット網羅（サイズ付きを含む）",
        ddl: true,
    },
    { name: "autoincrement", purpose: "autoincrement=1", ddl: true },
    { name: "quotes-i18n", purpose: "コメント内のシングルクォート・日本語識別子", ddl: true },
]);

export const DDL_FIXTURES = FIXTURES.filter((f) => f.ddl);

/**
 * ORM 出力の golden の母集団（段階6-9d）。**DDL の 56 本と同じ形にはしない。**
 *
 * ORM 出力は「型の写像」と「構造の組み立て」に分かれ、**構造の側はプロファイルに依らない**
 * （生成器が見るのは正規型 kind と関係とキーだけで、SQL 型名も識別子の引用も通らない）。
 * だから 8 × 7 = 56 本は要らず、次の 2 つで足りる:
 *
 *   型の写像   8 プロファイル × types-matrix（**そのプロファイルの全型が 1 列ずつ**入っている）
 *   構造       postgresql × 残り 6 本（複合 PK・自己参照 FK・identity・日本語識別子）
 *
 * 合わせて 14 本。ORM が 4 本になっても 56 本で、DDL の 56 本と同じ桁に収まる。
 */
export function ormGoldenCases(dbProfiles: readonly string[]): ReadonlyArray<{
    readonly db: string;
    readonly fixture: string;
}> {
    const cases: Array<{ db: string; fixture: string }> = [];
    for (const db of dbProfiles) {
        cases.push({ db: db, fixture: "types-matrix" });
    }
    for (const f of DDL_FIXTURES) {
        if (f.name !== "types-matrix") {
            cases.push({ db: SERIALIZER_DB, fixture: f.name });
        }
    }
    return cases;
}

/**
 * プロファイル変換 DDL の golden の母集団（段階6-10a）。
 *
 * **postgresql の設計 × 他 7 プロファイル向けの出力 × 2 fixture = 14 本。**
 * 8 × 8 × 7 = 448 本にはしない —— 変換は「設計側の型 -> 正規型（kind）-> 出力側の型」の
 * 1 段で、**出発点を 1 つに固定すれば写像の全体は types-matrix で覆える**
 * （postgresql の全 24 型が 1 列ずつ入っている）。ORM golden が 8 × types-matrix ＋
 * postgresql × 残り 6 本で 14 本に収まっているのと同じ切り方。
 *
 * house-defaults を入れてあるのは「**house 既定が各 DB で何を失うか**」を見るため ——
 * 6-7 が「この表そのものが公開プロダクトの価値情報」と書いた中身が、生成物の先頭の
 * コメントとしてそのまま出る。
 */
export const CONVERT_SOURCE = "postgresql";

export const CONVERT_FIXTURES: readonly string[] = Object.freeze([
    "house-defaults",
    "types-matrix",
]);

export function convertGoldenCases(dbProfiles: readonly string[]): ReadonlyArray<{
    readonly to: string;
    readonly fixture: string;
}> {
    const cases: Array<{ to: string; fixture: string }> = [];
    for (const db of dbProfiles) {
        if (db === CONVERT_SOURCE) {
            continue;
        }
        for (const fixture of CONVERT_FIXTURES) {
            cases.push({ to: db, fixture: fixture });
        }
    }
    return cases;
}

/** そのプロファイルの fixture が置かれたディレクトリ（段階6-6a で DB 別になった） */
export function fixtureDir(db: string): string {
    return join(FIXTURE_DIR, db);
}

/**
 * fixture を読む。
 *
 * **db を省略できないのは意図的**（段階6-6a）。既定値を持たせると「どのプロファイル向けの
 * 入力を、どのパレットで読んでいるか」が呼び出し側から消える。**その 2 つがずれていること
 * 自体が主張になっているテストがある**ので、db を書かせる形でないと黙って壊れる。
 *
 * **証拠は段階6-8d で総入れ替えになった**（本コメントは 6-10a で書き直したもの）。6-6a の時点で
 * 挙げていた known-issues #4 / #10 は「未現代化のパレットで読むと先頭型に落ちる」という不具合の
 * 再現で、8 本すべてが strict になった 6-8d でテストごと消えている。同じ理由で寄せ先を失った
 * `golden/state/mysql-house-defaults.json` は mysql → oracle → sqlite → **h2** と 3 回動いた。
 * いま「ずれ」を主張にしているのは次の 4 種:
 *
 *   1. **強い側** —— PG の house-defaults を h2 パレットで読むと**潰れずに移る**
 *      （tests/browser/state.spec.ts / tests/node/state.test.ts → golden/state/h2-house-defaults.json）。
 *      house 既定の 8 型が全部 h2 の aka に載っている唯一の非 PG プロファイルなので成り立つ。
 *      **段階6-10 のプロファイル変換はここを一般化したもの**
 *   2. **拒む側** —— 設計 JSON の db が実行中のパレットと違えば例外
 *      （tests/node/json.test.ts / tests/browser/json.spec.ts、alert の文言は io-ui の 2 本）
 *   3. **差し替えに追随する側** —— setRoot 後の fk 解決と FK 自動生成が新パレットに従う
 *      （tests/node/type-resolution.test.ts / tests/browser/types.spec.ts）
 *   4. **known-issue #15** —— PG の quotes-i18n を oracle パレットで読んで DDL を採る
 */
export function readFixture(db: string, name: string): string {
    return readFileSync(join(fixtureDir(db), `${name}.xml`), "utf8");
}

/**
 * tests/known-issues/fixtures/ の fixture。
 *
 * こちらは DB 別にしない（段階6-6a）。既知の不具合はどれも「特定のパレットで読んだときに
 * 何が起きるか」が主張なので、入力を DB ごとに分けると再現条件そのものが消える。
 *
 * 不具合が直っても fixture は動かさない（§4 段階4-4 で #1 を直したときの判断）。
 * 正常系へ昇格させると FIXTURES の母集団が増えて DDL golden がプロファイル数ぶん増え、
 * 「DDL golden が無差分」という段階の完了判定がぼやける。
 */
export function readKnownIssueFixture(name: string): string {
    return readFileSync(
        join(REPO_ROOT, "tests", "known-issues", "fixtures", `${name}.xml`),
        "utf8",
    );
}
