#!/bin/sh
#
# 正本ディレクトリの所有者に合わせてから、アプリを非 root で起こす（issue #103）。
#
# ★ **なぜ要るのか**
#   bind mount は**ホスト側の所有権をそのまま通す**。イメージが固定の uid で走ると、
#   Linux ホストでは 2 方向に壊れる:
#
#     1. **コンテナが書けない** —— mount 先は clone した人の uid。FileDesignStore の
#        起動時 fail-fast が `正本ディレクトリに書けない` で止める（段階5-3 の設計どおり）。
#     2. **書けたものをホストが読めない** —— 1 を回避しても、Files.createTempFile が
#        **POSIX 0600** で作ったものが ATOMIC_MOVE されるので、保存された JSON は
#        **600・コンテナの uid 所有**。**自分の設計を git add できない。**
#
#   **降りる先を mount 先の所有者に合わせると、両方同時に消える。**
#
# ★ **chown しない。** mount 先を chown すると**ホスト側のファイルの所有者が変わる**
#   —— 症状 2 を直すどころか悪化させる。**動かすのはコンテナ側の uid だけ。**
#
# ★ **uid 0 のときは降り先を既定の grabado にする。**
#   Docker Desktop for Windows / macOS は所有権を偽装して **uid=0 gid=0 mode=777** を返す
#   （2026-08-27 実測）。mount していないときも 0 になる。**どちらも「ホストの uid が
#   分からない」場合**なので、イメージが用意した非 root ユーザーへ降りる（従来どおり）。
#
# ★ **root のまま走らせない。** このスクリプトだけが root で、**アプリは必ず su-exec で
#   降りた先で動く**。exec するので **PID 1 は java** になり、SIGTERM が直接届く
#   （Spring Boot の graceful shutdown が効く）。
set -eu

# 値の正本は application.yaml（GRABADO_SCHEMA_DIR）。ここは mount 先を知るためだけに読む。
schema_dir="${GRABADO_SCHEMA_DIR:-/data/schema}"

if [ ! -d "$schema_dir" ]; then
    # 起動時 fail-fast は FileDesignStore の仕事。ここでは判断せず、そのまま渡す
    # （「無い」と「書けない」を別の場所で二重に判定しない）。
    exec su-exec grabado "$@"
fi

owner_uid="$(stat -c '%u' "$schema_dir")"
owner_gid="$(stat -c '%g' "$schema_dir")"

if [ "$owner_uid" = "0" ]; then
    exec su-exec grabado "$@"
fi

exec su-exec "${owner_uid}:${owner_gid}" "$@"
