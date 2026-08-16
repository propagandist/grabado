# FORMAT.md — 設計 JSON（`formatVersion: 2`）

grabado の**正本フォーマット**。git 管理のファイルとして保存され、共有は PR で行う
（CLAUDE.md 制約2）。読み書きは [`../js/io/json-serializer.ts`](../js/io/json-serializer.ts) と
[`../js/io/json-parser.ts`](../js/io/json-parser.ts) の 2 本だけを通る。形の定義（キー順の契約を含む）は
[`../js/io/json-format.ts`](../js/io/json-format.ts) が正本で、本書はその散文版。

> 状態: **確定版**（§4 完了時点・段階4-7 で総点検）。4-2 で新設 → 4-2b で型キーを安定 `id` に →
> 4-3b で UI の全経路に配線 → 4-4 で書き出しの拒否条件（同名テーブル）→ 4-5 で「既定値なし」を
> `""` の 1 通りに → 4-6 で保存前の外部変更検知。保存（textarea / クリップボード / ダウンロード /
> localStorage / server）はすべてこの形式で、読み込みは JSON と XML の両方を受ける
> （形式は中身の先頭 1 文字で判別する。[`../js/io/detect.ts`](../js/io/detect.ts)）。
> **次に本書が動くのは §6.1（PostgreSQL 18 型パレットへの差し替え）** —— そのとき `id` の
> 移行表が要る（「パレットを差し替えるときの移行」）。

## 例

```json
{
  "formatVersion": 2,
  "db": "postgresql",
  "tables": [
    {
      "name": "employees",
      "x": 20,
      "y": 20,
      "comment": "従業員",
      "columns": [
        { "name": "id", "type": "integer" },
        {
          "name": "manager_id",
          "type": "integer",
          "nullable": true,
          "comment": "直属の上長（自己参照）",
          "references": [{ "table": "employees", "column": "id" }]
        }
      ],
      "keys": [{ "type": "PRIMARY", "name": "employees_pkey", "columns": ["id"] }]
    }
  ]
}
```

## スキーマ

### ルート

| キー | 型 | 必須 | 意味 |
|---|---|---|---|
| `formatVersion` | `2` | ○ | 形式の版。**2 以外は読み込みを拒む**（`1` は移行コマンドを名指しして拒む） |
| `db` | string | ○ | 型パレット（`db/<db>/datatypes.xml` の `db` 属性）。パレット全文は入れない |
| `tables` | array | ○ | 空でも出す（`"tables": []`） |

`db` は読み込み時に**実行中のパレットと照合し、食い違えば例外**（4-2b。4-2 は読んで捨てていた）。
型 `id` はプロファイル内で一意なだけなので、`db` が load-bearing でないと型キーの安全性が
成立しない。

**UI は拒むだけで、パレットを取り直して開き直すことはしない**（4-3b の決定）。例外メッセージが
そのまま alert に出て、「Options の db を `<ファイル側の db>` に変えてページを再読み込みすること」
という導線を示す。自動で取り直す案を採らなかったのは、読込 5 経路の非同期化が要るうえ、
`typeIndex` / `fkTypeFor` の古いキャッシュを新パレットに当てる既知の癖（4-0b で意図的に温存）を
JSON 経路にも持ち込むため。cookie の `db` は変わらないのでリロードで元に戻る半端な状態も作る。

### `tables[]`

| キー | 型 | 必須 | 既定 |
|---|---|---|---|
| `name` | string | ○ | — |
| `x` / `y` | number | ○ | — （省略不可。原点に重なるテーブルが黙って生まれるのを避ける） |
| `comment` | string | — | `""` |
| `columns` | array | ○ | 空でも出す |
| `keys` | array | — | `[]` |

### `tables[].columns[]`

| キー | 型 | 必須 | 既定 |
|---|---|---|---|
| `name` | string | ○ | — |
| `type` | string | ○ | — （型パレットの **id**。下記） |
| `size` | string | — | `""`（`"11"` / `"10,2"` のような生文字列） |
| `nullable` | boolean | — | `false` |
| `autoincrement` | boolean | — | `false` |
| `default` | string | — | `""`（＝既定値なし）。**引用符は付けない** |
| `comment` | string | — | `""` |
| `references` | array | — | `[]`（この列を子＝ FK 側とする参照） |

### `tables[].columns[].references[]`

