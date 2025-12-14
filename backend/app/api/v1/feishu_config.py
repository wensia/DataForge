"""飞书配置管理接口（三层结构：客户端 → 多维表格 → 数据表）"""

from datetime import datetime

import httpx
from fastapi import APIRouter
from loguru import logger
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models.feishu_bitable import (
    FeishuBitable,
    FeishuBitableCreate,
    FeishuBitableResponse,
    FeishuBitableUpdate,
)
from app.models.feishu_client import (
    FeishuClient,
    FeishuClientCreate,
    FeishuClientResponse,
    FeishuClientUpdate,
)
from app.models.feishu_table import (
    FeishuTable,
    FeishuTableCreate,
    FeishuTableResponse,
    FeishuTableUpdate,
)
from app.schemas.response import ResponseModel

router = APIRouter(prefix="/feishu", tags=["飞书配置"])


# ==================== 飞书凭证验证 ====================


class FeishuCredentialsVerify(BaseModel):
    """飞书凭证验证请求"""

    app_id: str
    app_secret: str


@router.post("/verify", response_model=ResponseModel)
async def verify_feishu_credentials(credentials: FeishuCredentialsVerify):
    """验证飞书 App ID 和 App Secret 是否有效"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
                json={
                    "app_id": credentials.app_id,
                    "app_secret": credentials.app_secret,
                },
            )
            result = response.json()

            if result.get("code") == 0:
                # 验证成功
                return ResponseModel.success(
                    data={
                        "valid": True,
                        "tenant_access_token": result.get("tenant_access_token"),
                        "expire": result.get("expire"),
                    },
                    message="飞书凭证验证成功",
                )
            else:
                # 验证失败
                error_msg = result.get("msg", "未知错误")
                logger.warning(f"飞书凭证验证失败: {error_msg}")
                return ResponseModel.success(
                    data={"valid": False, "error": error_msg},
                    message=f"飞书凭证验证失败: {error_msg}",
                )
    except httpx.TimeoutException:
        logger.error("飞书凭证验证超时")
        return ResponseModel.error(code=500, message="飞书 API 请求超时")
    except Exception as e:
        logger.error(f"飞书凭证验证异常: {e}")
        return ResponseModel.error(code=500, message=f"验证异常: {str(e)}")


# ==================== 获取飞书多维表格名称 ====================


class FetchBitableNameRequest(BaseModel):
    """获取多维表格名称请求"""

    app_token: str


@router.post("/clients/{client_id}/fetch-bitable-name", response_model=ResponseModel)
async def fetch_bitable_name(client_id: int, request: FetchBitableNameRequest):
    """通过 app_token 从飞书 API 获取多维表格名称"""
    with Session(engine) as session:
        # 获取客户端凭证
        client = session.get(FeishuClient, client_id)
        if not client:
            return ResponseModel.error(code=404, message="客户端不存在")

        try:
            async with httpx.AsyncClient(timeout=10.0) as http_client:
                # 1. 获取 tenant_access_token
                token_response = await http_client.post(
                    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
                    json={"app_id": client.app_id, "app_secret": client.app_secret},
                )
                token_result = token_response.json()

                if token_result.get("code") != 0:
                    error_msg = token_result.get("msg", "获取 token 失败")
                    logger.warning(f"获取飞书 token 失败: {error_msg}")
                    return ResponseModel.error(
                        code=500, message=f"获取飞书凭证失败: {error_msg}"
                    )

                tenant_access_token = token_result.get("tenant_access_token")

                # 2. 获取多维表格元信息
                api_response = await http_client.get(
                    f"https://open.feishu.cn/open-apis/bitable/v1/apps/{request.app_token}",
                    headers={"Authorization": f"Bearer {tenant_access_token}"},
                )
                result = api_response.json()

                if result.get("code") != 0:
                    error_msg = result.get("msg", "获取多维表格信息失败")
                    logger.warning(f"获取多维表格信息失败: {error_msg}")
                    return ResponseModel.error(code=400, message=error_msg)

                app_info = result.get("data", {}).get("app", {})
                return ResponseModel.success(
                    data={
                        "name": app_info.get("name", ""),
                        "app_token": request.app_token,
                    },
                    message="获取多维表格名称成功",
                )

        except httpx.TimeoutException:
            logger.error("获取多维表格名称超时")
            return ResponseModel.error(code=500, message="飞书 API 请求超时")
        except Exception as e:
            logger.error(f"获取多维表格名称异常: {e}")
            return ResponseModel.error(code=500, message=f"获取异常: {str(e)}")


# ==================== 获取飞书多维表格数据表列表 ====================


@router.get("/bitables/{bitable_id}/fetch-tables", response_model=ResponseModel)
async def fetch_feishu_bitable_tables(bitable_id: int):
    """从飞书 API 获取多维表格下的所有数据表"""
    with Session(engine) as session:
        # 获取多维表格配置
        bitable = session.get(FeishuBitable, bitable_id)
        if not bitable:
            return ResponseModel.error(code=404, message="多维表格不存在")

        # 获取关联的客户端配置
        client = session.get(FeishuClient, bitable.client_id)
        if not client:
            return ResponseModel.error(code=404, message="关联的飞书客户端不存在")

        try:
            async with httpx.AsyncClient(timeout=10.0) as http_client:
                # 先获取 tenant_access_token
                token_response = await http_client.post(
                    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
                    json={
                        "app_id": client.app_id,
                        "app_secret": client.app_secret,
                    },
                )
                token_result = token_response.json()

                if token_result.get("code") != 0:
                    error_msg = token_result.get("msg", "获取 token 失败")
                    return ResponseModel.error(
                        code=500, message=f"飞书认证失败: {error_msg}"
                    )

                tenant_access_token = token_result.get("tenant_access_token")

                # 获取多维表格下的数据表列表
                tables_response = await http_client.get(
                    f"https://open.feishu.cn/open-apis/bitable/v1/apps/{bitable.app_token}/tables",
                    headers={"Authorization": f"Bearer {tenant_access_token}"},
                )
                tables_result = tables_response.json()

                if tables_result.get("code") != 0:
                    error_msg = tables_result.get("msg", "获取数据表列表失败")
                    return ResponseModel.error(
                        code=500, message=f"获取数据表失败: {error_msg}"
                    )

                # 提取数据表信息
                items = tables_result.get("data", {}).get("items", [])
                table_list = [
                    {
                        "table_id": item.get("table_id"),
                        "name": item.get("name"),
                        "revision": item.get("revision"),
                    }
                    for item in items
                ]

                logger.info(
                    f"获取多维表格 {bitable.name} 的数据表列表: {len(table_list)} 个"
                )

                return ResponseModel.success(
                    data=table_list,
                    message=f"获取到 {len(table_list)} 个数据表",
                )

        except httpx.TimeoutException:
            logger.error("获取飞书数据表列表超时")
            return ResponseModel.error(code=500, message="飞书 API 请求超时")
        except Exception as e:
            logger.error(f"获取飞书数据表列表异常: {e}")
            return ResponseModel.error(code=500, message=f"获取异常: {str(e)}")


# ==================== 同步数据表功能 ====================


async def _fetch_remote_tables(
    client: FeishuClient, app_token: str
) -> tuple[list[dict], str | None]:
    """
    从飞书 API 获取数据表列表

    Returns:
        tuple: (数据表列表, 错误信息)
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            # 获取 tenant_access_token
            token_response = await http_client.post(
                "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
                json={"app_id": client.app_id, "app_secret": client.app_secret},
            )
            token_result = token_response.json()

            if token_result.get("code") != 0:
                return [], f"飞书认证失败: {token_result.get('msg', '获取 token 失败')}"

            tenant_access_token = token_result.get("tenant_access_token")

            # 获取数据表列表
            tables_response = await http_client.get(
                f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables",
                headers={"Authorization": f"Bearer {tenant_access_token}"},
            )
            tables_result = tables_response.json()

            if tables_result.get("code") != 0:
                return [], f"获取数据表失败: {tables_result.get('msg', '未知错误')}"

            items = tables_result.get("data", {}).get("items", [])
            return [
                {"table_id": item.get("table_id"), "name": item.get("name")}
                for item in items
            ], None

    except httpx.TimeoutException:
        return [], "飞书 API 请求超时"
    except Exception as e:
        return [], f"获取异常: {str(e)}"


