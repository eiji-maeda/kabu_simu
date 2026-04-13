"""
Claude AIストラテジ — LLMによる自動売買

使い方:
  1. pip install anthropic
  2. .env に ANTHROPIC_API_KEY=sk-ant-... を追加
  3. strategies/__init__.py の STRATEGY_REGISTRY に登録

動作:
  MarketContext を JSON プロンプトに変換し Claude に送信。
  Claude は JSON で { "action": "BUY"|"SELL"|"HOLD", "quantity_pct": 0.0-1.0,
  "reasoning": "..." } を返す。
"""
from __future__ import annotations

import json
from decimal import Decimal

from app.strategies.base import Strategy
from app.strategies.context import MarketContext
from app.strategies.signal import SignalAction, SizingMode, TradeSignal


class ClaudeStrategy(Strategy):
    """
    Claude API を使った LLM 自動売買ストラテジ。

    Parameters
    ----------
    model:         使用する Claude モデル ID
    lookback_bars: プロンプトに含める過去足数
    """

    name = "claude"
    description = "Claude APIによるLLM自動売買（要APIキー）"

    def __init__(
        self,
        model: str = "claude-opus-4-6",
        lookback_bars: int = 20,
    ) -> None:
        self.model = model
        self.lookback_bars = lookback_bars
        self._client = None  # lazy init

    def _get_client(self):  # type: ignore[return]
        if self._client is None:
            try:
                import anthropic
                from app.core.config import settings
                self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            except ImportError as e:
                raise RuntimeError("anthropic パッケージが未インストール: pip install anthropic") from e
        return self._client

    def _build_prompt(self, ctx: MarketContext) -> str:
        df = ctx.ohlcv.tail(self.lookback_bars)
        history = df[["open", "high", "low", "close", "volume"]].to_dict(orient="records")
        # タイムスタンプを文字列化
        dates = [str(d.date()) for d in df.index]
        ohlcv_summary = [
            {"date": d, **{k: round(float(v), 4) for k, v in row.items()}}
            for d, row in zip(dates, history)
        ]

        context_dict = {
            "symbol": ctx.symbol,
            "market": ctx.market,
            "currency": ctx.currency,
            "current_price": float(ctx.current_price),
            "cash_available": float(ctx.cash_available),
            "portfolio_value": float(ctx.portfolio_value),
            "current_position": (
                {
                    "quantity": ctx.current_position.quantity,
                    "avg_cost": float(ctx.current_position.avg_cost),
                    "unrealized_pnl_pct": round(ctx.current_position.unrealized_pnl_pct, 2),
                }
                if ctx.current_position
                else None
            ),
            "indicators": ctx.indicators,
            "recent_ohlcv": ohlcv_summary,
        }

        return f"""あなたは株式トレーダーです。以下の市場データを分析し、売買判断をJSONで返してください。

## 市場データ
```json
{json.dumps(context_dict, ensure_ascii=False, indent=2)}
```

## 指示
上記データに基づいて、以下のJSONのみを返してください（説明文不要）:
```json
{{
  "action": "BUY" | "SELL" | "HOLD",
  "quantity_pct": 0.0から1.0（ポートフォリオ比率、HOLDの場合は0）,
  "reasoning": "判断理由を日本語で簡潔に"
}}
```"""

    def _parse_response(self, text: str, symbol: str) -> TradeSignal:
        try:
            # JSON ブロックを抽出
            start = text.find("{")
            end = text.rfind("}") + 1
            if start == -1 or end == 0:
                return TradeSignal.hold(symbol, reasoning="JSONパースエラー")
            data = json.loads(text[start:end])

            action_str = str(data.get("action", "HOLD")).upper()
            action = SignalAction(action_str) if action_str in ("BUY", "SELL", "HOLD") else SignalAction.HOLD
            quantity_pct = float(data.get("quantity_pct", 0.0))
            reasoning = str(data.get("reasoning", ""))

            return TradeSignal(
                action=action,
                symbol=symbol,
                sizing_mode=SizingMode.PERCENT_EQUITY,
                quantity=quantity_pct,
                reasoning=reasoning,
                confidence=min(1.0, quantity_pct),
            )
        except Exception as e:
            return TradeSignal.hold(symbol, reasoning=f"パースエラー: {e}")

    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        from app.core.config import settings
        if not settings.anthropic_api_key:
            return TradeSignal.hold(ctx.symbol, reasoning="ANTHROPIC_API_KEY が未設定")

        try:
            client = self._get_client()
            prompt = self._build_prompt(ctx)
            response = client.messages.create(
                model=self.model,
                max_tokens=512,
                messages=[{"role": "user", "content": prompt}],
            )
            return self._parse_response(response.content[0].text, ctx.symbol)
        except Exception as e:
            return TradeSignal.hold(ctx.symbol, reasoning=f"Claude API エラー: {e}")
