# AI 集成规范

> Kimi / DeepSeek 等 AI 服务集成指南

## 支持的 AI 服务

| 服务 | 提供商 | 特点 | API 文档 |
|------|--------|------|---------|
| Kimi | 月之暗面 | 超长上下文 200K | https://platform.moonshot.cn/docs |
| DeepSeek | DeepSeek | 性价比高，推理能力强 | https://platform.deepseek.com/api-docs |

### Kimi (Moonshot AI) 详情

- **Base URL**: `https://api.moonshot.cn/v1`
- **认证方式**: Bearer Token
- **API 密钥申请**: https://platform.moonshot.cn/console/api-keys

**可用模型与定价**:

| 模型 | 上下文长度 | 定价 (每千 token) |
|------|-----------|------------------|
| moonshot-v1-8k | 8K | ¥0.012 |
| moonshot-v1-32k | 32K | ¥0.024 |
| moonshot-v1-128k | 128K | ¥0.06 |
| kimi-k2 | 256K | 见官网 |

### DeepSeek 详情

- **Base URL**: `https://api.deepseek.com`
- **认证方式**: Bearer Token
- **API 密钥申请**: https://platform.deepseek.com/

**可用模型**:

| 模型 | 说明 |
|------|------|
| deepseek-chat | DeepSeek V3.2 非思考模式 |
| deepseek-reasoner | DeepSeek R1 思考模式 |

## 配置

### 环境变量

在 `backend/.env` 中配置：

```env
# AI 服务配置
KIMI_API_KEY=your_kimi_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
DEFAULT_AI_PROVIDER=kimi  # 默认服务: kimi / deepseek
```

### 获取 API Key

**Kimi**:
1. 访问 https://platform.moonshot.cn/
2. 注册账号并登录
3. 进入控制台 → API Keys → 创建新密钥

**DeepSeek**:
1. 访问 https://platform.deepseek.com/
2. 注册账号并登录
3. 进入 API Keys 页面 → 创建密钥

## 代码结构

```
backend/app/clients/ai/
├── __init__.py      # 模块入口，get_ai_client() 工厂函数
├── base.py          # AIClient 抽象基类
├── kimi.py          # Kimi 客户端实现
└── deepseek.py      # DeepSeek 客户端实现
```

## 使用方式

### 获取客户端

```python
from app.clients.ai import get_ai_client

# 使用工厂函数获取客户端
client = get_ai_client("kimi", api_key="your_api_key")

# 或使用配置中的密钥
from app.config import settings
client = get_ai_client(settings.default_ai_provider, settings.kimi_api_key)
```

### 发送聊天请求

```python
from app.clients.ai import ChatMessage

messages = [
    ChatMessage(role="system", content="你是一个数据分析助手"),
    ChatMessage(role="user", content="分析这些数据..."),
]

response = await client.chat(messages, temperature=0.7)
print(response.content)
print(f"消耗 tokens: {response.tokens_used}")
```

### 数据分析

```python
# 生成摘要
response = await client.summarize(data_text, focus="通话时长趋势")

# 异常检测
response = await client.detect_anomalies(data_text, threshold="时长超过30分钟")

# 基于数据问答
response = await client.answer_question(data_text, "哪个部门通话量最高？")
```

## AIClient 接口定义

```python
class AIClient(ABC):
    """AI 客户端抽象基类"""

    @property
    def provider_name(self) -> str:
        """提供商名称"""

    @property
    def default_model(self) -> str:
        """默认模型名称"""

    async def chat(
        self,
        messages: list[ChatMessage],
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> ChatResponse:
        """聊天接口"""

    async def analyze(self, data: str, prompt: str, system_prompt: str | None = None) -> ChatResponse:
        """数据分析"""

    async def summarize(self, data: str, focus: str | None = None) -> ChatResponse:
        """生成摘要"""

    async def detect_anomalies(self, data: str, threshold: str | None = None) -> ChatResponse:
        """异常检测"""

    async def answer_question(self, data: str, question: str, history: list[ChatMessage] | None = None) -> ChatResponse:
        """智能问答"""
```

## 模型选择

### Kimi 模型

| 模型 | 上下文长度 | 适用场景 |
|------|-----------|---------|
| moonshot-v1-8k | 8K tokens | 短对话、简单任务 |
| moonshot-v1-32k | 32K tokens | 中等长度文档分析 |
| moonshot-v1-128k | 128K tokens | 大规模数据分析 |

```python
# 自动选择模型
from app.clients.ai.kimi import KimiClient

client = KimiClient(api_key)
model = client.select_model_by_context(estimated_tokens=50000)
# 返回: "moonshot-v1-128k"
```

### DeepSeek 模型

| 模型 | 特点 |
|------|------|
| deepseek-chat | 通用对话 |
| deepseek-coder | 代码生成 |

## 错误处理

```python
from app.clients.ai import AIClientError

try:
    response = await client.chat(messages)
except AIClientError as e:
    print(f"AI 服务错误: {e.message}")
    print(f"错误代码: {e.code}")
```

