package io.propagandist.grabado.config

import io.propagandist.grabado.design.DesignStore
import io.propagandist.grabado.design.FileDesignStore
import io.propagandist.grabado.design.ReadOnlyDesignStore
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Import
import java.nio.file.Path

/**
 * **「起動する」と「起動しない」を隣り合わせで見る**（issue #286）。
 *
 * [FileDesignStoreTest][io.propagandist.grabado.design.FileDesignStoreTest] はクラスを直接組むが、
 * **配布物で効くのは「Bean を作る途中で落ちる」経路**である（`@Bean` は遅延しないので、
 * 正本ディレクトリの検査は**起動そのもの**を止める）。そこをここが押さえる。
 *
 * ★ **Web サーバも他の Bean も起こさない**（`ApplicationContextRunner`）。前例は
 *   [AnthropicSuggestionSourceTest][io.propagandist.grabado.ai.AnthropicSuggestionSourceTest] の
 *   起動時検査で、**env から `@ConfigurationProperties` へ束縛される経路は本番と同じ**。
 */
class StoreConfigurationTest {

    /** [StoreConfiguration] の組み立てだけを起こす最小の文脈。 */
    @Configuration
    @EnableConfigurationProperties(GrabadoProperties::class)
    @Import(StoreConfiguration::class)
    class StoreOnly

    private fun runner(schemaDir: Path) = ApplicationContextRunner()
        .withUserConfiguration(StoreOnly::class.java)
        .withPropertyValues("grabado.schema-dir=$schemaDir")

    @Test
    fun `READONLY なら、正本ディレクトリが無くても起動する`(@TempDir base: Path) {
        // mount を持たない公開デモの形（§9.7）。**ここが赤くなると grabado.dev が 502 を返す。**
        runner(base.resolve("does-not-exist"))
            .withPropertyValues("grabado.readonly=true")
            .run { context ->
                assertThat(context).hasNotFailed()
                assertThat(context.getBean(DesignStore::class.java))
                    .isInstanceOf(ReadOnlyDesignStore::class.java)
            }
    }

    @Test
    fun `READONLY でなければ、正本ディレクトリが無いと起動しない`(@TempDir base: Path) {
        // issue #202。**この 1 本が緑でなくなったら、issue #286 の修正が行き過ぎている。**
        runner(base.resolve("does-not-exist")).run { context ->
            assertThat(context).hasFailed()
            assertThat(context.startupFailure)
                .rootCause()
                .hasMessageContaining("正本ディレクトリが無い")
        }
    }

    @Test
    fun `正本ディレクトリが在れば、READONLY でなくても起動する`(@TempDir schemaDir: Path) {
        // 上の 2 本が「何を渡しても落ちる／落ちない」で緑になっていないことを、同じ文脈で確かめる
        runner(schemaDir).run { context ->
            assertThat(context).hasNotFailed()
            assertThat(context.getBean(DesignStore::class.java))
                .isInstanceOf(FileDesignStore::class.java)
        }
    }
}
