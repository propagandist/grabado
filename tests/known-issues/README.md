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
| 9 | introspection サンプル（PG18 実出力）が well-formed でなく index も出ない | 余分な `</key>` と index 収集ループの `break`。詳細は [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §4.6 | introspection | §5.2 |
| 15 | `oracle`: 識別子に `"` を含むと実行できない DDL になる（ORA-25716）。**grabado の欠陥ではなく Oracle の制約**だが出力は実行できない | 他の 7 本と同じ `""` エスケープで出す。**Oracle だけが識別子内の `"` を許さない** | DDL 生成 | **6-9 以降**（直し方が生成器の中に無く、入力側で止めるしかない） |

**#15 は §6 段階6-8c で新設した。** 生成した DDL を Oracle 23ai に流して見つけたもので、
**実物に流さなければ golden は緑のまま実行できない DDL を固定していた**（6-8a の
`DEFAULT (UUID())` に続く 2 件目）。

**#12 / #13 は §6 段階6-5a、#14 は 6-6b で新設した。** どれも XSLT を TS へ移植する過程や
fixture を実型で書き直す過程で見つかった upstream からの粗さで、**移植が作った欠陥ではない**。
**#12 と #14 は 6-8b（mssql の現代化）で、#13 は 6-8d（sqlite の現代化）で直り**、
3 本とも下の「直したもの」へ移った。

**#11 は §6 段階6-4 で新設し、6-5b で PG から消え、6-8d で 8 本すべてから消えた**
（下の「直したもの」）。囲む側の規則が upstream から値の中を見ていないもので、
6-4 が作った欠陥ではない。

**「経路」列は §4 段階4-7 の棚卸しで足した。**当時の 5 本はどれも現象が消えていなかったが、
**§4 を通したことで 3 本は届く範囲が狭まっていた** —— そのぶん §6 で直すときの影響も狭かった。
**§6 段階6-3 で #4 / #10 はさらに狭まって `postgresql` から消え**、段階6-5b で #6 / #11 が出て、
6-8a（mysql）と 6-8b（mssql）でさらに 2 本が出た。**6-8c で #10 は実例が尽き、
6-8d で #4 / #10 / #13 がまとめて出た**（§6 のパレット現代化が 8 本とも終わった）。

**残るのは 2 本** —— #15 は Oracle の制約で 6-9 以降、#9 は introspection で §5.2。
**どちらも §6 の型パレット / DDL 生成の話ではない**ので、この表は §6 の残りを
もう 1 つも指していない。

- **#4 / #10 の再現条件（未現代化のパレットで `postgresql` の fixture を読む）は 6-8d で
  消滅した。** 6-3 が「残る 4 本が同じ形になるとこの 2 行ごと消える」と書いた、その時点。
  `js/io/palette.ts` の `indexOfTypeNameLegacy` と `js/io/xml-parser.ts` の先頭型
  フォールバックが**コードごと**落ちている。再発の検知は
  [`../node/type-resolution.test.ts`](../node/type-resolution.test.ts) の
  「`re` はどのパレットでも読まれない」「strict 属性を持たないパレットでも未知の型は例外」
  の 2 本で、**実データではもう再現できない**（`re` 属性を持つパレットが 0 本）ので
  人工パレットに置いてある。
- **#10 を 6-2 で直さなかったのは、直す向きが品質を下げるから。** `re` を素朴に先勝ちへ倒すと
  `mssql` は `INTEGER` → `tinyint`・`FLOAT` → `money` と**縮み**、oracle と合わせて DDL golden が
  12 本動く。パレット側の `re` を直すのが本筋で、それは各プロファイルの現代化（6-8）の仕事だった。
  **6-3 が `postgresql` で採った形（`re` を捨てて `aka` の完全一致に移す）がそのまま 6-8 の
  型紙になった**（判断の記録として残す）。
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
| 11（PG のみ） | 既定値を `quote` で囲むとき値の中の `'` がエスケープされない | §6 段階6-5b | [`../node/ddl.test.ts`](../node/ddl.test.ts) の `LITERALS` 表（`O'Brien` → `'O''Brien'`） |
| 11（残る 7 本） | 同上 | §6 段階6-8d | 同じ `LITERALS` 表。**8 プロファイル横断で回る**ようにした（`quoteDefault` から strict / 未現代化の分岐ごと落ちた） |
| 4 | 型パレットに無い型は黙って先頭の型になる | §6 段階6-8d | [`../browser/types.spec.ts`](../browser/types.spec.ts)「strict なパレットでは未知の型が例外になる」＋ [`../node/type-resolution.test.ts`](../node/type-resolution.test.ts)「strict 属性を持たないパレットでも未知の型は例外」。**`js/io/xml-parser.ts` のフォールバックごと消えた** |
| 10 | `<type re="...">` の照合が壊れている | §6 段階6-8d | [`../node/type-resolution.test.ts`](../node/type-resolution.test.ts)「`re` はどのパレットでも読まれない」＋「`re` 属性を持つパレットはもう 1 つも無い」＋ 8 プロファイル × 全候補名の全数掃き。**`indexOfTypeNameLegacy` ごと消えた**（実例は 6-8c で尽きていた） |
| 13 | `sqlite`: 複合 PRIMARY KEY が UNIQUE に落ち PRIMARY KEY が消える | §6 段階6-8d | [`../node/ddl.test.ts`](../node/ddl.test.ts)「複合 PRIMARY KEY は PRIMARY KEY のまま出る」。表定義の中に `CONSTRAINT <名> PRIMARY KEY (...)` を置く（SQLite に `ALTER TABLE ADD CONSTRAINT` は無い） |

#3 の記述にあった「`re` もアンカー無しの部分一致」は **#10 が引き継いだ**（6-2 で新設）。
6-2 が直したのは `sql` の完全一致どうしの順序だけで、**6-3 で `postgresql` が `re` を
持たなくなった**ぶんだけ #10 の範囲が縮んだ。`x_real`（#3 の entry 本体）も 6-3 で撤去され、
`sql` の重複はどのプロファイルにも無くなっている。

`fixtures/` はそのまま残す。**読み手を持つのは 3 本**（`amp-in-name.xml` / `bigint-drift.xml` /
`empty-default.xml` を移設先のテストが読む）で、`re-match-drift.xml` と `quote-in-default.xml` は
**読み手を持たない記録**として置いてある（現象が消えたので再現に使えない）。正常系
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
