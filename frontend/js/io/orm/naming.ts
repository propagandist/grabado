/* ------------------------- orm: 名前の変換 -------------------- */
/*
 * grabado: ORM 出力で共通の名前の変換（HANDOVER §6 段階6-9e）。
 *
 * 6-9d（JPA）が jpa.ts の中に持っていたものを、**2 本目（SQLAlchemy）を書く段で括った** ——
 * 6-7b が `ansi.ts` を、6-8a が `mysql-style.ts` を括ったのと同じ時期の取り方で、
 * 「重複が実際にできてから括る」。
 *
 * ここが持つのは**言語に依らない部分**だけ:
 *
 *   entityName    テーブル名 -> クラス名（単数化 ＋ PascalCase）
 *   camelCase     列名 -> camelCase のフィールド名
 *
 * **言語ごとの識別子の規則は各生成器が持つ** —— Kotlin はバッククォート、Python は
 * 何が識別子になるかが違う。ここで 1 本に畳むと、どちらでもない中途半端な規則になる。
 *
 * **DB の名前は書き換えていない。** 元の名前は必ず出力に残る（JPA なら @Table(name)、
 * SQLAlchemy なら __tablename__）ので、変換が外れても情報は 1 つも失われない。
 */

/**
 * テーブル名 -> クラス名（`articles` -> `Article`）。
 *
 * **単数化は英語の規則だけ。** 倒せない語（`people` / `children`）はそのまま残す ——
 * 不規則複数の表を持つと、その表に無い語で黙って間違える。非 ASCII は 1 文字も触らない。
 */
export function entityName(table: string): string {
    const singular = singularize(table);
    const pascal = singular
        .split("_")
        .filter((part) => part !== "")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
    return pascal === "" ? singular : pascal;
}

function singularize(name: string): string {
    if (/[a-z]ies$/.test(name)) {
        return name.slice(0, -3) + "y";
    }
    if (/(s|x|z|ch|sh)es$/.test(name)) {
        return name.slice(0, -2);
    }
    if (/[a-rt-z]s$/.test(name)) {
        return name.slice(0, -1);
    }
    return name;
}

/** 列名 -> camelCase（`created_at` -> `createdAt`）。非 ASCII はそのまま */
export function camelCase(column: string): string {
    const parts = column.split("_").filter((part) => part !== "");
    if (parts.length === 0) {
        return column;
    }
    return (
        parts[0]! +
        parts
            .slice(1)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join("")
    );
}
