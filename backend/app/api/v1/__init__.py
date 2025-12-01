"""API v1 路由"""

from fastapi import APIRouter

from app.api.v1 import accounts, health, yunke

router = APIRouter()

# 注册子路由
router.include_router(health.router, tags=["健康检查"])
router.include_router(yunke.router)
router.include_router(accounts.router)
