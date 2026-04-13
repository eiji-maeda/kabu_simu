from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.portfolio import Portfolio, Position
from app.models.signal_log import SignalLog
from app.models.snapshot import PortfolioSnapshot
from app.schemas.portfolio import (
    PortfolioCreate, PortfolioOut, PositionOut,
    SignalLogOut, SignalSummary, StrategySignalReport,
    ThemeSuggestRequest, ThemeSuggestResponse, ThemePortfolioCreate,
)
from app.services.market_data import get_fx_rate, get_quote

router = APIRouter(prefix="/portfolios", tags=["portfolio"])


async def _get_portfolio(portfolio_id: int, db: AsyncSession) -> Portfolio:
    result = await db.get(Portfolio, portfolio_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"ポートフォリオ {portfolio_id} が見つかりません")
    return result


@router.get("", response_model=list[PortfolioOut])
async def list_portfolios(db: AsyncSession = Depends(get_db)):
    import asyncio as _asyncio
    result = await db.execute(select(Portfolio))
    portfolios = result.scalars().all()

    try:
        fx_rate = await _asyncio.get_event_loop().run_in_executor(
            None, lambda: get_fx_rate("USD", "JPY")
        )
    except Exception:
        fx_rate = 150.0

    out = []
    for p in portfolios:
        pout = PortfolioOut.model_validate(p, from_attributes=True)
        for pos in pout.positions:
            if pos.currency == "USD":
                pos.fx_rate = fx_rate
        out.append(pout)
    return out


