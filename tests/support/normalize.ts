/**
 * toXML() 出力の正規化。
 *
 * 現行 SQL.Designer.prototype.toXML()（js/wwwsqldesigner.js:325-347）は
 * `<!-- Active URL: ... -->` に location.href をそのまま埋め込むため、出力が環境依存になる。
 * HANDOVER §4 の決定論要件（同一モデル→同一バイト列）に真っ向から反する既知の欠陥で、
 * §4 の serializer 再実装で撤去される対象。
 *
 * golden にはこの行を「存在すること」だけ残し、URL 部分だけを差し替える。
 * 行ごと消すと「§4 で撤去した」ことが golden の diff に現れなくなるため、消さない。
 */
export const ACTIVE_URL_PLACEHOLDER = "{{ACTIVE_URL}}";

const ACTIVE_URL_RE = /^<!-- Active URL: .*-->$/m;

export function normalizeDesignXml(xml: string): string {
    return xml.replace(ACTIVE_URL_RE, `<!-- Active URL: ${ACTIVE_URL_PLACEHOLDER} -->`);
}

/** `<!-- Active URL: ... -->` 行が実在するか（非決定性が「まだそこにある」ことの確認用） */
export function hasActiveUrlComment(xml: string): boolean {
    return ACTIVE_URL_RE.test(xml);
}

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
