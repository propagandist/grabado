// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite / mssql で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。

import { integer, pgTable, text } from "drizzle-orm/pg-core";

/** 顧客マスタ。'仮登録' の状態も含む */
export const __ = pgTable("顧客", {
    id: integer("id").primaryKey(),
    /** 姓と名は分けない */
    __: text("氏名").notNull(),
    /** 識別子に " が入る場合の属性エスケープ確認 */
    say__hi_: text("say \"hi\""),
    /** 顧客の'愛称'をここに書く */
    ___2: text("メモ"),
});