@router.post("", response_model=PortfolioOut, status_code=201)
async def create_portfolio(body: PortfolioCreate, db: AsyncSession = Depends(get_db)):
    p = Portfolio(
        name=body.name,
        currency=body.currency,
        initial_capital=body.initial_capital,
        cash_balance=body.initial_capital,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@router.get("/comparison")
async def get_portfolio_comparison(db: AsyncSession = Depends(get_db)):
    """
    全ポートフォリオの現在状態とスナップショット履歴を返す。
    ダッシュボードの比較チャート・テーブルで使用。
    """
    portfolios_result = await db.execute(select(Portfolio))
    portfolios = portfolios_result.scalars().all()

    try:
        fx_rate = await __import__("asyncio").get_event_loop().run_in_executor(
            None, lambda: get_fx_rate("USD", "JPY")
        )
    except Exception:
        fx_rate = 150.0

    result = []
    for p in portfolios:
        # スナップショット取得（最新252件）
        snap_result = await db.execute(
            select(PortfolioSnapshot)
            .where(PortfolioSnapshot.portfolio_id == p.id)
            .order_by(PortfolioSnapshot.timestamp.asc())
            .limit(252)
        )
        snapshots = snap_result.scalars().all()

        equity_curve = [
            {
                "date": s.timestamp.strftime("%Y-%m-%d"),
                "value": float(s.total_value),
            }
            for s in snapshots
        ]

        # スナップショットがない場合は開始点だけ
        if not equity_curve:
            equity_curve = [
                {
                    "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "value": float(p.initial_capital),
                }
            ]

        # 現在の総評価額（JPY換算）
        positions_value = 0.0
        for pos in p.positions:
            mv = float(pos.current_price) * pos.quantity
            if pos.currency == "USD":
                mv *= fx_rate
            positions_value += mv
        total_value = float(p.cash_balance) + positions_value
        initial = float(p.initial_capital)

        result.append({
            "id": p.id,
            "name": p.name,
            "portfolio_type": p.portfolio_type,
            "strategy_name": p.strategy_name,
            "theme_name": p.theme_name,
            "initial_capital": initial,
            "total_value": total_value,
            "total_return_pct": (total_value / initial - 1) * 100 if initial > 0 else 0.0,
            "cash_balance": float(p.cash_balance),
            "position_count": len(p.positions),
            "equity_curve": equity_curve,
        })

    return result


@router.get("/signal-report", response_model=list[StrategySignalReport])
async def get_signal_report(db: AsyncSession = Depends(get_db)):
    """
    全戦略ポートフォリオの直近セッション実行レポートを返す。
    各戦略について「どの銘柄を評価し、なぜ売買したか/しなかったか」を含む。
    """
    from sqlalchemy import func

    # 戦略ポートフォリオ + テーマ型ポートフォリオを取得
    pf_result = await db.execute(
        select(Portfolio).where(Portfolio.portfolio_type.in_(["strategy", "theme"]))
    )
    strategy_portfolios = pf_result.scalars().all()

    reports: list[StrategySignalReport] = []

    for portfolio in strategy_portfolios:
        from datetime import timedelta

        # BUY/SELL が含まれる最新セッションを優先し、なければ最新セッションを使う
        action_q = await db.execute(
            select(func.max(SignalLog.executed_at)).where(
                SignalLog.portfolio_id == portfolio.id,
                SignalLog.action.in_(["BUY", "SELL"]),
            )
        )
        latest_action_at = action_q.scalar_one_or_none()

        latest_q = await db.execute(
            select(func.max(SignalLog.executed_at)).where(
                SignalLog.portfolio_id == portfolio.id
            )
        )
        latest_at = latest_q.scalar_one_or_none()

        if latest_at is None:
            continue  # まだ実行されていない

        # BUY/SELL があればその実行時刻を基準に、なければ最新セッション時刻を基準にする
        target_at = latest_action_at if latest_action_at else latest_at

        # target_at を中心に ±120秒のウィンドウで同一セッション実行回のログを取得
        # （セッション名は US_AM 等が繰り返し使われるため時刻でフィルタ）
        window_start = target_at - timedelta(seconds=120)
        window_end   = target_at + timedelta(seconds=120)
        logs_q = await db.execute(
            select(SignalLog).where(
                SignalLog.portfolio_id == portfolio.id,
                SignalLog.executed_at >= window_start,
                SignalLog.executed_at <= window_end,
            ).order_by(SignalLog.executed_at)
        )
        logs = logs_q.scalars().all()

        if not logs:
            continue

        session = logs[0].session
        signals = [
            SignalLogOut(
                symbol=log.symbol,
                market=log.market,
                action=log.action,
                price=float(log.price),
                reasoning=log.reasoning,
                executed_at=log.executed_at,
            )
            for log in logs
        ]

        counts = {"BUY": 0, "SELL": 0, "HOLD": 0, "ERROR": 0}
        for s in signals:
            counts[s.action] = counts.get(s.action, 0) + 1

        reports.append(StrategySignalReport(
            portfolio_id=portfolio.id,
            strategy_name=portfolio.strategy_name,
            portfolio_name=portfolio.theme_name or portfolio.name,
            session=session,
            executed_at=target_at,
            signals=signals,
            summary=SignalSummary(
                buy=counts["BUY"],
                sell=counts["SELL"],
                hold=counts["HOLD"],
                error=counts["ERROR"],
                total=len(signals),
            ),
        ))

    return reports


@router.post("/run-session")
async def manual_run_session(
    session: Literal["TSE_AM", "TSE_PM", "US_AM", "US_PM"],
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    テスト用エンドポイント: 指定セッションを手動でトリガーする。
    バックグラウンドで実行し即座に 202 を返す。
    """
    from app.services.scheduler import _fire_session
    background_tasks.add_task(_fire_session, session)
    return {"status": "started", "session": session}


@router.post("/theme/suggest", response_model=ThemeSuggestResponse)
async def suggest_theme(body: ThemeSuggestRequest):
    """
    テーマ文字列から Claude API で関連銘柄を提案する（DB 未変更）。
    ANTHROPIC_API_KEY が未設定の場合は 503 を返す。
    """
    from app.services.theme_resolver import suggest_symbols
    try:
        result = await suggest_symbols(body.theme)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result


@router.post("/theme", response_model=PortfolioOut, status_code=201)
async def create_theme_portfolio(
    body: ThemePortfolioCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    テーマ型ポートフォリオを作成する。
    銘柄ユニバースは毎回の売買実行時に Claude API で動的生成するため DB には保存しない。
    """
    from app.core.config import settings

    p = Portfolio(
        name=f"{body.theme_name}（テーマ）",
        currency="JPY",
        initial_capital=settings.initial_capital,
        cash_balance=settings.initial_capital,
        portfolio_type="theme",
        strategy_name="theme_follow",
        theme_name=body.theme_name,
        universe_json=None,  # 実行時に動的生成
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@router.post("/{portfolio_id}/advise")
async def advise_strategy(
    portfolio_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Claude API を使って戦略の改善アドバイスを返す。
    body: { "message": str, "metrics": {...} }
    """
    from app.services.strategy_advisor import get_advice
    from app.core.config import settings

    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY が未設定です。バックエンドの .env に設定してください。"
        )

    portfolio = await _get_portfolio(portfolio_id, db)
    message = str(body.get("message", ""))
    metrics = body.get("metrics", {})

    try:
        advice = await get_advice(portfolio, message, metrics)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"advice": advice}


@router.get("/{portfolio_id}", response_model=PortfolioOut)
async def get_portfolio(portfolio_id: int, db: AsyncSession = Depends(get_db)):
    return await _get_portfolio(portfolio_id, db)


@router.delete("/{portfolio_id}", status_code=204)
async def delete_portfolio(portfolio_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get_portfolio(portfolio_id, db)
    await db.delete(p)
    await db.commit()


@router.get("/{portfolio_id}/positions", response_model=list[PositionOut])
async def get_positions(portfolio_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get_portfolio(portfolio_id, db)
    return p.positions


@router.post("/{portfolio_id}/refresh")
async def refresh_prices(portfolio_id: int, db: AsyncSession = Depends(get_db)):
    """全ポジションの現在値を更新する。"""
    p = await _get_portfolio(portfolio_id, db)
    updated = []
    for pos in p.positions:
        try:
            q = get_quote(pos.symbol)
            pos.current_price = q["price"]
            updated.append(pos.symbol)
        except Exception:
            pass
    await db.commit()
    return {"updated": updated}
