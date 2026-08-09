# git hook を有効化する（clone 後に1回だけ実行）。
# main / develop へのローカル直 push を pre-push hook で禁止する。
git config core.hooksPath .githooks
Write-Host "core.hooksPath = $(git config core.hooksPath)"
Write-Host "pre-push hook を有効化しました（main / develop への直 push を禁止）。"
