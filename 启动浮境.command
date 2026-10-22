#!/bin/zsh
cd -- "$(dirname -- "$0")"
task_node="$(command -v node)"
if [[ -z "$task_node" && -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  task_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ -z "$task_node" ]]; then
  echo '请先安装 Node.js 20 或以上版本，再运行此文件。'
  read '?按回车关闭…'
  exit 1
fi
echo '苍岚浮境：启动后请在浏览器打开 http://127.0.0.1:4173'
"$task_node" scripts/serve.mjs
