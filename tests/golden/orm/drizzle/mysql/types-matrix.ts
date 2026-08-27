// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite / mssql で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。

import { bigint, blob, boolean, date, datetime, decimal, double, float, int, json, mysqlTable, smallint, text, time, timestamp, tinyint } from "drizzle-orm/mysql-core";

export const typeSamples = mysqlTable("type_samples", {
    cInteger: int("c_integer"),
    cSmallint: smallint("c_smallint"),
    cTinyint: tinyint("c_tinyint"),
    cMediumint: int("c_mediumint"),
    cBigint: bigint("c_bigint", { mode: "bigint" }),
    cBigintIdentity: bigint("c_bigint_identity", { mode: "bigint" }).primaryKey().autoincrement(),
    cDecimal: decimal("c_decimal"),
    cFloat: float("c_float"),
    cDouble: double("c_double"),
    cChar: text("c_char"),
    cVarchar: text("c_varchar"),
    cText: text("c_text"),
    cBytea: blob("c_bytea"),
    cBinary: blob("c_binary"),
    cVarbinary: blob("c_varbinary"),
    cBoolean: boolean("c_boolean"),
    cDate: date("c_date"),
    cTime: time("c_time"),
    cDatetime: datetime("c_datetime"),
    cTimestamp: timestamp("c_timestamp"),
    // other: mysql-core に対応が無いので text で出す（YEAR）
    cYear: text("c_year"),
    cJson: json("c_json"),
    // other: mysql-core に対応が無いので text で出す（ENUM('draft','published')）
    cEnum: text("c_enum"),
    // other: mysql-core に対応が無いので text で出す（SET('a','b')）
    cSet: text("c_set"),
    // other: mysql-core に対応が無いので text で出す（BIT(8)）
    cBit: text("c_bit"),
});