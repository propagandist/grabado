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

    /**
     * READONLY のときだけ許す例外（issue #286）—— **公開デモは mount を持たない**（§9.7）。
     * 保存できないデプロイでは「捨てた瞬間に消える」事故が原理的に起きないので、
     * **正本ディレクトリが無ければ設計 0 件で起こす。**
     */
    private fun readOnlyStore(dir: Path) = FileDesignStore(GrabadoProperties(dir, readonly = true))

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

        // ★ readonly は既定の false。**その既定がこのテストの主語**（issue #286 で READONLY
        //   だけが例外になったので、ここが「READONLY でない側」を押さえている）。
        assertThatThrownBy { FileDesignStore(GrabadoProperties(missing)) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("正本ディレクトリが無い")
    }

    @Test
    fun `READONLY なら、正本ディレクトリが無くても起動して list は 0 件`() {
        // mount を持たない公開デモの形（§9.7）。**v0.4.0 〜 v0.8.0 は、ここで落ちていた。**
        assertThat(readOnlyStore(root.resolve("does-not-exist")).list()).isEmpty()
    }

    @Test
    fun `READONLY で正本ディレクトリが無いとき、load は null（HTTP 404 になる）`() {
        // list だけ直して load を忘れると、症状は「0 件なのに開ける名前がある」になる
        assertThat(readOnlyStore(root.resolve("does-not-exist")).load(DesignName.parse("orders.json")))
            .isNull()
    }

    @Test
    fun `0 件で起きても、正本ディレクトリを作らない`() {
        // 「無ければ作る」で直すと、**書き先がコンテナ内 fs に戻る** ＝ issue #202 の事故に戻る
        val missing = root.resolve("does-not-exist")

        readOnlyStore(missing).list()

        assertThat(Files.notExists(missing)).isTrue()
    }

    @Test
    fun `READONLY でも、在るのにディレクトリでなければ起動しない`() {
        // **例外にするのは「無い」だけ。** 在るものが壊れているのは mount の失敗で、
        // 0 件で起こすと**その人の設計が見えないまま正常に見える**。
        val file = root.resolve("not-a-dir")
        Files.write(file, "x".toByteArray())

        assertThatThrownBy { readOnlyStore(file) }.isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun `正本ディレクトリがファイルなら起動しない`() {
        val file = root.resolve("not-a-dir")
        Files.write(file, "x".toByteArray())

        assertThatThrownBy { FileDesignStore(GrabadoProperties(file)) }
            .isInstanceOf(IllegalStateException::class.java)
    }
}
