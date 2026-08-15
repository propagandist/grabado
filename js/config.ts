/*
 * grabado: HANDOVER §3 段階3-1 で .ts 化した。
 *
 * export ＋ window 登録の 2 本立て（イディオムは js/oz.ts の冒頭を参照）。
 * まだ .js の 15 本が裸の CONFIG を読むので、window 登録は段階3-4 まで残す。
 */
export const CONFIG = {
    AVAILABLE_DBS: [
        "mysql",
        "sqlite",
        "web2py",
        "mssql",
        "postgresql",
        "oracle",
        "sqlalchemy",
        "vfp9",
        "cubrid",
        "web2py",
    ],
    DEFAULT_DB: "mysql",

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

    AVAILABLE_BACKENDS: [
        "php-mysql",
        "php-s3",
        "php-blank",
        "php-file",
        "php-sqlite",
        "php-mysql+file",
        "php-postgresql",
        "php-pdo",
        "perl-file",
        "php-cubrid",
        "asp-file",
        "web2py",
    ],
    DEFAULT_BACKEND: ["php-mysql"],

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
