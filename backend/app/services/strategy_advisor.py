"""
戦略アドバイザーサービス。
Claude API を使ってポートフォリオの現状を分析し、改善提案を返す。
"""
import asyncio
import logging

from app.core.config import settings
from app.models.portfolio import Portfolio

logger = logging.getLogger(__name__)

STRATEGY_DESCRIPTIONS = {
    "trend_follow": (
        "SMA50/200 ゴールデンクロス + MACD クロスで大型株（TOPIX100/S&P500）をトレードする戦略。"
        "1銘柄あたりポートフォリオの8%を投入。20銘柄ユニバース。"
    ),
    "factor_selection": (
        "高配当・バリュー株 × MA20乖離率（Value）+ 低ボラティリティ（Quality）複合ファクター戦略。"
        "MA20を3%以上下回り、かつ日次ボラ2.5%未満の銘柄を買い。損切り-8%、利確+10%。"
    ),
    "sector_rotation": (
        "米国セクターETF9本を対象に3ヶ月モメンタムで上位2セクターを保有するローテーション戦略。"
        "1セクターあたり45%配分。米国セッションのみ動作。"
    ),
    "momentum_breakout": (
        "中小型グロース株（US/TSE）× 52週高値ブレイクアウトで買い、MA30割れ/-12%損切りの戦略。"
        "1銘柄あたり7%配分。14銘柄ユニバース。"
    ),
    "theme_follow": (
        "ユーザー定義テーマ × MA20モメンタム追従戦略。"
        "毎回 Claude API で銘柄ユニバースを動的生成。MA20上 + 1ヶ月リターン正で買い。MA-5%割れ/-12%で売り。"
    ),
}


async def get_advice(portfolio: Portfolio, message: str, metrics: dict) -> str:
    """
    Claude API でアドバイスを生成する（同期クライアントを to_thread で実行）。
    """
    return await asyncio.to_thread(_call_claude_sync, portfolio, message, metrics)


def _call_claude_sync(portfolio: Portfolio, message: str, metrics: dict) -> str:
    try:
        import anthropic
    except ImportError as e:
        raise RuntimeError("anthropic パッケージが未インストールです") from e

    strategy_name = portfolio.strategy_name or "不明"
    strategy_desc = STRATEGY_DESCRIPTIONS.get(strategy_name, "カスタム戦略")
    theme_info = f"\nテーマ: {portfolio.theme_name}" if portfolio.theme_name else ""

    # パフォーマンス指標を整形
    metrics_text = ""
    if metrics:
        lines = []
        if "total_return_pct" in metrics:
            lines.append(f"累計リターン: {metrics['total_return_pct']:.2f}%")
        if "win_rate" in metrics:
            wr = metrics["win_rate"]
            lines.append(f"勝率: {wr*100:.1f}% ({metrics.get('wins',0)}勝{metrics.get('losses',0)}敗)")
        if "trade_count" in metrics:
            lines.append(f"総取引数: {metrics['trade_count']}回")
        if "total_realized_pnl" in metrics:
            lines.append(f"実現損益: ¥{metrics['total_realized_pnl']:,.0f}")
        if "position_count" in metrics:
            lines.append(f"現在保有ポジション: {metrics['position_count']}銘柄")
        if "cash_pct" in metrics:
            lines.append(f"現金比率: {metrics['cash_pct']:.1f}%")
        metrics_text = "\n".join(lines)

    system_prompt = """\
あなたは株式自動売買システムの専門アドバイザーです。
ユーザーからの質問・指示に対して、具体的かつ実践的な改善提案を日本語で返してください。
回答は簡潔に（200〜400字程度）。箇条書きを活用して読みやすくしてください。"""

    user_prompt = f"""\
【戦略情報】
戦略名: {strategy_name}{theme_info}
戦略説明: {strategy_desc}

【現在のパフォーマンス】
{metrics_text if metrics_text else "（データなし）"}

【ユーザーの質問・指示】
{message}

上記の情報をもとに、具体的な改善提案やアドバイスを返してください。
パラメータ変更の提案がある場合は具体的な数値も示してください。"""

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    return response.content[0].text
