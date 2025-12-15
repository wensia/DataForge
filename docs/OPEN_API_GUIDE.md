# CRM开放API调用指南

本文档说明如何在其他项目中调用CRM系统的开放API，实现用户认证和组织架构数据共享。

## 概述

开放API允许外部服务器：
- 使用CRM系统的账号密码进行登录
- 验证用户Token有效性
- 获取用户详细信息（含所有身份：校区/部门/职位）
- 查询组织架构数据（校区、部门、职位列表）

## 认证方式

### 服务端API Key

所有开放API请求必须携带服务端API Key，通过请求头传递：

```
X-Service-Key: rmf_svc_xxxxxxxx...
```

**获取服务端API Key**：联系CRM系统管理员创建。

### 用户Token

部分API（如获取用户信息）还需要用户的访问令牌：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

## API基础地址

```
生产环境: https://your-crm-domain.com/api/v1/open
开发环境: http://127.0.0.1:9876/api/v1/open
```

---

## API端点详情

### 1. 用户登录

**POST** `/auth/login`

使用CRM账号密码登录，获取访问令牌。

**请求头**
```
Content-Type: application/json
X-Service-Key: {服务端API Key}
```

**请求体**
```json
{
  "username": "zhangsan",
  "password": "password123"
}
```

**响应示例**
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 604800,
    "user": {
      "id": "ea3faaed-a2a6-4c7c-a636-e62d36808cbf",
      "username": "zhangsan",
      "name": "张三",
      "email": "zhangsan@example.com",
      "phone": "13800138000",
      "is_superuser": false,
      "is_active": true,
      "joined_at": "2024-01-01T00:00:00+08:00",
      "identities": [
        {
          "identity_id": "uuid",
          "campus_id": "uuid",
          "campus_name": "西南楼校区",
          "department_id": "uuid",
          "department_name": "咨询部",
          "position_id": "uuid",
          "position_name": "咨询经理",
          "position_level": 3,
          "is_active": true,
          "can_manage_leads": true,
          "can_access_pool": true
        }
      ]
    }
  }
}
```

---

### 2. 验证Token

**POST** `/auth/verify-token`

验证用户Token是否有效。

**请求头**
```
Content-Type: application/json
X-Service-Key: {服务端API Key}
```

**请求体**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**响应示例（有效）**
```json
{
  "success": true,
  "message": "Token有效",
  "data": {
    "valid": true,
    "user_id": "ea3faaed-a2a6-4c7c-a636-e62d36808cbf",
    "username": "zhangsan",
    "expires_at": "2025-12-21T00:00:00+08:00",
    "remaining_seconds": 604800
  }
}
```

**响应示例（无效）**
```json
{
  "success": true,
  "message": "Token已过期",
  "data": {
    "valid": false,
    "user_id": null,
    "username": null,
    "expires_at": "2025-12-14T00:00:00+08:00",
    "remaining_seconds": 0
  }
}
```

---

### 3. 刷新Token

**POST** `/auth/refresh`

使用刷新令牌获取新的访问令牌。

**请求头**
```
Content-Type: application/json
X-Service-Key: {服务端API Key}
```

**请求体**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**响应示例**
```json
{
  "success": true,
  "message": "令牌刷新成功",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 604800
  }
}
```

---

### 4. 获取当前用户信息

**GET** `/users/me`

获取当前登录用户的详细信息。

**请求头**
```
X-Service-Key: {服务端API Key}
Authorization: Bearer {用户访问令牌}
```

**响应示例**
```json
{
  "success": true,
  "message": "获取成功",
  "data": {
    "id": "ea3faaed-a2a6-4c7c-a636-e62d36808cbf",
    "username": "zhangsan",
    "name": "张三",
    "email": "zhangsan@example.com",
    "phone": "13800138000",
    "is_superuser": false,
    "is_active": true,
    "joined_at": "2024-01-01T00:00:00+08:00",
    "identities": [
      {
        "identity_id": "uuid",
        "campus_id": "uuid",
        "campus_name": "西南楼校区",
        "department_id": "uuid",
        "department_name": "咨询部",
        "position_id": "uuid",
        "position_name": "咨询经理",
        "position_level": 3,
        "is_active": true,
        "can_manage_leads": true,
        "can_access_pool": true
      }
    ]
  }
}
```

---

### 5. 获取用户列表

**GET** `/users`

获取系统用户列表，支持分页和筛选。

**请求头**
```
X-Service-Key: {服务端API Key}
```

**查询参数**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认1 |
| size | int | 否 | 每页数量，默认100，最大500 |
| search | string | 否 | 搜索关键词（姓名/用户名） |
| is_active | bool | 否 | 筛选是否启用 |
| campus_id | string | 否 | 筛选校区ID |
| department_id | string | 否 | 筛选部门ID |

**响应示例**
```json
{
  "success": true,
  "message": "获取成功",
  "data": {
    "items": [
      {
        "id": "ea3faaed-a2a6-4c7c-a636-e62d36808cbf",
        "username": "zhangsan",
        "name": "张三",
        "email": "zhangsan@example.com",
        "phone": "13800138000",
        "is_superuser": false,
        "is_active": true,
        "joined_at": "2024-01-01T00:00:00+08:00",
        "identities": [
          {
            "identity_id": "uuid",
            "campus_id": "uuid",
            "campus_name": "西南楼校区",
            "department_id": "uuid",
            "department_name": "咨询部",
            "position_id": "uuid",
            "position_name": "咨询经理",
            "position_level": 3,
            "is_active": true,
            "can_manage_leads": true,
            "can_access_pool": true
          }
        ]
      }
    ],
    "total": 50
  }
}
```

---

### 6. 获取校区列表

**GET** `/organization/campuses`

**请求头**
```
X-Service-Key: {服务端API Key}
```

**查询参数**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认1 |
| size | int | 否 | 每页数量，默认100，最大500 |
| is_active | bool | 否 | 筛选是否启用 |
| area_id | string | 否 | 筛选区域ID |

**响应示例**
```json
{
  "success": true,
  "message": "获取成功",
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "西南楼校区",
        "address": "北京市朝阳区xxx",
        "contact_phone": "010-12345678",
        "is_active": true,
        "area_id": "uuid",
        "area_name": "北京区域"
      }
    ],
    "total": 10
  }
}
```

---

### 7. 获取部门列表

**GET** `/organization/departments`

**请求头**
```
X-Service-Key: {服务端API Key}
```

**查询参数**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认1 |
| size | int | 否 | 每页数量，默认100，最大500 |
| is_active | bool | 否 | 筛选是否启用 |

**响应示例**
```json
{
  "success": true,
  "message": "获取成功",
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "咨询部",
        "description": "负责客户咨询",
        "sort_order": 1,
        "is_active": true
      }
    ],
    "total": 5
  }
}
```

---

### 8. 获取职位列表

**GET** `/organization/positions`

**请求头**
```
X-Service-Key: {服务端API Key}
```

**查询参数**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认1 |
| size | int | 否 | 每页数量，默认100，最大500 |
| is_active | bool | 否 | 筛选是否启用 |

**响应示例**
```json
{
  "success": true,
  "message": "获取成功",
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "咨询经理",
        "level": 3,
        "description": "部门经理级别",
        "is_active": true
      }
    ],
    "total": 8
  }
}
```

---

## 错误处理

### HTTP状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 401 | 认证失败（缺少或无效的服务端Key/用户Token） |
| 403 | 权限不足（用户已被禁用） |
| 429 | 请求过于频繁（触发速率限制） |
| 500 | 服务器内部错误 |

### 错误响应格式

```json
{
  "detail": "错误描述信息"
}
```

或

```json
{
  "success": false,
  "message": "错误描述信息",
  "data": null
}
```

### 速率限制

| 端点 | 限制（每分钟） |
|------|--------------|
| /auth/login | 20次 |
| /auth/verify-token | 100次 |
| /auth/refresh | 100次 |
| /users/me | 60次 |
| /users | 60次 |
| /organization/* | 100次 |

超出限制时返回 `429 Too Many Requests`。

---

## 调用示例

### Python

```python
import requests

