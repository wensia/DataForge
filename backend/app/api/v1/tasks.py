"""任务管理 API 路由"""

import asyncio
from collections.abc import AsyncGenerator
from datetime import datetime

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from loguru import logger

from app.models.task import (
    ScheduledTaskCreate,
    ScheduledTaskResponse,
    ScheduledTaskUpdate,
)
from app.models.task_execution import (
    TaskExecutionDetailResponse,
    TaskExecutionResponse,
)
from app.scheduler.registry import get_registered_tasks
from app.schemas.response import ResponseModel
from app.services import task_service
from app.utils.redis_client import (
    get_logs_async,
    subscribe_logs,
)

router = APIRouter(prefix="/tasks", tags=["任务管理"])


@router.get("", response_model=ResponseModel[list[ScheduledTaskResponse]])
async def get_tasks(
    status: str = Query(None, description="按状态筛选"),
    category: str = Query(None, description="按分类筛选"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """获取所有定时任务"""
    tasks = await task_service.get_all_tasks_async(
        status=status, category=category, page=page, size=size
    )
    return ResponseModel.success(data=tasks)


@router.get("/categories", response_model=ResponseModel[list[str]])
async def get_categories():
    """获取所有已使用的任务分类"""
    categories = await task_service.get_all_categories_async()
    return ResponseModel.success(data=categories)


@router.get("/handlers", response_model=ResponseModel[list[dict]])
async def get_handlers():
    """获取所有可用的任务处理函数（已注册的 Celery 任务）"""
    handlers = get_registered_tasks()
    return ResponseModel.success(data=handlers)


@router.get("/executions/all", response_model=ResponseModel[dict])
async def get_all_executions(
    task_id: int = Query(None, description="按任务ID筛选"),
    status: str = Query(None, description="按状态筛选: success/failed/running/pending"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """获取所有任务的执行记录"""
    executions, total = await task_service.get_all_executions_async(
        task_id=task_id, status=status, page=page, size=size
    )
    return ResponseModel.success(
        data={"items": executions, "total": total, "page": page, "size": size}
    )


@router.get(
    "/executions/{execution_id}",
    response_model=ResponseModel[TaskExecutionDetailResponse],
)
async def get_execution_detail(execution_id: int):
    """获取执行详情"""
    execution = await task_service.get_execution_by_id_async(execution_id)
    if not execution:
        return ResponseModel.error(code=404, message="执行记录不存在")
    return ResponseModel.success(data=execution)


@router.get("/executions/{execution_id}/logs", response_model=ResponseModel[dict])
async def get_execution_logs(execution_id: int):
    """获取执行日志（轮询用）

    返回日志列表和执行状态，用于前端轮询获取实时日志。
    - 运行中：从 Redis List 获取实时日志
    - 已完成：从数据库 log_output 获取
    """
    execution = await task_service.get_execution_by_id_async(execution_id)
    if not execution:
        return ResponseModel.error(code=404, message="执行记录不存在")

    # 以数据库状态为准判断是否结束（pending/running 都属于进行中）
    db_status = execution.status.value
    is_active = db_status in ("pending", "running")

    if is_active:
        # 从 Redis 获取实时日志
        logs = await get_logs_async(execution_id)
    else:
        # 从数据库获取完成后的日志
        logs = execution.log_output.split("\n") if execution.log_output else []

    # 过滤空行
    logs = [line for line in logs if line.strip()]

    return ResponseModel.success(
        data={
            "logs": logs,
            "status": db_status,
            "finished": not is_active,
        }
    )


@router.post("/executions/{execution_id}/cancel", response_model=ResponseModel)
async def cancel_execution(execution_id: int):
    """取消执行中的任务

    将运行中或等待中的任务标记为已取消状态。
    注意：这只是标记状态变更，无法真正终止已在运行的后台任务。
    """
    result = await task_service.cancel_execution_async(execution_id)
    if result["success"]:
        return ResponseModel.success(message=result["message"])
    return ResponseModel.error(code=400, message=result["message"])


# ============================================================================
# 任务锁管理 API（必须放在 /{task_id} 路由之前，否则会被路径参数拦截）
# ============================================================================


@router.get("/locks", response_model=ResponseModel[list[dict]])
async def get_all_locks():
    """获取所有任务锁

    返回当前 Redis 中所有任务锁的列表，包括：
    - task_id: 任务 ID
    - holder: 锁持有者（Worker ID）
    - ttl: 剩余过期时间（秒）

    用于监控和调试锁状态。
    """
    from app.utils.task_lock import list_all_task_locks

    locks = list_all_task_locks()
    return ResponseModel.success(data=locks)


@router.get("/{task_id}", response_model=ResponseModel[ScheduledTaskResponse])
async def get_task(task_id: int):
    """获取单个任务详情"""
    task = await task_service.get_task_by_id_async(task_id)
    if not task:
        return ResponseModel.error(code=404, message="任务不存在")
    return ResponseModel.success(data=task)


@router.post("", response_model=ResponseModel[ScheduledTaskResponse])
async def create_task(data: ScheduledTaskCreate):
    """创建新任务"""
    try:
        # 检查名称是否已存在
        existing = task_service.get_task_by_name(data.name)
        if existing:
            return ResponseModel.error(code=400, message="任务名称已存在")

        task = task_service.create_task(data)
        return ResponseModel.success(data=task, message="任务创建成功")
    except Exception as e:
        logger.error(f"创建任务失败: {e}")
        return ResponseModel.error(code=500, message=str(e))


@router.put("/{task_id}", response_model=ResponseModel[ScheduledTaskResponse])
async def update_task(task_id: int, data: ScheduledTaskUpdate):
    """更新任务配置"""
    task = task_service.update_task(task_id, data)
    if not task:
        return ResponseModel.error(code=404, message="任务不存在")
    return ResponseModel.success(data=task, message="任务更新成功")


@router.delete("/{task_id}", response_model=ResponseModel)
async def delete_task(task_id: int):
    """删除任务"""
    success = await task_service.delete_task_async(task_id)
    if not success:
        return ResponseModel.error(code=400, message="任务不存在或为系统任务，无法删除")
    return ResponseModel.success(message="任务删除成功")


@router.post("/{task_id}/run", response_model=ResponseModel)
async def run_task(task_id: int):
    """手动触发任务执行（通过 Celery 异步执行）"""
    from app.celery_app import celery_app

    # 验证任务存在和 task_name 有效
    result = task_service.validate_task_for_run(task_id)
    if not result["success"]:
        return ResponseModel.error(code=400, message=result["message"])

    # 通过 Celery 直接调用任务
    task_name = result["task_name"]
    handler_kwargs = result["handler_kwargs"]

    celery_result = celery_app.send_task(
        task_name,
        kwargs={
            "scheduled_task_id": task_id,
            "trigger_type": "manual",
            **handler_kwargs,
        },
    )

    return ResponseModel.success(
        data={
            "task_id": task_id,
            "task_name": task_name,
            "celery_task_id": celery_result.id,
            "message": "任务已发送到 Celery 队列",
        },
        message="任务已触发",
    )


@router.post("/{task_id}/pause", response_model=ResponseModel)
async def pause_task(task_id: int):
    """暂停任务"""
    success = task_service.pause_task(task_id)
    if not success:
        return ResponseModel.error(code=404, message="任务不存在")
    return ResponseModel.success(message="任务已暂停")


@router.post("/{task_id}/resume", response_model=ResponseModel)
async def resume_task(task_id: int):
    """恢复任务"""
    success = task_service.resume_task(task_id)
    if not success:
        return ResponseModel.error(code=404, message="任务不存在")
    return ResponseModel.success(message="任务已恢复")


@router.get(
    "/{task_id}/executions", response_model=ResponseModel[list[TaskExecutionResponse]]
)
async def get_task_executions(
    task_id: int,
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """获取任务执行历史"""
    executions = await task_service.get_task_executions_async(
        task_id, page=page, size=size
    )
    return ResponseModel.success(data=executions)


def _escape_log_for_json(log_line: str) -> str:
    """转义日志行中的 JSON 特殊字符"""
    return log_line.replace("\\", "\\\\").replace('"', '\\"')


async def _log_stream_generator(execution_id: int) -> AsyncGenerator[str, None]:
    """SSE 日志流生成器

    使用 Redis List 存储日志，Pub/Sub 只用于通知有新日志。
    这样可以解决订阅前消息丢失的问题。

    增强功能：
    - 初始连接确认
    - 任务超时检测（最大运行 1 小时）
    - 更短的状态检查间隔（10 秒）
    """
    # 任务最大运行时间（秒）
    MAX_RUNNING_TIME = 3600  # 1 小时

    # 1. 发送连接确认
    yield f'data: {{"connected": true, "execution_id": {execution_id}}}\n\n'

    # 2. 检查执行记录是否存在
    execution = await task_service.get_execution_by_id_async(execution_id)
    if not execution:
        yield 'data: {"error": "执行记录不存在"}\n\n'
        return

    # 3. 如果任务已结束，直接返回完整日志并关闭连接
    db_status = execution.status.value
    if db_status not in ("pending", "running"):
        if execution.log_output:
            for line in execution.log_output.split("\n"):
                if line.strip():
                    escaped = _escape_log_for_json(line)
                    yield f'data: {{"log": "{escaped}"}}\n\n'
        yield f'data: {{"status": "{db_status}", "finished": true}}\n\n'
        return

    # 4. 检查任务是否运行超时
    if execution.started_at:
        running_time = (datetime.now() - execution.started_at).total_seconds()
        if running_time > MAX_RUNNING_TIME:
            yield f'data: {{"warning": "任务运行超时（已运行 {int(running_time)} 秒）", "timeout": true}}\n\n'
            yield 'data: {"status": "timeout", "finished": true}\n\n'
            return

    # 5. pending/running：先发送已存在的 Redis 日志（若还没开始可能为空）
    sent_count = 0
    existing_logs = await get_logs_async(execution_id)
    for log_line in existing_logs:
        if log_line.strip():
            escaped = _escape_log_for_json(log_line)
            yield f'data: {{"log": "{escaped}"}}\n\n'
            sent_count += 1

    yield f'data: {{"status": "{db_status}", "execution_id": {execution_id}}}\n\n'

    # 6. 订阅 Pub/Sub 获取新日志通知；若不可用则回退轮询
    pubsub = await subscribe_logs(execution_id)
    if pubsub is None:
        yield 'data: {"warning": "Redis Pub/Sub不可用，使用轮询模式"}\n\n'
        while True:
            await asyncio.sleep(1)
            new_logs = await get_logs_async(execution_id, start=sent_count)
            for log_line in new_logs:
                if log_line.strip():
                    escaped = _escape_log_for_json(log_line)
                    yield f'data: {{"log": "{escaped}"}}\n\n'
                    sent_count += 1

            execution = await task_service.get_execution_by_id_async(execution_id)
            if not execution:
                yield 'data: {"error": "执行记录不存在"}\n\n'
                return
            db_status = execution.status.value
            if db_status not in ("pending", "running"):
                remaining_logs = await get_logs_async(execution_id, start=sent_count)
                for log_line in remaining_logs:
                    if log_line.strip():
                        escaped = _escape_log_for_json(log_line)
                        yield f'data: {{"log": "{escaped}"}}\n\n'
                        sent_count += 1
                yield f'data: {{"status": "{db_status}", "finished": true}}\n\n'
                return

            yield ": heartbeat\n\n"

    try:
        while True:
            try:
                # 使用 10 秒超时，更频繁检查 DB 状态
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0),
                    timeout=10.0,
                )
                if message is None:
                    # 没有消息，检查 DB 状态是否已结束
                    execution = await task_service.get_execution_by_id_async(
                        execution_id
                    )
                    if not execution:
                        yield 'data: {"error": "执行记录不存在"}\n\n'
                        break
                    db_status = execution.status.value
                    if db_status not in ("pending", "running"):
                        remaining_logs = await get_logs_async(
                            execution_id, start=sent_count
                        )
                        for log_line in remaining_logs:
                            if log_line.strip():
                                escaped = _escape_log_for_json(log_line)
                                yield f'data: {{"log": "{escaped}"}}\n\n'
                                sent_count += 1
                        yield f'data: {{"status": "{db_status}", "finished": true}}\n\n'
                        break
                    continue

                if message["type"] == "message":
                    data = message["data"]
                    if data == "__END__":
                        remaining_logs = await get_logs_async(
                            execution_id, start=sent_count
                        )
                        for log_line in remaining_logs:
                            if log_line.strip():
                                escaped = _escape_log_for_json(log_line)
                                yield f'data: {{"log": "{escaped}"}}\n\n'
                                sent_count += 1

                        execution = await task_service.get_execution_by_id_async(
                            execution_id
                        )
                        db_status = execution.status.value if execution else "unknown"
                        yield f'data: {{"status": "{db_status}", "finished": true}}\n\n'
                        break
                    elif data == "NEW_LOG":
                        new_logs = await get_logs_async(execution_id, start=sent_count)
                        for log_line in new_logs:
                            if log_line.strip():
                                escaped = _escape_log_for_json(log_line)
                                yield f'data: {{"log": "{escaped}"}}\n\n'
                                sent_count += 1

            except TimeoutError:
                yield ": heartbeat\n\n"
                execution = await task_service.get_execution_by_id_async(execution_id)
                if not execution:
                    yield 'data: {"error": "执行记录不存在"}\n\n'
                    break
                db_status = execution.status.value
                if db_status not in ("pending", "running"):
                    remaining_logs = await get_logs_async(
                        execution_id, start=sent_count
                    )
                    for log_line in remaining_logs:
                        if log_line.strip():
                            escaped = _escape_log_for_json(log_line)
                            yield f'data: {{"log": "{escaped}"}}\n\n'
                            sent_count += 1
                    yield f'data: {{"status": "{db_status}", "finished": true}}\n\n'
                    break

                # 检查任务是否运行超时
                if execution.started_at:
                    running_time = (
                        datetime.now() - execution.started_at
                    ).total_seconds()
                    if running_time > MAX_RUNNING_TIME:
                        yield f'data: {{"warning": "任务运行超时（已运行 {int(running_time)} 秒）", "timeout": true}}\n\n'
                        yield 'data: {"status": "timeout", "finished": true}\n\n'
                        break
    finally:
        await pubsub.unsubscribe()
        await pubsub.close()


@router.get("/executions/{execution_id}/logs/stream")
async def stream_execution_logs(execution_id: int):
    """
    实时流式获取执行日志 (SSE)

    使用 Server-Sent Events 推送实时日志。
    如果任务已完成，直接返回完整日志并关闭连接。
    如果任务正在运行，持续推送新的日志行。

    响应格式:
    - {"log": "日志内容"} - 日志行
    - {"status": "success", "finished": true} - 任务完成
    - {"error": "错误信息"} - 错误
    """
    return StreamingResponse(
        _log_stream_generator(execution_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{task_id}/lock", response_model=ResponseModel[dict])
async def get_task_lock(task_id: int):
    """获取指定任务的锁信息

    Args:
        task_id: 任务 ID

    Returns:
        锁信息，包括是否存在、持有者、TTL
    """
    from app.utils.task_lock import get_lock_info

    lock_key = f"task_lock:{task_id}"
    lock_info = get_lock_info(lock_key)

    if lock_info is None:
        return ResponseModel.error(code=500, message="无法获取锁信息（Redis 不可用）")

    return ResponseModel.success(data=lock_info)


@router.post("/{task_id}/release-lock", response_model=ResponseModel)
async def release_task_lock(task_id: int):
    """强制释放任务锁（管理员操作）

    当任务因异常卡住而锁未释放时，管理员可使用此接口强制释放锁。

    注意：
    - 此操作会直接删除锁，不验证持有者
    - 仅用于清理异常情况，正常情况锁会自动过期
    - 强制释放锁可能导致任务并发执行，请谨慎使用

    Args:
        task_id: 任务 ID

    Returns:
        释放结果
    """
    from app.utils.task_lock import force_release_task_lock, get_lock_info

    lock_key = f"task_lock:{task_id}"

    # 先检查锁是否存在
    lock_info = get_lock_info(lock_key)
    if lock_info is None:
        return ResponseModel.error(code=500, message="无法获取锁信息（Redis 不可用）")

    if not lock_info.get("exists"):
        return ResponseModel.error(code=404, message="锁不存在或已过期")

    # 强制释放锁
    success = force_release_task_lock(lock_key)
    if success:
        logger.warning(f"管理员强制释放了任务 #{task_id} 的锁")
        return ResponseModel.success(
            message=f"已强制释放任务 #{task_id} 的锁",
            data={"task_id": task_id, "released": True},
        )
    else:
        return ResponseModel.error(code=500, message="释放锁失败")
