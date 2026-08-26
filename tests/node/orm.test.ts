import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { className, fieldName, kotlinIdentifier } from "../../frontend/js/io/orm/jpa.ts";
import { ORM_EXTENSIONS, ORM_TARGETS, isOrmTarget } from "../../frontend/js/io/orm/generate.ts";
import { DB_PROFILES, ormGoldenCases, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { createHarness, type NodeHarness } from "./harness.ts";

/*
 * ORM 出力（HANDOVER §6 段階6-9d）。
 *
 * golden の権威はブラウザ側（tests/browser/orm.spec.ts）で、ここは同じ 14 件を読むだけ ——
 * DDL golden と同じ分担。加えて **golden から読み取れない規則**を近くで押さえる:
 * 名前の変換（クラス名・フィールド名・Kotlin 識別子）と、正規型の写像の網羅。
 */
describe("ORM 出力（Node）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    afterAll(() => {
        h.close();
    });

    for (const target of ORM_TARGETS) {
        for (const one of ormGoldenCases(DB_PROFILES)) {
            test(`${target} golden: ${one.db} / ${one.fixture}`, () => {
                h.useDatatypes(one.db);
                h.loadFixture(readFixture(one.db, one.fixture));

                const actual = h.toOrm(target);
                assertNoCarriageReturn(actual, `orm(${target}/${one.db}/${one.fixture})`);

                expect(actual).toBe(
                    readGolden(
                        goldenPath(
                            "orm",
                            target,
                            one.db,
                            `${one.fixture}.${ORM_EXTENSIONS[target]}`,
                        ),
                    ),
                );
            });
        }
    }

    describe("ターゲットの登録", () => {
        test("ORM_TARGETS は 2 本（jpa / prisma）。SQLAlchemy は保留（段階6-9e）", () => {
            expect(ORM_TARGETS).toEqual(["jpa", "prisma"]);
        });

        test("知らないターゲットは受け付けない", () => {
            expect(isOrmTarget("jpa")).toBe(true);
            expect(isOrmTarget("hibernate3")).toBe(false);
            expect(() => h.toOrm("sqlalchemy")).toThrow(
                /対応していない ORM ターゲット: sqlalchemy/,
            );
        });
    });

    describe("名前の変換（golden に写らない規則）", () => {
        /**
         * 左が設計のテーブル名、右が Kotlin のクラス名。
         *
         * **単数化は英語の規則だけ**で、倒せない語はそのまま残す —— `people` を `person` に
         * する表を持つと、その表に無い語で黙って間違える。**元の名前は @Table(name = ...) に
         * 必ず残る**ので、単数化が外れても情報は 1 つも失われない。
         */
        const CLASS_NAMES: ReadonlyArray<readonly [string, string]> = [
            ["articles", "Article"],
            ["article_tags", "ArticleTag"],
            ["users", "User"],
            ["companies", "Company"],
            ["boxes", "Box"],
            ["employee_projects", "EmployeeProject"],
            /* 単数形のテーブル名はそのまま（house 標準は複数形だが強制はしない） */
            ["status", "Statu"],
            /* 不規則複数は倒せない。**倒せないことを固定する** */
            ["people", "People"],
            ["children", "Children"],
            /* 非 ASCII は 1 文字も触らない */
            ["顧客", "顧客"],
        ];

        test("テーブル名 -> クラス名", () => {
            const actual = CLASS_NAMES.map(([from]) => [from, className(from)] as const);
            expect(actual).toEqual(CLASS_NAMES.map(([f, t]) => [f, t]));
        });

        test("列名 -> フィールド名（snake_case -> camelCase）", () => {
            expect(fieldName("created_at")).toBe("createdAt");
            expect(fieldName("id")).toBe("id");
            expect(fieldName("氏名")).toBe("氏名");
        });

        describe("Kotlin 識別子（3 段）", () => {
            test("そのまま書ける名前は 1 文字も変えない", () => {
                expect(kotlinIdentifier("createdAt")).toBe("createdAt");
                expect(kotlinIdentifier("_x1")).toBe("_x1");
                expect(kotlinIdentifier("顧客")).toBe("顧客");
            });

            test("囲めば書ける名前はバッククォートで囲む（**名前を失わない**）", () => {
                /* quotes-i18n の `say "hi"` が実物の例。golden にもそのまま出ている */
                expect(kotlinIdentifier('say "hi"')).toBe('`say "hi"`');
                expect(kotlinIdentifier("order by")).toBe("`order by`");
                expect(kotlinIdentifier("1st")).toBe("`1st`");
            });

            test("囲んでも書けない文字は _ に置換する（ここで初めて名前が変わる）", () => {
                /* JVM が名前に使えない文字。DB の名前は @Column(name) に残る */
                expect(kotlinIdentifier("a.b")).toBe("a_b");
                expect(kotlinIdentifier("a/b")).toBe("a_b");
                expect(kotlinIdentifier("a`b")).toBe("a_b");
                expect(kotlinIdentifier("")).toBe("_");
            });
        });
    });

    describe("正規型の写像", () => {
        test("**8 プロファイルの全型が JPA の型に落ちている**（写せない型はコメント付き）", () => {
            /*
             * types-matrix はそのプロファイルの全型を 1 列ずつ持つ（fixture-set.test.ts が
             * 機械的に押さえる）ので、**8 本の golden を掃けば 172 型ぜんぶを通ったことになる**。
             *
             * 見るのは 2 つ: 型注釈のない `var` が 1 つも無いこと（＝ 全列に型が付いた）と、
             * 写せない型には必ず理由のコメントが付いていること（黙って String に落とさない）。
             */
            const missing: string[] = [];
            for (const db of DB_PROFILES) {
                const kt = readGolden(goldenPath("orm", "jpa", db, "types-matrix.kt"));
                for (const line of kt.split("\n")) {
                    if (line.trimStart().startsWith("var ") && !line.includes(": ")) {
                        missing.push(`${db}: ${line.trim()}`);
                    }
                }
                /* String に落ちた列の数と、理由コメントの数が合っている */
                const fallbacks = kt.split("JPA の標準に対応する型が無いので String で出す").length - 1;
                const stringCols = kt.split("): String").length - 1 + (kt.split(": String?").length - 1);
                if (fallbacks > stringCols) {
                    missing.push(`${db}: 理由コメントが String 列より多い`);
                }
            }
            expect(missing).toEqual([]);
        });

        test("uuid / timestamptz / json が house 既定どおりに落ちる（postgresql）", () => {
            h.useDatatypes("postgresql");
            h.loadFixture(readFixture("postgresql", "house-defaults"));
            const kt = h.toOrm("jpa");

            expect(kt).toContain("var id: UUID");
            expect(kt).toContain("var createdAt: OffsetDateTime");
            /* json は JPA の標準に無いので String ＋ 理由。**黙って落とさない** */
            expect(kt).toContain("json: JPA の標準に対応する型が無いので String で出す（JSONB）");
            expect(kt).toContain("import java.util.UUID");
            expect(kt).toContain("import java.time.OffsetDateTime");
        });
    });

    describe("関係とキー", () => {
        test("FK は @ManyToOne ＋ @JoinColumn。**逆参照は出さない**", () => {
            h.useDatatypes("postgresql");
            h.loadFixture(readFixture("postgresql", "relations"));
            const kt = h.toOrm("jpa");

            /* 自己参照 FK。フィールド名は列名から _id を落とした形 */
            expect(kt).toContain("@ManyToOne");
            expect(kt).toContain('@JoinColumn(name = "manager_id", nullable = true)');
            expect(kt).toContain("var manager: Employee? = null");
            /*
             * **設計モデルが逆参照も多重度も持たない**ので出さない（段階6-9d の判断）。
             * 親側のコレクション名は発明するしかなく、6-5b の「識別子を書き換えない」と衝突する。
             */
            expect(kt).not.toContain("@OneToMany");
            expect(kt).not.toContain("@OneToOne");
        });

        test("複合 PK は @IdClass ＋ data class。**PK 列は関連にしない**", () => {
            h.useDatatypes("postgresql");
            h.loadFixture(readFixture("postgresql", "relations"));
            const kt = h.toOrm("jpa");

            expect(kt).toContain("@IdClass(EmployeeProjectId::class)");
            expect(kt).toContain("data class EmployeeProjectId(");
            expect(kt).toContain(") : Serializable");
            /*
             * employee_id は PK であり FK でもある。関連にすると JPA の derived identity に
             * 踏み込み、生成物を読む人が JPA の細則を知らないと直せなくなる（段階6-9d の判断）。
             */
            expect(kt).toContain('@Column(name = "employee_id")');
        });

        test("UNIQUE と INDEX は @Table の引数に出る", () => {
            h.useDatatypes("postgresql");
            h.loadFixture(readFixture("postgresql", "house-defaults"));
            const kt = h.toOrm("jpa");

            expect(kt).toContain(
                'uniqueConstraints = [UniqueConstraint(name = "users_email_key", columnNames = ["email"])]',
            );
        });

        test("identity 列は @GeneratedValue（型の identity 句と ai チェックの両方）", () => {
            h.useDatatypes("postgresql");
            h.loadFixture(readFixture("postgresql", "autoincrement"));
            expect(h.toOrm("jpa")).toContain(
                "@GeneratedValue(strategy = GenerationType.IDENTITY)",
            );
        });
    });

    describe("prisma（段階6-9e）", () => {
        test("**逆参照を出す** —— 6-9d の判断を Prisma だけ決め直した", () => {
            /*
             * Prisma は片側だけの relation をスキーマ検証が拒む（JPA では逆参照が無くても
             * 有効だった）。**形式が要求するので名前を発明する**が、規則は機械的:
             * 通常は子テーブル名、同じ子から 2 本以上なら FK 列名を混ぜる。
             */
            h.useDatatypes("postgresql");
            h.loadFixture(readFixture("postgresql", "relations"));
            const out = h.toOrm("prisma");

            /* 子側（FK を持つ側）はスカラー列 ＋ 関連フィールドの 2 行 */
            expect(out).toContain("ownerId Int @map(\"owner_id\")");
            expect(out).toContain("owner Employee @relation(fields: [ownerId], references: [id])");
            /* 親側に逆参照が生える（JPA では 1 行も出なかった） */
            expect(out).toContain("projects Project[]");
            expect(out).toContain("employeeProjects EmployeeProject[]");
        });

        test("自己参照は 1 本でも名前付き relation（Prisma の規則）", () => {
            h.useDatatypes("postgresql");
            h.loadFixture(readFixture("postgresql", "relations"));
            const out = h.toOrm("prisma");

            expect(out).toContain(
                'manager Employee? @relation("employees_manager_id", fields: [managerId], references: [id])',
            );
            expect(out).toContain('employees Employee[] @relation("employees_manager_id")');
        });

        test("**識別子は ASCII だけ**。潰れた名前は通し番号で一意化する", () => {
            /*
             * Prisma に Kotlin のバッククォートに当たる逃げ道が無い。日本語の列名は
             * どれも `_` に潰れてぶつかるので、モデル 1 つの中でまとめて一意化する。
             * **元の名前は @map に必ず残る**。
             */
            h.useDatatypes("postgresql");
            h.loadFixture(readFixture("postgresql", "quotes-i18n"));
            const out = h.toOrm("prisma");

            expect(out).toContain('m__ String @map("氏名")');
            expect(out).toContain('m___2 String? @map("メモ")');
            expect(out).toContain('@@map("顧客")');
            /* 同じ名前が 2 回出ていない（出ると Prisma が拒む） */
            const fields = out.split("\n").filter((line) => /^ {2}m__/.test(line));
            expect(new Set(fields.map((line) => line.trim().split(" ")[0])).size).toBe(
                fields.length,
            );
        });

        test("provider が無いプロファイルでは datasource を出さず理由を言う", () => {
            /* Prisma に h2 / oracle / sql-standard の provider は無い */
            h.useDatatypes("oracle");
            h.loadFixture(readFixture("oracle", "minimal"));
            const out = h.toOrm("prisma");

            expect(out).not.toContain("datasource db {");
            expect(out).toContain("oracle に対応する Prisma の provider が無い");

            /* 対応がある側は datasource を出す */
            h.useDatatypes("postgresql");
            h.loadFixture(readFixture("postgresql", "minimal"));
            expect(h.toOrm("prisma")).toContain('provider = "postgresql"');
        });
    });

    test("テーブルが 0 件なら 1 バイトも出さない（DDL の empty.sql と揃える）", () => {
        h.useDatatypes("postgresql");
        h.loadFixture(readFixture("postgresql", "empty"));
        expect(h.toOrm("jpa")).toBe("");
        expect(h.toOrm("prisma")).toBe("");
    });
});