class CRMClient:
    def __init__(self, base_url: str, service_key: str):
        self.base_url = base_url.rstrip('/')
        self.service_key = service_key
        self.access_token = None
        self.refresh_token = None

    def _headers(self, with_auth: bool = False) -> dict:
        headers = {
            "Content-Type": "application/json",
            "X-Service-Key": self.service_key
        }
        if with_auth and self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    def login(self, username: str, password: str) -> dict:
        """用户登录"""
        resp = requests.post(
            f"{self.base_url}/auth/login",
            headers=self._headers(),
            json={"username": username, "password": password}
        )
        resp.raise_for_status()
        data = resp.json()
        if data["success"]:
            self.access_token = data["data"]["access_token"]
            self.refresh_token = data["data"]["refresh_token"]
        return data

    def verify_token(self, token: str = None) -> dict:
        """验证Token"""
        token = token or self.access_token
        resp = requests.post(
            f"{self.base_url}/auth/verify-token",
            headers=self._headers(),
            json={"token": token}
        )
        resp.raise_for_status()
        return resp.json()

    def refresh_access_token(self) -> dict:
        """刷新Token"""
        resp = requests.post(
            f"{self.base_url}/auth/refresh",
            headers=self._headers(),
            json={"refresh_token": self.refresh_token}
        )
        resp.raise_for_status()
        data = resp.json()
        if data["success"]:
            self.access_token = data["data"]["access_token"]
        return data

    def get_current_user(self) -> dict:
        """获取当前用户信息"""
        resp = requests.get(
            f"{self.base_url}/users/me",
            headers=self._headers(with_auth=True)
        )
        resp.raise_for_status()
        return resp.json()

    def get_users(self, page: int = 1, size: int = 100, search: str = None,
                  is_active: bool = None, campus_id: str = None) -> dict:
        """获取用户列表"""
        params = {"page": page, "size": size}
        if search:
            params["search"] = search
        if is_active is not None:
            params["is_active"] = is_active
        if campus_id:
            params["campus_id"] = campus_id
        resp = requests.get(
            f"{self.base_url}/users",
            headers=self._headers(),
            params=params
        )
        resp.raise_for_status()
        return resp.json()

    def get_campuses(self, page: int = 1, size: int = 100) -> dict:
        """获取校区列表"""
        resp = requests.get(
            f"{self.base_url}/organization/campuses",
            headers=self._headers(),
            params={"page": page, "size": size}
        )
        resp.raise_for_status()
        return resp.json()

    def get_departments(self, page: int = 1, size: int = 100) -> dict:
        """获取部门列表"""
        resp = requests.get(
            f"{self.base_url}/organization/departments",
            headers=self._headers(),
            params={"page": page, "size": size}
        )
        resp.raise_for_status()
        return resp.json()

    def get_positions(self, page: int = 1, size: int = 100) -> dict:
        """获取职位列表"""
        resp = requests.get(
            f"{self.base_url}/organization/positions",
            headers=self._headers(),
            params={"page": page, "size": size}
        )
        resp.raise_for_status()
        return resp.json()


