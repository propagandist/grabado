package io.propagandist.grabado.design

import io.propagandist.grabado.config.GrabadoProperties
import org.slf4j.LoggerFactory
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
 * ★ **正本ディレクトリが無いまま起きることがある**（**READONLY のときだけ**。issue #286）。
 *   **その 1 点だけが [absent] に集まっている。**
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

    /** 下の 1 行のためだけに持つ（`server/main` で logger を使うのは AI の費用計測とここだけ）。 */
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * **正本ディレクトリが無いまま起きた**（issue #286）。**READONLY のときだけ真になる。**
     *
     * 触るのは [list] だけでよい —— [load] は解決したパスを `isRegularFile` で見るので、
     * ディレクトリが無くても `null`（＝ 404）を返す。[save] は READONLY のとき
     * [ReadOnlyDesignStore] が先に 403 を返すので **到達しない**（仮に不変条件が崩れても
     * `Files.createTempFile` が落ちて 500 —— **書けない場所へ書けたことにはならない**ので、
     * 到達しない `if` をここに足さない。禁止は [ReadOnlyDesignStore] の 1 か所に置く）。
     *
     * ★ **起動時に 1 度決めて、動かさない。** 要求のたびに fs を見ると、同じデプロイの
     *   2 つの応答が別のことを言いうる（[list] の並びをロケール非依存で固定したのと同じ価値観）。
     *   **起動後に消えた**ときは今までどおり例外＝ 500 —— 在ったものが消えたのは**故障**で、
     *   「0 件」と答えるのは嘘になる。**その嘘は #202 の事故の実行時版**（mount が外れた
     *   書けるデプロイが、空のビューアに化ける）。
     *
     * ★ **`!Files.exists` ではなく `Files.notExists`。** 状態が分からないとき（親を辿れない等）は
     *   **どちらも false** —— そのとき [absent] は false になり、下の `check(Files.exists(root))` で
     *   **起動しない側へ倒れる**。**「無いと確かめられた」ときだけ 0 件で起こす。**
     */
    private val absent: Boolean = properties.readonly && Files.notExists(root)

    init {
        /*
         * ★ 起動時 fail-fast。
         *
         * mount を忘れたままコンテナを起動すると、書き込み先がコンテナ内 fs になり、
         * コンテナを捨てた瞬間に設計が消える。「起動はするが save のたびに 500」も
         * 同じくらい悪い。**駄目なら起動させない。**
         *
         * ★★ **この宣言は 2026-09-09（issue #202）まで効いていなかった。** `Dockerfile` が
         * `mkdir -p /data/schema` で正本ディレクトリを**イメージに焼いていた**ので、
         * mount を省いても下の 4 つの check が全部通っていた —— **防ぐと書いてある事故が
         * そのまま起きていた**。Dockerfile 側から `mkdir` と `chown` を外して一致させた。
         *
         * ★ **ここは 1 行も変えていない。** 動かしたのは Dockerfile だけで、意図の側は
         * 最初から正しかった。実測は `CUSTOMIZATIONS.md` の 2026-09-09。
         *
         * ★★ **その「1 行も変えていない」は 2026-09-12 に終わった**（issue #286）。
         * **止めると決めた事故は 1 つも見逃していない。緩めたのは条件を 1 つだけ** ——
         * **READONLY のときは、正本ディレクトリが無くてよい**（[absent]）。
         *
         * 上が防ぐと書いた事故は「**保存したものが、コンテナを捨てた瞬間に消える**」で、
         * **保存できないデプロイでは原理的に起きない**。判定の軸は「ディレクトリが在るか」
         * ではなく「**書き込み先が要るか（= `!readonly`）**」で、下の `isWritable` は段階5-3 から
         * その軸に乗っていた。**`exists` だけが乗っていなかった** —— #202 は Dockerfile だけを
         * 動かしたので、この非対称がそのまま残り、**mount を持たない契約の公開デモ
         * （`docs/ARCHITECTURE.md` §9.7）が v0.4.0 以降のすべての版で起動しなくなっていた**
         * （2026-09-12 に `grabado.dev` が 502 を返した。実測は `CUSTOMIZATIONS.md` の同日）。
         *
         * ★ **READONLY でも「在るのに壊れている」は今までどおり止める。** 例外にするのは
         *   「**無い**」だけ —— 何かが在るのにファイルだったり読めなかったりするのは
         *   **mount を意図した人が居て、それが失敗している**状態で、0 件で起こすと
         *   **その人の設計が見えないまま正常に見える**。
         */
        if (absent) {
            /*
             * ★ **消した信号の代わりに、いちばん弱い信号を 1 本置く。** READONLY の他の 3 つ
             *   （save の 403 / introspection / AI）は `?action=capabilities` に出るのに、
             *   **「設計が 0 件なのは、見に行く先が無いからだ」だけは HTTP のどこにも出ない**
             *   —— 公開デモは 0 件が正常なので、**mount のタイポと症状で区別が付かない**。
             *
             * ★ **WARN にしない。** §9.7 は mount 無しを**正しい構成として宣言している**ので、
             *   祝福された構成で毎回 WARN を出すと、**人が WARN を読まなくなる**。
             *   アプリは「意図した mount 無し」と「タイポ」を区別できない —— **できない判断を
             *   語で主張せず、観測だけを述べて判断は読む人に返す。**
             */
            log.info(
                "READONLY で正本ディレクトリが無いので、設計 0 件で起動する: {}（grabado.schema-dir / GRABADO_SCHEMA_DIR）",
                root,
            )
        } else {
            check(Files.exists(root)) { "正本ディレクトリが無い: $root（grabado.schema-dir / GRABADO_SCHEMA_DIR）" }
            check(Files.isDirectory(root)) { "正本ディレクトリがディレクトリでない: $root" }
            check(Files.isReadable(root)) { "正本ディレクトリを読めない: $root" }
            // 書き込み可能性を要求するのは、保存する気がある場合だけ（段階5-3）。
            // READONLY のビューアは読み取り専用マウントでも起動できるべき。
            if (!properties.readonly) {
                check(Files.isWritable(root)) { "正本ディレクトリに書けない: $root" }
            }
        }
    }

    override fun list(): List<String> {
        /*
         * 正本ディレクトリが無いまま起きたデプロイ（issue #286）。**0 件で答える。**
         * ここを通すと `NoSuchFileException` ＝ **500** になり、§9.7 の「`list` は 0 件を返す」を
         * 満たせない —— **起動できても、公開デモの画面は壊れたままになる。**
         */
        if (absent) {
            return emptyList()
        }
        return Files.newDirectoryStream(root).use { stream ->
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
