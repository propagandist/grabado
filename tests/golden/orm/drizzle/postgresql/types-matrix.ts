// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。

import { bigint, boolean, customType, date, doublePrecision, integer, interval, jsonb, numeric, pgTable, real, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

/** pg-core に bytea の型関数は無いので自分で定義する */
const bytea = customType<{ data: Uint8Array }>({
    dataType() {
        return "bytea";
    },
});

export const typeSamples = pgTable("type_samples", {
    cInteger: integer("c_integer"),
    cSmallint: smallint("c_smallint"),
    cBigint: bigint("c_bigint", { mode: "bigint" }),
    cDecimal: numeric("c_decimal"),
    cSerial: bigint("c_serial", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    cBigserial: bigint("c_bigserial", { mode: "bigint" }).generatedAlwaysAsIdentity().notNull(),
    cFloat: real("c_float"),
    cDouble: doublePrecision("c_double"),
    cChar: text("c_char"),
    cVarchar: text("c_varchar"),
    cText: text("c_text"),
    cBytea: bytea("c_bytea"),
    cBoolean: boolean("c_boolean"),
    cDate: date("c_date"),
    cTime: time("c_time"),
    cTimeTz: time("c_time_tz", { withTimezone: true }),
    cInterval: interval("c_interval"),
    cTimestamp: timestamp("c_timestamp", { withTimezone: true }),
    cTimestampTz: timestamp("c_timestamp_tz", { withTimezone: true }),
    cTimestampWoTz: timestamp("c_timestamp_wo_tz", { withTimezone: true }),
    cUuid: uuid("c_uuid"),
    // xml: pg-core に対応が無いので text で出す（XML）
    cXml: text("c_xml"),
    // other: pg-core に対応が無いので text で出す（BIT(8)）
    cBit: text("c_bit"),
    // other: pg-core に対応が無いので text で出す（VARBIT(8)）
    cVarbit: text("c_varbit"),
    // other: pg-core に対応が無いので text で出す（INET）
    cInet: text("c_inet"),
    // other: pg-core に対応が無いので text で出す（CIDR）
    cCidr: text("c_cidr"),
    // geometry: pg-core に対応が無いので text で出す（GEOMETRY）
    cGeometry: text("c_geometry"),
    cJson: jsonb("c_json"),
    cJsonb: jsonb("c_jsonb"),
});