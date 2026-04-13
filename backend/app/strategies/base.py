from abc import ABC, abstractmethod

from app.strategies.context import MarketContext
from app.strategies.signal import TradeSignal


class Strategy(ABC):
    """
    すべての売買戦略の抽象基底クラス。

    設計原則:
    1. 純粋関数 — generate_signal は MarketContext を受け取り TradeSignal を返すだけ。
       DB アクセス・HTTP 呼び出し不可（AIストラテジは注入クライアント経由のみ可）。
    2. ルックアヘッドなし — ohlcv は現在バー以前のデータのみ含む。
    3. 副作用なし — ストラテジはシグナルを返すだけで注文を発行しない。
    4. シリアライズ可能 I/O — context / signal 両方を JSON 化できるため LLM と親和性が高い。

    LLMストラテジの実装例:
        class ClaudeStrategy(Strategy):
            def __init__(self, client: anthropic.Anthropic, model: str):
                self.client = client; self.model = model

            def generate_signal(self, ctx: MarketContext) -> TradeSignal:
                prompt = self._build_prompt(ctx)
                resp = self.client.messages.create(model=self.model, ...)
                return self._parse_response(resp.content[0].text, ctx.symbol)
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """一意の戦略識別子。ログ・DB レコードで使用。"""
        ...

    @property
    def description(self) -> str:
        return ""

    @abstractmethod
    def generate_signal(self, ctx: MarketContext) -> TradeSignal:
        """
        コアロジック。MarketContext を受け取り TradeSignal を返す。
        通常の市場状況では例外を投げてはいけない。
        不確実なときは TradeSignal.hold() を返す。
        """
        ...

    def on_fill(self, signal: TradeSignal, fill_price: float, quantity: int) -> None:
        """約定後コールバック。ステートフルな戦略向け。"""

    def on_session_start(self, timestamp: object, portfolio_value: float) -> None:
        """各取引セッション開始時コールバック。"""

    def on_session_end(self, timestamp: object, portfolio_value: float) -> None:
        """各取引セッション終了時コールバック。"""
