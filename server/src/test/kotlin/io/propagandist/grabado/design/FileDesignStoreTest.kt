package io.propagandist.grabado.design

import io.propagandist.grabado.config.GrabadoProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path

/**
 * 正本ディレクトリへの I/O。**Spring を 1 ミリも起動しない**（[GrabadoProperties] が
 * data class なのでコンストラクタで作れる）。
 *
 * in-memory の double は作らない —— store の面白い失敗（原子性・UTF-8 のファイル名・
 * 一時ファイルの後始末）は実 FS にしか無いので、`@TempDir` ＋ 実装で書く。
 */
class FileDesignStoreTest {

    @TempDir
    lateinit var root: Path

    private fun store() = FileDesignStore(GrabadoProperties(root))

    @Test
    fun `保存したバイト列がそのままファイルになる（内容を解釈しない）`() {
        val bytes = "{\"formatVersion\":2}\n".toByteArray(StandardCharsets.UTF_8)
        store().save(DesignName.parse("orders.json"), bytes)

        assertThat(Files.readAllBytes(root.resolve("orders.json"))).isEqualTo(bytes)
    }

    @Test
    fun `save と load はバイト単位で往復する`() {
        // BOM を足さない・末尾改行を勝手に付けない・改行を変換しない。
        val bytes = "<?xml version=\"1.0\"?>\r\n<sql db=\"mysql\"/>".toByteArray(StandardCharsets.UTF_8)
        val name = DesignName.parse("legacy.json")
        store().save(name, bytes)

        assertThat(store().load(name)?.bytes).isEqualTo(bytes)
    }

    @Test
    fun `日本語のファイル名が往復する`() {
        val name = DesignName.parse("受注.json")
        store().save(name, "{}".toByteArray(StandardCharsets.UTF_8))

        assertThat(store().list()).containsExactly("受注.json")
        assertThat(store().load(name)).isNotNull()
    }

    @Test
    fun `無いものは null（HTTP 404 になる）`() {
        assertThat(store().load(DesignName.parse("nope.json"))).isNull()
    }

    @Test
    fun `list は昇順で、dotfile を返さない`() {
        val s = store()
        s.save(DesignName.parse("b.json"), "{}".toByteArray())
        s.save(DesignName.parse("a.json"), "{}".toByteArray())
        s.save(DesignName.parse(".hidden.json"), "{}".toByteArray())

        // PHP の glob も dotfile を返さない。ついでに save の一時ファイルも見えなくなる。
        assertThat(s.list()).containsExactly("a.json", "b.json")
    }

    @Test
    fun `list はディレクトリを返さず、再帰もしない`() {
        Files.createDirectory(root.resolve("sub"))
        Files.write(root.resolve("sub").resolve("nested.json"), "{}".toByteArray())
        store().save(DesignName.parse("top.json"), "{}".toByteArray())

        assertThat(store().list()).containsExactly("top.json")
    }

    @Test
    fun `save は一時ファイルを残さない`() {
        store().save(DesignName.parse("orders.json"), "{}".toByteArray())

        val leftovers = Files.newDirectoryStream(root).use { it.map { p -> p.fileName.toString() } }
        assertThat(leftovers).containsExactly("orders.json")
    }

    @Test
    fun `上書きしても中身が混ざらない（短い内容で置き換える）`() {
        val name = DesignName.parse("orders.json")
        val s = store()
        s.save(name, "0123456789ABCDEF".toByteArray())
        s.save(name, "{}".toByteArray())

        // 追記でも truncate 忘れでもなく、置換であること。
        assertThat(s.load(name)?.bytes).isEqualTo("{}".toByteArray())
    }

    @Test
    fun `正本ディレクトリが無ければ起動しない`() {
        val missing = root.resolve("does-not-exist")

        assertThatThrownBy { FileDesignStore(GrabadoProperties(missing)) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("正本ディレクトリが無い")
    }

    @Test
    fun `正本ディレクトリがファイルなら起動しない`() {
        val file = root.resolve("not-a-dir")
        Files.write(file, "x".toByteArray())

        assertThatThrownBy { FileDesignStore(GrabadoProperties(file)) }
            .isInstanceOf(IllegalStateException::class.java)
    }
}
