import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Xslt, XmlParser } from "xslt-processor";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DB_PROFILES, DDL_FIXTURES, REPO_ROOT, readFixture } from "../support/fixtures.ts";
import { goldenPath, readGolden } from "../support/golden.ts";
import { assertNoCarriageReturn } from "../support/normalize.ts";
import { createHarness, type NodeHarness } from "./harness.ts";
import { PARITY_EXCEPTIONS, PARITY_EXCLUDED_DBS } from "./parity-exceptions.ts";

/**
 * Node には XSLTProcessor が無いので xslt-processor（純 JS の XSLT 1.0 実装）で代替し、
 * 実ブラウザが採った golden と突き合わせる。
 *
 * 入力は fixture そのものではなく toXML() の出力。js/io.js:538-562 の finish() が
 * this.owner.toXML() を XSLT に渡すのと同じにするため。
 */
/**
 * XML 1.0 の line-end normalization（CRLF / 単独 CR -> LF）。
 * ブラウザの DOMParser はこれを行うが xslt-processor 5.1.0 の XmlParser は行わない。
 * 補わないと、CRLF を含む XSL / 入力 XML から CR が生成 SQL に漏れる。
 * golden を歪めるのではなく「準拠した XML パーサの振る舞いを補う」ための前処理。
 *
 * **段階6-1 時点では実際に踏むプロファイルが無い**（唯一 CRLF だった db/vfp9/output.xsl が
 * 消え、入力 XML は buildDdlInputXml() が LF 固定で組む）。それでも残すのは、これが
 * 特定プロファイルの都合ではなくエンジンの非準拠を埋める adapter だから。
 * 関数ごと消えるのは 6-5（XSLT 経路そのものが無くなる段階）。
 */
function normalizeXmlLineEnds(source: string): string {
    return source.replace(/\r\n?/g, "\n");
}

/**
 * xslt-processor 5.1.0 は <xsl:output method="text"/> でも結果ツリーを XML として直列化し、
 * & < > をエンティティにエスケープしてしまう（4-0b の実測。当時は db/vfp9 の "&tcCommand" と
 * db/sqlalchemy の "<things('%s')>" が踏んでいた）。ブラウザの XSLTProcessor は
 * text 出力なのでエスケープしない。
 *
 * これは「エスケープの逆変換」であって golden 側を歪める操作ではない。
 * &amp; を最後に戻すことで、本文に元々 "&lt;" という文字列があった場合
 * （エンジンは &amp;lt; と出す）も正しく "&lt;" に戻る。
 *
 * **段階6-1 で踏んでいた 2 プロファイルが消え、残る 35 本の golden に & < > は 1 文字も無い。**
 * それでも残すのは、根拠が消えたのではなく現れていないだけだから —— 識別子に & を書けるのは
 * 4-4 で直した挙動で（tests/known-issues/fixtures/amp-in-name.xml）、6-6 で DB 別 fixture に
 * その種の入力が入った瞬間、adapter が無いと Node 側だけがブラウザとずれる。
 * しかも「エンジンの非準拠」ではなく「移植の回帰」に見える形で。
 */
function undoXmlTextEscaping(text: string): string {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

async function transform(xml: string, xsl: string): Promise<string> {
    const xslt = new Xslt();
    const parser = new XmlParser();
    const out = await xslt.xsltProcess(
        parser.xmlParse(normalizeXmlLineEnds(xml)),
        parser.xmlParse(normalizeXmlLineEnds(xsl)),
    );
    return undoXmlTextEscaping(out).trim();
}

function readStylesheet(db: string): string {
    return readFileSync(join(REPO_ROOT, "db", db, "output.xsl"), "utf8");
}

describe("DDL golden（Node / xslt-processor）", () => {
    let h: NodeHarness;

    beforeAll(async () => {
        h = await createHarness();
    });

    afterAll(() => {
        h.close();
    });

    for (const db of DB_PROFILES) {
        const excluded = PARITY_EXCLUDED_DBS.has(db);

        describe(`${db}${excluded ? "（parity 例外・ブラウザ側専任）" : ""}`, () => {
            for (const fixture of DDL_FIXTURES) {
                test.skipIf(excluded)(`${db} / ${fixture.name}`, async () => {
                    h.useDatatypes(db);
                    h.loadFixture(readFixture(fixture.name));

                    const actual = await transform(h.toXML(), readStylesheet(db));
                    assertNoCarriageReturn(actual, `DDL(${db}/${fixture.name})`);

                    expect(actual).toBe(readGolden(goldenPath("ddl", db, `${fixture.name}.sql`)));
                });
            }
        });
    }

    // 例外が「静かに残り続ける／静かに消える」のが一番まずい。載っている以上は本当に
    // 食い違うことを確認し、エンジン側が対応したら（＝一致するようになったら）
    // このテストが落ちて棚卸しを促す。
    for (const exception of PARITY_EXCEPTIONS) {
        test(`parity 例外がまだ実在する: ${exception.db}（${exception.symptom}）`, async () => {
            h.useDatatypes(exception.db);
            h.loadFixture(readFixture(exception.probeFixture));

            const run = transform(h.toXML(), readStylesheet(exception.db));

            if (exception.kind === "throws") {
                await expect(run).rejects.toThrow();
                return;
            }

            const golden = readGolden(
                goldenPath("ddl", exception.db, `${exception.probeFixture}.sql`),
            );
            expect(await run).not.toBe(golden);
        });
    }
});
