package dev.grabado.design

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

/**
 * `keyword` の検証規則。**HTTP も FS も起動しない純粋な表テスト。**
 *
 * 段階5-1b で「空」と「パスを脱出しうる形」、5-2 で「`.json` の強制（大小無視）・制御文字・
 * Windows 予約名・255 バイト超」。どれもフロントには届かない（`jsonKeyword()` が必ず `.json` を
 * 付け、設計名に制御文字が入る UI 経路が無い）が、公開 API としては塞いでおく ——
 * **正本ディレクトリはユーザーの git repo そのもの**なので、意図しない名前でファイルを
 * 作らせない。
 */
class DesignNameTest {

    @ParameterizedTest
    @ValueSource(
        strings = [
            "orders.json",
            "Orders.JSON", // 大文字の拡張子も契約（tests/node/io-ui.test.ts が固定している）
            "受注.json", // 日本語。Unicode 正規化はしない
            "a.b.json",
            ".hidden.json", // dotfile 自体は拒まない（list に出ないだけ）
            "CONSOLE.json", // 予約名の前方一致では弾かない（CON とは別物）
        ],
    )
    fun `通る名前`(raw: String) {
        assertThat(DesignName.parse(raw).value).isEqualTo(raw)
    }

    @ParameterizedTest
    @ValueSource(strings = ["legacy", "orders.txt", "orders.json.bak", "orders", ".json.txt"])
    fun `json で終わらない名前は NOT_JSON`(raw: String) {
        // 段階5-2。php-file 時代の data/default のような拡張子なしファイルは、もう作れない。
        assertThatThrownBy { DesignName.parse(raw) }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.NOT_JSON)
    }

    @ParameterizedTest
    @ValueSource(strings = ["CON.json", "con.json", "NUL.json", "COM1.json", "lpt9.json", "AUX.json"])
    fun `Windows の予約デバイス名は WINDOWS_RESERVED`(raw: String) {
        // 拡張子を付けても予約のまま。ここを通すと FileDesignStore が OS 依存の例外で 500 になる。
        assertThatThrownBy { DesignName.parse(raw) }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.WINDOWS_RESERVED)
    }

    @Test
    fun `255 バイトちょうどは通り、超えると TOO_LONG`() {
        val stem = "a".repeat(255 - ".json".length)
        assertThat(DesignName.parse("$stem.json").value).hasSize(255)

        assertThatThrownBy { DesignName.parse("a$stem.json") }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.TOO_LONG)
    }

    @Test
    fun `長さは文字数ではなくバイト数で見る`() {
        // 日本語は UTF-8 で 3 バイト。85 文字で 255 バイトなので、86 文字は超える。
        val stem = "あ".repeat(84) // 252 バイト ＋ .json（5）＝ 257 バイト
        assertThatThrownBy { DesignName.parse("$stem.json") }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.TOO_LONG)
    }

    @Test
    fun `制御文字は CONTROL_CHARACTER`() {
        // Kotlin のソースに生の制御文字を書かない（ファイルがバイナリ扱いになる）。
        assertThatThrownBy { DesignName.parse("orders" + Char(9) + ".json") }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.CONTROL_CHARACTER)
    }

    @ParameterizedTest
    @ValueSource(strings = ["", "   ", "\t"])
    fun `空は MISSING`(raw: String) {
        assertThatThrownBy { DesignName.parse(raw) }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.MISSING)
    }

    @Test
    fun `null は MISSING`() {
        assertThatThrownBy { DesignName.parse(null) }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.MISSING)
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "../escaped.json",
            "../../etc/passwd",
            "sub/dir.json",
            "sub\\dir.json",
            "..",
            "..hidden.json", // `..` 始まりはまとめて拒む（判定を単純に保つ）
            ".",
        ],
    )
    fun `パスを脱出しうる名前は TRAVERSAL`(raw: String) {
        assertThatThrownBy { DesignName.parse(raw) }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.TRAVERSAL)
    }

    @Test
    fun `NUL を含む名前は CONTROL_CHARACTER`() {
        // Kotlin のソースに生の NUL を書かない（ファイルがバイナリ扱いになる）。
        // 段階5-1b では TRAVERSAL として弾いていたが、5-2 で制御文字の規則ができたので
        // そちらに寄せた（どちらでも 400 なので、外から見た挙動は変わらない）。
        val raw = "orders" + Char(0) + ".json"
        assertThatThrownBy { DesignName.parse(raw) }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.CONTROL_CHARACTER)
    }

    @Test
    fun `php-file の basename とは違い、黙って書き換えない`() {
        // php-file は `../../x` を `x` にして**保存してしまう**。書き換えると
        // js/io/conflict.ts の Baseline.name と実ファイル名がずれ、段階4-6 の
        // 外部変更検知が別のファイルを見張ることになる。だから拒む。
        assertThatThrownBy { DesignName.parse("../../orders.json") }
            .isInstanceOf(InvalidDesignNameException::class.java)
    }
}
