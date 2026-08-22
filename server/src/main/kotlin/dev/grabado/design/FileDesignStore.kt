package dev.grabado.design

import dev.grabado.config.GrabadoProperties
import org.springframework.stereotype.Component
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import kotlin.io.path.isRegularFile
import kotlin.io.path.name

/**
 * 正本ディレクトリへのファイル I/O。**`java.nio` に触るのはこのクラスだけ。**
 *
 * 正本は git 管理のファイル（CLAUDE.md 制約2）なので、次の 2 つがこの実装の要になる:
 *
 * - **原子的な置換**。同じディレクトリの一時ファイルへ書いてから `ATOMIC_MOVE` する。
 *   途中で落ちても正本は壊れない —— 半端に書かれた JSON が `git add` される事故を防ぐ。
 * - **二重の防御**。[DesignName] が純粋な門として `..` やパス区切りを弾いているが、
 *   ここでも解決後のパスが正本ディレクトリ直下であることを確かめる。
 *
 * in-memory の double は作らない。store の面白い失敗（原子性・UTF-8 のファイル名・
 * symlink・Windows の大小無視 FS）は**実 FS にしか無い**ので、double を相手にした
 * テストは空虚になる。テストは `@TempDir` ＋ この実装で書く。
 */
@Component
class FileDesignStore(properties: GrabadoProperties) : DesignStore {

    /** 正本ディレクトリ（絶対・正規化済み）。 */
    private val root: Path = properties.schemaDir.toAbsolutePath().normalize()

    init {
        /*
         * ★ 起動時 fail-fast。
         *
         * mount を忘れたままコンテナを起動すると、書き込み先がコンテナ内 fs になり、
         * コンテナを捨てた瞬間に設計が消える。「起動はするが save のたびに 500」も
         * 同じくらい悪い。**駄目なら起動させない。**
         */
        check(Files.exists(root)) { "正本ディレクトリが無い: $root（grabado.schema-dir / GRABADO_SCHEMA_DIR）" }
        check(Files.isDirectory(root)) { "正本ディレクトリがディレクトリでない: $root" }
        check(Files.isReadable(root)) { "正本ディレクトリを読めない: $root" }
        // 段階5-3 で READONLY が入ったら、書き込み可能性の要求はそちらの分岐に移す。
        check(Files.isWritable(root)) { "正本ディレクトリに書けない: $root" }
    }

    override fun list(): List<String> =
        Files.newDirectoryStream(root).use { stream ->
            stream.asSequence()
                .filter { it.isRegularFile() }
                .map { it.name }
                .filterNot { it.startsWith(".") }
                .sorted() // String の自然順。Collator は使わない（ロケール依存＝非決定論）
                .toList()
        }

    override fun load(name: DesignName): ByteArray? {
        val path = resolve(name)
        return if (path.isRegularFile()) Files.readAllBytes(path) else null
    }

    override fun save(name: DesignName, bytes: ByteArray) {
        val path = resolve(name)
        // 一時ファイルは同じディレクトリに作る。別 fs だと ATOMIC_MOVE ができない。
        // `.` 始まりなので list には出ない。
        val tmp = Files.createTempFile(root, ".grabado-", ".tmp")
        try {
            Files.write(tmp, bytes)
            try {
                Files.move(tmp, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (_: AtomicMoveNotSupportedException) {
                // ATOMIC_MOVE を持たない fs（一部のネットワークマウント）へのフォールバック。
                Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING)
            }
        } catch (e: Throwable) {
            Files.deleteIfExists(tmp)
            throw e
        }
    }

    /**
     * 名前を正本ディレクトリ配下の 1 ファイルに解決する。
     *
     * [DesignName] を通っていても、ここで**もう一度**確かめる。門は 2 つあってよい。
     */
    private fun resolve(name: DesignName): Path {
        val path = root.resolve(name.value).normalize()
        check(path.parent == root) { "正本ディレクトリの外を指している: $path" }
        return path
    }
}
