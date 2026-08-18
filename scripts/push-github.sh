#!/bin/bash
# 一键推送 v2.9.9 + 创建 GitHub Release + 上传安装包
# 用法：bash scripts/push-github.sh
# 前置：本机已开 Steam++ GitHub 加速（hosts 劫持），或确保其他通道能连 api.github.com
# Token 内嵌在 git remote URL（已配），直接复用

set -e
cd "$(dirname "$0")/.."

RELEASE_DIR="release/v2.9.9"
TAG="v2.9.9"
TITLE="v2.9.9"
NOTES='## 灼灼直播控场 v2.9.9 (2026-08-18)

### 快捷回复 chip 全面优化
- 移除无用的复制按钮；chip 加 \`min-width: 0\` 修复长句换行，\`max-width\` 200→180px 更紧凑
- 发送模式 chip 支持长按拖拽排序（仿手机桌面图标），300ms 长按浮起 + 拖动换位
- 修复拖拽换位 bug：目标位置计算排除被拖 chip 自己 + store 越界时插末尾
- 顺带修复历史直播间 chip 拖拽的同源 bug

### 配色统一
- 清理 5 处旧橙色残留（hover/阴影/滚动条/暂停光晕）→ 粉系主色 \`#f0506e\`

### 体验细节
- 6 张 README 截图全部更新为 v2.9.9 新 UI（暗色主题 + 粉色主色）
- 新增 \`scripts/capture-screenshots.cjs\` 自动化截图工具

### 校验
- mac/win/linux 三平台构建通过（CI: lint + test + build）'

# 1. git push（Steam++ 加速通道配置）
echo "=== 1/3 推送代码 ==="
git -c http.curlopt.resolv=127.0.0.1:443 -c http.sslVerify=false push origin master

# 2. 创建 Release
echo "=== 2/3 创建 Release ${TAG} ==="
TOKEN=$(git remote get-url origin | sed -nE 's#.*://[^:]+:([^@]+)@.*#\1#p')
[ -z "$TOKEN" ] && { echo "未找到 token（remote URL 未内嵌）"; exit 1; }

RELEASE_JSON=$(curl -sS -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d "$(node -e "console.log(JSON.stringify({tag_name:'$TAG',name:'$TITLE',body:process.argv[1],draft:false,prerelease:false}))" "$NOTES")" \
  https://api.github.com/repos/coolestgaim/douyin-live-info-master/releases)

UPLOAD_URL=$(echo "$RELEASE_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.upload_url||'');})")
RELEASE_HTML=$(echo "$RELEASE_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.html_url||j.message||'');})")
if [ -z "$UPLOAD_URL" ]; then
  echo "创建 Release 失败：$RELEASE_JSON"
  exit 1
fi
echo "Release: $RELEASE_HTML"

# 3. 上传资产
echo "=== 3/3 上传安装包 ==="
for FILE in "$RELEASE_DIR/DouyinLiveInfo-2.9.9-Portable.exe" "$RELEASE_DIR/DouyinLiveInfo Setup 2.9.9.exe"; do
  [ -f "$FILE" ] || { echo "跳过（不存在）: $FILE"; continue; }
  NAME=$(basename "$FILE")
  echo "上传 $NAME ($(du -h "$FILE" | cut -f1))..."
  curl -sS -X POST \
    -H "Authorization: token $TOKEN" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @"$FILE" \
    "${UPLOAD_URL}&name=${NAME}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.state==='uploaded'?'✓ 上传完成':'× 失败: '+JSON.stringify(j));})"
done

echo ""
echo "全部完成："
echo "  代码：master @ $(git rev-parse --short HEAD)"
echo "  Release: $RELEASE_HTML"
