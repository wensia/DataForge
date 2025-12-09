# 云客API客户端开发规则

> 云客CRM系统API客户端模块开发规范

## 概述

云客API客户端模块提供与云客CRM系统的API交互能力。所有API请求都应通过客户端类进行，以确保统一的错误处理和自动登录重试机制。

## 目录结构

```
backend/app/clients/yunke/
├── __init__.py      # 模块导出
├── base.py          # 基础配置（URL、Headers、Client工厂）
├── auth.py          # 认证相关独立函数（登录、获取密钥等）
├── client.py        # API客户端基类（YunkeApiClient）
├── report.py        # 报表API客户端（ReportClient）
├── record.py        # 录音API客户端（RecordClient）
└── call_log.py      # 通话记录API客户端（CallLogClient）
```

## 客户端架构

### 1. 基础配置 (base.py)

包含通用配置和工具函数：

| 函数/常量 | 说明 |
|-----------|------|
| `BASE_URL` | 云客API默认域名 |
| `get_common_headers()` | 获取通用请求头 |
| `get_browser_headers()` | 获取浏览器相关头 |
| `create_client()` | 创建httpx异步客户端 |

### 2. 客户端基类 (client.py)

`YunkeApiClient` 是所有API客户端的基类，提供：

#### 核心功能

- **自动登录重试**: 当检测到登录失效时，自动调用回调函数重新登录
- **密码错误终止**: 当检测到密码错误时，立即终止请求，不进行重试
- **统一错误处理**: 将响应码转换为异常类型

#### 异常类型

```python
YunkeApiException            # 通用API异常
YunkeLoginRequiredException  # 需要重新登录
YunkePasswordException       # 密码错误（不重试）
```

#### 错误码分类

```python
# 需要重新登录的错误码
RELOGIN_ERROR_CODES = {"10001", "10002", "401", "10003", "22003", "22004", "302"}

# 密码错误（不重试）
PASSWORD_ERROR_CODES = {"10004", "10005", "10006", "22001", "22002"}
```

### 3. API客户端类

每个业务模块创建独立的客户端类，继承自 `YunkeApiClient`：

```python
class ReportClient(YunkeApiClient):
    """报表API客户端"""
    
    async def get_call_index_detail(self, ...) -> dict:
        return await self._request(
            "POST",
            "/yunke-report-phone/module/getIndexDetail",
            json=payload,
            referer="/cms/home/reportform/call",
        )
```

## 添加新API的步骤

### Step 1: 确定API所属模块

| 类型 | 文件 | 说明 |
|------|------|------|
| 认证相关 | `auth.py` | 独立函数 |
| 报表相关 | `report.py` | ReportClient |
| 新业务模块 | 创建新文件 | 如 `customer.py` |

### Step 2: 创建API方法

```python
async def api_method_name(
    self,
    param1: str,
    param2: int = 10,
) -> dict[str, Any]:
    """API方法说明
    
    Args:
        param1: 参数1说明
        param2: 参数2说明
        
    Returns:
        dict: 返回数据说明
        
    Raises:
        YunkePasswordException: 密码错误
        YunkeApiException: API调用失败
    """
    payload = {
        "param1": param1,
        "param2": param2,
    }
    
    logger.info(f"调用API: param1={param1}")
    
    return await self._request(
        "POST",  # 或 "GET"
        "/api/path",
        json=payload,  # POST请求使用json
        # params=payload,  # GET请求使用params
        referer="/cms/page/path",  # 设置referer
    )
```

### Step 3: 导出新的客户端/方法

在 `__init__.py` 中添加导出：

```python
from app.clients.yunke.new_module import NewClient

__all__ = [
    # ...existing...
    "NewClient",
]
```

## 使用示例

### 基本使用

