from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/status")
async def config_status():
    """フロントエンドが API キー設定状況を確認するためのエンドポイント。"""
    return {
        "anthropic_api_key_set": bool(settings.anthropic_api_key),
    }