| キー | 型 | 必須 |
|---|---|---|
| `table` | string | ○ |
| `column` | string | ○ |

### `tables[].keys[]`

| キー | 型 | 必須 | 既定 |
|---|---|---|---|
| `type` | string | ○ | — （UI が作るのは `PRIMARY` / `INDEX` / `UNIQUE` / `FULLTEXT` の 4 つ） |
| `name` | string | — | `""` |
| `columns` | array of string | ○ | — |

`type` は **parser も serializer も値を検査しない**（文字列であることだけを見る）。選択肢を持つのは
UI 側（[`../js/keymanager.ts`](../js/keymanager.ts)）で、[`Key`](../js/key.ts) は falsy を `INDEX` に
倒す。DDL でどう出るかは `db/<db>/output.xsl` 次第で、**PostgreSQL は `PRIMARY` / `UNIQUE` 以外を
すべて `ADD CONSTRAINT <table>_pkey KEY (...)` に落とす**（`INDEX` も `FULLTEXT` も同じ。
制約名の衝突は known-issues #6）。値を列挙して拒む案は §6.3（エクスポート規約）の判断に送る ——
形式側で拒むと、いま開ける設計が読めなくなる側の変更になる。

## 決定論と diff フレンドリー（CLAUDE.md 制約3）

- **同一モデル → 同一バイト列。** 環境依存の入力を 1 つも持たない
  （XML が持っていた `<!-- Active URL -->` に相当するものが無い）。
- **キー順は上の表の並びに固定**。`JSON.stringify` は挿入順を保つので、serializer の
  オブジェクトリテラル / 代入の並びがそのまま契約になる。
- **整形は 2 スペース、末尾に LF 1 つ、改行は LF。**
- **既定値と同じキーは出さない。** 意味のある差分だけが git diff に出る。
- **1 テーブル = 独立ブロック。** テーブルの追加は、既存部分を 1 バイトも動かさずに
  ブロックが 1 つ増えるだけの差分になる（`tests/browser/json.spec.ts` が実際に確認している）。

## 決めたことと、その理由

### 型は `id` で持つ（`label` でも `sql` 名でもない）

型キーは `db/<db>/datatypes.xml` の `<type id="...">`。**永続化専用の属性**で、`label`（表示名）とも
`sql`（出力する型名）とも独立している。

**なぜ `sql` ではないか。** `sql` は §6 のパレット現代化が**変えることを目的にしている属性**そのもの
（`SERIAL` → identity、`CHAR` → `TEXT`、`TIMESTAMP` → `TIMESTAMPTZ`）。正本ファイルの型キーに
最も不安定な属性を選ぶわけにいかない。加えて `db/postgresql/datatypes.xml` は `sql="BIGINT"` を
**Big Integer と Real の 2 か所**に持ち、照合ループが `break` しないので後勝ちになる
（known-issues #3）—— sql 名で焼くと Big Integer → `"BIGINT"` → Real にドリフトする。

**なぜ `label` ではないか**（4-2 はこれを選び、4-2b で変えた）。label は一意ではあったが**表示名**で、
§6 のパレット現代化で動く。動いた瞬間に git 管理下の設計ファイルが読めなくなる。
さらに実測すると **postgresql と mysql は label を 12 個共有**していた（`Integer` / `Text` /
`Timestamp` / `Char` / `Varchar` / `Decimal` / `Date` / `Time` / `Bit` / `Binary` / 単精度 / 倍精度）ので、
4-2 の「`db` を読んで捨てる」と組み合わさると **PG の設計を mysql パレットで開いたときに
12 型が例外にならず黙って別の型に解決される**（PG の `Text`=`TEXT` → mysql の `Text`=`MEDIUMTEXT`）。
`id` 化と `db` の必須化はこの 2 つを同時に塞ぐためのもので、**片方だけでは成立しない**。

#### `id` の規則

| # | 規則 |
|---|---|
| 1 | `^[a-z][a-z0-9_]{0,31}$` に適合し、パレット内で一意 |
| 2 | 語源はその `<type>` が出力する SQL 型名の正規化（小文字化 → 英数字以外を `_` → 前後の `_` を落とす） |
| 3 | **意味が同じ型の `id` は変えない。意味が変わったら必ず変える。`id` を別の意味で再利用しない** |
| 4 | 規則 2 の結果が衝突する / 語源が壊れている entry には `x_` を付ける（撤去予定の印） |

