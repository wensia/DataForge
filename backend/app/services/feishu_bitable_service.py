"""飞书多维表格服务层

封装飞书多维表格 API 操作，包括创建表、字段、记录等功能。
"""

import asyncio
from typing import Any

import httpx
from loguru import logger

FEISHU_API_BASE = "https://open.feishu.cn/open-apis"

# 默认重试配置
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0  # 秒


async def _request_with_retry(
    method: str,
    url: str,
    headers: dict,
    json: dict | None = None,
    timeout: float = 30.0,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
) -> dict:
    """带重试机制的 HTTP 请求

    Args:
        method: HTTP 方法 (GET/POST)
        url: 请求 URL
        headers: 请求头
        json: 请求体
        timeout: 超时时间
        max_retries: 最大重试次数
        retry_delay: 重试延迟（指数退避基数）

    Returns:
        dict: 响应 JSON

    Raises:
        httpx.ConnectError: 多次重试后仍然连接失败
    """
    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                if method.upper() == "GET":
                    response = await client.get(url, headers=headers)
                else:
                    response = await client.post(url, headers=headers, json=json)
                return response.json()

        except (httpx.ConnectError, httpx.TimeoutException) as e:
            last_exception = e
            if attempt < max_retries:
                delay = retry_delay * (2**attempt)  # 指数退避
                logger.warning(
                    f"飞书 API 请求失败 (尝试 {attempt + 1}/{max_retries + 1}): {e}, "
                    f"{delay:.1f}s 后重试..."
                )
                await asyncio.sleep(delay)
            else:
                logger.error(f"飞书 API 请求失败，已达最大重试次数: {e}")

    raise last_exception


class FeishuBitableError(Exception):
    """飞书多维表格操作异常"""

    def __init__(self, message: str, code: int = 0):
        self.message = message
        self.code = code
        super().__init__(message)


async def get_tenant_access_token(app_id: str, app_secret: str) -> str:
    """获取飞书 tenant_access_token

    Args:
        app_id: 飞书应用 App ID
        app_secret: 飞书应用 App Secret

    Returns:
        str: tenant_access_token

    Raises:
        FeishuBitableError: 获取 token 失败
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{FEISHU_API_BASE}/auth/v3/tenant_access_token/internal",
            json={"app_id": app_id, "app_secret": app_secret},
        )
        result = response.json()

        if result.get("code") != 0:
            error_msg = result.get("msg", "未知错误")
            logger.error(f"获取飞书 token 失败: {error_msg}")
            raise FeishuBitableError(
                f"获取 token 失败: {error_msg}", result.get("code", 0)
            )

        token = result.get("tenant_access_token")
        logger.debug(f"获取飞书 token 成功，有效期: {result.get('expire')}秒")
        return token


async def list_tables(access_token: str, app_token: str) -> list[dict]:
    """获取多维表格下的所有数据表

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token

    Returns:
        list[dict]: 数据表列表，每个元素包含 table_id, name 等字段
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        result = response.json()

        if result.get("code") != 0:
            error_msg = result.get("msg", "未知错误")
            logger.error(f"获取数据表列表失败: {error_msg}")
            raise FeishuBitableError(
                f"获取数据表列表失败: {error_msg}", result.get("code", 0)
            )

        items = result.get("data", {}).get("items", [])
        logger.debug(f"获取到 {len(items)} 个数据表")
        return items


async def create_table(
    access_token: str,
    app_token: str,
    name: str,
    default_view_name: str = "默认视图",
    fields: list[dict] | None = None,
) -> dict:
    """创建数据表

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        name: 表名称
        default_view_name: 默认视图名称
        fields: 字段定义列表，每个元素包含 field_name, type 等

    Returns:
        dict: 包含 table_id, default_view_id, field_id_list 等
    """
    body: dict[str, Any] = {
        "table": {
            "name": name,
            "default_view_name": default_view_name,
        }
    }

    if fields:
        body["table"]["fields"] = fields

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
        )
        result = response.json()

        if result.get("code") != 0:
            error_msg = result.get("msg", "未知错误")
            logger.error(f"创建数据表失败: {error_msg}")
            raise FeishuBitableError(
                f"创建数据表失败: {error_msg}", result.get("code", 0)
            )

        data = result.get("data", {})
        logger.info(f"创建数据表成功: table_id={data.get('table_id')}")
        return data


