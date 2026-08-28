// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。
//
// **oracle に対応する Drizzle の core は無い。** pg-core の形で出しているので、
// 使うときは対応する core へ読み替えること（型名が変わる）。

import { bigint, boolean, customType, doublePrecision, interval, jsonb, numeric, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

/** pg-core に bytea の型関数は無いので自分で定義する */
const bytea = customType<{ data: Uint8Array }>({
    dataType() {
        return "bytea";
    },
});

export const typeSamples = pgTable("type_samples", {
    cNumber: numeric("c_number").primaryKey(),
    cInteger: bigint("c_integer", { mode: "bigint" }),
    cDecimal: numeric("c_decimal"),
    cFloat: doublePrecision("c_float"),
    cBinaryFloat: real("c_binary_float"),
    cBinaryDouble: doublePrecision("c_binary_double"),
    cChar: text("c_char"),
    cVarchar2: text("c_varchar2"),
    cNchar: text("c_nchar"),
    cNvarchar2: text("c_nvarchar2"),
    cClob: text("c_clob"),
    cNclob: text("c_nclob"),
    cBoolean: boolean("c_boolean"),
    cDate: timestamp("c_date"),
    cTimestamp: timestamp("c_timestamp"),
    cTimestampTz: timestamp("c_timestamp_tz", { withTimezone: true }),
    cIntervalYm: interval("c_interval_ym"),
    cIntervalDs: interval("c_interval_ds"),
    cRaw: bytea("c_raw"),
    cBlob: bytea("c_blob"),
    cJson: jsonb("c_json"),
    // xml: pg-core に対応が無いので text で出す（XMLTYPE）
    cXml: text("c_xml"),
    // other: pg-core に対応が無いので text で出す（ROWID）
    cRowid: text("c_rowid"),
});