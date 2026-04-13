import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal, init_db
from app.api.v1 import market_data, portfolio, orders, trades, backtest, config

logger = logging.getLogger(__name__)

# ─── Startup セード ──────────────────────────────────────────────────────────

_SEED_PORTFOLIOS = [
    ("ユーザーポートフォリオ", "user",     None),
    ("トレンドフォロー",       "strategy", "trend_follow"),
    ("ファクター選択",         "strategy", "factor_selection"),
    ("セクターローテーション", "strategy", "sector_rotation"),
    ("モメンタムブレイクアウト", "strategy", "momentum_breakout"),
]


async def _seed_portfolios() -> None:
    """起動時に戦略ポートフォリオが存在しなければ作成する。"""
    from app.models.portfolio import Portfolio

    async with AsyncSessionLocal() as db:
        created = 0
        for name, ptype, sname in _SEED_PORTFOLIOS:
            if sname is None:
                stmt = select(Portfolio).where(Portfolio.portfolio_type == "user").limit(1)
            else:
                stmt = select(Portfolio).where(Portfolio.strategy_name == sname).limit(1)
            existing = (await db.execute(stmt)).scalar_one_or_none()
            if not existing:
                db.add(Portfolio(
                    name=name,
                    currency="JPY",
                    initial_capital=1_000_000,
                    cash_balance=1_000_000,
                    portfolio_type=ptype,
                    strategy_name=sname,
                ))
                created += 1

        if created:
            await db.commit()
            logger.info(f"[startup] {created} 個のポートフォリオをシードしました")
        else:
            logger.info("[startup] ポートフォリオは既に存在します")


# ─── Lifespan ────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB 初期化（テーブル作成）
    Path("data").mkdir(exist_ok=True)
    await init_db()

    # ポートフォリオシード
    await _seed_portfolios()

    # スケジューラ起動
    from app.services.scheduler import scheduler_loop
    scheduler_task = asyncio.create_task(scheduler_loop())

    yield

    # クリーンアップ
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass


# ─── App factory ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="株シミュ API",
    description="日本株・米国株の売買シミュレータ",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API ルーター
prefix = "/api/v1"
app.include_router(market_data.router, prefix=prefix)
app.include_router(portfolio.router,   prefix=prefix)
app.include_router(orders.router,      prefix=prefix)
app.include_router(trades.router,      prefix=prefix)
app.include_router(backtest.router,    prefix=prefix)
app.include_router(config.router,      prefix=prefix)

# React SPA の配信（本番ビルド）
DIST = Path(__file__).parent / "static" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse(DIST / "index.html")
