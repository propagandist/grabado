# TYPE-MAPPING.md — house 既定が各 DB で何になるか

grabado は **PostgreSQL 18 の型パレットを house 標準**として設計し（[`../CLAUDE.md`](../CLAUDE.md)
「スキーマ既定」）、そこから **8 つの DB プロファイルすべて**に向けて DDL を出せる。
この文書は「**PG で設計したものを他の DB 向けに出すと何が変わるか**」を型ごとに示す。

出し方は SQL 出力ダイアログの「出力先」（§6 段階6-10b）。設計そのものは 1 バイトも変わらず、
**出力の直前にモデルの写しを作るだけ**なので、保存されるファイルはどのプロファイルを選んでも同じ。

> この表は手で書いていない。[`../tests/node/type-mapping.test.ts`](../tests/node/type-mapping.test.ts)
> が実装の出力と 1 セルずつ突き合わせるので、**パレットを触れば必ず赤くなる**。

---

## house 既定 8 型の写り方

| 設計（postgresql） | h2 | mariadb | mssql | mysql | oracle | sql-standard | sqlite |
|---|---|---|---|---|---|---|---|
| `UUID` | `UUID` | `UUID` | `uniqueidentifier` | `CHAR(36)` | `CHAR(36)` | `CHARACTER(36)` | `TEXT` |
| `TEXT` | `CHARACTER LARGE OBJECT` | `LONGTEXT` | `nvarchar` | `LONGTEXT` | `CLOB` | `CHARACTER LARGE OBJECT` | `TEXT` |
| `NUMERIC(12,2)` | `NUMERIC(12,2)` | `DECIMAL(12,2)` | `decimal(12,2)` | `DECIMAL(12,2)` | `DECIMAL(12,2)` | `NUMERIC(12,2)` | `TEXT` |
| `INTEGER` | `INTEGER` | `INT` | `int` | `INT` | `INTEGER` | `INTEGER` | `INTEGER` |
| `BOOLEAN` | `BOOLEAN` | `BOOLEAN` | `bit` | `BOOLEAN` | `BOOLEAN` | `BOOLEAN` | `INTEGER` |
| `DATE` | `DATE` | `DATE` | `date` | `DATE` | `DATE` | `DATE` | `TEXT` |
| `TIMESTAMPTZ` | `TIMESTAMP WITH TIME ZONE` | `TIMESTAMP` | `datetimeoffset` | `TIMESTAMP` | `TIMESTAMP WITH TIME ZONE` | `TIMESTAMP WITH TIME ZONE` | `TEXT` |
| `JSONB` | `JSON` | `JSON` | `nvarchar` | `JSON` | `JSON` | `JSON` | `TEXT` |

## 読み方

**同じ綴りで出ていれば、その DB がその型を持っている。** 綴りが変わっているものは 3 通りある。

| 種類 | 例 | 何が起きているか |
|---|---|---|
| **別名** | `INTEGER` → `INT`（mysql） | 同じ値の域を、その DB の綴りで書いただけ。**失われるものは無い** |
| **代用** | `UUID` → `CHAR(36)`（mysql / oracle） | その DB に型が無いので、慣行に沿った表現に置いた。**アプリ側が形を保つ責任を負う** |
| **丸め** | `TIMESTAMPTZ` → `TIMESTAMP`（mysql / mariadb） | **意味が落ちている**。この例ではタイムゾーンが消える |

**丸めが起きた列は生成物の先頭コメントに列挙される**（`users.created_at: TIMESTAMPTZ
(timestamp_tz) -> TIMESTAMP (timestamp)` の形）。黙って落とすことはしない。

## プロファイルごとの要点

**sqlite** は型が 5 本しか無い（`INTEGER` / `REAL` / `TEXT` / `BLOB` / `ANY`）。uuid も date も
timestamptz も json も `TEXT` になるが、**これは劣化ではなく SQLite のやり方**で、日付を ISO 8601
文字列で持つのは公式が案内している形。`BOOLEAN` が `INTEGER` になるのも同じ。

