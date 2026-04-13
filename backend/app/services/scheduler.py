"""
自動売買スケジューラ。

FastAPI lifespan で asyncio.create_task(scheduler_loop()) として起動。
1日2回、各市場の取引時間中に戦略ポートフォリオを実行する。

セッション時刻:
  TSE_AM — 10:00 JST (01:00 UTC)
  TSE_PM — 14:00 JST (05:00 UTC)
  US_AM  — 10:30 EST (15:30 UTC / 14:30 UTC 夏時間)
  US_PM  — 14:30 EST (19:30 UTC / 18:30 UTC 夏時間)
"""
import asyncio
import logging
from datetime import datetime, timedelta

import pytz

from app.services.strategy_runner import run_strategy_session

logger = logging.getLogger(__name__)

_JST = pytz.timezone("Asia/Tokyo")
_EST = pytz.timezone("America/New_York")

# (セッション名, タイムゾーン, 時, 分)
_SESSIONS: list[tuple[str, pytz.BaseTzInfo, int, int]] = [
    ("TSE_AM", _JST, 10, 0),
    ("TSE_PM", _JST, 14, 0),
    ("US_AM",  _EST, 10, 30),
    ("US_PM",  _EST, 14, 30),
]


def _next_fire(now_utc: datetime) -> tuple[datetime, str]:
    """
    現時刻 (UTC) から最も近い次のセッション時刻と名前を返す。
    週末はスキップして月曜に送る。
    """
    candidates: list[tuple[datetime, str]] = []

    for session_name, tz, hour, minute in _SESSIONS:
        now_local = now_utc.astimezone(tz)
        # 今日の発火時刻
        fire_local = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        fire_utc = fire_local.astimezone(pytz.utc)

        # 過去ならば翌日以降を探す
        if fire_utc <= now_utc:
            fire_utc += timedelta(days=1)
            fire_local = fire_utc.astimezone(tz)

        # 週末スキップ（土曜=5, 日曜=6）
        while fire_local.weekday() >= 5:
            fire_utc += timedelta(days=1)
            fire_local = fire_utc.astimezone(tz)

        candidates.append((fire_utc, session_name))

    candidates.sort(key=lambda x: x[0])
    return candidates[0]


async def _fire_session(session: str) -> None:
    """指定セッションで全戦略ポートフォリオを並列実行する。"""
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.portfolio import Portfolio

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Portfolio).where(Portfolio.portfolio_type.in_(["strategy", "theme"]))
        )
        portfolios = result.scalars().all()

    if not portfolios:
        logger.info(f"[scheduler] {session}: 戦略・テーマポートフォリオなし")
        return

    logger.info(f"[scheduler] {session} 開始 — {len(portfolios)} ポートフォリオ")

    tasks = [
        run_strategy_session(p.id, p.strategy_name, session)
        for p in portfolios
        if p.strategy_name
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for p, r in zip(portfolios, results):
        if isinstance(r, Exception):
            logger.error(f"[scheduler] {p.strategy_name}/{session} エラー: {r}")

    logger.info(f"[scheduler] {session} 完了")


async def scheduler_loop() -> None:
    """
    アプリ起動時に create_task で起動する無限ループ。
    次のセッション時刻まで sleep して発火する。
    """
    logger.info("[scheduler] スケジューラ起動")
    while True:
        now_utc = datetime.now(pytz.utc)
        next_time, session_name = _next_fire(now_utc)
        wait_secs = (next_time - now_utc).total_seconds()

        logger.info(
            f"[scheduler] 次のセッション: {session_name} "
            f"at {next_time.strftime('%Y-%m-%d %H:%M UTC')} "
            f"({wait_secs/3600:.1f}h 後)"
        )

        await asyncio.sleep(wait_secs)

        try:
            await _fire_session(session_name)
        except Exception as e:
            logger.error(f"[scheduler] セッション実行エラー: {e}")
