from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    from app.models import portfolio, order, trade, backtest, snapshot, signal_log  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # SQLite ALTER TABLE マイグレーション（既存DBへの新カラム追加）
        await _migrate_portfolios(conn)


async def _migrate_portfolios(conn) -> None:
    """portfolios テーブルに新カラムを追加（存在しない場合のみ）。"""
    import logging
    logger = logging.getLogger(__name__)
    try:
        # 現在のカラム一覧を確認
        result = await conn.execute(
            __import__("sqlalchemy").text("PRAGMA table_info(portfolios)")
        )
        existing_cols = {row[1] for row in result.fetchall()}

        if "portfolio_type" not in existing_cols:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE portfolios ADD COLUMN portfolio_type VARCHAR(20) DEFAULT 'user'"
                )
            )
            logger.info("[migrate] portfolios.portfolio_type カラムを追加しました")

        if "strategy_name" not in existing_cols:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE portfolios ADD COLUMN strategy_name VARCHAR(50)"
                )
            )
            logger.info("[migrate] portfolios.strategy_name カラムを追加しました")

        if "theme_name" not in existing_cols:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE portfolios ADD COLUMN theme_name VARCHAR(100)"
                )
            )
            logger.info("[migrate] portfolios.theme_name カラムを追加しました")

        if "universe_json" not in existing_cols:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE portfolios ADD COLUMN universe_json TEXT"
                )
            )
            logger.info("[migrate] portfolios.universe_json カラムを追加しました")

    except Exception as e:
        logger.warning(f"[migrate] マイグレーションスキップ: {e}")
