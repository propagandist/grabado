// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。

import { blob, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const typeSamples = sqliteTable("type_samples", {
    cInteger: blob("c_integer", { mode: "bigint" }).primaryKey(),
    cReal: real("c_real"),
    cText: text("c_text"),
    cBlob: blob("c_blob"),
    // other: sqlite-core に対応が無いので text で出す（ANY）
    cAny: text("c_any"),
});