**規則 3 が唯一の契約**で、`label` と `sql` は §6 がいくらでも動かしてよい。
規則 1 が小文字始まりなのは安全装置でもある —— **現行 5 パレットの label はこの形に 1 つも一致しない**
ので、移行し忘れた `formatVersion: 1` のファイルが「たまたま読めてしまう」ことが原理的に起きない。

4-2b 時点で `x_` が付いているのは実測 2 件だけだった（`postgresql: x_real` ＝ known-issue #3 の本体、
`vfp9: x_integer_not_key`）。**6-1 の撤去で `vfp9` が対応 DB から外れ、残るのは `x_real` の 1 件。
6-3 の PG18 パレット差し替えでこれも消えて 0 件になる。**
規則そのものの検査は [`../tests/node/palette-id.test.ts`](../tests/node/palette-id.test.ts)。

#### パレットを差し替えるときの移行

読み込み時に**現在の型パレットに無い `id` は例外**にする（known-issues #4 の「一致が無ければ
先頭の型」を持ち込まない）。正本を黙って別の型で開くのが最悪の失敗だから。

§6 でパレットを現代化すると、撤去された型を使っているファイルはここで落ちる。**その段階が
同じ PR で移行を持つ**（移行表とパレットが別の PR に分かれると、その間リポジトリの設計ファイルが
読めない ＝ CLAUDE.md 制約1「半移行を放置しない」に反する）。**移行表の形と規則は 6-3**
（PG18 パレット差し替えと同じ PR）で確定する。**表そのものは
[`../CUSTOMIZATIONS.md`](../CUSTOMIZATIONS.md) の 6-0 の記録**にある
—— 4-2b の移行が「label → id」の全射だったのに対し、§6 の移行は「消えた型をどこに寄せるか」という
意味的判断を含むので、形が違う。

### 参照は名前で持つ

現行 XML と同じく `{table, column}` の名前。**同名のテーブルが 2 つあると復元時に両端が先頭の
テーブルへ解決される既知の不具合**がこの名前解決に由来するが、id 参照へ移すには描画クラス側に
id の発番が要る。「壊れた設計を保存させない」方向の始末は 4-4。

### 「既定値なし」は `""` の 1 通り（`DEFAULT NULL` の内部表現は持たない）

`default` が `""` のときはキーを出さず、読み戻しはキーが無ければ `""` を入れる。

段階4-2 の時点では内部表現が `null`（＝ `DEFAULT NULL`）と `""`（＝既定なし）の 2 つに割れて
いて、JSON はどちらも「キーを出さない」に潰していた —— XML が nullable な行に
`<default>NULL</default>` を生やす不具合（known-issues #2）と、空の `<default>` で壊れた SQL が
出る不具合（#5）を **JSON 経路に最初から持ち込まない**ため。**段階4-5 で `null` を撤去した**ので、
いまは形式・内部表現ともに `""` の 1 通りしかない。

`default` 欄に `"NULL"`（大小問わず）と打った場合、**nullable な列では `""` に潰れる**
（[`Row.update()`](../js/row.ts) の正規化。nullable 列の `DEFAULT NULL` は SQL 上も暗黙の既定と
同義なので情報は失われない）。`NOT NULL` の列では文字列としてそのまま保存される —— 現行の
条件をそのまま残したためで、意図した既定値を勝手に消さないという意味でもこちらが安全側。
正規化は `Row.update()` の 1 箇所だけにあり、parser は読んだ生値を渡す（[`js/io/model.ts`](../js/io/model.ts)）。

## ファイル名（段階4-3b）

**拡張子は `.json`。** server 経路（`?action=save&keyword=…`）は keyword に `.json` を付けて送るので
backend 上のファイルは `<name>.json` になり、ダウンロードは `new-database.json` で落ちる。
`jsonKeyword()`（[`../js/io.ts`](../js/io.ts)）が二重付与を防ぐので、`list` が返した名前を
そのまま prompt に貼っても壊れない。設計の名前（`setTitle` に渡す値）には付けない。

拡張子が要るのは、`.gitattributes` / `.prettierignore` / 移行 glob
（`npm run migrate:design -- schema/*.json`）のいずれもファイルを名指しできないため。
正本の置き場所は各プロダクトのリポジトリの `schema/`（[`BRANCHING.md`](BRANCHING.md)）。

