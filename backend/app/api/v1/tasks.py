"""任务管理 API 路由"""

import asyncio
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from loguru import logger

from app.models.task import (
    ScheduledTaskCreate,
    ScheduledTaskResponse,
    ScheduledTaskUpdate,
)
from app.models.task_execution import (
    ExecutionStatus,
    TaskExecutionDetailResponse,
    TaskExecutionResponse,
)
from app.schemas.response import ResponseModel
from app.scheduler import subscribe_log, unsubscribe_log
from app.scheduler.registry import get_registered_handlers
from app.services import task_service

router = APIRouter(prefix="/tasks", tags=["任务管理"])


@router.get("", response_model=ResponseModel[list[ScheduledTaskResponse]])
async def get_tasks(
    status: str = Query(None, description="按状态筛选"),
    category: str = Query(None, description="按分类筛选"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """获取所有定时任务"""
    tasks = task_service.get_all_tasks(
        status=status, category=category, page=page, size=size
    )
    return ResponseModel.success(data=tasks)


@router.get("/categories", response_model=ResponseModel[list[str]])
async def get_categories():
    """获取所有已使用的任务分类"""
    categories = task_service.get_all_categories()
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
    executions, total = task_service.get_all_executions(
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
    execution = task_service.get_execution_by_id(execution_id)
    if not execution:
        return ResponseModel.error(code=404, message="执行记录不存在")
    return ResponseModel.success(data=execution)


@router.get("/{task_id}", response_model=ResponseModel[ScheduledTaskResponse])
async def get_task(task_id: int):
    """获取单个任务详情"""
    task = task_service.get_task_by_id(task_id)
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
async def run_task(task_id: int):
    """手动触发任务执行"""
    result = await task_service.run_task_now(task_id)
    if result["success"]:
        return ResponseModel.success(data=result, message="任务已触发")
    return ResponseModel.error(code=400, message=result["message"])


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
    executions = task_service.get_task_executions(task_id, page=page, size=size)
    return ResponseModel.success(data=executions)


async def _log_stream_generator(execution_id: int) -> AsyncGenerator[str, None]:
    """SSE 日志流生成器"""
    # 检查执行记录是否存在
    execution = task_service.get_execution_by_id(execution_id)
    if not execution:
        yield f'data: {{"error": "执行记录不存在"}}\n\n'
        return

    # 【重要】无论任务状态如何，先发送已有的日志
    if execution.log_output:
        for line in execution.log_output.split("\n"):
            if line.strip():  # 跳过空行
                escaped = line.replace("\\", "\\\\").replace('"', '\\"')
                yield f'data: {{"log": "{escaped}"}}\n\n'

    # 如果任务已完成，发送完成信号并结束
    if execution.status not in [ExecutionStatus.RUNNING, ExecutionStatus.PENDING]:
        yield f'data: {{"status": "{execution.status.value}", "finished": true}}\n\n'
        return

    # 任务仍在运行，订阅实时日志
    queue = subscribe_log(execution_id)
    try:
        # 发送运行中状态
        yield f'data: {{"status": "running", "execution_id": {execution_id}}}\n\n'

        # 持续读取日志
        while True:
            try:
                log_line = await asyncio.wait_for(queue.get(), timeout=30.0)
                if log_line is None:
                    # 任务结束信号
                    # 重新获取执行记录以获取最终状态
                    execution = task_service.get_execution_by_id(execution_id)
                    status = execution.status.value if execution else "unknown"
                    yield f'data: {{"status": "{status}", "finished": true}}\n\n'
                    break
                # 转义 JSON 特殊字符
                escaped = log_line.replace("\\", "\\\\").replace('"', '\\"')
                yield f'data: {{"log": "{escaped}"}}\n\n'
            except asyncio.TimeoutError:
                # 发送心跳保持连接
                yield f": heartbeat\n\n"
    finally:
        unsubscribe_log(execution_id, queue)


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
