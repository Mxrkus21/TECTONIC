"""Send one local document to the configured Document AI OCR processor."""

from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
from pathlib import Path

from dotenv import load_dotenv

from document_ai_ocr import document_ai_ocr_from_environment


HERE = Path(__file__).resolve().parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test Google Document AI OCR")
    parser.add_argument("document", type=Path, help="PDF or image to process")
    return parser.parse_args()


async def run(document: Path) -> dict[str, object]:
    load_dotenv(HERE / ".env")
    extractor = document_ai_ocr_from_environment()
    if extractor is None:
        raise RuntimeError("DOCUMENT_AI_ENABLED is not true")
    content = document.read_bytes()
    result = await extractor.extract(
        filename=document.name,
        content=content,
        mime_type=mimetypes.guess_type(document.name)[0],
        max_characters=250_000,
    )
    return {
        "document": document.name,
        "extraction_method": result.extraction_method,
        "page_count": result.page_count,
        "character_count": result.character_count,
        "truncated": result.truncated,
        "text_preview": (result.full_text or "")[:800],
    }


def main() -> int:
    args = parse_args()
    if not args.document.is_file():
        raise SystemExit(f"Document not found: {args.document}")
    print(json.dumps(asyncio.run(run(args.document)), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
