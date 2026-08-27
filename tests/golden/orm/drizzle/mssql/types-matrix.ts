// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite / mssql で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。

import { bigint, bit, date, datetime2, datetimeoffset, decimal, float, int, mssqlTable, nvarchar, real, smallint, text, time, tinyint, varbinary } from "drizzle-orm/mssql-core";

export const typeSamples = mssqlTable("type_samples", {
    cInteger: int("c_integer").primaryKey(),
    cSmallint: smallint("c_smallint"),
    cTinyint: tinyint("c_tinyint"),
    cBigint: bigint("c_bigint", { mode: "bigint" }),
    cDecimal: decimal("c_decimal"),
    cFloat: float("c_float"),
    cReal: real("c_real"),
    cChar: nvarchar("c_char", { length: 4000 }),
    cVarchar: nvarchar("c_varchar", { length: 4000 }),
    cNchar: nvarchar("c_nchar", { length: 4000 }),
    cNvarchar: nvarchar("c_nvarchar", { length: 4000 }),
    cBoolean: bit("c_boolean"),
    cBinary: varbinary("c_binary"),
    cVarbinary: varbinary("c_varbinary"),
    cDate: date("c_date"),
    cTime: time("c_time"),
    cDatetime: datetime2("c_datetime"),
    cDatetime2: datetime2("c_datetime2"),
    cDatetimeoffset: datetimeoffset("c_datetimeoffset"),
    cSmalldatetime: datetime2("c_smalldatetime"),
    // uuid: mssql-core に対応が無いので text で出す（uniqueidentifier）
    cUuid: text("c_uuid"),
    // xml: mssql-core に対応が無いので text で出す（xml）
    cXml: text("c_xml"),
    // other: mssql-core に対応が無いので text で出す（sql_variant）
    cSqlVariant: text("c_sql_variant"),
    // other: mssql-core に対応が無いので text で出す（rowversion）
    cRowversion: text("c_rowversion"),
    // other: mssql-core に対応が無いので text で出す（hierarchyid）
    cHierarchyid: text("c_hierarchyid"),
    // geometry: mssql-core に対応が無いので text で出す（geometry）
    cGeometry: text("c_geometry"),
});