async def list_fields(access_token: str, app_token: str, table_id: str) -> list[dict]:
    """获取数据表字段列表

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_id: 数据表 ID

    Returns:
        list[dict]: 字段列表，每个元素包含 field_id, field_name, type 等
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/fields",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        result = response.json()

        if result.get("code") != 0:
            error_msg = result.get("msg", "未知错误")
            logger.error(f"获取字段列表失败: {error_msg}")
            raise FeishuBitableError(
                f"获取字段列表失败: {error_msg}", result.get("code", 0)
            )

        items = result.get("data", {}).get("items", [])
        logger.debug(f"获取到 {len(items)} 个字段")
        return items


async def create_field(
    access_token: str,
    app_token: str,
    table_id: str,
    field_name: str,
    field_type: int,
    property: dict | None = None,
) -> dict:
    """创建字段

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_id: 数据表 ID
        field_name: 字段名称
        field_type: 字段类型代码
        property: 类型相关属性（可选）

    Returns:
        dict: 包含 field_id, field_name, type 等

    字段类型代码:
        1: 多行文本
        2: 数字
        3: 单选
        4: 多选
        5: 日期
        7: 复选框
        13: 电话号码
        15: 超链接
    """
    body: dict[str, Any] = {
        "field_name": field_name,
        "type": field_type,
    }

    if property:
        body["property"] = property

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/fields",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
        )
        result = response.json()

        if result.get("code") != 0:
            error_msg = result.get("msg", "未知错误")
            logger.error(f"创建字段失败: {error_msg}")
            raise FeishuBitableError(
                f"创建字段失败: {error_msg}", result.get("code", 0)
            )

        data = result.get("data", {}).get("field", {})
        logger.info(f"创建字段成功: {field_name} (type={field_type})")
        return data


async def search_records(
    access_token: str,
    app_token: str,
    table_id: str,
    filter_conditions: dict | None = None,
    field_names: list[str] | None = None,
    page_size: int = 100,
    page_token: str | None = None,
) -> dict:
    """查询记录

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_id: 数据表 ID
        filter_conditions: 筛选条件
        field_names: 返回的字段名列表
        page_size: 每页记录数（最大500）
        page_token: 分页标记

    Returns:
        dict: 包含 items, page_token, has_more, total 等
    """
    body: dict[str, Any] = {
        "page_size": min(page_size, 500),
    }

    if field_names:
        body["field_names"] = field_names

    if filter_conditions:
        body["filter"] = filter_conditions

    if page_token:
        body["page_token"] = page_token

    url = (
        f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}"
        f"/tables/{table_id}/records/search"
    )
    headers = {"Authorization": f"Bearer {access_token}"}

    result = await _request_with_retry(
        method="POST",
        url=url,
        headers=headers,
        json=body,
        timeout=30.0,
    )

    if result.get("code") != 0:
        error_msg = result.get("msg", "未知错误")
        logger.error(f"查询记录失败: {error_msg}")
        raise FeishuBitableError(f"查询记录失败: {error_msg}", result.get("code", 0))

    data = result.get("data", {})
    logger.debug(f"查询到 {len(data.get('items', []))} 条记录")
    return data


async def create_record(
    access_token: str,
    app_token: str,
    table_id: str,
    fields: dict,
) -> dict:
    """新增单条记录

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_id: 数据表 ID
        fields: 字段值字典 {"字段名": 值}

    Returns:
        dict: 包含 record_id, fields 等
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/records",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"fields": fields},
        )
        result = response.json()

        if result.get("code") != 0:
            error_msg = result.get("msg", "未知错误")
            logger.error(f"新增记录失败: {error_msg}")
            raise FeishuBitableError(
                f"新增记录失败: {error_msg}", result.get("code", 0)
            )

        data = result.get("data", {}).get("record", {})
        return data


