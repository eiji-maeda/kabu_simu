from fastapi import APIRouter, HTTPException, Query

from app.schemas.market_data import FXRateOut, QuoteOut
from app.services.market_data import get_fx_rate, get_quote, search_symbols, get_history
from app.core.exceptions import MarketDataError

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/quote", response_model=QuoteOut)
async def quote(symbol: str = Query(..., description="銘柄コード (例: AAPL, 7203.T)")):
    try:
        return get_quote(symbol.upper())
    except MarketDataError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/history")
async def history(
    symbol: str = Query(...),
    period: str = Query("1y", description="1d/5d/1mo/3mo/6mo/1y/2y/5y/max"),
    interval: str = Query("1d", description="1d/1wk/1mo"),
):
    try:
        df = get_history(symbol.upper(), period=period, interval=interval)
        records = []
        for ts, row in df.iterrows():
            records.append({
                "date": ts.date().isoformat(),
                "open":   round(float(row["open"]),   4),
                "high":   round(float(row["high"]),   4),
                "low":    round(float(row["low"]),    4),
                "close":  round(float(row["close"]),  4),
                "volume": int(row["volume"]),
            })
        return {"symbol": symbol.upper(), "data": records}
    except MarketDataError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/fx", response_model=FXRateOut)
async def fx(
    from_currency: str = Query("USD"),
    to_currency: str = Query("JPY"),
):
    from datetime import datetime, timezone
    rate = get_fx_rate(from_currency.upper(), to_currency.upper())
    return FXRateOut(
        from_currency=from_currency.upper(),
        to_currency=to_currency.upper(),
        rate=rate,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/search")
async def search(q: str = Query(..., min_length=1)):
    return {"results": search_symbols(q)}
