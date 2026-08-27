// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite / mssql で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。

import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const counters = pgTable("counters", {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    label: text("label").notNull(),
    hits: integer("hits").notNull().default(sql`0`),
});