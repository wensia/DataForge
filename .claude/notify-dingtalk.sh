#!/bin/bash
# 钉钉机器人通知脚本

WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=38d31848e7b813c5c8a7d5cdf7a5cd41770f564a0b07f4bb81f24980f2983c3e"
SECRET="SEC4177649902135b8b3b17967f5d58ac34ea4e9ef44204e8e547ecfecf93b2c968"

# 计算时间戳（毫秒）- 兼容 macOS
timestamp=$(python3 -c "import time; print(int(time.time() * 1000))")

# 计算签名
string_to_sign="${timestamp}"$'\n'"${SECRET}"
sign=$(printf '%s' "$string_to_sign" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64 | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip(), safe=''))")

# 构建完整 URL
url="${WEBHOOK}&timestamp=${timestamp}&sign=${sign}"

# 获取消息内容（从参数或默认）
message="${1:-Claude Code 任务已完成}"
title="${2:-任务通知}"

# 发送通知并输出响应（便于调试）
response=$(curl -s -X POST "$url" \
  -H "Content-Type: application/json" \
  -d "{
    \"msgtype\": \"markdown\",
    \"markdown\": {
      \"title\": \"$title\",
      \"text\": \"### $title\n\n$message\n\n---\n> 时间: $(date '+%Y-%m-%d %H:%M:%S')\"
    }
  }")

echo "$response"