async def sync_bitable_tables(
    session: Session, bitable: FeishuBitable, client: FeishuClient
) -> dict:
    """
    同步多维表格的数据表到数据库

    Returns:
        dict: {"added": int, "updated": int, "deactivated": int, "error": str | None}
    """
    # 从飞书获取远程数据表
    remote_tables, error = await _fetch_remote_tables(client, bitable.app_token)
    if error:
        return {"added": 0, "updated": 0, "deactivated": 0, "error": error}

    # 获取数据库中现有的数据表
    existing_tables = session.exec(
        select(FeishuTable).where(FeishuTable.bitable_id == bitable.id)
    ).all()
    existing_map = {t.table_id: t for t in existing_tables}

    # 远程数据表 table_id 集合
    remote_table_ids = {t["table_id"] for t in remote_tables}

    added = 0
    updated = 0
    deactivated = 0

    # 处理远程数据表
    for remote_table in remote_tables:
        table_id = remote_table["table_id"]
        name = remote_table["name"]

        if table_id in existing_map:
            # 已存在：更新名称，恢复激活状态
            db_table = existing_map[table_id]
            if db_table.name != name or not db_table.is_active:
                db_table.name = name
                db_table.is_active = True
                db_table.updated_at = datetime.now()
                session.add(db_table)
                updated += 1
        else:
            # 新增
            new_table = FeishuTable(
                bitable_id=bitable.id,
                name=name,
                table_id=table_id,
                is_active=True,
            )
            session.add(new_table)
            added += 1

    # 处理已删除的数据表：标记为无效
    for table_id, db_table in existing_map.items():
        if table_id not in remote_table_ids and db_table.is_active:
            db_table.is_active = False
            db_table.updated_at = datetime.now()
            session.add(db_table)
            deactivated += 1

    session.commit()

    logger.info(
        f"同步多维表格 {bitable.name} 的数据表: "
        f"新增 {added}, 更新 {updated}, 标记无效 {deactivated}"
    )

    return {
        "added": added,
        "updated": updated,
        "deactivated": deactivated,
        "error": None,
    }


