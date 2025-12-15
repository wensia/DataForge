"""API v1 路由"""

from fastapi import APIRouter

from app.api.v1 import (
    accounts,
    ai_config,
    api_keys,
    asr_config,
    auth,
    chat,
    dajiala_config,
    data_analysis,
    feishu_config,
    health,
    organization,
    prompts,
    record_proxy,
    robot,
    staff_mapping,
    tasks,
    user_preferences,
    users,
    wechat_article,
    yunke,
)

router = APIRouter()

# 注册子路由
router.include_router(health.router, tags=["健康检查"])
router.include_router(auth.router, tags=["认证管理"])
router.include_router(api_keys.router)
router.include_router(feishu_config.router)
router.include_router(yunke.router)
router.include_router(accounts.router)
router.include_router(tasks.router)
router.include_router(users.router)
router.include_router(organization.router)
router.include_router(data_analysis.router)
router.include_router(ai_config.router)
router.include_router(asr_config.router)
router.include_router(dajiala_config.router)
router.include_router(record_proxy.router)
router.include_router(user_preferences.router)
router.include_router(staff_mapping.router)
router.include_router(chat.router)
router.include_router(prompts.router)
router.include_router(robot.router)
router.include_router(wechat_article.router)
