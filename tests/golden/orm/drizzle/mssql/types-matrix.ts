// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。
//
// **mssql に対応する Drizzle の core は無い。** pg-core の形で出しているので、
// 使うときは対応する core へ読み替えること（型名が変わる）。

import { bigint, boolean, customType, date, doublePrecision, integer, numeric, pgTable, real, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

/** pg-core に bytea の型関数は無いので自分で定義する */
const bytea = customType<{ data: Uint8Array }>({
    dataType() {
        return "bytea";
    },
});

export const typeSamples = pgTable("type_samples", {
    cInteger: integer("c_integer").primaryKey(),
    cSmallint: smallint("c_smallint"),
    cTinyint: smallint("c_tinyint"),
    cBigint: bigint("c_bigint", { mode: "bigint" }),
    cDecimal: numeric("c_decimal"),
    cFloat: doublePrecision("c_float"),
    cReal: real("c_real"),
    cChar: text("c_char"),
    cVarchar: text("c_varchar"),
    cNchar: text("c_nchar"),
    cNvarchar: text("c_nvarchar"),
    cBoolean: boolean("c_boolean"),
    cBinary: bytea("c_binary"),
    cVarbinary: bytea("c_varbinary"),
    cDate: date("c_date"),
    cTime: time("c_time"),
    cDatetime: timestamp("c_datetime"),
    cDatetime2: timestamp("c_datetime2"),
    cDatetimeoffset: timestamp("c_datetimeoffset", { withTimezone: true }),
    cSmalldatetime: timestamp("c_smalldatetime"),
    cUuid: uuid("c_uuid"),
    // xml: pg-core に対応が無いので text で出す（xml）
    cXml: text("c_xml"),
    // other: pg-core に対応が無いので text で出す（sql_variant）
    cSqlVariant: text("c_sql_variant"),
    // other: pg-core に対応が無いので text で出す（rowversion）
    cRowversion: text("c_rowversion"),
    // other: pg-core に対応が無いので text で出す（hierarchyid）
    cHierarchyid: text("c_hierarchyid"),
    // geometry: pg-core に対応が無いので text で出す（geometry）
    cGeometry: text("c_geometry"),
});