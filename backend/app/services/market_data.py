"""
市場データサービス — yfinanceラッパー

すべての戻り値のタイムスタンプは UTC。
日本株は symbol に ".T" サフィックスが付く (例: 7203.T)。
"""
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import pandas as pd
import pytz
import yfinance as yf

from app.core.config import settings
from app.core.exceptions import MarketDataError

# ─── Market metadata ────────────────────────────────────────────────────────
_TSE_TZ = pytz.timezone("Asia/Tokyo")
_NYSE_TZ = pytz.timezone("America/New_York")


def detect_market(symbol: str) -> str:
    """'7203.T' → 'TSE',  'AAPL' → 'US'"""
    return "TSE" if symbol.upper().endswith(".T") else "US"


def detect_currency(symbol: str) -> str:
    return "JPY" if detect_market(symbol) == "TSE" else "USD"


def is_market_open(symbol: str) -> bool:
    market = detect_market(symbol)
    tz = _TSE_TZ if market == "TSE" else _NYSE_TZ
    now = datetime.now(tz)
    h, m = now.hour, now.minute
    mins = h * 60 + m
    dow = now.weekday()  # 0=Mon … 4=Fri
    if dow >= 5:
        return False
    if market == "TSE":
        return (9 * 60 <= mins < 11 * 60 + 30) or (12 * 60 + 30 <= mins < 15 * 60 + 30)
    # NYSE/NASDAQ
    return 9 * 60 + 30 <= mins < 16 * 60


# ─── Simple TTL cache ────────────────────────────────────────────────────────
_quote_cache: dict[str, tuple[dict[str, Any], float]] = {}


def _cached_quote(symbol: str) -> dict[str, Any] | None:
    entry = _quote_cache.get(symbol)
    if entry and time.time() - entry[1] < settings.quote_cache_ttl:
        return entry[0]
    return None


def _set_cache(symbol: str, data: dict[str, Any]) -> None:
    _quote_cache[symbol] = (data, time.time())


# ─── Public API ──────────────────────────────────────────────────────────────
def get_quote(symbol: str) -> dict[str, Any]:
    """現在の株価・出来高などを取得。結果は60秒キャッシュ。"""
    cached = _cached_quote(symbol)
    if cached:
        return cached

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        prev_close = float(getattr(info, "previous_close", 0) or 0)
        price = float(getattr(info, "last_price", 0) or 0)
        if price == 0:
            raise MarketDataError(f"価格が取得できません: {symbol}")

        change = price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0.0

        result: dict[str, Any] = {
            "symbol": symbol.upper(),
            "market": detect_market(symbol),
            "currency": detect_currency(symbol),
            "price": price,
            "open": float(getattr(info, "open", price) or price),
            "high": float(getattr(info, "day_high", price) or price),
            "low": float(getattr(info, "day_low", price) or price),
            "prev_close": prev_close,
            "change": round(change, 4),
            "change_pct": round(change_pct, 4),
            "volume": int(getattr(info, "three_month_average_volume", 0) or 0),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _set_cache(symbol, result)
        return result
    except MarketDataError:
        raise
    except Exception as e:
        raise MarketDataError(f"yfinance エラー ({symbol}): {e}") from e


def get_history(
    symbol: str,
    period: str = "1y",
    interval: str = "1d",
) -> pd.DataFrame:
    """
    OHLCV DataFrame を返す。インデックスは UTC-aware DatetimeIndex。
    columns: open, high, low, close, volume
    """
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval, auto_adjust=True)
        if df.empty:
            raise MarketDataError(f"データなし: {symbol}")

        df.columns = [c.lower() for c in df.columns]
        df = df[["open", "high", "low", "close", "volume"]]

        # UTC に正規化
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        else:
            df.index = df.index.tz_convert("UTC")

        return df
    except MarketDataError:
        raise
    except Exception as e:
        raise MarketDataError(f"履歴データ取得エラー ({symbol}): {e}") from e


def get_fx_rate(from_currency: str = "USD", to_currency: str = "JPY") -> float:
    """為替レートを取得。デフォルトは USD/JPY。"""
    if from_currency == to_currency:
        return 1.0
    pair = f"{from_currency}{to_currency}=X"
    try:
        cached = _cached_quote(pair)
        if cached:
            return float(cached["price"])
        ticker = yf.Ticker(pair)
        rate = float(ticker.fast_info.last_price or 150.0)
        _set_cache(pair, {"price": rate})
        return rate
    except Exception:
        return 150.0  # フォールバック


def search_symbols(query: str) -> list[dict[str, str]]:
    """銘柄検索（yfinance search）"""
    try:
        results = yf.Search(query, max_results=8)
        quotes = results.quotes if hasattr(results, "quotes") else []
        return [
            {
                "symbol": q.get("symbol", ""),
                "name": q.get("longname") or q.get("shortname", ""),
                "exchange": q.get("exchange", ""),
                "type": q.get("quoteType", ""),
            }
            for q in quotes
            if q.get("symbol")
        ]
    except Exception:
        return []
