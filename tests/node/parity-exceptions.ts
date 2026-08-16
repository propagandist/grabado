/**
 * Node 側（xslt-processor 5.1.0）が実ブラウザ（Chromium の XSLTProcessor）と
 * 同じ結果を出せない DB プロファイル。すべて実測で原因を特定してある。
 *
 * ここに載る DB は Node 側の DDL 回帰から外れるので、その分の安全網は
 * `npm run test:browser` だけが張っている状態になる。原則ここは空であるべきで、
 * 増やすときは必ず原因を突き止めてから書く。
 *
 * golden 側は絶対に動かさない。golden は実ブラウザ採取のものが唯一の正で、
 * ここに載るのは「第 2 の実行系がそこまで追いつけていない」という Node 側の都合。
 *
 * なお、エンジンの以下 2 点は tests/node/ddl.test.ts の adapter で補正済み
 * （準拠した XML パーサ／text 出力の振る舞いを取り戻すだけの、可逆な前後処理）:
 *   - XML 1.0 の line-end normalization をしない
 *   - method="text" でも & < > を XML エスケープする
 */
export type ParityKind =
    /** xsltProcess() が例外を投げる */
    | "throws"
    /** 変換は通るが出力がブラウザと違う */
    | "differs";

export interface ParityException {
    readonly db: string;
    readonly kind: ParityKind;
    /** 例外がまだ実在することを確認するのに使う fixture */
    readonly probeFixture: string;
    /** 何が起きるか（実測） */
    readonly symptom: string;
    /** エンジンのどこが XSLT 1.0 に届いていないか */
    readonly cause: string;
}

export const PARITY_EXCEPTIONS: readonly ParityException[] = Object.freeze([
    {
        db: "oracle",
        kind: "throws",
        probeFixture: "minimal",
        symptom: "xsltProcess() が XPST0008: Unresolved variable reference: $crlf で失敗する",
        cause:
            "db/oracle/output.xsl:5-16 はトップレベルの xsl:variable（quote / apos / crlf / padding_* 等）を" +
            "定義してテンプレート内から参照する。xslt-processor はこのグローバル変数を解決できない。" +
            "XSLT 1.0 として正当な書き方なので、現行 XSL の不備ではなくエンジン側の未対応。",
    },
]);

export const PARITY_EXCLUDED_DBS: ReadonlySet<string> = new Set(
    PARITY_EXCEPTIONS.map((e) => e.db),
);
