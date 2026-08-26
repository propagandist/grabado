# grabado の配布イメージ（HANDOVER §2 / 段階2-1）。**契約は docs/ARCHITECTURE.md §9。**
#
#   docker build -t grabado .
#   docker run --rm -p 8080:8080 -v "$PWD/schema:/data/schema" grabado
#
# **compose で起こすなら compose.yaml**（mount と env の口はそこ。一覧は .env.example、
# 起動手順は README）。CSP と配信ヘッダは段階2-2。
#
# ★ 3 ステージ。**runtime に残るのは jar 1 本だけ**で、Node も Gradle も JDK も入らない。
#
# ★ ベースは digest でピンする（org security-baseline §5.1）—— タグだけでは、同じ Dockerfile
#   から違うものが入る。**末尾コメントの版表記を消さないこと**：Dependabot が digest と一緒に
#   書き換える対象で、消すとどの版か読めなくなる（.github/workflows/*.yml の action ピンと
#   同じ書式）。**ピンは Dependabot とセットで初めて安全**で、凍結したまま放置すると
#   セキュリティ修正が降りてこないぶん浮動タグより悪い（.github/dependabot.yml の docker entry）。
#
# ★ **レジストリへは publish しない**（段階2-0 の決めたこと 5）。イメージは各自が build する。


# ---------------------------------------------------------------------------
# 1) web —— フロントを束ねる（vite build -> /web/dist）
#
# ★ 版は ci-frontend.yml の `node-version: 24` に揃える。**CI と違うもので配布物を作らない。**
# ---------------------------------------------------------------------------
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS web

WORKDIR /web

# 依存の取得だけを先の層に置く。**package*.json が動かない限り再取得しない。**
COPY package.json package-lock.json ./
RUN npm ci

# 残りはビルドの入力そのもの。**何が入るかは .dockerignore の許可リストが唯一の正**
# ——ここに COPY を並べると、配るものの正本が 2 か所になる。
COPY . .
RUN npm run build


# ---------------------------------------------------------------------------
# 2) api —— jar を作る（bootJar -> grabado.jar）
#
# ★ **dist を static へ入れるのはこの COPY で、Gradle タスクにしない**（段階2-0 の決めたこと 2）
#   ——タスクにすると手元の `./gradlew bootJar` が Node のビルドを要求し、開発時の 2 プロセスと
#   `npm run test:server` が壊れる。代償として**手元の jar に static は入らない**ので、
#   **イメージの検証はイメージでやる**（2-4）。
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jdk-alpine@sha256:09349d79941fd53bb3d487b393ca118d8853c08c09193f416fe6a8718df9e732 AS api

WORKDIR /src

# wrapper が落とす Gradle 配布物は distributionSha256Sum が固定している
# （server/gradle/wrapper/gradle-wrapper.properties）—— **取りに行くものはハッシュで縛る。**
COPY server/ ./
COPY --from=web /web/dist ./src/main/resources/static

# ★ `sh ./gradlew` と書くのは、**実行ビットがホストの OS 次第**だから（Windows のチェック
#   アウトでは落ちる）。同じ Dockerfile がどこでビルドされても同じように動く形にする。
# ★ `--no-daemon`: 1 回しかビルドしないコンテナで daemon を残す意味が無い。
RUN sh ./gradlew bootJar --no-daemon


# ---------------------------------------------------------------------------
# 3) runtime —— jar だけを thin JRE で起こす（単一プロセスで static と API の両方を配る）
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jre-alpine@sha256:3137541deb3cac6626b5d9a4a2187bc0d6a34312f858bd2c67dd01e732e6b682

# ★ 非 root で走らせる。`/data/schema` は **save が書く先**（正本は git 管理のファイル。
#   CLAUDE.md 制約2）なので、先に作って所有権を渡す。**bind mount で uid が合わないと
#   書けない** —— compose は ./schema を mount する（リポジトリに実在させてある）。
#   **Linux ホストは未実測**で、注意は README。
RUN addgroup -S grabado && adduser -S -G grabado grabado \
 && mkdir -p /data/schema && chown grabado:grabado /data/schema

WORKDIR /app

# 名前は build.gradle.kts の archiveFileName が固定している（**ワイルドカードにしない**）。
COPY --from=api /src/build/libs/grabado.jar ./grabado.jar

USER grabado
EXPOSE 8080

# exec 形式なので PID 1 が java そのものになり、SIGTERM が直接届く
# （Spring Boot の graceful shutdown が効く）。
ENTRYPOINT ["java", "-jar", "/app/grabado.jar"]
