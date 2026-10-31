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

echo "⓪ 读取版本号（唯一来源 data/course.mjs 的 META.version）"
# 版本号只从 META 取，不在本脚本里另写一份 —— 两份写法必然漂移。
# 剥掉 v 前缀后必须是三段式：门户的实时端点正则只认 ^v?(\d+\.\d+\.\d+)$，
# 写成 v1.0 这类两段式会导致入口站取不到值、卡片永远显示静态旧值（已踩过）。
VER=$(node --input-type=module -e 'import { pathToFileURL } from "node:url"; const m = await import(pathToFileURL(process.argv[1]).href); process.stdout.write(String(m.META.version).replace(/^v/, ""))' "$ROOT/data/course.mjs")
# ⚠ 不能用 import('D:/...')：Windows 上 ESM 只认 file:// URL，裸盘符会抛
#   ERR_UNSUPPORTED_ESM_URL_SCHEME（'d:' 非法协议），且路径含空格时手工拼 file:// 同样会挂。
#   pathToFileURL 同时解决盘符与空格两件事。

echo "$VER" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || {
  echo "✗ 版本号 '$VER' 不是三段式（x.y.z）—— 入口站 /api/version 端点会读不到，先改 data/course.mjs"
  exit 1
}
echo "   $VER"

echo "① 本地重建 site/（确保产物与 data/course.mjs 一致）"
node "$ROOT/build-site.mjs" >/dev/null
echo "   完成：$(find "$ROOT/site" -name '*.html' | wc -l | tr -d ' ') 个页面"

echo "② 上传到 $HOST:$DIR"
tar -C "$ROOT/site" -czf - . | ssh "$HOST" "set -e
  rm -rf $DIR
  mkdir -p $DIR
  tar -C $DIR -xzf -
  printf '%s\n' '$VER' > $DIR/.deployed-version
  chown -R www-data:www-data $DIR
  chmod -R u=rwX,go=rX $DIR
  chmod 644 $DIR/.deployed-version"
# 哨兵为何要 chmod 644：入口站 nginx 用 alias 直接把它转成 /api/version/web-training，
# 由 nginx worker（www-data）读取；权限不对就是 403，门户会静默退回静态版本号。

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

# 版本哨兵：入口站 /api/version/web-training 读的就是这个文件。
# 内容或权限任一不对，卡片就会静默退回静态旧值 —— 属于"看起来正常、实际在撒谎"，必须当场失败。
sentinel=$(ssh "$HOST" "cat $DIR/.deployed-version" | tr -d '\r\n')
[ "$sentinel" = "$VER" ] || { echo "✗ 哨兵内容 '$sentinel' ≠ 版本 '$VER'"; exit 1; }
perm=$(ssh "$HOST" "stat -c '%a' $DIR/.deployed-version")
[ "$perm" = "644" ] || { echo "✗ 哨兵权限 $perm（应为 644，否则 nginx worker 读不到）"; exit 1; }

echo "✓ 已上线 $URL"
echo "  状态码 200 ｜ 裸域 301 ｜ 三层哈希一致 ${local_h:0:12} ｜ 哨兵 $sentinel ($perm)"
