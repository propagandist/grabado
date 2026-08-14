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

    /*
     * The key below needs to be set individually by you if you want to use the Dropbox load/save feature.
     * To do that, first sign up with Dropbox (may require a specific developer / SDK sign-up), go to
     * https://www.dropbox.com/developers/apps and use "Create app" to add a new "Dropbox API app".
     * Limit the app to its own folder. Call it, for instance, "wwwsqldesigner".
     * Under "OAuth 2", "Redirect URIs", add the URL to the "dropbox-oauth-receiver.html" file on your server.
     * E.g, if you install wwwsqldesigner on your local web server under "http://localhost/sqldesigner/", then add
     * http://localhost/sqldesigner/dropbox-oauth-receiver.html as a Redirection URI.
     * Copy the shown "App key" and paste it here below instead of the null value:
     */
    /* grabado: 各自が文字列を入れる前提の設定値なので、既定値の null からは
       型が決まらない。js/io.js:378 が truthy 判定で読む（HANDOVER §3 段階3-1）。 */
    DROPBOX_KEY: null as string | null, // such as: "d6stdscwewhl6sa"
};

/*
 * grabado: window.CONFIG と declare global を撤去した（HANDOVER §3 段階3-4c）。
 * 参照側はすべて import になっており、window 越しに読む者は段階3-3b の時点で 0 件だった。
 */
