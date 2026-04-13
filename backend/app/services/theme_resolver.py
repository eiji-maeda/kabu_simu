"""
テーマ → 銘柄ユニバース解決サービス。
Claude API を使ってテーマに関連する銘柄リストを毎回新規生成する。
APIキーが未設定の場合は RuntimeError を raise する。
"""
import json
import logging
from datetime import date

from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
あなたは株式市場の専門家です。
ユーザーが指定するテーマに関連する銘柄を選定し、JSONのみで返答します。
説明文や前置きは一切不要です。"""

USER_PROMPT_TEMPLATE = """\
今日（{today}）のテーマ「{theme}」に関連する株式銘柄を10〜15本選んでください。

条件:
- 東証上場株は末尾 .T を付けること（例: 7203.T）
- 米国株はティッカーシンボル（例: NVDA, AAPL）
- yfinance で現在も取得可能な主要銘柄のみ
- 日本株・米国株を適切にミックスすること（テーマによっては一方のみでも可）
- 毎回多様な選定になるよう心がけること

以下のJSONのみを返してください（他の文章は不要）:
{{
  "symbols": [
    {{"symbol": "7203.T", "name": "トヨタ自動車", "market": "TSE"}},
    {{"symbol": "NVDA",   "name": "NVIDIA",       "market": "US"}}
  ],
  "reasoning": "選定理由を日本語で2〜3文"
}}"""


async def suggest_symbols(theme: str) -> dict:
    """
    Claude API を使ってテーマに関連する銘柄リストを生成する。

    Returns
    -------
    {
        "theme": str,
        "symbols": [{"symbol": str, "name": str, "market": str}],
        "reasoning": str,
    }

    Raises
    ------
    RuntimeError: APIキーが未設定 / anthropic 未インストールの場合
    """
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY が未設定です。バックエンドの .env に設定してください。")

    import asyncio
    # anthropic SDK は同期クライアントなのでスレッドプールで実行
    result = await asyncio.to_thread(_call_claude_sync, theme)
    return result


def _call_claude_sync(theme: str) -> dict:
    """同期的に Claude API を呼び出す（to_thread 用）。"""
    try:
        import anthropic
    except ImportError as e:
        raise RuntimeError("anthropic パッケージが未インストールです: pip install anthropic") from e

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    user_message = USER_PROMPT_TEMPLATE.format(
        today=date.today().isoformat(),
        theme=theme,
    )

    logger.info(f"[theme_resolver] Claude API 呼び出し: theme={theme!r}")

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",  # コスト効率の良いモデルを使用
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw_text = response.content[0].text
    logger.info(f"[theme_resolver] Claude レスポンス: {raw_text[:200]}")

    return _parse_response(raw_text, theme)


def _parse_response(text: str, theme: str) -> dict:
    """Claude のレスポンスから JSON を抽出してパースする。"""
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("JSON が見つかりません")
        data = json.loads(text[start:end])

        symbols = data.get("symbols", [])
        # 最低限のバリデーション
        validated = []
        for s in symbols:
            symbol = str(s.get("symbol", "")).strip().upper()
            name = str(s.get("name", symbol))
            market = str(s.get("market", "US")).upper()
            if symbol:
                # TSE銘柄は末尾 .T を大文字のまま保持
                if symbol.endswith(".T"):
                    market = "TSE"
                else:
                    market = "US"
                validated.append({"symbol": symbol, "name": name, "market": market})

        return {
            "theme": theme,
            "symbols": validated,
            "reasoning": str(data.get("reasoning", "")),
        }

    except Exception as e:
        logger.warning(f"[theme_resolver] レスポンスパースエラー: {e}\nraw={text[:500]}")
        raise RuntimeError(f"Claude のレスポンスをパースできませんでした: {e}") from e
