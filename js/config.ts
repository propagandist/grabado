/*
 * grabado: HANDOVER §3 段階3-1 で .ts 化した。
 *
 * export ＋ window 登録の 2 本立て（イディオムは js/oz.ts の冒頭を参照）。
 * まだ .js の 15 本が裸の CONFIG を読むので、window 登録は段階3-4 まで残す。
 */
export const CONFIG = {
    /*
     * grabado: 段階6-1 で cubrid / vfp9 / web2py / sqlalchemy を落とした
     * （web2py は 2 回入っていたので重複も同時に消えた）。
     * 対応 DB は 8 本で、新設 3 本（sql-standard / mariadb / h2）は 6-7 で入る。
     *
     * **段階6-5a で house 標準を先頭に出し、既定を postgresql にした。**
     * 6-1 がこの 2 つを 6-3 へ送っていた（「いま振ると初回ユーザーが最初に触るパレットが
     * uuid 不在・x_real が BIGINT の未現代化 PG になる」）が、6-3 のエントリに実施記録が
     * 無く落ちていた。**テストは DEFAULT_DB を読まない**（両ハーネスとも useDatatypes() で
     * 明示指定する）ので、6-1 が言うとおり「テストが止めてくれない変更」だった。
     * 送り先の条件——PG の現代化——は 6-3 で満たされている。
     * 並びは postgresql を先頭へ動かすだけで、残る 4 本の相対順は upstream のまま。
     */
    AVAILABLE_DBS: [
        "postgresql",
        "mysql",
        "sqlite",
        "mssql",
        "oracle",
        "sql-standard",
        "h2",
        "mariadb",
    ],
    DEFAULT_DB: "postgresql",

    AVAILABLE_LOCALES: [
        "ar",
        "cs",
        "de",
        "el",
        "en",
        "eo",
        "es",
        "fr",
        "hu",
        "it",
        "ja",
        "ko",
        "nl",
        "pl",
        "pt_BR",
        "ro",
        "ru",
        "sv",
        "tr",
        "uk",
        "zh",
    ],
    DEFAULT_LOCALE: "en",

    /*
     * grabado: AVAILABLE_BACKENDS / DEFAULT_BACKEND は段階5-5 で撤去した。
     *
     * upstream は backend 実装を 12 本並べて画面から選ばせていたが、grabado の backend は
     * Kotlin/Spring Boot **1 本**（CLAUDE.md 制約6）で、その実体は段階5-2 で PHP ごと消えている。
     * 選択肢が実質 1 つの select は情報量ゼロで、公開 OSS では「何を選ぶのか」という誤解を
     * 生むだけだった。URL は `backend/file/` に固定（`js/io.ts` の BACKEND_PATH）。
     *
     * `DEFAULT_BACKEND` が文字列ではなく配列 `["php-mysql"]` だった upstream の取り違えは、
     * **是正ではなく消滅で決着した**（段階3-3b が「§5 の backend 移植で決める」と送っていた項目）。
     *
     * 将来 store を増やすとしても env（サーバ側）で決める —— **どの store が生きているかは
     * サーバしか知らない**ので、ブラウザに選ばせるのは筋が悪い。
     */

    RELATION_THICKNESS: 2,
    RELATION_SPACING: 15,
    RELATION_COLORS: ["#000", "#800", "#080", "#008", "#088", "#808", "#088"],

    RELATION_HIGHLIGHTED_COLOR: "#FF0000",
    RELATION_HIGHLIGHTED_THICKNESS: 5,

    STYLES: ["material-inspired", "original"],
    MATERIAL_RELATION_COLORS: [
        "#323232",
        "#F44336",
        "#E91E63",
        "#9C27B0",
        "#3F51B5",
        "#673AB7",
        "#2196F3",
        "#03A9F4",
        "#00BCD4",
        "#009688",
        "#4CAF50",
        "#8BC34A",
        "#CDDC39",
        "#FFC107",
        "#FF5722",
        "#795548",
        "#607D8B",
    ],

    STATIC_PATH: "",
    XHR_PATH: "",
    /* grabado: DROPBOX_KEY は段階4-3a で Dropbox 連携ごと撤去した（js/io.ts の冒頭） */
};

/*
 * grabado: window.CONFIG と declare global を撤去した（HANDOVER §3 段階3-4c）。
 * 参照側はすべて import になっており、window 越しに読む者は段階3-3b の時点で 0 件だった。
 */