async def batch_create_records(
    access_token: str,
    app_token: str,
    table_id: str,
    records: list[dict],
) -> dict:
    """批量新增记录（最多500条，带自动重试）

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_id: 数据表 ID
        records: 记录列表，每个元素是 {"fields": {...}}

    Returns:
        dict: 包含 records 列表
    """
    if len(records) > 500:
        raise FeishuBitableError("批量新增记录最多支持500条", 0)

    url = (
        f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}"
        f"/tables/{table_id}/records/batch_create"
    )
    headers = {"Authorization": f"Bearer {access_token}"}

    result = await _request_with_retry(
        method="POST",
        url=url,
        headers=headers,
        json={"records": records},
        timeout=60.0,
    )

    if result.get("code") != 0:
        error_msg = result.get("msg", "未知错误")
        logger.error(f"批量新增记录失败: {error_msg}")
        raise FeishuBitableError(
            f"批量新增记录失败: {error_msg}", result.get("code", 0)
        )

    data = result.get("data", {})
    created_count = len(data.get("records", []))
    logger.info(f"批量新增记录成功: {created_count} 条")
    return data


async def get_or_create_table(
    access_token: str,
    app_token: str,
    table_name: str,
    fields: list[dict] | None = None,
) -> tuple[str, bool]:
    """获取指定名称的表，不存在则创建

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_name: 表名称
        fields: 创建表时的字段定义（可选）

    Returns:
        tuple: (table_id, is_created)
    """
    # 获取现有表列表
    tables = await list_tables(access_token, app_token)

    # 查找同名表
    for table in tables:
        if table.get("name") == table_name:
            logger.info(
                f"找到已存在的表: {table_name} (table_id={table.get('table_id')})"
            )
            return table.get("table_id"), False

    # 创建新表
    logger.info(f"表 {table_name} 不存在，开始创建...")
    result = await create_table(access_token, app_token, table_name, fields=fields)
    return result.get("table_id"), True


async def ensure_fields(
    access_token: str,
    app_token: str,
    table_id: str,
    required_fields: list[dict],
) -> dict:
    """确保指定字段存在，不存在则创建

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_id: 数据表 ID
        required_fields: 必需的字段列表，每个元素包含:
            - field_name: 字段名
            - type: 字段类型代码
            - property: 类型属性（可选）

    Returns:
        dict: {"existing": [...], "created": [...]}
    """
    # 获取现有字段
    existing_fields = await list_fields(access_token, app_token, table_id)
    existing_names = {f.get("field_name") for f in existing_fields}

    result = {"existing": [], "created": []}

    for field_def in required_fields:
        field_name = field_def.get("field_name")
        if field_name in existing_names:
            result["existing"].append(field_name)
        else:
            # 创建缺失字段
            await create_field(
                access_token=access_token,
                app_token=app_token,
                table_id=table_id,
                field_name=field_name,
                field_type=field_def.get("type", 1),
                property=field_def.get("property"),
            )
            result["created"].append(field_name)

    if result["created"]:
        logger.info(f"创建了 {len(result['created'])} 个缺失字段: {result['created']}")

    return result


async def check_records_exist(
    access_token: str,
    app_token: str,
    table_id: str,
    field_name: str,
    values: list[str],
) -> set[str]:
    """检查指定字段值的记录是否存在

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_id: 数据表 ID
        field_name: 用于检查的字段名
        values: 要检查的值列表

    Returns:
        set[str]: 已存在的值集合
    """
    existing_values = set()

    # 飞书搜索 API 单次最多支持500条记录
    # 对于大量记录，我们需要分批查询
    for value in values:
        filter_conditions = {
            "conjunction": "and",
            "conditions": [
                {
                    "field_name": field_name,
                    "operator": "is",
                    "value": [value],
                }
            ],
        }

        try:
            result = await search_records(
                access_token=access_token,
                app_token=app_token,
                table_id=table_id,
                filter_conditions=filter_conditions,
                field_names=[field_name],
                page_size=1,
            )

            if result.get("items"):
                existing_values.add(value)

        except FeishuBitableError:
            # 查询失败，跳过该值
            continue

    return existing_values