# 使用示例
if __name__ == "__main__":
    client = CRMClient(
        base_url="http://127.0.0.1:9876/api/v1/open",
        service_key="rmf_svc_xxxxxxxx..."
    )

    # 登录
    result = client.login("zhangsan", "password123")
    print(f"登录成功: {result['data']['user']['name']}")

    # 获取用户信息
    user = client.get_current_user()
    print(f"用户身份数: {len(user['data']['identities'])}")

    # 获取校区列表
    campuses = client.get_campuses()
    print(f"校区数量: {campuses['data']['total']}")
```

### JavaScript/TypeScript

```typescript
class CRMClient {
  private baseUrl: string;
  private serviceKey: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(baseUrl: string, serviceKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.serviceKey = serviceKey;
  }

  private headers(withAuth: boolean = false): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Service-Key': this.serviceKey,
    };
    if (withAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  async login(username: string, password: string): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();
    if (data.success) {
      this.accessToken = data.data.access_token;
      this.refreshToken = data.data.refresh_token;
    }
    return data;
  }

  async verifyToken(token?: string): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/auth/verify-token`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ token: token || this.accessToken }),
    });
    return resp.json();
  }

  async refreshAccessToken(): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });
    const data = await resp.json();
    if (data.success) {
      this.accessToken = data.data.access_token;
    }
    return data;
  }

  async getCurrentUser(): Promise<any> {
    const resp = await fetch(`${this.baseUrl}/users/me`, {
      headers: this.headers(true),
    });
    return resp.json();
  }

  async getUsers(page = 1, size = 100, search?: string, isActive?: boolean): Promise<any> {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) params.append('search', search);
    if (isActive !== undefined) params.append('is_active', String(isActive));
    const resp = await fetch(
      `${this.baseUrl}/users?${params.toString()}`,
      { headers: this.headers() }
    );
    return resp.json();
  }

  async getCampuses(page = 1, size = 100): Promise<any> {
    const resp = await fetch(
      `${this.baseUrl}/organization/campuses?page=${page}&size=${size}`,
      { headers: this.headers() }
    );
    return resp.json();
  }

  async getDepartments(page = 1, size = 100): Promise<any> {
    const resp = await fetch(
      `${this.baseUrl}/organization/departments?page=${page}&size=${size}`,
      { headers: this.headers() }
    );
    return resp.json();
  }

  async getPositions(page = 1, size = 100): Promise<any> {
    const resp = await fetch(
      `${this.baseUrl}/organization/positions?page=${page}&size=${size}`,
      { headers: this.headers() }
    );
    return resp.json();
  }
}

// 使用示例
const client = new CRMClient(
  'http://127.0.0.1:9876/api/v1/open',
  'rmf_svc_xxxxxxxx...'
);

async function main() {
  // 登录
  const loginResult = await client.login('zhangsan', 'password123');
  console.log('登录成功:', loginResult.data.user.name);

  // 获取用户信息
  const user = await client.getCurrentUser();
  console.log('用户身份数:', user.data.identities.length);
}

main();
```