@router.post("/bitables/{bitable_id}/sync-tables", response_model=ResponseModel)
async def sync_feishu_bitable_tables(bitable_id: int):
    """同步多维表格的数据表（从飞书获取最新数据并更新数据库）"""
    with Session(engine) as session:
        # 获取多维表格
        bitable = session.get(FeishuBitable, bitable_id)
        if not bitable:
            return ResponseModel.error(code=404, message="多维表格不存在")

        # 获取关联的客户端
        client = session.get(FeishuClient, bitable.client_id)
        if not client:
            return ResponseModel.error(code=404, message="关联的飞书客户端不存在")

        # 执行同步
        result = await sync_bitable_tables(session, bitable, client)

        if result["error"]:
            return ResponseModel.error(code=500, message=result["error"])

        return ResponseModel.success(
            data=result,
            message=f"同步完成：新增 {result['added']} 个，更新 {result['updated']} 个，标记无效 {result['deactivated']} 个",
        )


# ==================== 飞书客户端 API ====================


@router.get("/clients", response_model=ResponseModel)
async def list_feishu_clients():
    """获取飞书客户端列表"""
    with Session(engine) as session:
        statement = select(FeishuClient)
        clients = session.exec(statement).all()

        client_responses = [
            FeishuClientResponse(
                id=client.id,
                name=client.name,
                app_id=client.app_id,
                is_active=client.is_active,
                notes=client.notes,
                created_at=client.created_at,
                updated_at=client.updated_at,
            )
            for client in clients
        ]

        return ResponseModel.success(
            data=client_responses,
            message=f"获取到 {len(client_responses)} 个飞书客户端",
        )


