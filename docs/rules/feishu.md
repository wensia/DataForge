# 飞书集成开发规范

## 概述

本项目使用飞书多维表格作为数据同步目标，通过 `lark-oapi` SDK 与飞书 API 交互。

## 数据结构

采用三层结构管理飞书配置：

```
飞书客户端 (FeishuClient)
    ├── id, name, app_id, app_secret, is_active, notes
    │
    └── 多维表格 (FeishuBitable) [1:N]
            ├── id, client_id(FK), name, app_token, is_active, notes
            │
            └── 数据表 (FeishuTable) [1:N]
                    └── id, bitable_id(FK), name, table_id, is_active, notes
```

### 字段说明

| 层级 | 字段 | 来源 | 用途 |
|------|------|------|------|
| 客户端 | `app_id` | 飞书开放平台 → 应用详情 | 飞书应用唯一标识 |
| 客户端 | `app_secret` | 飞书开放平台 → 凭证与基础信息 | 用于获取 access_token |
| 多维表格 | `app_token` | 多维表格 URL 中 `base/xxx` 部分 | 多维表格唯一标识 |
| 数据表 | `table_id` | 多维表格 URL 中 `table=xxx` 部分 | 数据表唯一标识 |

### URL 解析示例

```
https://xxx.feishu.cn/base/PtRdbPjCFa5Og5sry0lcD1yPnKg?table=tblVBqxDbGXOJZPv
                          ↑                              ↑
                      app_token                      table_id
```

## 相关文件

### 后端

```
backend/app/
├── models/
│   ├── feishu_client.py    # 飞书客户端模型
│   ├── feishu_bitable.py   # 多维表格模型
│   └── feishu_table.py     # 数据表模型
└── api/v1/
    └── feishu_config.py    # 飞书配置 API 路由
```

### 前端

```
frontend/src/
├── api/
│   └── feishuConfig.ts     # 飞书配置 API 封装
└── views/
    └── FeishuConfigManager.vue  # 飞书配置管理页面
```

## API 路由

### 飞书客户端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/feishu/clients` | 获取客户端列表 |
| POST | `/api/v1/feishu/clients` | 创建客户端 |
| GET | `/api/v1/feishu/clients/{id}` | 获取客户端详情 |
| PUT | `/api/v1/feishu/clients/{id}` | 更新客户端 |
| DELETE | `/api/v1/feishu/clients/{id}` | 删除客户端（级联删除） |

### 多维表格

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/feishu/clients/{client_id}/bitables` | 获取多维表格列表 |
| POST | `/api/v1/feishu/clients/{client_id}/bitables` | 创建多维表格 |
| GET | `/api/v1/feishu/bitables/{id}` | 获取多维表格详情 |
| PUT | `/api/v1/feishu/bitables/{id}` | 更新多维表格 |
| DELETE | `/api/v1/feishu/bitables/{id}` | 删除多维表格（级联删除） |

### 数据表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/feishu/bitables/{bitable_id}/tables` | 获取数据表列表 |
| POST | `/api/v1/feishu/bitables/{bitable_id}/tables` | 创建数据表 |
| GET | `/api/v1/feishu/tables/{id}` | 获取数据表详情 |
| PUT | `/api/v1/feishu/tables/{id}` | 更新数据表 |
| DELETE | `/api/v1/feishu/tables/{id}` | 删除数据表 |

## lark-oapi SDK 使用

### 安装

```bash
pip install lark-oapi
```

### 创建客户端

```python
import lark_oapi as lark

# 使用数据库中存储的 app_id 和 app_secret
client = lark.Client.builder() \
    .app_id(feishu_client.app_id) \
    .app_secret(feishu_client.app_secret) \
    .build()
```

### 操作多维表格记录

```python
from lark_oapi.api.bitable.v1 import *

# 创建记录
request = CreateAppTableRecordRequest.builder() \
    .app_token(feishu_bitable.app_token) \
    .table_id(feishu_table.table_id) \
    .request_body(AppTableRecord.builder()
        .fields({
            "字段名1": "值1",
            "字段名2": "值2",
        })
        .build()) \
    .build()

response = client.bitable.v1.app_table_record.create(request)

if response.success():
    print(f"记录创建成功: {response.data.record.record_id}")
else:
    print(f"创建失败: {response.code}, {response.msg}")
```

### 查询记录

```python
# 获取记录列表
request = ListAppTableRecordRequest.builder() \
    .app_token(feishu_bitable.app_token) \
    .table_id(feishu_table.table_id) \
    .page_size(100) \
    .build()

response = client.bitable.v1.app_table_record.list(request)
```

### 更新记录

```python
request = UpdateAppTableRecordRequest.builder() \
    .app_token(feishu_bitable.app_token) \
    .table_id(feishu_table.table_id) \
    .record_id("record_id") \
    .request_body(AppTableRecord.builder()
        .fields({"字段名": "新值"})
        .build()) \
    .build()

response = client.bitable.v1.app_table_record.update(request)
```

## 开发规范

### 1. 配置管理

- 敏感信息（`app_secret`）存储在数据库中，API 响应不返回
- 前端编辑时，`app_secret` 留空表示不修改
- `app_id` 创建后不可修改

### 2. 级联删除

- 删除客户端时，自动删除关联的多维表格和数据表
- 删除多维表格时，自动删除关联的数据表
- 前端删除确认框需明确提示级联删除影响

### 3. 唯一性约束

- `app_id` 全局唯一
- `app_token` 在同一客户端下唯一
- `table_id` 在同一多维表格下唯一

### 4. 错误处理

```python
# lark-oapi 调用错误处理
if not response.success():
    logger.error(f"飞书 API 调用失败: code={response.code}, msg={response.msg}")
    raise Exception(f"飞书 API 错误: {response.msg}")
```

### 5. Token 管理

`lark-oapi` SDK 自动管理 `tenant_access_token`，无需手动获取和刷新。

## 前端页面结构

飞书配置管理页面使用 Tab 布局：

1. **飞书客户端 Tab** - 管理 App ID / App Secret
2. **多维表格 Tab** - 选择客户端 → 管理多维表格
3. **数据表 Tab** - 选择客户端和多维表格 → 管理数据表

### 交互逻辑

- 切换客户端时，清空多维表格和数据表选择
- 切换多维表格时，清空数据表选择并重新加载
- 添加/编辑/删除操作后自动刷新列表

## 飞书应用配置步骤

1. 登录 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 获取 App ID 和 App Secret
4. 配置应用权限：
   - `bitable:app` - 查看、评论、编辑和管理多维表格
5. 发布应用
6. 将应用添加到多维表格的协作者中
