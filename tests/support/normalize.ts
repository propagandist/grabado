/**
 * golden 比較の前提チェック。
 *
 * **§4 段階4-4 まではここに `<!-- Active URL: ... -->` の正規化があった。**
 * 現行 toXML() が location.href を埋め込んでいたため出力が環境依存で、golden には
 * 行を残したまま URL 部分だけを `{{ACTIVE_URL}}` に差し替えていた。4-4 でその行ごと
 * 撤去した（js/io/ddl-xml.ts）ので、**golden はもう 1 バイトも加工していない**。
 *
 * 「撤去した」ことは tests/browser/serialize.spec.ts の決定論テストと、
 * golden/ddl-input/ の diff が記録している。
 */

/**
 * golden はすべて LF。.gitattributes で db/** と locale/** も LF に固定しているが、
 * それでも CR が混じったら黙って正規化せず落とす（原因を隠さないため）。
 */
export function assertNoCarriageReturn(text: string, what: string): void {
    if (text.includes("\r")) {
        throw new Error(
            `${what} に CR (\\r) が含まれている。` +
                `db/** と locale/** は .gitattributes で LF 固定のはず。` +
                `core.autocrlf の設定と作業ツリーの改行コードを確認すること。`,
        );
    }
}
