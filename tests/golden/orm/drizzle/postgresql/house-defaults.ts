// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。

import { boolean, date, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** ユーザー */
export const users = pgTable("users", {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    /** ログイン用メールアドレス */
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    isActive: boolean("is_active").notNull().default(sql`true`),
    /** UI 設定などの任意項目 */
    preferences: jsonb("preferences").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
    unique("users_email_key").on(t.email),
]);

/** 記事 */
export const articles = pgTable("articles", {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    /** 執筆者 (users.id) */
    authorId: uuid("author_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    body: text("body"),
    viewCount: integer("view_count").notNull().default(sql`0`),
    /** 有料記事の価格。money ではなく numeric を使う */
    price: numeric("price"),
    publishedOn: date("published_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

/** 記事とタグの対応 */
export const articleTags = pgTable("article_tags", {
    articleId: uuid("article_id").notNull().references(() => articles.id),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
    primaryKey({ columns: [t.articleId, t.tag] }),
]);