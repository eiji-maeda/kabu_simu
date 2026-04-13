import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.backtest import BacktestComparison, BacktestRun
from app.schemas.backtest import (
    BacktestRunRequest, ComparisonRequest, ComparisonOut
)
from app.services.backtester import run_backtest
from app.strategies import STRATEGY_INFO, STRATEGY_REGISTRY

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.get("/strategies")
async def list_strategies():
    return STRATEGY_INFO


@router.post("/run", status_code=202)
async def start_backtest(body: BacktestRunRequest, db: AsyncSession = Depends(get_db)):
    if body.strategy_name not in STRATEGY_REGISTRY and body.strategy_name != "claude":
        raise HTTPException(status_code=400, detail=f"未知のストラテジ: {body.strategy_name}")

    run = BacktestRun(
        strategy_name=body.strategy_name,
        symbols=json.dumps(body.symbols),
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
        status="RUNNING",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # 非同期で実行（ブロックしない）
    asyncio.create_task(_run_async(run.id, body))

    return {"id": run.id, "status": "RUNNING"}


async def _run_async(run_id: int, body: BacktestRunRequest) -> None:
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        run = await db.get(BacktestRun, run_id)
        if not run:
            return
        try:
            strategy_cls = STRATEGY_REGISTRY.get(body.strategy_name)
            if not strategy_cls:
                run.status = "FAILED"
                run.result_json = json.dumps({"error": "ストラテジ不明"})
                await db.commit()
                return

            strategy = strategy_cls()
            result = await asyncio.to_thread(
                run_backtest,
                strategy,
                body.symbols[0],
                str(body.start_date),
                str(body.end_date),
                float(body.initial_capital),
            )
            run.status = "COMPLETED"
            run.result_json = json.dumps(result)
            run.completed_at = datetime.now(timezone.utc)
        except Exception as e:
            run.status = "FAILED"
            run.result_json = json.dumps({"error": str(e)})
        await db.commit()


@router.get("/run/{run_id}")
async def get_backtest_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await db.get(BacktestRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="バックテストが見つかりません")

    data: dict = {
        "id": run.id,
        "strategy_name": run.strategy_name,
        "symbols": json.loads(run.symbols),
        "start_date": str(run.start_date),
        "end_date": str(run.end_date),
        "initial_capital": float(run.initial_capital),
        "status": run.status,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "equity_curve": [],
        "metrics": None,
        "trades": [],
    }
    if run.result_json:
        result = json.loads(run.result_json)
        data["equity_curve"] = result.get("equity_curve", [])
        data["metrics"]      = result.get("metrics")
        data["trades"]       = result.get("trades", [])
    return data


@router.post("/comparison", status_code=202)
async def start_comparison(body: ComparisonRequest, db: AsyncSession = Depends(get_db)):
    comp = BacktestComparison(
        name=body.name,
        symbol=body.symbol,
        start_date=body.start_date,
        end_date=body.end_date,
        initial_capital=body.initial_capital,
    )
    db.add(comp)
    await db.commit()
    await db.refresh(comp)

    # 各ストラテジのバックテストを順次起動
    for strategy_name in body.strategy_names:
        req = BacktestRunRequest(
            strategy_name=strategy_name,
            symbols=[body.symbol],
            start_date=body.start_date,
            end_date=body.end_date,
            initial_capital=body.initial_capital,
            comparison_id=comp.id,
        )
        run = BacktestRun(
            comparison_id=comp.id,
            strategy_name=strategy_name,
            symbols=json.dumps([body.symbol]),
            start_date=body.start_date,
            end_date=body.end_date,
            initial_capital=body.initial_capital,
            status="RUNNING",
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        asyncio.create_task(_run_async(run.id, req))

    return {"id": comp.id, "status": "RUNNING"}


@router.get("/comparison/{comp_id}")
async def get_comparison(comp_id: int, db: AsyncSession = Depends(get_db)):
    comp = await db.get(BacktestComparison, comp_id)
    if not comp:
        raise HTTPException(status_code=404, detail="比較結果が見つかりません")

    runs_out = []
    for run in comp.runs:
        r: dict = {
            "id": run.id,
            "strategy_name": run.strategy_name,
            "status": run.status,
            "equity_curve": [],
            "metrics": None,
        }
        if run.result_json:
            result = json.loads(run.result_json)
            r["equity_curve"] = result.get("equity_curve", [])
            r["metrics"]      = result.get("metrics")
        runs_out.append(r)

    return {
        "id": comp.id,
        "name": comp.name,
        "symbol": comp.symbol,
        "start_date": str(comp.start_date),
        "end_date": str(comp.end_date),
        "initial_capital": float(comp.initial_capital),
        "runs": runs_out,
        "created_at": comp.created_at.isoformat(),
    }