```python
from app.clients.yunke import ReportClient

# 创建客户端
client = ReportClient(
    phone="13800138000",
    company_code="2fy7qa",
    user_id="xxx",
    cookies={"user": "xxx", "userToken": "xxx"},
    domain="https://crm.yunkecn.com",
)

# 调用API
result = await client.get_outbound_call_report(
    start_date="2025-11-30",
    end_date="2025-11-30",
    depart_id="xxx",
)
```

### 配合自动登录

```python
from app.services.account_service import auto_login

async def get_auto_login_callback(account_id: int):
    """创建自动登录回调"""
    async def callback():
        return await auto_login(account_id)
    return callback

# 创建带自动登录的客户端
client = ReportClient(
    phone=account.phone,
    company_code=company.company_code,
    user_id=account.user_id,
    cookies=json.loads(account.cookies),
    domain=company.domain,
    auto_login_callback=await get_auto_login_callback(account.id),
)
```

## 请求头说明

云客API需要以下关键请求头：

| Header | 说明 | 来源 |
|--------|------|------|
| `company` | 公司代码 | 登录时获取 |
| `userid` | 用户ID | 登录响应中的id |
| `channel` | 渠道，固定 "4" | - |
| `source` | 来源，固定 "yunkepc" | - |
| `referer` | 来源页面 | 根据API设置 |

## Cookies说明

登录成功后，cookies中包含：

| Cookie | 说明 |
|--------|------|
| `user` | 用户信息（加密） |
| `userToken` | 用户Token（加密） |
| `JESONG_USER_ID` | 用户ID |

## 自动登录重试流程

```
发起请求
    ↓
检查响应 ─── 成功 ───→ 返回数据
    │
    ↓ 失败
判断错误类型
    │
    ├─ 密码错误 ───→ 抛出 YunkePasswordException（不重试）
    │
    └─ 登录失效 ───→ 调用 auto_login_callback
                         │
                         ├─ 成功 ───→ 更新凭证，重试请求
                         │
                         └─ 失败 ───→ 抛出异常
```

## 注意事项

1. **域名**: 不同公司可能使用不同的域名（如 `crm.yunkecn.com` 或 `crm2.yunkecn.com`）
2. **Token过期**: Token通常24小时内有效
3. **并发限制**: 避免短时间内发送大量请求
4. **日志记录**: 使用loguru记录关键操作和错误
5. **类型注解**: 所有方法必须有完整的类型注解
6. **SSL验证**: 云客API可能存在证书问题，客户端设置 `verify=False`

## 已实现的API列表

### ReportClient (report.py)

| 方法 | 说明 | API路径 |
|------|------|---------|
| `get_call_index_detail()` | 获取通话报表详情 | `/yunke-report-phone/module/getIndexDetail` |
| `get_outbound_call_report()` | 外呼报表快捷方法 | 同上 |
| `get_inbound_call_report()` | 呼入报表快捷方法 | 同上 |

### RecordClient (record.py)

| 方法 | 说明 | API路径 |
|------|------|---------|
| `get_record_url()` | 获取录音下载地址 | `/pc/callLog/getRecordUrl` |

### CallLogClient (call_log.py)

| 方法 | 说明 | API路径 |
|------|------|---------|
| `get_call_logs()` | 获取通话记录列表 | `/pc/callLog/list` |

**请求参数:**
- `start_time`: 开始时间，格式 "YYYY-MM-DD HH:mm"
- `end_time`: 结束时间，格式 "YYYY-MM-DD HH:mm"
- `page`: 页码
- `page_size`: 每页数量，最大200
- `department_id`: 部门ID（可选）
- `user_id`: 用户ID（可选）
- `call_type`: 通话类型，s=外呼，i=呼入，空=全部

### auth.py (独立函数)

| 函数 | 说明 |
|------|------|
| `get_secure_key()` | 获取RSA公钥 |
| `encrypt_with_rsa()` | RSA加密 |
| `check_and_get_users()` | 检查账号获取公司列表 |
| `password_login()` | 密码登录 |




