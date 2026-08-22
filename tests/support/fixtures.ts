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

/** そのプロファイルの fixture が置かれたディレクトリ（段階6-6a で DB 別になった） */
export function fixtureDir(db: string): string {
    return join(FIXTURE_DIR, db);
}

/**
 * fixture を読む。
 *
 * **db を省略できないのは意図的**（段階6-6a）。既定値を持たせると「どのプロファイル向けの
 * 入力を、どのパレットで読んでいるか」が呼び出し側から消える。**その 2 つがずれていること
 * 自体が主張になっているテストがある** —— known-issues #4 / #10 と
 * golden/state/mysql-house-defaults.json は「postgresql の fixture を mysql / oracle の
 * パレットで読む」ことを見ているので、db を書かせる形でないと 6-6b で黙って壊れる。
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
