# 用户认证系统规范

## 概述

DataForge 项目使用双层认证机制：
1. **JWT 认证** - 保护后台管理路由（需要用户登录）
2. **API Key 认证** - 保护外部 API 接口（用于第三方调用）

### 认证流程图

```
请求 ──▶ JWT 中间件 ──▶ API Key 中间件 ──▶ 路由处理
              │                │
              │                ├── 豁免路径？──▶ 跳过验证
              │                │
              │                └── 验证 API Key
              │
              ├── 豁免路径？──▶ 跳过验证
              │
              ├── 需要 JWT？
              │      │
              │      ├── 有 JWT Token？──▶ 验证 Token
              │      │
              │      └── 无 Token？──▶ 尝试 API Key 回退验证
              │
              └── 不需要 JWT？──▶ 继续（可选解析 Token）
```

## 数据模型

### User 模型

```python
class UserRole(str, Enum):
    USER = "user"    # 普通用户
    ADMIN = "admin"  # 管理员

class User(SQLModel, table=True):
    id: int (PK)
    email: str (unique, index)   # 登录邮箱
    password_hash: str           # bcrypt 哈希密码
    name: str                    # 显示名称
    role: UserRole = USER        # 用户角色
    is_active: bool = True       # 账号状态
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None
```

### ApiKey 用户关联

```python
# ApiKey 模型新增字段
owner_id: int | None (FK -> users.id)  # 所属用户
```

## 后端 API

### 认证接口 `/api/v1/auth`

| 端点 | 方法 | 说明 | 认证要求 |
|------|------|------|----------|
| `/auth/login` | POST | 邮箱密码登录 | 无 |
| `/auth/me` | GET | 获取当前用户 | JWT |
| `/auth/test` | GET | 测试 API Key | API Key |
| `/auth/generate-key` | POST | 生成 API Key | 无（开发用） |

### 用户管理接口 `/api/v1/users` (仅管理员)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/users` | GET | 获取用户列表 |
| `/users` | POST | 创建用户 |
| `/users/{id}` | GET | 获取用户详情 |
| `/users/{id}` | PUT | 更新用户 |
| `/users/{id}` | DELETE | 删除用户 |
| `/users/{id}/api-keys/{key_id}` | POST | 为用户分配密钥 |
| `/users/{id}/api-keys/{key_id}` | DELETE | 取消密钥分配 |
| `/users/{id}/api-keys` | GET | 获取用户的密钥列表 |

## 中间件配置

### JWT 中间件

```python
class JWTAuthMiddleware:
    # 需要 JWT 认证的路由前缀
    PROTECTED_PREFIXES = [
        "/api/v1/users",  # 用户管理
    ]

    # 豁免路由（即使匹配前缀也不验证）
    EXEMPT_PATHS = [
        "/api/v1/auth/login",
        "/api/v1/auth/test",
        "/api/v1/auth/generate-key",
    ]
```

#### JWT 中间件验证逻辑

JWT 中间件支持 **API Key 回退验证**，验证顺序如下：

1. **检查豁免路径** - 如果路径在 `EXEMPT_PATHS` 中，直接跳过验证
2. **检查是否需要 JWT** - 根据 `PROTECTED_PREFIXES` 判断
3. **尝试 JWT 认证** - 从 `Authorization: Bearer <token>` 头获取并验证 Token
4. **JWT 失败时尝试 API Key** - 从查询参数 `?api_key=xxx` 获取并验证
5. **两者都失败** - 返回 401 错误

```python
# JWT 中间件核心逻辑
async def dispatch(self, request, call_next):
    # 1. 豁免路径直接通过
    if path in self.EXEMPT_PATHS:
        return await call_next(request)

    # 2. 不需要 JWT 的路由，可选解析 Token
    if not needs_jwt:
        # 如果携带了 Token 也尝试解析（用于获取用户信息）
        return await call_next(request)

    # 3. 尝试 JWT 认证
    if auth_header and auth_header.startswith("Bearer "):
        payload = decode_token(token)
        if payload:
            request.state.user_id = payload.sub
            request.state.user_email = payload.email
            request.state.user_role = payload.role
            return await call_next(request)

    # 4. JWT 失败，尝试 API Key 回退验证
    api_key = request.query_params.get("api_key")
    if api_key:
        is_valid, _, client_metadata = api_key_validator.validate(api_key)
        if is_valid and client_metadata:
            request.state.client_id = client_metadata.get("client_id")
            request.state.client_metadata = client_metadata
            request.state.key_type = client_metadata.get("key_type", "client")
            return await call_next(request)

    # 5. 两者都失败，返回 401
    return JSONResponse(status_code=401, content={...})
```

### API Key 中间件

```python
class APIKeyMiddleware:
    # 豁免验证的路径列表
    EXEMPT_PATHS = [
        "/",                          # 根路径
        "/api/v1/health",             # 健康检查
        "/api/v1/yunke/record/url",   # 录音下载地址（公开）
        "/api/v1/accounts",           # 账号列表（录音下载页面需要）
        "/api/v1/auth/login",         # 用户登录
        "/api/v1/auth/me",            # 获取当前用户（需要 JWT，不需要 API Key）
        "/docs",                      # Swagger UI
        "/redoc",                     # ReDoc
        "/openapi.json",              # OpenAPI Schema
    ]
```