常见错误：
- `401` - API Key 无效
- `429` - 请求频率超限
- `timeout` - 请求超时（默认 120 秒）

## 分析服务

### 服务位置

`backend/app/services/ai_analysis_service.py`

### 可用函数

```python
from app.services import ai_analysis_service as ai_svc

# 生成数据摘要
result = await ai_svc.generate_summary(session, start_time, end_time, filters, provider)

# 趋势分析
result = await ai_svc.analyze_trend(session, start_time, end_time, focus, provider)

# 异常检测
result = await ai_svc.detect_anomalies(session, start_time, end_time, threshold, provider)

# 智能问答
result = await ai_svc.chat_with_data(session, question, history, provider)

# 获取历史记录
results, total = ai_svc.get_analysis_history(session, analysis_type, limit, offset)
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/analysis/summary` | 生成数据摘要 |
| POST | `/api/v1/analysis/trend` | 趋势分析 |
| POST | `/api/v1/analysis/anomaly` | 异常检测 |
| POST | `/api/v1/analysis/chat` | 智能问答 |
| GET | `/api/v1/analysis/history` | 分析历史 |
| GET | `/api/v1/analysis/providers` | 可用 AI 服务列表 |

### 请求示例

```bash
# 生成摘要
curl -X POST "http://localhost:8847/api/v1/analysis/summary?api_key=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "ai_provider": "kimi",
    "date_start": "2024-01-01T00:00:00",
    "date_end": "2024-01-31T23:59:59",
    "max_records": 500
  }'

# 智能问答
curl -X POST "http://localhost:8847/api/v1/analysis/chat?api_key=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "哪个部门的通话量最高？",
    "ai_provider": "kimi",
    "context_records": 100
  }'
```

## 数据格式化

AI 分析前会将数据格式化为文本：

```python
def _format_records_for_ai(records: list[CallRecord], max_chars: int = 50000) -> str:
    """将记录格式化为 AI 可读的文本"""
    # 每条记录格式:
    # [1] 时间: 2024-01-15 10:30:00, 主叫: 13800138000, 被叫: 客户A, 时长: 120秒, ...
```

注意事项：
- 默认最大字符数 50000（约 25000 tokens）
- 超出限制会截断并提示
- Kimi 支持更长上下文，可适当增加

## 成本控制

### Token 估算

```python
# Kimi 提供 token 计数 API
from app.clients.ai.kimi import KimiClient

client = KimiClient(api_key)
tokens = await client.count_tokens(messages)
```

### 限制建议

- 单次分析默认最多 500 条记录
- 智能问答上下文默认 100 条记录
- 根据实际需求和成本调整

## 扩展新 AI 服务

1. 在 `backend/app/clients/ai/` 创建新客户端文件
2. 继承 `AIClient` 基类
3. 实现 `chat()` 方法
4. 在 `__init__.py` 的 `get_ai_client()` 中注册
5. 在 `config.py` 添加 API Key 配置

```python
# 示例: 添加通义千问
class QwenClient(AIClient):
    @property
    def provider_name(self) -> str:
        return "qwen"

    @property
    def default_model(self) -> str:
        return "qwen-turbo"

    async def chat(self, messages, **kwargs) -> ChatResponse:
        # 实现通义千问 API 调用
        ...
```

## 数据库配置管理

配置存储在 `ai_configs` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| provider | str | 提供商 (kimi/deepseek) |
| name | str | 配置名称 |
| api_key | str | API 密钥 |
| base_url | str | API 基础 URL |
| default_model | str | 默认模型 |
| is_active | bool | 是否启用 |
| notes | str | 备注 |

### 后台配置

1. 登录后台管理系统
2. 进入 **系统设置 > AI 配置**
3. 点击"添加配置"
4. 选择提供商（Kimi/DeepSeek）
5. 输入配置名称和 API 密钥
6. 选择默认模型
7. 点击"测试"验证连接

### 配置 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/ai-configs` | GET | 获取配置列表 |
| `/api/v1/ai-configs` | POST | 创建配置 |
| `/api/v1/ai-configs/presets` | GET | 获取提供商预设 |
| `/api/v1/ai-configs/{id}` | GET | 获取单个配置 |
| `/api/v1/ai-configs/{id}` | PUT | 更新配置 |
| `/api/v1/ai-configs/{id}` | DELETE | 删除配置 |
| `/api/v1/ai-configs/{id}/test` | POST | 测试连接 |

## 注意事项

1. **API 密钥安全**: 不要在代码中硬编码 API 密钥，使用数据库配置管理
2. **限流**: 注意各服务的请求限制，合理控制调用频率
3. **成本控制**: 监控 token 使用量，避免超支
4. **错误处理**: 处理网络超时、API 错误等异常情况
5. **模型选择**: 根据任务复杂度选择合适的模型，平衡性能和成本

## 参考链接

- Kimi 开放平台: https://platform.moonshot.cn/
- DeepSeek 开放平台: https://platform.deepseek.com/
- OpenAI SDK 文档: https://github.com/openai/openai-python