@router.post("/clients", response_model=ResponseModel)
async def create_feishu_client(client_data: FeishuClientCreate):
    """创建飞书客户端"""
    with Session(engine) as session:
        # 检查 app_id 是否已存在
        existing = session.exec(
            select(FeishuClient).where(FeishuClient.app_id == client_data.app_id)
        ).first()
        if existing:
            return ResponseModel.error(code=400, message="该 App ID 已存在")

        # 创建新客户端
        new_client = FeishuClient(
            name=client_data.name,
            app_id=client_data.app_id,
            app_secret=client_data.app_secret,
            notes=client_data.notes,
        )

        session.add(new_client)
        session.commit()
        session.refresh(new_client)

        logger.info(f"创建飞书客户端: {new_client.name} (ID: {new_client.id})")

        return ResponseModel.success(
            data=FeishuClientResponse(
                id=new_client.id,
                name=new_client.name,
                app_id=new_client.app_id,
                is_active=new_client.is_active,
                notes=new_client.notes,
                created_at=new_client.created_at,
                updated_at=new_client.updated_at,
            ),
            message="飞书客户端创建成功",
        )


@router.get("/clients/{client_id}", response_model=ResponseModel)
async def get_feishu_client(client_id: int):
    """获取单个飞书客户端详情"""
    with Session(engine) as session:
        client = session.get(FeishuClient, client_id)
        if not client:
            return ResponseModel.error(code=404, message="飞书客户端不存在")

        return ResponseModel.success(
            data=FeishuClientResponse(
                id=client.id,
                name=client.name,
                app_id=client.app_id,
                is_active=client.is_active,
                notes=client.notes,
                created_at=client.created_at,
                updated_at=client.updated_at,
            ),
            message="获取飞书客户端成功",
        )


@router.put("/clients/{client_id}", response_model=ResponseModel)
async def update_feishu_client(client_id: int, client_data: FeishuClientUpdate):
    """更新飞书客户端"""
    with Session(engine) as session:
        client = session.get(FeishuClient, client_id)
        if not client:
            return ResponseModel.error(code=404, message="飞书客户端不存在")

        # 更新字段
        if client_data.name is not None:
            client.name = client_data.name
        if client_data.app_secret is not None:
            client.app_secret = client_data.app_secret
        if client_data.is_active is not None:
            client.is_active = client_data.is_active
        if client_data.notes is not None:
            client.notes = client_data.notes

        client.updated_at = datetime.now()

        session.add(client)
        session.commit()
        session.refresh(client)

        logger.info(f"更新飞书客户端: {client.name} (ID: {client.id})")

        return ResponseModel.success(
            data=FeishuClientResponse(
                id=client.id,
                name=client.name,
                app_id=client.app_id,
                is_active=client.is_active,
                notes=client.notes,
                created_at=client.created_at,
                updated_at=client.updated_at,
            ),
            message="飞书客户端更新成功",
        )


@router.delete("/clients/{client_id}", response_model=ResponseModel)
async def delete_feishu_client(client_id: int):
    """删除飞书客户端（级联删除关联的多维表格和数据表）"""
    with Session(engine) as session:
        client = session.get(FeishuClient, client_id)
        if not client:
            return ResponseModel.error(code=404, message="飞书客户端不存在")

        # 级联删除：先删除关联的数据表，再删除多维表格
        bitables = session.exec(
            select(FeishuBitable).where(FeishuBitable.client_id == client_id)
        ).all()

        for bitable in bitables:
            tables = session.exec(
                select(FeishuTable).where(FeishuTable.bitable_id == bitable.id)
            ).all()
            for table in tables:
                session.delete(table)
            session.delete(bitable)

        client_name = client.name
        session.delete(client)
        session.commit()

        logger.info(f"删除飞书客户端: {client_name} (ID: {client_id})")

        return ResponseModel.success(
            data={"id": client_id},
            message="飞书客户端删除成功",
        )


# ==================== 飞书多维表格 API ====================


