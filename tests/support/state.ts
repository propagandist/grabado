import type { Designer } from "../../frontend/js/wwwsqldesigner.ts";

/**
 * 読み込み後の「ライブツリー＋DOM」の状態スナップショット（HANDOVER §4 段階4-1b）。
 *
 * 書き出しの golden（ddl 35 ＋ json 7）は**結果**を押さえるが、fromXML は
 * 「XML を再生する UI 操作列」なので、XML に出ない状態（選択クラス・型パレット由来の色・
 * z-index・relation がどの**実体**に繋がったか・DOM の後始末）を 1 つも押さえていない。
 * 4-1b は読み込み方向を js/io/ へ移す段階なので、その安全網をここで足す。
 *
 * ## 自己完結関数であること
 *
 * captureDesignState は module スコープの束縛を一切参照しない（ヘルパーはすべて内側）。
 * page 側は関数を**ソース文字列として注入**するため（page.evaluate はバンドルの外で走り、
 * import を解決できない）:
 *
 *     await page.evaluate(`(${captureDesignState})(window.d)`)
 *
 * Node 側は jsdom の designer をそのまま渡す。採取ロジックの正本が 1 本に保たれ、
 * 2 実行系のずれがそのまま情報になる（docs/TESTING.md の構成と同じ）。
 *
 * ## 何を採らないか
 *
 * - **レイアウト由来の値すべて**（table.width/height、dom.mini の width/height/left/top、
 *   relation path の d 属性、designer.width/height）。jsdom は offsetWidth が常に 0 なので、
 *   除外して初めて 1 本の golden を実ブラウザと jsdom で共有できる。
 * - **relation の色**（Relation.color / path の stroke）。Relation._counter が
 *   ページ生涯で単調増加する static なので、同じ設計でもテストの実行順で変わる。
 */
export function captureDesignState(d: Designer): string {
    /* 要素の同定。svg 要素の className は SVGAnimatedString なので getAttribute で読む */
    function describeElement(el: Element): string {
        const tag = el.tagName.toLowerCase();
        const cls = el.getAttribute("class");
        return cls ? `${tag}.${cls}` : tag;
    }

    function describeChildren(parent: Element | undefined): string[] {
        if (!parent) {
            return [];
        }
        const out: string[] = [];
        for (let i = 0; i < parent.children.length; i++) {
            out.push(describeElement(parent.children[i]!));
        }
        return out;
    }

    const tables = d.tables.map((t) => ({
        title: t.getTitle(),
        x: t.x,
        y: t.y,
        zIndex: t.zIndex,
        comment: t.getComment(),
        selected: t.selected,
        dom: {
            containerClass: t.dom.container.className,
            /* left/top は redraw() が x/y（選択中は −1）から作る。レイアウト非依存 */
            styleLeft: t.dom.container.style.left,
            styleTop: t.dom.container.style.top,
            styleZIndex: t.dom.container.style.zIndex,
            titleHtml: t.dom.title.innerHTML,
            /* setComment() だけが書く。無コメント時に "" を代入していないことの確認を兼ねる */
            titleTooltip: t.dom.title.getAttribute("title"),
            miniClass: t.dom.mini.className,
        },
        rows: t.rows.map((r) => ({
            title: r.getTitle(),
            /* 型パレットの添字そのもの（sql 名に解決しない。js/io/model.ts の規約） */
            type: r.data.type,
            size: r.data.size,
            def: r.data.def,
            nll: r.data.nll,
            ai: r.data.ai,
            comment: r.data.comment,
            selected: r.selected,
            expanded: r.expanded,
            /* 所属 key を添字で持つ（Key.addRow / Row.addKey の双方向リンクの確認） */
            keys: r.keys.map((k) => t.keys.indexOf(k)),
            dom: {
                containerClass: r.dom.container.className,
                containerTooltip: r.dom.container.getAttribute("title"),
                /* getColor() = 型パレットの color。パレット差し替えのタイミング事故がここに出る */
                backgroundColor: r.dom.container.style.backgroundColor,
                borderColor: r.dom.container.style.borderColor,
                titleClass: r.dom.title.className,
                titleHtml: r.dom.title.innerHTML,
                typehint: r.dom.typehint.textContent,
                selectedDisplay: r.dom.selected.style.display,
            },
        })),
        keys: t.keys.map((k) => ({
            type: k.getType(),
            name: k.getName(),
            parts: k.rows.map((r) => r.getTitle()),
        })),
    }));

    /*
     * relation は名前ではなく**添字**で採る。同名テーブルが 2 つあると復元時に両端が
     * 先頭のテーブルへ解決される既知の不具合があり（js/io/model.ts の RelationRef 参照）、
     * 名前で採ると「名前は合っているが実体が違う」状態がそのまま素通りする。
     * 4-1b は読み込み方向の移設なので、ここがいちばん効く 1 項目。
     */
    const relations = d.relations.map((rel) => {
        const t1 = d.tables.indexOf(rel.row1.owner);
        const t2 = d.tables.indexOf(rel.row2.owner);
        return {
            parent: [t1, t1 == -1 ? -1 : d.tables[t1]!.rows.indexOf(rel.row1)],
            child: [t2, t2 == -1 ? -1 : d.tables[t2]!.rows.indexOf(rel.row2)],
        };
    });

    const snapshot = {
        tables: tables,
        relations: relations,
        /* clearTables() の後始末が効いているか（テーブル div の残骸・svg の位置） */
        area: describeChildren(d.dom.container),
        svg: describeChildren(d.vector ? d.dom.svg : undefined),
        minimap: describeChildren(d.map.dom.container),
    };

    /* 決定論・diff フレンドリー（HANDOVER §4）。2 スペース・末尾 LF */
    return `${JSON.stringify(snapshot, null, 2)}\n`;
}
