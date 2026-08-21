# tests/known-issues — 現行コードの既知の不具合

HANDOVER §7 の特性化テストのうち、**「移植で保存すべき挙動」ではないもの**をここに隔離する。

`tests/golden/` は「移植で変わってはいけない挙動」の記録なので、不具合をそこに焼くと
*期待される正しい出力* に見えてしまう。そのためここでは **golden ファイルを持たず**、
「現在こう壊れている」ことをテストコード内のリテラルで直接アサートする。

```
npm run known-issues     # ここだけを走らせる（npm test / npm run test:browser には含まれない）
```

## 運用

移植（HANDOVER §4 IO 再実装 / §6 型パレット・エクスポート規約）で不具合を直すと、
**このテストが赤くなる**。それが正しい。手順は次のとおり。

1. 赤くなったテストの内容を読み、意図した修正で直ったのかを確認する。
2. 直ったことを [`../../CUSTOMIZATIONS.md`](../../CUSTOMIZATIONS.md) の決定ログに記録する。
3. 該当テストを削除、または「直った後の挙動」のアサートに書き換える。
4. 影響が `tests/golden/` に出る場合は、**実ブラウザで** `npm run golden:update` して差分をレビューする。

黙って消さない。消えた記録は「そもそも壊れていなかった」ことにされてしまう。

## 収録している不具合