@router.get("/bitables", response_model=ResponseModel)
async def list_all_feishu_bitables():
    """获取所有多维表格（含客户端信息和数据表统计）"""
    with Session(engine) as session:
        # 联表查询：多维表格 + 客户端
        statement = (
            select(FeishuBitable, FeishuClient)
            .join(FeishuClient, FeishuBitable.client_id == FeishuClient.id)
            .order_by(FeishuBitable.id.desc())
        )
        results = session.exec(statement).all()

        bitable_responses = []
        for bitable, client in results:
            # 查询该多维表格下的活跃数据表
            tables = session.exec(
                select(FeishuTable)
                .where(FeishuTable.bitable_id == bitable.id)
                .where(FeishuTable.is_active)
                .order_by(FeishuTable.id)
            ).all()

            bitable_responses.append(
                {
                    "id": bitable.id,
                    "client_id": bitable.client_id,
                    "name": bitable.name,
                    "app_token": bitable.app_token,
                    "is_active": bitable.is_active,
                    "notes": bitable.notes,
                    "created_at": bitable.created_at.isoformat()
                    if bitable.created_at
                    else None,
                    "updated_at": bitable.updated_at.isoformat()
                    if bitable.updated_at
                    else None,
                    "client_name": client.name,
                    "client_app_id": client.app_id,
                    "table_count": len(tables),
                    "table_preview": [t.name for t in tables[:3]],
                }
            )

        return ResponseModel.success(
            data=bitable_responses,
            message=f"获取到 {len(bitable_responses)} 个多维表格",
        )


@router.get("/clients/{client_id}/bitables", response_model=ResponseModel)
async def list_feishu_bitables(client_id: int):
    """获取指定客户端下的多维表格列表（含数据表统计）"""
    with Session(engine) as session:
        # 检查客户端是否存在
        client = session.get(FeishuClient, client_id)
        if not client:
            return ResponseModel.error(code=404, message="飞书客户端不存在")

        statement = select(FeishuBitable).where(FeishuBitable.client_id == client_id)
        bitables = session.exec(statement).all()

        bitable_responses = []
        for bitable in bitables:
            # 查询该多维表格下的活跃数据表
            tables = session.exec(
                select(FeishuTable)
                .where(FeishuTable.bitable_id == bitable.id)
                .where(FeishuTable.is_active)
                .order_by(FeishuTable.id)
            ).all()

            bitable_responses.append(
                {
                    "id": bitable.id,
                    "client_id": bitable.client_id,
                    "name": bitable.name,
                    "app_token": bitable.app_token,
                    "is_active": bitable.is_active,
                    "notes": bitable.notes,
                    "created_at": bitable.created_at.isoformat()
                    if bitable.created_at
                    else None,
                    "updated_at": bitable.updated_at.isoformat()
                    if bitable.updated_at
                    else None,
                    "table_count": len(tables),
                    "table_preview": [t.name for t in tables[:3]],
                }
            )

        return ResponseModel.success(
            data=bitable_responses,
            message=f"获取到 {len(bitable_responses)} 个多维表格",
        )


@router.post("/clients/{client_id}/bitables", response_model=ResponseModel)
async def create_feishu_bitable(client_id: int, bitable_data: FeishuBitableCreate):
    """在指定客户端下创建多维表格（创建后自动同步数据表）"""
    with Session(engine) as session:
        # 检查客户端是否存在
        client = session.get(FeishuClient, client_id)
        if not client:
            return ResponseModel.error(code=404, message="飞书客户端不存在")

        # 检查同一客户端下 app_token 是否重复
        existing = session.exec(
            select(FeishuBitable).where(
                FeishuBitable.client_id == client_id,
                FeishuBitable.app_token == bitable_data.app_token,
            )
        ).first()
        if existing:
            return ResponseModel.error(
                code=400, message="该客户端下已存在相同的 App Token"
            )

        # 创建新多维表格
        new_bitable = FeishuBitable(
            client_id=client_id,
            name=bitable_data.name,
            app_token=bitable_data.app_token,
            notes=bitable_data.notes,
        )

        session.add(new_bitable)
        session.commit()
        session.refresh(new_bitable)

        logger.info(f"创建多维表格: {new_bitable.name} (ID: {new_bitable.id})")

        # 自动同步数据表
        sync_result = await sync_bitable_tables(session, new_bitable, client)
        sync_msg = ""
        if sync_result["error"]:
            sync_msg = f"（数据表同步失败: {sync_result['error']}）"
        elif sync_result["added"] > 0:
            sync_msg = f"，同步了 {sync_result['added']} 个数据表"

        return ResponseModel.success(
            data={
                "bitable": FeishuBitableResponse(
                    id=new_bitable.id,
                    client_id=new_bitable.client_id,
                    name=new_bitable.name,
                    app_token=new_bitable.app_token,
                    is_active=new_bitable.is_active,
                    notes=new_bitable.notes,
                    created_at=new_bitable.created_at,
                    updated_at=new_bitable.updated_at,
                ),
                "sync_result": sync_result,
            },
            message=f"多维表格创建成功{sync_msg}",
        )