### cURL

```bash
# 设置变量
SERVICE_KEY="rmf_svc_xxxxxxxx..."
BASE_URL="http://127.0.0.1:9876/api/v1/open"

# 1. 登录
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Service-Key: $SERVICE_KEY" \
  -d '{"username": "zhangsan", "password": "password123"}'

# 2. 验证Token
curl -X POST "$BASE_URL/auth/verify-token" \
  -H "Content-Type: application/json" \
  -H "X-Service-Key: $SERVICE_KEY" \
  -d '{"token": "eyJhbGciOiJIUzI1NiIs..."}'

# 3. 获取当前用户信息
curl -X GET "$BASE_URL/users/me" \
  -H "X-Service-Key: $SERVICE_KEY" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# 4. 获取用户列表
curl -X GET "$BASE_URL/users?size=10&is_active=true" \
  -H "X-Service-Key: $SERVICE_KEY"

# 5. 获取校区列表
curl -X GET "$BASE_URL/organization/campuses?size=10" \
  -H "X-Service-Key: $SERVICE_KEY"

# 6. 获取部门列表
curl -X GET "$BASE_URL/organization/departments" \
  -H "X-Service-Key: $SERVICE_KEY"

# 7. 获取职位列表
curl -X GET "$BASE_URL/organization/positions" \
  -H "X-Service-Key: $SERVICE_KEY"
```

---

## 数据模型说明

### 用户身份 (Identity)

一个用户可以有多个身份，每个身份关联一个校区、部门和职位：

```
用户 (1) -----> (N) 身份
                    |
                    +---> 校区 (Campus)
                    +---> 部门 (Department)
                    +---> 职位 (Position)
```

### 职位级别 (Position Level)

| 级别 | 说明 |
|------|------|
| 1 | 专员 |
| 2 | 主管 |
| 3 | 经理 |
| 4 | 总监 |
| 5 | 副总裁 |
| 6 | 总裁 |

---

## 最佳实践

1. **Token管理**：登录成功后保存 `access_token` 和 `refresh_token`，在 `access_token` 过期前使用 `refresh_token` 刷新。

2. **错误处理**：妥善处理 401（重新登录）和 429（等待重试）错误。

3. **缓存组织数据**：校区、部门、职位等数据变化不频繁，建议客户端缓存。

4. **安全存储**：服务端API Key 应安全存储，不要暴露在客户端代码中。