**読み込み側は拡張子を見ない。** 中身の先頭 1 文字で判別する（[`../js/io/detect.ts`](../js/io/detect.ts)）
ので、拡張子なしで保存された 4-3b 以前のファイルも、`.txt` で書き出した旧 XML もそのまま読める。

拡張子の**強制**（`.json` 以外の save を拒む・`list` が `*.json` だけを返す）は正本ディレクトリの
責務なので、Kotlin backend（HANDOVER §5.1）に送ってある。

## 壊れた入力の扱い

parser は**部分的に読み込まない**。次のいずれかで例外を投げ、その時点で開いている設計は変えない
（[`Designer.fromJson()`](../js/wwwsqldesigner.ts) は parse を `clearTables()` より先に置いてある）。

- JSON として構文が壊れている（`JSON.parse` の `SyntaxError` がそのまま出る）
- `formatVersion` が 2 でない
- **`formatVersion` が 1**（下記。移行コマンドを名指しする専用のメッセージ）
- **`db` が実行中の型パレットと違う**
- 必須キーの欠落・型違い（メッセージに `tables[0].columns[2].name` の形で位置が入る）
- 型パレットに無い `type`

例外の message は開発者向けで **locale を通さない**（価値の本体が `tables[0].columns[2].name` の
位置情報で、訳すと壊れるため）。**ユーザーへの見せ方は 4-3b で「見出しだけ locale・詳細は素通し」に
確定した** —— [`../js/io.ts`](../js/io.ts) の `loadDesignText()` が
`alert(_("jsonerror") + ": " + e.message)` に流す。現行の 18 か所と同じ形。

そもそも parser に渡らない入力が 2 つある（[`../js/io/detect.ts`](../js/io/detect.ts) の判別）。
どちらも locale 付きの短い alert で終わり、**開いている設計は変わらない**。

| 入力 | 判別 | 出るもの |
|---|---|---|
| 空（空白と BOM だけを含む） | `empty` | `_("empty")` |
| 先頭が `{` でも `<` でもない | `unknown` | `_("unknownformat")` |

「JSON として読んで駄目なら XML」というフォールバックは**作らない**。壊れた JSON を XML として
読み直すと「Null document」に着地し、ユーザーが直せない位置のメッセージになるため（同ファイル冒頭）。

## 書き出せない設計

serializer 側にも拒否条件がある。いずれも **1 バイトも書かずに例外**で、受け止めは
[`IO.toJsonOrAlert()`](../js/io.ts) 1 か所（失敗したら textarea を空で上書きしたり
空ファイルを保存したりしない）。

- 型パレットに `db` 属性が無い / 型 `id` が無い（4-2b）
- **同名のテーブルが 2 つ以上ある**（4-4）

同名テーブルを拒むのは、上の `references` が**名前参照**だから。同名があると読み戻したときに
参照先が常に先頭のテーブルへ解決され、**名前は合っているのに設計が変わる**。形式を id 参照へ
移して直す案は 4-2 で採らなかった（id の発番が描画クラス側に要り、「4-2 以降はライブ側を
触らない」という 4-1c の申し送りを破る）ので、**壊れた設計をファイルに書かせない**方向で始末する。
正本が git 管理のファイルである以上、黙って壊れたものをコミットさせるほうが害が大きい。

### `formatVersion: 1` は後方互換で読まない

4-2 が書いた版 1 のファイルは、**parser がアップグレードせずに落とす**。移行は
[`../tools/migrate-design.mjs`](../tools/migrate-design.mjs) を通す。

```bash
npm run migrate:design -- schema/*.json
```

実行時に黙ってアップグレードすると、開いて保存し直すまでファイルは旧世代のままで、
リポジトリ内に 2 世代が混在し「どれが移行済みか」を機械判定できない（CLAUDE.md 制約2 は
正本が git 管理のファイルであることを要求している）。かつ**意味の変化が `git diff` に出ない** ——
制約3 が避けたい形そのもの。**移行は 1 コミットとして出す**。parser が持つ後方互換は、
このコマンドを名指しする例外メッセージ 1 つだけ。