@router.get("/bitables/{bitable_id}", response_model=ResponseModel)
async def get_feishu_bitable(bitable_id: int):
    """获取单个多维表格详情"""
    with Session(engine) as session:
        bitable = session.get(FeishuBitable, bitable_id)
        if not bitable:
            return ResponseModel.error(code=404, message="多维表格不存在")

        return ResponseModel.success(
            data=FeishuBitableResponse(
                id=bitable.id,
                client_id=bitable.client_id,
                name=bitable.name,
                app_token=bitable.app_token,
                is_active=bitable.is_active,
                notes=bitable.notes,
                created_at=bitable.created_at,
                updated_at=bitable.updated_at,
            ),
            message="获取多维表格成功",
        )


@router.put("/bitables/{bitable_id}", response_model=ResponseModel)
async def update_feishu_bitable(bitable_id: int, bitable_data: FeishuBitableUpdate):
    """更新多维表格"""
    with Session(engine) as session:
        bitable = session.get(FeishuBitable, bitable_id)
        if not bitable:
            return ResponseModel.error(code=404, message="多维表格不存在")

        # 更新字段
        if bitable_data.name is not None:
            bitable.name = bitable_data.name
        if bitable_data.app_token is not None:
            bitable.app_token = bitable_data.app_token
        if bitable_data.is_active is not None:
            bitable.is_active = bitable_data.is_active
        if bitable_data.notes is not None:
            bitable.notes = bitable_data.notes

        bitable.updated_at = datetime.now()

        session.add(bitable)
        session.commit()
        session.refresh(bitable)

        logger.info(f"更新多维表格: {bitable.name} (ID: {bitable.id})")

        return ResponseModel.success(
            data=FeishuBitableResponse(
                id=bitable.id,
                client_id=bitable.client_id,
                name=bitable.name,
                app_token=bitable.app_token,
                is_active=bitable.is_active,
                notes=bitable.notes,
                created_at=bitable.created_at,
                updated_at=bitable.updated_at,
            ),
            message="多维表格更新成功",
        )


@router.delete("/bitables/{bitable_id}", response_model=ResponseModel)
async def delete_feishu_bitable(bitable_id: int):
    """删除多维表格（级联删除关联的数据表）"""
    with Session(engine) as session:
        bitable = session.get(FeishuBitable, bitable_id)
        if not bitable:
            return ResponseModel.error(code=404, message="多维表格不存在")

        # 级联删除关联的数据表
        tables = session.exec(
            select(FeishuTable).where(FeishuTable.bitable_id == bitable_id)
        ).all()
        for table in tables:
            session.delete(table)

        bitable_name = bitable.name
        session.delete(bitable)
        session.commit()

        logger.info(f"删除多维表格: {bitable_name} (ID: {bitable_id})")

        return ResponseModel.success(
            data={"id": bitable_id},
            message="多维表格删除成功",
        )


# ==================== 飞书数据表 API ====================


@router.get("/bitables/{bitable_id}/tables", response_model=ResponseModel)
async def list_feishu_tables(bitable_id: int):
    """获取指定多维表格下的数据表列表"""
    with Session(engine) as session:
        # 检查多维表格是否存在
        bitable = session.get(FeishuBitable, bitable_id)
        if not bitable:
            return ResponseModel.error(code=404, message="多维表格不存在")

        statement = select(FeishuTable).where(FeishuTable.bitable_id == bitable_id)
        tables = session.exec(statement).all()

        table_responses = [
            FeishuTableResponse(
                id=table.id,
                bitable_id=table.bitable_id,
                name=table.name,
                table_id=table.table_id,
                is_active=table.is_active,
                notes=table.notes,
                created_at=table.created_at,
                updated_at=table.updated_at,
            )
            for table in tables
        ]

        return ResponseModel.success(
            data=table_responses,
            message=f"获取到 {len(table_responses)} 个数据表",
        )


