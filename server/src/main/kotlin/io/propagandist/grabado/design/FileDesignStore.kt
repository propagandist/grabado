package io.propagandist.grabado.design

import io.propagandist.grabado.config.GrabadoProperties
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.concurrent.ConcurrentHashMap
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
class FileDesignStore(properties: GrabadoProperties) : DesignStore {

    /** 正本ディレクトリ（絶対・正規化済み）。 */
    private val root: Path = properties.schemaDir.toAbsolutePath().normalize()

    /**
     * keyword 単位のロック（段階5-4）。条件付き更新の CAS を成立させるために要る。
     *
     * 設計名の数は有限（1 リポジトリぶん）なので、エントリが残り続けても実害は無い。
     */
    private val locks = ConcurrentHashMap<String, Any>()

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
        // 書き込み可能性を要求するのは、保存する気がある場合だけ（段階5-3）。
        // READONLY のビューアは読み取り専用マウントでも起動できるべき。
        if (!properties.readonly) {
            check(Files.isWritable(root)) { "正本ディレクトリに書けない: $root" }
        }
    }

    override fun list(): List<String> =
        Files.newDirectoryStream(root).use { stream ->
            stream.asSequence()
                .filter { it.isRegularFile() }
                .map { it.name }
                .filterNot { it.startsWith(".") }
                // 段階5-2: 正本ディレクトリは README や .gitattributes と同居しうる。
                // 設計として扱うのは *.json だけ（判定は大小無視。DesignName と同じ規則）。
                .filter { it.endsWith(".json", ignoreCase = true) }
                .sorted() // String の自然順。Collator は使わない（ロケール依存＝非決定論）
                .toList()
        }

    override fun load(name: DesignName): Stored? {
        val path = resolve(name)
        if (!path.isRegularFile()) {
            return null
        }
        val bytes = Files.readAllBytes(path)
        return Stored(bytes, ETags.of(bytes))
    }

    override fun save(name: DesignName, bytes: ByteArray, ifMatch: String?, ifNoneMatch: String?): String {
        /*
         * ★ 「読む → 比べる → 書く」を keyword 単位のロックで囲む（段階5-4）。
         *   囲まないと 412 は「たいてい正しい」だけの機能になり、read-before-write に
         *   残っていた TOCTOU の窓を閉じる目的を果たさない。
         *
         *   ロックは同じ JVM の中でしか効かない。**正本ディレクトリを複数プロセスで共有する
         *   構成は想定していない**（各自ローカルの単一コンテナ。HANDOVER §2.1）。
         */
        val lock = locks.computeIfAbsent(name.value) { Any() }
        synchronized(lock) {
            val current = load(name)?.etag
            if (ifMatch != null && !ETags.ifMatchSatisfied(ifMatch, current)) {
                throw PreconditionFailedException()
            }
            if (ifNoneMatch != null && !ETags.ifNoneMatchSatisfied(ifNoneMatch, current)) {
                throw PreconditionFailedException()
            }
            writeAtomically(resolve(name), bytes)
            return ETags.of(bytes)
        }
    }

    /**
     * 同じディレクトリの一時ファイルへ書いてから置き換える。
     *
     * マウント先は **git が見ているディレクトリ**なので、部分書き込みは
     * 「壊れた設計ファイルがコミットされる」に直結する。
     */
    private fun writeAtomically(path: Path, bytes: ByteArray) {
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
