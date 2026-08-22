package dev.grabado.design

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

/**
 * `keyword` の検証規則。**HTTP も FS も起動しない純粋な表テスト。**
 *
 * 段階5-1b で入るのは「空」と「パスを脱出しうる形」の 2 つだけ。`.json` の強制（大小無視）・
 * 制御文字全般・Windows 予約名・255 バイト超は 5-2 —— 規則を足すたびに、それがフロントに
 * 届くかどうかを 1 段階ずつ確かめるため。
 */
class DesignNameTest {

    @ParameterizedTest
    @ValueSource(
        strings = [
            "orders.json",
            "Orders.JSON", // 大文字の拡張子も契約（tests/node/io-ui.test.ts が固定している）
            "受注.json", // 日本語。Unicode 正規化はしない
            "legacy", // 拡張子なし。強制は 5-2
            "a.b.json",
            ".hidden.json", // dotfile 自体は拒まない（list に出ないだけ）
        ],
    )
    fun `通る名前`(raw: String) {
        assertThat(DesignName.parse(raw).value).isEqualTo(raw)
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
    fun `NUL を含む名前は TRAVERSAL`() {
        // Kotlin のソースに生の NUL を書かない（ファイルがバイナリ扱いになる）。
        val raw = "orders" + Char(0) + ".json"
        assertThatThrownBy { DesignName.parse(raw) }
            .isInstanceOf(InvalidDesignNameException::class.java)
            .extracting { (it as InvalidDesignNameException).reason }
            .isEqualTo(NameRejection.TRAVERSAL)
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
