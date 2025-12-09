#!/bin/bash
# Stop Hook - 钉钉通知脚本（含对话摘要）

WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=38d31848e7b813c5c8a7d5cdf7a5cd41770f564a0b07f4bb81f24980f2983c3e"
SECRET="SEC4177649902135b8b3b17967f5d58ac34ea4e9ef44204e8e547ecfecf93b2c968"

# 读取 Hook Input（从 stdin）
HOOK_INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty')

# 展开 ~ 路径
TRANSCRIPT_PATH="${TRANSCRIPT_PATH/#\~/$HOME}"

# 默认值
LAST_QUESTION="无法获取"
LAST_RESPONSE="无法获取"
TOTAL_MESSAGES=0

# 解析对话历史
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    # 获取最后一条用户问题（type=user 且 content 是字符串）
    LAST_QUESTION=$(jq -r 'select(.type == "user" and (.message.content | type) == "string") | .message.content' "$TRANSCRIPT_PATH" 2>/dev/null | tail -1 | head -c 200)

    # 获取最后一条 Claude 文本响应
    LAST_RESPONSE=$(jq -r 'select(.type == "assistant") | .message.content[] | select(.type == "text") | .text' "$TRANSCRIPT_PATH" 2>/dev/null | tail -1 | head -c 300)

    # 消息总数
    TOTAL_MESSAGES=$(jq -r 'select(.type == "user" or .type == "assistant") | .type' "$TRANSCRIPT_PATH" 2>/dev/null | wc -l | tr -d ' ')
fi

# 处理空值
[ -z "$LAST_QUESTION" ] && LAST_QUESTION="无法获取"
[ -z "$LAST_RESPONSE" ] && LAST_RESPONSE="无法获取"

# 截断并添加省略号
if [ ${#LAST_QUESTION} -ge 200 ]; then
    LAST_QUESTION="${LAST_QUESTION}..."
fi
if [ ${#LAST_RESPONSE} -ge 300 ]; then
    LAST_RESPONSE="${LAST_RESPONSE}..."
fi

# 计算签名
timestamp=$(python3 -c "import time; print(int(time.time() * 1000))")
string_to_sign="${timestamp}"$'\n'"${SECRET}"
sign=$(printf '%s' "$string_to_sign" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64 | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip(), safe=''))")

# 构建完整 URL
url="${WEBHOOK}&timestamp=${timestamp}&sign=${sign}"

# 转义特殊字符（用于 JSON）
escape_json() {
    python3 -c "import json,sys; print(json.dumps(sys.stdin.read())[1:-1])"
}

ESCAPED_QUESTION=$(echo -n "$LAST_QUESTION" | escape_json)
ESCAPED_RESPONSE=$(echo -n "$LAST_RESPONSE" | escape_json)

# 发送通知
curl -s -X POST "$url" \
  -H "Content-Type: application/json" \
  -d "{
    \"msgtype\": \"markdown\",
    \"markdown\": {
      \"title\": \"Claude Code 任务完成\",
      \"text\": \"### ✅ Claude Code 任务完成\n\n**用户问题**\n\n${ESCAPED_QUESTION}\n\n**执行结果**\n\n${ESCAPED_RESPONSE}\n\n---\n\n> 📊 交互次数: ${TOTAL_MESSAGES} | ⏰ $(date '+%H:%M:%S')\"
    }
  }" > /dev/null 2>&1
