// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。
//
// **h2 に対応する Drizzle の core は無い。** pg-core の形で出しているので、
// 使うときは対応する core へ読み替えること（型名が変わる）。

import { bigint, boolean, customType, date, doublePrecision, integer, jsonb, numeric, pgTable, real, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

/** pg-core に bytea の型関数は無いので自分で定義する */
const bytea = customType<{ data: Uint8Array }>({
    dataType() {
        return "bytea";
    },
});

export const typeSamples = pgTable("type_samples", {
    cInteger: integer("c_integer"),
    cSmallint: smallint("c_smallint"),
    cTinyint: smallint("c_tinyint"),
    cBigint: bigint("c_bigint", { mode: "bigint" }),
    cBigintIdentity: bigint("c_bigint_identity", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    cDecimal: numeric("c_decimal"),
    cFloat: real("c_float"),
    cDouble: doublePrecision("c_double"),
    cDecfloat: numeric("c_decfloat"),
    cChar: text("c_char"),
    cVarchar: text("c_varchar"),
    cText: text("c_text"),
    cBytea: bytea("c_bytea"),
    cVarbinary: bytea("c_varbinary"),
    cBoolean: boolean("c_boolean"),
    cDate: date("c_date"),
    cTime: time("c_time"),
    cTimeTz: time("c_time_tz", { withTimezone: true }),
    cTimestampTz: timestamp("c_timestamp_tz", { withTimezone: true }),
    cUuid: uuid("c_uuid"),
    cJson: jsonb("c_json"),
    // geometry: pg-core に対応が無いので text で出す（GEOMETRY）
    cGeometry: text("c_geometry"),
});