@router.post("/bitables/{bitable_id}/tables", response_model=ResponseModel)
async def create_feishu_table(bitable_id: int, table_data: FeishuTableCreate):
    """在指定多维表格下创建数据表"""
    with Session(engine) as session:
        # 检查多维表格是否存在
        bitable = session.get(FeishuBitable, bitable_id)
        if not bitable:
            return ResponseModel.error(code=404, message="多维表格不存在")

        # 检查同一多维表格下 table_id 是否重复
        existing = session.exec(
            select(FeishuTable).where(
                FeishuTable.bitable_id == bitable_id,
                FeishuTable.table_id == table_data.table_id,
            )
        ).first()
        if existing:
            return ResponseModel.error(
                code=400, message="该多维表格下已存在相同的 Table ID"
            )

        # 创建新数据表
        new_table = FeishuTable(
            bitable_id=bitable_id,
            name=table_data.name,
            table_id=table_data.table_id,
            notes=table_data.notes,
        )

        session.add(new_table)
        session.commit()
        session.refresh(new_table)

        logger.info(f"创建数据表: {new_table.name} (ID: {new_table.id})")

        return ResponseModel.success(
            data=FeishuTableResponse(
                id=new_table.id,
                bitable_id=new_table.bitable_id,
                name=new_table.name,
                table_id=new_table.table_id,
                is_active=new_table.is_active,
                notes=new_table.notes,
                created_at=new_table.created_at,
                updated_at=new_table.updated_at,
            ),
            message="数据表创建成功",
        )


@router.get("/tables/{table_id}", response_model=ResponseModel)
async def get_feishu_table(table_id: int):
    """获取单个数据表详情"""
    with Session(engine) as session:
        table = session.get(FeishuTable, table_id)
        if not table:
            return ResponseModel.error(code=404, message="数据表不存在")

        return ResponseModel.success(
            data=FeishuTableResponse(
                id=table.id,
                bitable_id=table.bitable_id,
                name=table.name,
                table_id=table.table_id,
                is_active=table.is_active,
                notes=table.notes,
                created_at=table.created_at,
                updated_at=table.updated_at,
            ),
            message="获取数据表成功",
        )


@router.put("/tables/{table_id}", response_model=ResponseModel)
async def update_feishu_table(table_id: int, table_data: FeishuTableUpdate):
    """更新数据表"""
    with Session(engine) as session:
        table = session.get(FeishuTable, table_id)
        if not table:
            return ResponseModel.error(code=404, message="数据表不存在")

        # 更新字段
        if table_data.name is not None:
            table.name = table_data.name
        if table_data.table_id is not None:
            table.table_id = table_data.table_id
        if table_data.is_active is not None:
            table.is_active = table_data.is_active
        if table_data.notes is not None:
            table.notes = table_data.notes

        table.updated_at = datetime.now()

        session.add(table)
        session.commit()
        session.refresh(table)

        logger.info(f"更新数据表: {table.name} (ID: {table.id})")

        return ResponseModel.success(
            data=FeishuTableResponse(
                id=table.id,
                bitable_id=table.bitable_id,
                name=table.name,
                table_id=table.table_id,
                is_active=table.is_active,
                notes=table.notes,
                created_at=table.created_at,
                updated_at=table.updated_at,
            ),
            message="数据表更新成功",
        )


@router.delete("/tables/{table_id}", response_model=ResponseModel)
async def delete_feishu_table(table_id: int):
    """删除数据表"""
    with Session(engine) as session:
        table = session.get(FeishuTable, table_id)
        if not table:
            return ResponseModel.error(code=404, message="数据表不存在")

        table_name = table.name
        session.delete(table)
        session.commit()

        logger.info(f"删除数据表: {table_name} (ID: {table_id})")

        return ResponseModel.success(
            data={"id": table_id},
            message="数据表删除成功",
        )
