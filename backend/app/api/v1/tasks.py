"""任务管理 API 路由"""

import asyncio
from collections.abc import AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, Query
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
from app.scheduler import is_execution_running
from app.scheduler.registry import get_registered_handlers
from app.schemas.response import ResponseModel
from app.services import task_service
from app.utils.redis_client import (
    get_execution_status_async,
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
    """获取所有可用的任务处理函数"""
    handlers = get_registered_handlers()
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
    success = task_service.delete_task(task_id)
    if not success:
        return ResponseModel.error(code=400, message="任务不存在或为系统任务，无法删除")
    return ResponseModel.success(message="任务删除成功")


@router.post("/{task_id}/run", response_model=ResponseModel)
async def run_task(task_id: int, background_tasks: BackgroundTasks):
    """手动触发任务执行（立即返回，后台执行）"""
    # 仅验证任务存在和处理函数有效，不做数据库写入
    result = task_service.validate_task_for_run(task_id)
    if not result["success"]:
        return ResponseModel.error(code=400, message=result["message"])

    # 添加到 FastAPI 后台任务队列（在独立线程执行，不阻塞事件循环）
    background_tasks.add_task(
        task_service.run_task_in_background,
        task_id=task_id,
        handler_path=result["handler_path"],
        handler_kwargs=result["handler_kwargs"],
    )

    return ResponseModel.success(
        data={"task_id": task_id, "message": "任务已加入执行队列"},
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
    """
    # 1. 检查执行记录是否存在
    execution = await task_service.get_execution_by_id_async(execution_id)
    if not execution:
        yield 'data: {"error": "执行记录不存在"}\n\n'
        return

    # 2. 检查 Redis 中的任务状态
    redis_status = await get_execution_status_async(execution_id)

    # 3. 如果任务正在运行（Redis 状态为 running）
    if redis_status == "running":
        # 从 Redis List 获取已有日志
        sent_count = 0
        existing_logs = await get_logs_async(execution_id)
        for log_line in existing_logs:
            if log_line.strip():
                escaped = _escape_log_for_json(log_line)
                yield f'data: {{"log": "{escaped}"}}\n\n'
                sent_count += 1

        # 发送运行中状态
        yield f'data: {{"status": "running", "execution_id": {execution_id}}}\n\n'

        # 订阅 Pub/Sub 获取新日志通知
        pubsub = await subscribe_logs(execution_id)
        if pubsub is None:
            # Redis Pub/Sub 不可用，回退到轮询模式
            yield 'data: {"warning": "Redis Pub/Sub不可用，使用轮询模式"}\n\n'
            while is_execution_running(execution_id):
                await asyncio.sleep(1)
                # 检查是否有新日志
                new_logs = await get_logs_async(execution_id, start=sent_count)
                for log_line in new_logs:
                    if log_line.strip():
                        escaped = _escape_log_for_json(log_line)
                        yield f'data: {{"log": "{escaped}"}}\n\n'
                        sent_count += 1
                yield ": heartbeat\n\n"
            # 任务结束
            execution = await task_service.get_execution_by_id_async(execution_id)
            status = execution.status.value if execution else "unknown"
            yield f'data: {{"status": "{status}", "finished": true}}\n\n'
            return

        try:
            while True:
                try:
                    message = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0),
                        timeout=30.0,
                    )
                    if message is None:
                        # 没有消息，检查任务是否还在运行
                        if not is_execution_running(execution_id):
                            execution = await task_service.get_execution_by_id_async(
                                execution_id
                            )
                            status = (
                                execution.status.value if execution else "unknown"
                            )
                            finished_msg = f'{{"status": "{status}", "finished": true}}'
                            yield f"data: {finished_msg}\n\n"
                            break
                        continue

                    if message["type"] == "message":
                        data = message["data"]
                        if data == "__END__":
                            # 任务结束信号 - 获取剩余日志
                            remaining_logs = await get_logs_async(
                                execution_id, start=sent_count
                            )
                            for log_line in remaining_logs:
                                if log_line.strip():
                                    escaped = _escape_log_for_json(log_line)
                                    yield f'data: {{"log": "{escaped}"}}\n\n'
                            # 发送完成信号
                            execution = await task_service.get_execution_by_id_async(
                                execution_id
                            )
                            status = (
                                execution.status.value if execution else "unknown"
                            )
                            finished_msg = f'{{"status": "{status}", "finished": true}}'
                            yield f"data: {finished_msg}\n\n"
                            break
                        elif data == "NEW_LOG":
                            # 有新日志通知 - 从 Redis List 获取新日志
                            new_logs = await get_logs_async(
                                execution_id, start=sent_count
                            )
                            for log_line in new_logs:
                                if log_line.strip():
                                    escaped = _escape_log_for_json(log_line)
                                    yield f'data: {{"log": "{escaped}"}}\n\n'
                                    sent_count += 1

                except TimeoutError:
                    yield ": heartbeat\n\n"
                    if not is_execution_running(execution_id):
                        execution = await task_service.get_execution_by_id_async(
                            execution_id
                        )
                        status = execution.status.value if execution else "unknown"
                        yield f'data: {{"status": "{status}", "finished": true}}\n\n'
                        break
        finally:
            await pubsub.unsubscribe()
            await pubsub.close()

    else:
        # 4. 任务已完成或 Redis 状态不存在 - 从数据库获取日志
        if execution.log_output:
            for line in execution.log_output.split("\n"):
                if line.strip():
                    escaped = _escape_log_for_json(line)
                    yield f'data: {{"log": "{escaped}"}}\n\n'

        # 发送完成状态
        yield f'data: {{"status": "{execution.status.value}", "finished": true}}\n\n'


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