**mysql / mariadb にタイムゾーン付きの時刻型は無い。** `TIMESTAMPTZ` は `TIMESTAMP` に丸まる ——
house 標準が `timestamptz` 固定なのでここは必ず踏む。**UTC で保存する運用を前提にすること。**

**mssql は「サイズを取らない文字列型」を 1 本も持たない。** `TEXT` と `JSONB` が `nvarchar` と
だけ書かれ、**SQL Server はこれを `nvarchar(1)` と解釈する**。生成物には
「寄せ先はサイズを要求する。流す前に長さを足すこと」と出るので、**`nvarchar(max)` などに
手で直してから流すこと**（既知の課題。[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の段階6-10a）。

**oracle の `DATE` は時刻を含む**ので、PG の `DATE`（日付だけ）とは別の型として扱う ——
名前が同じでも寄せない。PG の `DATE` は oracle でも `DATE` に写るが、**時刻部分が付く**ことは
コメントに出る。

**h2 / sql-standard** は house 既定をほぼそのまま表せる。`TEXT` が
`CHARACTER LARGE OBJECT`（SQL 標準の綴り）になる程度。

## 型以外で変わらないもの・変わるもの

| | 扱い |
|---|---|
| テーブル名・列名 | **変えない**。識別子は生成器が書き換えない（§6 段階6-5b の判断）。予約語や長さ上限に触れる名前は入力時に警告する（6-9b） |
| コメント | そのまま写る（その DB のコメント構文で出る） |
| キー・FK・索引 | そのまま。制約名の組み立て規則は出力先プロファイルのものが当たる |
| **既定値（DEFAULT）** | **変換していない。** `uuidv7()` や `'{}'::jsonb` は PG 固有なので、他の DB では**そのまま出て拒まれる** —— 黙って別の関数に置き換えるより気づけるほうを選んだ。流す前に手で直すこと |

## 制約として知っておくこと

- **MySQL は `TEXT` / `BLOB` 系をキーにできない**（長さ指定が要る）。house 既定は `text` 優先なので、
  `text` の列を UNIQUE や複合 PK に使っている設計は MySQL 向けの DDL がそこで落ちる。
  該当する列だけ `VARCHAR(n)` で設計するか、出力後に手で直す
- **`uuid` の代用（`CHAR(36)`）は文字列**なので、DB 側で形式は検査されない
- 表に無い型（`INET` / `CIDR` / `XML` / `GEOMETRY` / `INTERVAL` ほか）は、写せる型が無ければ
  **その DB の既定型に置かれ、そのことがコメントに出る**

---

## ORM 3 本での写り方

grabado は同じ設計から **JPA (Kotlin) / Prisma / Drizzle** のモデル定義も出せる。ORM は
**DB プロファイルとは別の軸**で（「どの言語で出すか」と「どの DB を下敷きにするか」）、
8 プロファイルのどれで設計していても 3 本とも出せる。

| 設計（postgresql） | JPA (Kotlin) | Prisma | Drizzle pg-core | Drizzle mysql-core | Drizzle sqlite-core |
|---|---|---|---|---|---|
| `UUID` | `UUID` | `String` | `uuid()` | `text()` | `text()` |
| `TEXT` | `String` | `String` | `text()` | `text()` | `text()` |
| `NUMERIC(12,2)` | `BigDecimal` | `Decimal` | `numeric()` | `decimal()` | `text()` |
| `INTEGER` | `Int` | `Int` | `integer()` | `int()` | `integer()` |
| `BOOLEAN` | `Boolean` | `Boolean` | `boolean()` | `boolean()` | `integer()` |
| `DATE` | `LocalDate` | `DateTime` | `date()` | `date()` | `text()` |
| `TIMESTAMPTZ` | `OffsetDateTime` | `DateTime` | `timestamp({ withTimezone: true })` | `timestamp()` | `text()` |
| `JSONB` | `String` | `Json` | `jsonb()` | `json()` | `text()` |

**Drizzle の 3 列は「PG の設計をそのプロファイルへ写してから出したもの」。** 上の DDL の表が
先に効いていて、たとえば `TIMESTAMPTZ` が sqlite で `TEXT` になるのは Drizzle の都合ではなく
**SQLite に時刻型が無いから**。列名は表から落としてある（実際の出力は `text("created_at")`）。

### JPA と Prisma は 1 列で足りる

**どちらも下敷きの DB に依らない。** JPA は Kotlin の型、Prisma はスカラー 9 つで、
**provider は `datasource` ブロックにしか現れない**。だから mysql 向けに出しても mssql 向けに
出しても、この列は 1 文字も変わらない。

### Drizzle の core は 4 プロファイルにしかない

**Drizzle は型そのものが core 依存**なので、下敷きのプロファイルで出力が変わる。

| db プロファイル | Drizzle の core |
|---|---|
| h2 | 無い（pg-core で出す） |
| mariadb | mysql-core |
| mssql | 無い（pg-core で出す） |
| mysql | mysql-core |
| oracle | 無い（pg-core で出す） |
| postgresql | pg-core |
| sql-standard | 無い（pg-core で出す） |
| sqlite | sqlite-core |

**対応する core が無いプロファイルでも出力はする** —— 生成物の先頭に「その core は無い。
pg-core の形で出しているので読み替えること」と出る。黙って動くように見せることはしない。

### ORM 側で知っておくこと

- **サイズは 3 本とも出さない。** `NUMERIC(12,2)` は `numeric()` / `Decimal` / `BigDecimal` に
  なり、**桁数は落ちる**。Prisma は native type 属性（`@db.*`）を出さないと決めていて
  （[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の段階6-9c）、JPA と Drizzle も同じ扱いに
  揃えてある。**DDL 側には桁数が出る**ので、スキーマの正本はそちら
- **null 許容は表に出していない。** 実際には JPA が `String?`、Prisma が `String?` を出す
  （Drizzle は `.notNull()` の有無で表す）。表は NOT NULL の列で採っている
- **JPA の `JSONB` が `String` になる**のは、JPA の標準に json 型が無いため（Hibernate の
  拡張なら書けるが標準ではない）。**丸めた列には理由のコメントが付く**
- **`uuid()` を持つのは pg-core だけ。** mysql / sqlite では文字列になる
- **sqlite の整数は JS では number（53 bit）に丸まる。** SQLite の `INTEGER` は 64 bit だが、
  **drizzle-orm の sqlite-core に bigint モードが無い** —— 公式が案内する
  `blob({ mode: "bigint" })` は**BLOB 列を作る**ので、DDL 出力の `INTEGER` と食い違う。
  **grabado が出すのはテーブル定義なので列型の一致を採った**
  （[issue #126](https://github.com/propagandist/grabado/issues/126)）。53 bit を超える整数を
  扱うなら、アプリ側で変換すること
- **sqlite では `BOOLEAN` も `integer()` になる**（`{ mode: "boolean" }` は付かない）。
  上の DDL の表のとおり **sqlite に真偽型が無く `INTEGER` に写る**ためで、
  **その時点で「真偽」という情報が設計から消えている**

> この表も手で書いていない。[`../tests/node/type-mapping.test.ts`](../tests/node/type-mapping.test.ts)
> が**出荷されるバイト列そのもの**（生成器の出力）から型を抜いて 1 セルずつ突き合わせる。
> core の対応表も同じく、出力の `import` 行から読んでいる。

---

関連: [`FORMAT.md`](FORMAT.md)（正規型 `kind` の語彙）／
[`ARCHITECTURE.md`](ARCHITECTURE.md) §5.6（`js/io/` の構成）／
[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md)（段階6-10a / 6-10b の決定ログ）
