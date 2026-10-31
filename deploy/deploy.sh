#!/usr/bin/env bash
# 发布 web-training 到腾讯云（主机别名见 ~/.ssh/config 的 wx-tencent）
#
#   bash deploy/deploy.sh
#
# 前提：~/.ssh/config 里有别名 wx-tencent（root + pfc_ci），本机能 ssh 通。
# 为什么用 tar over ssh 而不是 rsync：本机 Git Bash 没装 rsync，
# 而 tar 是现成的；同一条链路课程 M17 讲的也是它。
#
# ⚠️ 这是覆盖式发布：服务器目录先清空再解包。
#    所以别往 /var/www/web-training 里手改东西 —— 下次发布就没了。
set -euo pipefail

HOST=wx-tencent
DIR=/var/www/web-training
URL=https://www.web-training.power-knowledge.tech
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "① 本地重建 site/（确保产物与 data/course.mjs 一致）"
node "$ROOT/build-site.mjs" >/dev/null
echo "   完成：$(find "$ROOT/site" -name '*.html' | wc -l | tr -d ' ') 个页面"

echo "② 上传到 $HOST:$DIR"
tar -C "$ROOT/site" -czf - . | ssh "$HOST" "set -e
  rm -rf $DIR
  mkdir -p $DIR
  tar -C $DIR -xzf -
  chown -R www-data:www-data $DIR
  chmod -R u=rwX,go=rX $DIR"

echo "③ 三层核验（状态码 / 线上内容 / 服务器落盘）"
code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/")
[ "$code" = "200" ] || { echo "✗ 首页状态码 $code"; exit 1; }

local_h=$(sha256sum "$ROOT/site/index.html" | cut -d' ' -f1)
wire_h=$(curl -s "$URL/" | sha256sum | cut -d' ' -f1)
disk_h=$(ssh "$HOST" "sha256sum $DIR/index.html" | cut -d' ' -f1)

if [ "$local_h" != "$wire_h" ] || [ "$wire_h" != "$disk_h" ]; then
  echo "✗ 内容不一致"
  echo "   本地 ${local_h:0:12} / 线上 ${wire_h:0:12} / 落盘 ${disk_h:0:12}"
  exit 1
fi

# 裸域必须 301 到 www，否则 canonical 与实际入口不一致
bare=$(curl -s -o /dev/null -w '%{http_code}' "https://web-training.power-knowledge.tech/")
[ "$bare" = "301" ] || { echo "✗ 裸域未 301（$bare）"; exit 1; }

echo "✓ 已上线 $URL"
echo "  状态码 200 ｜ 裸域 301 ｜ 三层哈希一致 ${local_h:0:12}"
