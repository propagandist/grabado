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

関連: [`FORMAT.md`](FORMAT.md)（正規型 `kind` の語彙）／
[`ARCHITECTURE.md`](ARCHITECTURE.md) §5.6（`js/io/` の構成）／
[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md)（段階6-10a / 6-10b の決定ログ）
