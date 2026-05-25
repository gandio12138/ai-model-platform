#!/usr/bin/env python3
"""Minimal oToken OpenAI-compatible chat demo.

Usage:
  OTOKEN_API_KEY=aitp_xxx python scripts/otoken_chat_demo.py
  OTOKEN_API_KEY=aitp_xxx python scripts/otoken_chat_demo.py --model gemini-2.5-pro --message "你好"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def mask_key(value: str) -> str:
    if len(value) <= 12:
        return "***"
    return f"{value[:8]}...{value[-6:]}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Call oToken /v1/chat/completions.")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("OTOKEN_BASE_URL", "https://xufongnian.xyz/v1"),
        help="OpenAI-compatible base URL. Defaults to https://xufongnian.xyz/v1",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("OTOKEN_MODEL", "gemini-2.5-flash"),
        help="Model code copied from oToken model catalog.",
    )
    parser.add_argument(
        "--message",
        default="用一句话介绍你自己。",
        help="User message to send.",
    )
    parser.add_argument("--max-tokens", type=int, default=64)
    parser.add_argument("--temperature", type=float, default=0.2)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = os.environ.get("OTOKEN_API_KEY") or os.environ.get("AI_TOKEN_API_KEY")
    if not api_key:
        print("Missing OTOKEN_API_KEY or AI_TOKEN_API_KEY.", file=sys.stderr)
        return 2

    base_url = args.base_url.rstrip("/")
    endpoint = f"{base_url}/chat/completions"
    payload = {
        "model": args.model,
        "messages": [{"role": "user", "content": args.message}],
        "max_tokens": args.max_tokens,
        "temperature": args.temperature,
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "oTokenPythonDemo/1.0",
        },
        method="POST",
    )

    print(f"Endpoint: {endpoint}")
    print(f"Model: {args.model}")
    print(f"API Key: {mask_key(api_key)}")

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read().decode("utf-8")
            data = json.loads(body)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        print(f"HTTP {error.code}", file=sys.stderr)
        try:
            print(json.dumps(json.loads(body), ensure_ascii=False, indent=2), file=sys.stderr)
        except json.JSONDecodeError:
            print(body, file=sys.stderr)
        return 1
    except urllib.error.URLError as error:
        print(f"Network error: {error}", file=sys.stderr)
        return 1

    print(json.dumps(data, ensure_ascii=False, indent=2))
    content = data.get("choices", [{}])[0].get("message", {}).get("content")
    if content:
        print("\nAssistant:")
        print(content)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