| # | 現象 | 原因 | 経路 | 直る予定 |
|---|---|---|---|---|
| 4 | 型パレットに無い型は黙って先頭の型になる（`UUID` → `INTEGER`） | 一致が無いと初期値 `type: 0` が残る（[js/io/xml-parser.ts](../../js/io/xml-parser.ts)） | **XML 読込のみ**／**未現代化の 4 プロファイルのみ**（`postgresql` は段階6-3 で解消） | §6 段階6-8 |
| 10 | `<type re="...">` の照合が壊れている。アンカーされておらず部分一致し、大文字小文字を区別し、`sql` の完全一致を後から上書きする | [js/io/palette.ts](../../js/io/palette.ts) の `indexOfTypeNameLegacy` が `re` を後勝ちで見る。壊れているのは規則よりパレット側で、`oracle` は `re="INT"` を integer と number の 2 型に、`mssql` は 4 型（tinyint/smallint/int/bigint）に振っている | **XML 読込のみ**／**未現代化の 4 プロファイルのみ**（同上） | §6 段階6-8 |
| 9 | introspection サンプル（PG18 実出力）が well-formed でなく index も出ない | 余分な `</key>` と index 収集ループの `break`。詳細は [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §4.6 | introspection | §5.2 |
| 15 | `oracle`: 識別子に `"` を含むと実行できない DDL になる（ORA-25716）。**grabado の欠陥ではなく Oracle の制約**だが出力は実行できない | 他の 7 本と同じ `""` エスケープで出す。**Oracle だけが識別子内の `"` を許さない** | DDL 生成 | **6-9 以降**（直し方が生成器の中に無く、入力側で止めるしかない） |
| 13 | `sqlite`: 複合 PRIMARY KEY が UNIQUE に落ち、PRIMARY KEY が 1 つも無い DDL になる | [js/io/ddl/sqlite.ts](../../js/io/ddl/sqlite.ts) が「UNIQUE、または part 2 個以上の PRIMARY」をまとめて UNIQUE として出す（`db/sqlite/output.xsl:61-64` の逐語） | DDL 生成 | §6 段階6-8 |

**#15 は §6 段階6-8c で新設した。** 生成した DDL を Oracle 23ai に流して見つけたもので、
**実物に流さなければ golden は緑のまま実行できない DDL を固定していた**（6-8a の
`DEFAULT (UUID())` に続く 2 件目）。

**#12 / #13 は §6 段階6-5a、#14 は 6-6b で新設した。** どれも XSLT を TS へ移植する過程や
fixture を実型で書き直す過程で見つかった upstream からの粗さで、**移植が作った欠陥ではない**。
**#12 と #14 は 6-8b（mssql の現代化）で直り**、下の「直したもの」へ移った。
残るのは **#13**（sqlite）で、6-8d で消える。

**#11 は §6 段階6-4 で新設し、6-5b で PG から消えた**（下の「直したもの」）。囲む側の規則が
upstream から値の中を見ていないもので、6-4 が作った欠陥ではない。未現代化の 4 本には残っている。

**「経路」列は §4 段階4-7 の棚卸しで足した。**残る 5 本はどれも現象が消えていないが、
**§4 を通したことで 3 本は届く範囲が狭まっている** —— そのぶん §6 で直すときの影響も狭い。
**§6 段階6-3 で #4 / #10 はさらに狭まり、`postgresql` から消えた。**
段階6-5b で #6 / #11 が出て、**6-8a（mysql）と 6-8b（mssql）でさらに 2 本が出た**。
**6-8c で #10 は実例が尽きて消えた**（`re` を持つパレットが 1 つも無くなった）。
**残るのは 4 本** —— #4 と #13 は `sqlite` の話で 6-8d、#15 は Oracle の制約で 6-9 以降、
#9 は introspection で §5.2。

- **#4 / #10 の再現は `postgresql` の fixture を別のパレットで読むことに依る**（段階6-6a）。
  6-6a で fixture が DB 別になったので、ここは `readFixture(SERIALIZER_DB, ...)` と
  **明示的に postgresql を指定する** —— `mysql` の fixture を mysql のパレットで読むのは
  正常系であって、#4 / #10 はどちらも「そのパレットに無い型名を読ませたとき」の話。
  6-6b で 4 プロファイルの fixture が実型に書き換わっても、ここの再現は動かない。
- **#4 / #10 は設計 JSON では起きない。** 正本フォーマットの型キーは 4-2b で安定 `id` になり、
  [json-parser.ts](../../js/io/json-parser.ts) は**パレットに無い id を throw** する
  （「一致が無ければ添字 0」を持ち込まない）。残っているのは互換で読む XML 経路
  （[xml-parser.ts](../../js/io/xml-parser.ts) → [palette.ts](../../js/io/palette.ts)）だけ。
  テストが XML fixture を読ませているのはこのため。
- **#4 / #10 は `postgresql` では起きない（段階6-3）。** `<datatypes strict="1">` を持つ
  「現代化済み」プロファイルは `sql` / `aka` の**大小無視の完全一致だけ**で解決し（＝ `re` を
  見ないので #10 が消える）、一致が無ければ**例外**になる（＝ 先頭型に落ちないので #4 が消える）。
  残る 4 本が 6-8 で同じ形になると、この 2 行ごと消える。
- **#10 を 6-2 で直さなかったのは、直す向きが品質を下げるから。** `re` を素朴に先勝ちへ倒すと
  `mssql` は `INTEGER` → `tinyint`・`FLOAT` → `money` と**縮み**、oracle と合わせて DDL golden が
  12 本動く。パレット側の `re` を直すのが本筋で、それは各プロファイルの現代化（6-8）の仕事。
  DB 別 fixture（6-6）が無いうちは是非を検証する材料も無い。**6-3 が `postgresql` で採った形
  （`re` を捨てて `aka` の完全一致に移す）がそのまま 6-8 の型紙になる。**
- **#5 は書き出し側では構造的に起きなくなった**（段階4-5）。`if (row.def)` が `""` を落とすので、
  grabado が書いた XML に空の `<default>` は出ない。残るのは introspection の出力（外部由来の XML）を
  直接 XSLT に食わせる経路だけ。

`PRIMARY` / `UNIQUE` 以外の key type が PostgreSQL で `ADD CONSTRAINT <table>_pkey KEY (...)` に
落ちていた件（`INDEX` も `FULLTEXT` も同じ）は **#6 と一緒に段階6-5b で直した** ——
PG に `KEY (...)` 構文は無いので `CREATE INDEX idx_<table>_<cols>` になる。
`INDEX` / `FULLTEXT` を持つ fixture が 1 本も無く golden には 1 行も出ないので、
テストは [`../node/ddl.test.ts`](../node/ddl.test.ts)（規約）と
[`../browser/keys.spec.ts`](../browser/keys.spec.ts)（UI からの到達点）に置いてある。

### 直したもの（このディレクトリから出た不具合）

運用 3 に従い、テストは消さずに「直った後の挙動」のアサートへ書き換えて移設してある。
**§4（IO）が引き受けた分は 1 / 2 / 7 / 8 の 4 本で尽きている**（段階4-5 の記録）。
§6 は 6-2 で #3 を引き取り、**6-3 で #4 / #10 の `postgresql` 分**を引き取った
（現象そのものは未現代化の 4 本に残るので、表からは消していない）。
**6-5a で #5 が引き取られた** —— こちらは直したというより、現象に到達する経路
（introspection の XML を直接 XSLT に食わせる）が XSLT ごと無くなった。

| # | 現象 | 直した段階 | 移設先 |
|---|---|---|---|
| 1 | 識別子に `&` を含めると `toXML()` が well-formed でない XML を吐き、保存したファイルを二度と開けない | §4 段階4-4 | [`../browser/serialize.spec.ts`](../browser/serialize.spec.ts)「識別子に & を含んでも書き出し・読み直しが壊れない」（**段階6-5a で XML の書き出しが消えたので、主張を JSON と DDL に移した**） |
| 2 | nullable かつ default 未指定の行が、保存すると `<default>NULL</default>` を獲得する（情報が増える） | §4 段階4-5 | 同上「既定値の無い行は保存しても既定値を獲得しない」＋「nullable な行の default 欄に NULL と打っても既定値は出ない」（6-5a で観測面を JSON に移した） |
| 7 | `alignTables()` が `tables` を破壊的ソートし、テーブル順と座標を変える | §4 段階4-4 | 同上「`alignTables()` はテーブル順を変えない」 |
| 8 | `<default>` だけ末尾に改行が付かず diff が読みにくい | §4 段階4-4 | **段階6-5a で XML の書き出しごと消滅**（XML 固有の主張なので移設先を持たない。CUSTOMIZATIONS.md の 6-5a「消える主張の始末」） |
| 3 | `BIGINT` が Big Integer ではなく **Real** に解決される（`sql="BIGINT"` の重複を後勝ちで拾う） | §6 段階6-2 | [`../browser/types.spec.ts`](../browser/types.spec.ts)「BIGINT は Big Integer に解決される」＋「XML を読み直しても型がドリフトしない」／[`../browser/json.spec.ts`](../browser/json.spec.ts)「型を id で持つので後勝ちドリフトが起きない」 |
| 4（PG のみ） | `UUID` が型パレットに無く `INTEGER` に落ちる | §6 段階6-3 | [`../browser/types.spec.ts`](../browser/types.spec.ts)「UUID が uuid に解決される」＋「strict なパレットでは未知の型が例外になる」 |
| 10（PG のみ） | `re` が大文字小文字を区別し `NUMERIC` に当たらない | §6 段階6-3 | [`../node/type-resolution.test.ts`](../node/type-resolution.test.ts)「大文字小文字を無視する」＋「部分一致しない」 |
| 5 | 空の `<default></default>` で ` DEFAULT ` だけが残る | §6 段階6-5a | [`../browser/serialize.spec.ts`](../browser/serialize.spec.ts)「空の `<default></default>` を読んでも DEFAULT 句は出ない」 |
| 6 | key が複数あると制約名が `<table>_pkey` で衝突する（`INDEX` / `FULLTEXT` が `KEY (...)` に落ちる件も同じ） | §6 段階6-5b | [`../node/ddl.test.ts`](../node/ddl.test.ts)「name が空のキーは §6.3 の規約で名前を組む」ほか 3 本 ＋ [`../browser/keys.spec.ts`](../browser/keys.spec.ts) |
| 12 | `mssql`: 最終列にコメントがあると区切りカンマが `--` に飲まれ T-SQL が構文エラーになる | §6 段階6-8b | [`../node/ddl.test.ts`](../node/ddl.test.ts)「コメントは列定義の後ろに出す」。コメントは落とさず位置を変えた |
| 14 | `mssql`: UNIQUE キーが T-SQL に無い `UNIQUE KEY (...)` で出る | §6 段階6-8b | 同「UNIQUE は T-SQL の構文で出す」 |
| 11（PG のみ） | 既定値を `quote` で囲むとき値の中の `'` がエスケープされない | §6 段階6-5b | [`../node/ddl.test.ts`](../node/ddl.test.ts) の `LITERALS` 表（`O'Brien` → `'O''Brien'`）。**未現代化 4 本には残る**ので同ファイルの mysql のテストが「直っていない」側を押さえる |

#3 の記述にあった「`re` もアンカー無しの部分一致」は **#10 が引き継いだ**（6-2 で新設）。
6-2 が直したのは `sql` の完全一致どうしの順序だけで、**6-3 で `postgresql` が `re` を
持たなくなった**ぶんだけ #10 の範囲が縮んだ。`x_real`（#3 の entry 本体）も 6-3 で撤去され、
`sql` の重複はどのプロファイルにも無くなっている。

`fixtures/` はそのまま残す（`amp-in-name.xml` と `bigint-drift.xml` は移設先のテストが読む）。正常系
[`../fixtures/`](../fixtures/) へ昇格させると DDL golden の母集団が 35 → 40 本に増え、
「DDL golden が無差分」という段階の完了判定がぼやけるため。

**ここの fixture は DB 別にしない**（段階6-6a）。正常系が
`tests/fixtures/<db>/<name>.xml` に分かれた後もこちらは 1 本のまま置く ——
既知の不具合はどれも「**特定のパレットで**読んだときに起きること」が主張なので、
入力を DB ごとに分けると再現条件そのものが消える。

### ここに無いが記録済みのもの

- ~~**`<!-- Active URL: ... -->` に `location.href` が入り出力が非決定的**~~
  **§4 段階4-4 で撤去した**（`<datatypes>` の全文埋め込みも同時に）。
  [`../browser/serialize.spec.ts`](../browser/serialize.spec.ts) のテストは主張を反転させ、
  「環境依存が出力に現れない」ことを固定している。golden の正規化も無くなった。
- ~~**`CONFIG.AVAILABLE_DBS` に `web2py` が重複**~~
  **§6 段階6-1 で解消した**（`web2py` ごと対応 DB から外れたため。副産物であって、
  この重複を直すこと自体が目的ではなかった）。
- **`DEFAULT_BACKEND` が配列**（[js/config.ts:61](../../js/config.ts#L61)）。
  出力に影響しないため今回は記録のみ（[`../../CUSTOMIZATIONS.md`](../../CUSTOMIZATIONS.md)）。
