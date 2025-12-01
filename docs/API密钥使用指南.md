# API密钥使用指南

## 功能概述

项目已成功添加API密钥验证功能,所有API接口(除豁免路径外)都需要提供有效的API密钥才能访问。

---

## 当前配置的密钥

系统已配置2个API密钥:

1. **密钥1** (client_1): `yk_HPGMcKf8CkgIsUlUXQLyKJds4tU6CpbP63SPAEIfJ9M`
2. **密钥2** (client_2): `yk_xS9J4tvF_Ft3m3BpagEKprGo5CvTn0VkSIm8ymuS8mw`

密钥配置位置: `backend/.env` 文件中的 `API_KEYS` 变量

---

## 豁免路径(无需密钥)

以下路径可以直接访问,无需提供API密钥:

- `/` - 根路径
- `/api/v1/health` - 健康检查

---

## 使用方法

### 方式1: 查询参数(推荐用于开发测试)

在URL中添加 `api_key` 参数:

```bash
# 获取账号列表
curl "http://localhost:8847/api/v1/accounts?api_key=yk_HPGMcKf8CkgIsUlUXQLyKJds4tU6CpbP63SPAEIfJ9M"

# 获取通话报表
curl "http://localhost:8847/api/v1/yunke/report/call?api_key=yk_HPGMcKf8CkgIsUlUXQLyKJds4tU6CpbP63SPAEIfJ9M"
```

### 方式2: 请求头(推荐用于生产环境)

**注意**: 当前版本仅支持查询参数方式。如需支持请求头,需要修改中间件代码。

---

## 测试端点

### 1. 测试API密钥是否有效

```bash
curl "http://localhost:8847/api/v1/auth/test?api_key=YOUR_KEY"
```

响应示例:
```json
{
  "code": 200,
  "message": "验证成功",
  "data": {
    "client_id": "client_1",
    "description": "API客户端 1",
    "created_at": "2025-12-01T09:49:28.510282",
    "message": "API密钥有效"
  }
}
```

### 2. 生成新的API密钥(开发环境)

```bash
curl -X POST "http://localhost:8847/api/v1/auth/generate-key?api_key=YOUR_KEY"
```

响应示例:
```json
{
  "code": 200,
  "message": "密钥生成成功",
  "data": {
    "api_key": "yk_di2a5JjuxWM--ECwCBmwBDxvfbmy4KRAP2MIMJ8YzyQ",
    "length": 46,
    "usage": "在查询参数中添加: ?api_key=yk_...",
    "example": "curl 'http://localhost:8847/api/v1/accounts?api_key=yk_...'"
  }
}
```

**注意**: 生成的新密钥需要手动添加到 `.env` 文件才能生效。

---

## 错误码说明

| 错误码 | 说明 | 解决方法 |
|--------|------|----------|
| 401 | 缺少API密钥 | 在URL中添加 `?api_key=YOUR_KEY` |
| 403 | API密钥无效 | 检查密钥是否正确或已过期 |
| 200 | 请求成功 | - |

### 错误响应示例

**缺少密钥 (401)**:
```json
{
  "code": 401,
  "message": "缺少API密钥,请在URL中添加api_key参数",
  "data": null
}
```

**无效密钥 (403)**:
```json
{
  "code": 403,
  "message": "无效的API密钥",
  "data": null
}
```

---

## 安全审计日志

系统会自动记录所有API密钥验证事件到独立的安全日志文件:

**日志位置**: `backend/logs/security.log`

**日志内容**:
- 验证成功: 记录客户端ID、IP地址、请求路径、脱敏后的密钥
- 验证失败: 记录IP地址、请求路径、脱敏后的密钥、时间戳

**查看日志**:
```bash
tail -f backend/logs/security.log
```

**日志示例**:
```
2025-12-01 17:50:00 | INFO | API密钥验证成功 | 客户端: client_1 | IP: 127.0.0.1 | 方法: GET | 路径: /api/v1/accounts | 密钥: yk_H...fJ9M
2025-12-01 17:49:56 | WARNING | API密钥验证失败 | IP: 127.0.0.1 | 方法: GET | 路径: /api/v1/accounts | 密钥: None | 时间: 2025-12-01T09:49:56.501133
```

---

## 客户端元数据管理

每个API密钥都关联一个客户端标识:

| 密钥 | 客户端ID | 描述 |
|------|---------|------|
| yk_HPGMcKf8...fJ9M | client_1 | API客户端 1 |
| yk_xS9J4tvF...S8mw | client_2 | API客户端 2 |

可以通过 `/api/v1/auth/test` 端点查询当前使用的密钥对应的客户端信息。

---

## 添加新密钥

### 1. 生成密钥

```bash
python -c "import secrets; print('yk_' + secrets.token_urlsafe(32))"
```

### 2. 添加到配置文件

编辑 `backend/.env` 文件:

```env
API_KEYS=密钥1,密钥2,新密钥
```

### 3. 重启服务

```bash
# 停止服务
lsof -ti:8847 | xargs kill -9

# 启动服务
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8847
```

---

## 前端集成建议

### 方式1: 全局配置

```typescript
// config.ts
export const API_KEY = 'yk_HPGMcKf8CkgIsUlUXQLyKJds4tU6CpbP63SPAEIfJ9M'

// api.ts
import { API_KEY } from './config'

export async function fetchAccounts() {
  const response = await fetch(`/api/v1/accounts?api_key=${API_KEY}`)
  return response.json()
}
```

### 方式2: Axios拦截器

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8847'
})

// 请求拦截器:自动添加api_key
api.interceptors.request.use(config => {
  const apiKey = 'yk_HPGMcKf8CkgIsUlUXQLyKJds4tU6CpbP63SPAEIfJ9M'

  // 添加到查询参数
  config.params = {
    ...config.params,
    api_key: apiKey
  }

  return config
})

export default api
```

---

## 生产环境部署建议

1. **使用强随机密钥**: 至少32位,使用 `secrets.token_urlsafe()` 生成
2. **定期轮换密钥**: 建议每90天更换一次
3. **限制密钥数量**: 为不同客户端/服务分配独立密钥,便于追踪和撤销
4. **启用HTTPS**: 生产环境必须使用HTTPS,避免密钥在传输过程中泄露
5. **监控审计日志**: 定期检查 `security.log`,发现异常访问及时处理
6. **备份密钥配置**: 将 `.env` 文件安全备份,但不要提交到Git仓库

---

## 故障排查

### 问题1: 所有接口都返回401

**原因**: 未配置API密钥或密钥配置错误

**解决**:
```bash
# 检查.env文件是否存在
ls backend/.env

# 检查API_KEYS是否配置
cat backend/.env | grep API_KEYS

# 查看启动日志
tail -f /tmp/yunke_backend.log
```

### 问题2: 密钥明明正确但返回403

**原因**: 密钥中可能包含空格或特殊字符

**解决**:
- 检查密钥复制是否完整
- 确保URL编码正确(特殊字符需要转义)
- 使用 `/api/v1/auth/test` 端点验证密钥

### 问题3: 审计日志没有记录

**原因**: 日志配置未生效或日志目录不存在

**解决**:
```bash
# 创建日志目录
mkdir -p backend/logs

# 检查日志配置
cat backend/.env | grep SECURITY

# 重启服务
```

---

## 联系方式

如有问题或建议,请联系技术团队。