ツールは冪等（v2 のファイルは触らない）で、**serializer が書いた正規形でない入力は変換せずに落とす**
（手編集されたファイルを書き直すと、数値リテラルの表記揺れのような意図しない差分が移行コミットに
紛れ込むため）。変換されるのは `formatVersion` の行と `columns[].type` の行だけで、それ以外は
キーの位置も値も動かない。

## 保存の前に読む（外部変更検知・段階4-6）

正本が git 管理のファイルである以上、**他人の PR を `git pull` で取り込んだ後に古い編集状態のまま
保存すると、相手の変更が黙って消える**。HANDOVER §4 はこれを「ファイルが app 外で変化したら検知し
再読込を促す。古い編集状態でファイルを上書きしない」と定義していて、**server 経路の save
（`#serversave` と F2 の `#quicksave`）は保存の前に同じ名前を 1 回 load する**。

判定は [`verdictForSave()`](../js/io/conflict.ts)（純関数）の 4 値で、confirm を出すかどうかは
[`../js/io.ts`](../js/io.ts) の `preflightresponse()` が決める。

| 判定 | 状況 | 挙動 |
|---|---|---|
| `absent` | サーバに無い（404） | そのまま保存（新規保存の正常系） |
| `clean` | 最後に観測した版と一致 | そのまま保存 |
| `exists` | 派生元を持たない名前に実体がある | **confirm**（他人／別セッションのファイルを踏む） |
| `conflict` | 観測した後に外部で変わった | **confirm**（本機能の主眼） |

- 台帳（派生元）は **keyword ごとの Map ではなく 1 本**。「今の編集セッションの派生元」という
  意味づけで、別名で保存すれば派生元も移る。載せるのは load / save で**実際に観測したバイト列**。
- **500 / 501 / 503 は中止**する。読めなかったものを「無かったこと」にして上書きするのは、
  本機能が防ぎたいことそのもの。
- 衝突しても**上書きの道は残す**（confirm で承諾すれば保存される）。正本は git なので復元できる ——
  ただし無言では通さない。
- **TOCTOU の窓は残る**（プリフライトと save の間に他者が書けば、そちらが負ける）。閉じるには
  backend 側の条件付き更新が要るので、ETag ＋ `If-Match`（不一致は 412）を Kotlin 実装
  （HANDOVER §5.1）へ申し送ってある。**そこでプリフライトは 1 往復に畳める。**
- **時間駆動にしない**（CLAUDE.md 制約2）。定期ポーリングも自動再読込も入れない ——
  編集中に勝手に読み直すと、pull 上書き事故を「編集の消失」という別の形で作り直すことになる。

対象は **server 経路だけ**。localStorage・ダウンロード・クリップボードは app の外で書き換わる
経路を持たない（あるいは書き換わっても上書き先が無い）ので、プリフライトを投げない。

## テスト

[`../tests/browser/json.spec.ts`](../tests/browser/json.spec.ts)（golden の権威）と
[`../tests/node/json.test.ts`](../tests/node/json.test.ts)（高速回帰）。golden は
`tests/golden/json/<fixture>.json` の 7 本。詳細は [`TESTING.md`](TESTING.md)。

`id` 規則そのものは [`../tests/node/palette-id.test.ts`](../tests/node/palette-id.test.ts) が
全プロファイルについて押さえ、移行ツールの規則は
[`../tests/node/migrate-design.test.ts`](../tests/node/migrate-design.test.ts) が見る。
**ツールが serializer と同じバイト列を書くこと**の根拠は golden テスト —— `tests/golden/json/` の
7 本はツールで移行したもので、それが serializer の出力と一致するかを毎回見ている。

**「JSON が XML と同じ情報を運ぶ」ことの根拠は「情報保存」テスト** —— 同じ fixture を
XML 経由（`toXML` → `fromXML`）と JSON 経由（`toJson` → `fromJson`）で往復させ、
ライブツリー＋DOM の状態スナップショットがバイト一致することを 7 fixture すべてで確認している。

形式の外側 2 つは別のテストが見る。判別（`{` / `<` / 空 / それ以外）は
[`../tests/node/detect.test.ts`](../tests/node/detect.test.ts)、外部変更検知は
[`../tests/node/conflict.test.ts`](../tests/node/conflict.test.ts)（判定の純関数）と
[`../tests/node/io-ui.test.ts`](../tests/node/io-ui.test.ts)（仮想 backend を相手に
プリフライト → confirm → save の往復を通す）。
