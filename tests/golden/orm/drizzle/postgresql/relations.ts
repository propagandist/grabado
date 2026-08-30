// grabado が生成した Drizzle のスキーマ。
//
// **型は core ごとに違う** —— pg / mysql / sqlite で関数名も表せる意味も
// 変わるので、正規型からの表を core ごとに持っている（段階6-9f）。
//
// **TypeScript の識別子は ASCII だけ**なので、非 ASCII の名前は `_` に潰して通し番号で
// 一意化してある。**元の名前は型関数の第 1 引数に必ず残る**。

import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const employees = pgTable("employees", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    /** 直属の上長（自己参照） */
    managerId: integer("manager_id").references((): AnyPgColumn => employees.id),
});

export const projects = pgTable("projects", {
    id: integer("id").primaryKey(),
    title: text("title").notNull(),
    ownerId: integer("owner_id").notNull().references(() => employees.id),
    teamId: integer("team_id").references(() => teams.id),
});

export const teams = pgTable("teams", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
});

export const employeeProjects = pgTable("employee_projects", {
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    projectId: integer("project_id").notNull().references(() => projects.id),
}, (t) => [
    primaryKey({ columns: [t.employeeId, t.projectId] }),
]);