### 中间件执行顺序

```python
# main.py 中的注册顺序（后添加的先执行）
app.add_middleware(APIKeyMiddleware)
app.add_middleware(JWTAuthMiddleware)  # JWT 先执行
```

### 认证方式对比

| 特性 | JWT Token | API Key |
|------|-----------|---------|
| 传递方式 | `Authorization: Bearer <token>` | `?api_key=xxx` |
| 有效期 | 24 小时（可配置） | 永久（除非禁用） |
| 用户信息 | 包含 user_id、email、role | 仅 client_id |
| 适用场景 | 前端登录用户 | 第三方 API 调用 |
| 存储位置 | 前端 localStorage | 服务端配置/数据库 |

## JWT Token

### 配置项

```python
# config.py
jwt_secret_key: str = "your-secret-key"  # 生产环境必须修改
jwt_expire_hours: int = 24               # Token 有效期（小时）
```

### Token 结构

```python
{
    "sub": user_id,      # 用户 ID
    "email": email,      # 用户邮箱
    "role": role,        # 用户角色
    "exp": expire_time   # 过期时间
}
```

### 密码哈希

使用 bcrypt 直接进行密码哈希：

```python
import bcrypt

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )
```

## 前端实现

### Auth Store (Pinia)

```typescript
// stores/auth.ts
const useAuthStore = defineStore('auth', () => {
    const token = ref<string | null>(localStorage.getItem('auth_token'))
    const user = ref<User | null>(null)

    const isLoggedIn = computed(() => !!token.value && !!user.value)
    const isAdmin = computed(() => user.value?.role === 'admin')

    const login = async (data: LoginRequest) => { ... }
    const logout = () => { ... }
    const fetchCurrentUser = async () => { ... }
})
```

### 请求拦截器

```typescript
// api/request.ts
request.interceptors.request.use((config) => {
    // 注入 API Key
    const apiKey = localStorage.getItem('api_key')
    if (apiKey) {
        config.params = { ...config.params, api_key: apiKey }
    }

    // 注入 JWT Token
    const token = localStorage.getItem('auth_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }

    return config
})
```

### 路由守卫

```typescript
// router/index.ts
router.beforeEach((to, from, next) => {
    const isLoggedIn = !!localStorage.getItem('auth_token')
    const isAdmin = user?.role === 'admin'

    // 需要登录的页面
    if (to.meta.requiresAuth && !isLoggedIn) {
        next({ path: '/login' })
        return
    }

    // 需要管理员权限
    if (to.meta.requiresAdmin && !isAdmin) {
        next({ path: '/admin' })
        return
    }

    next()
})
```

### 路由配置

```typescript
{
    path: '/login',
    meta: { guest: true }  // 已登录则跳转到后台
}

{
    path: '/admin',
    meta: { requiresAuth: true }  // 需要登录
}

{
    path: '/admin/users',
    meta: { requiresAdmin: true }  // 需要管理员
}
```

## 文件结构

```
backend/
├── app/
│   ├── models/
│   │   └── user.py           # User 模型
│   ├── utils/
│   │   └── jwt_auth.py       # JWT 工具函数
│   ├── middleware/
│   │   └── jwt_auth.py       # JWT 中间件
│   └── api/v1/
│       ├── auth.py           # 认证接口
│       └── users.py          # 用户管理接口
├── scripts/
│   └── create_admin.py       # 创建管理员脚本

frontend/
├── src/
│   ├── stores/
│   │   └── auth.ts           # 认证状态管理
│   ├── views/
│   │   ├── Login.vue         # 登录页面
│   │   └── UserManager.vue   # 用户管理页面
│   └── api/
│       └── users.ts          # 用户 API
```

## 初始化管理员

```bash
cd backend
uv run python -m scripts.create_admin

# 或指定参数
uv run python -m scripts.create_admin \
    --email admin@example.com \
    --password yourpassword \
    --name 管理员
```

## 安全注意事项

1. **生产环境必须修改** `JWT_SECRET_KEY`
2. 密码使用 bcrypt 哈希，不可逆
3. Token 默认 24 小时过期
4. 用户管理接口仅管理员可访问
5. 不要在日志中记录密码或 Token
6. HTTPS 环境下使用（防止 Token 被窃取）

## 角色权限

| 功能 | user | admin |
|------|:----:|:-----:|
| 登录后台 | ✓ | ✓ |
| 查看仪表板 | ✓ | ✓ |
| 管理云客账号 | ✓ | ✓ |
| 管理 API 密钥 | ✓ | ✓ |
| 管理定时任务 | ✓ | ✓ |
| 用户管理 | ✗ | ✓ |
| 创建用户 | ✗ | ✓ |
| 分配密钥 | ✗ | ✓ |