async def batch_check_records_exist(
    access_token: str,
    app_token: str,
    table_id: str,
    field_name: str,
    values: list[str],
    batch_size: int = 100,
) -> set[str]:
    """批量检查记录是否存在（使用OR条件优化查询）

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_id: 数据表 ID
        field_name: 用于检查的字段名
        values: 要检查的值列表
        batch_size: 每批查询的数量

    Returns:
        set[str]: 已存在的值集合
    """
    existing_values = set()

    # 分批查询
    for i in range(0, len(values), batch_size):
        batch_values = values[i : i + batch_size]

        # 构建 OR 条件
        filter_conditions = {
            "conjunction": "or",
            "conditions": [
                {
                    "field_name": field_name,
                    "operator": "is",
                    "value": [v],
                }
                for v in batch_values
            ],
        }

        try:
            # 获取所有匹配的记录
            page_token = None
            while True:
                result = await search_records(
                    access_token=access_token,
                    app_token=app_token,
                    table_id=table_id,
                    filter_conditions=filter_conditions,
                    field_names=[field_name],
                    page_size=500,
                    page_token=page_token,
                )

                # 提取已存在的值
                for item in result.get("items", []):
                    fields = item.get("fields", {})
                    value = fields.get(field_name)
                    if value:
                        # 处理可能的列表类型
                        if isinstance(value, list):
                            for v in value:
                                if isinstance(v, dict):
                                    existing_values.add(v.get("text", str(v)))
                                else:
                                    existing_values.add(str(v))
                        else:
                            existing_values.add(str(value))

                # 检查是否有更多数据
                if not result.get("has_more"):
                    break
                page_token = result.get("page_token")

        except FeishuBitableError as e:
            logger.warning(f"批量查询记录失败: {e.message}")
            continue

    return existing_values


async def get_all_field_values(
    access_token: str,
    app_token: str,
    table_id: str,
    field_name: str,
) -> set[str]:
    """获取表中指定字段的所有值（高效去重方案）

    通过分页遍历整个表，一次性获取所有已存在的字段值。
    适用于表记录数量适中的场景（建议 < 5万条），比分批 OR 查询更高效。

    性能对比:
    - batch_check_records_exist: 每100个值需要1次API请求
    - get_all_field_values: 每500条记录需要1次API请求

    Args:
        access_token: 飞书访问令牌
        app_token: 多维表格 app_token
        table_id: 数据表 ID
        field_name: 要获取值的字段名

    Returns:
        set[str]: 该字段的所有值集合
    """
    all_values = set()
    page_token = None
    total_fetched = 0

    while True:
        result = await search_records(
            access_token=access_token,
            app_token=app_token,
            table_id=table_id,
            field_names=[field_name],
            page_size=500,
            page_token=page_token,
        )

        items = result.get("items", [])
        total_fetched += len(items)

        for item in items:
            fields = item.get("fields", {})
            value = fields.get(field_name)
            if value:
                # 处理可能的列表类型（如多行文本）
                if isinstance(value, list):
                    for v in value:
                        if isinstance(v, dict):
                            all_values.add(v.get("text", str(v)))
                        else:
                            all_values.add(str(v))
                else:
                    all_values.add(str(value))

        # 检查是否有更多数据
        if not result.get("has_more"):
            break
        page_token = result.get("page_token")

    logger.debug(f"获取到 {len(all_values)} 个唯一值 (共 {total_fetched} 条记录)")
    return all_values
