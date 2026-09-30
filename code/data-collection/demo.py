"""Run the complete data-collection pipeline with the mock provider."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from henry_adapter import HenrySearchBrief
from mock import MockDocumentProvider
from providers.google_drive import google_drive_provider_from_environment
from service import collect_evidence


HERE = Path(__file__).resolve().parent
DEFAULT_REQUEST = HERE / "henry_search_brief.example.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the SD Worx evidence collection demo in mock mode."
    )
    parser.add_argument(
        "request",
        nargs="?",
        type=Path,
        default=DEFAULT_REQUEST,
        help="Path to Henry's SearchBrief JSON file.",
    )
    parser.add_argument(
        "--provider",
        choices=("mock", "google_drive"),
        default="mock",
        help="Document source to test. Defaults to mock.",
    )
    return parser.parse_args()


async def run(request_path: Path, provider_name: str) -> str:
    payload = json.loads(request_path.read_text(encoding="utf-8"))
    request = HenrySearchBrief.model_validate(payload).to_ask_request()
    provider = (
        MockDocumentProvider()
        if provider_name == "mock"
        else google_drive_provider_from_environment()
    )
    bundle = await collect_evidence(request, provider)
    return bundle.model_dump_json(indent=2)


def main() -> int:
    args = parse_args()
    try:
        print(asyncio.run(run(args.request, args.provider)))
        return 0
    except FileNotFoundError:
        print(f"Request file not found: {args.request}", file=sys.stderr)
    except json.JSONDecodeError as exc:
        print(f"Request file is not valid JSON: {exc}", file=sys.stderr)
    except ValidationError as exc:
        print(f"Request does not match SearchBrief:\n{exc}", file=sys.stderr)
    except (RuntimeError, ValueError) as exc:
        print(f"Demo failed: {exc}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
