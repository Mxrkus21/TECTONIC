"""Transparent local relevance ranking for extracted documents."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List, Set, Tuple

from contracts import ExtractedContent, RelevantPassage
from providers.base import ProviderSearchHit


PROVIDER_RANK_WEIGHT = 0.45
CONTENT_WEIGHT = 0.35
TITLE_PATH_WEIGHT = 0.20

_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "can",
    "do",
    "for",
    "how",
    "i",
    "in",
    "is",
    "many",
    "my",
    "of",
    "on",
    "still",
    "take",
    "the",
    "this",
    "to",
    "what",
}

_SYNONYMS = {
    "holiday": "leave",
    "holidays": "leave",
    "vacation": "leave",
    "vacations": "leave",
    "remaining": "balance",
    "left": "balance",
}


@dataclass(frozen=True)
class RankedDocument:
    hit: ProviderSearchHit
    content: ExtractedContent
    local_relevance: float


def rank_documents(
    question: str,
    documents: Iterable[Tuple[ProviderSearchHit, ExtractedContent]],
    max_documents: int = 8,
    max_passages_per_document: int = 3,
) -> List[RankedDocument]:
    """Rank extracted documents and attach their best matching passages."""

    if max_documents < 1:
        raise ValueError("max_documents must be greater than zero")
    if max_passages_per_document < 1:
        raise ValueError("max_passages_per_document must be greater than zero")

    query_tokens = tokenize(question)
    ranked = []

    for hit, content in documents:
        full_text = content.full_text or ""
        content_score = token_overlap(query_tokens, tokenize(full_text))
        title_path_score = token_overlap(
            query_tokens,
            tokenize(f"{hit.name} {hit.path or ''}"),
        )
        provider_rank_score = 1.0 / max(hit.rank or 1, 1)
        total = (
            PROVIDER_RANK_WEIGHT * provider_rank_score
            + CONTENT_WEIGHT * content_score
            + TITLE_PATH_WEIGHT * title_path_score
        )
        total = round(min(max(total, 0.0), 1.0), 4)

        passages = select_passages(
            full_text,
            query_tokens,
            max_passages=max_passages_per_document,
        )
        enriched_content = content.model_copy(
            update={"relevant_passages": passages}
        )
        ranked.append(
            RankedDocument(
                hit=hit,
                content=enriched_content,
                local_relevance=total,
            )
        )

    ranked.sort(
        key=lambda item: (
            item.local_relevance,
            -(item.hit.rank or 10_000),
            item.hit.modified_at.timestamp() if item.hit.modified_at else 0.0,
        ),
        reverse=True,
    )
    return ranked[:max_documents]


def tokenize(value: str) -> Set[str]:
    """Normalize text into a small explainable token set."""

    raw_tokens = re.findall(r"[a-z0-9]+", value.lower().replace("_", "-"))
    normalized = set()
    for token in raw_tokens:
        token = _SYNONYMS.get(token, token)
        if token.endswith("s") and len(token) > 3 and not token.endswith("ss"):
            token = token[:-1]
        if len(token) > 1 and token not in _STOP_WORDS:
            normalized.add(token)
    return normalized


def token_overlap(query_tokens: Set[str], document_tokens: Set[str]) -> float:
    if not query_tokens:
        return 0.0
    return len(query_tokens & document_tokens) / len(query_tokens)


def select_passages(
    text: str,
    query_tokens: Set[str],
    max_passages: int = 3,
    passage_characters: int = 700,
    overlap_characters: int = 100,
) -> List[RelevantPassage]:
    if not text or not query_tokens:
        return []
    if passage_characters < 1:
        raise ValueError("passage_characters must be greater than zero")
    if overlap_characters < 0 or overlap_characters >= passage_characters:
        raise ValueError(
            "overlap_characters must be non-negative and smaller than passage_characters"
        )

    candidates = []
    for start, end, passage_text in _text_windows(
        text,
        passage_characters=passage_characters,
        overlap_characters=overlap_characters,
    ):
        score = token_overlap(query_tokens, tokenize(passage_text))
        if score <= 0:
            continue
        candidates.append(
            RelevantPassage(
                text=passage_text,
                relevance_score=round(score, 4),
                start_char=start,
                end_char=end,
            )
        )

    candidates.sort(
        key=lambda passage: (
            passage.relevance_score,
            -(passage.start_char or 0),
        ),
        reverse=True,
    )
    return candidates[:max_passages]


def _text_windows(
    text: str,
    passage_characters: int,
    overlap_characters: int,
) -> Iterable[Tuple[int, int, str]]:
    start = 0
    text_length = len(text)

    while start < text_length:
        target_end = min(start + passage_characters, text_length)
        end = target_end
        if target_end < text_length:
            boundary = max(
                text.rfind("\n", start, target_end),
                text.rfind(". ", start, target_end),
                text.rfind(" ", start, target_end),
            )
            if boundary > start:
                end = boundary + 1

        passage = text[start:end].strip()
        if passage:
            actual_start = start
            while actual_start < end and text[actual_start].isspace():
                actual_start += 1
            actual_end = actual_start + len(passage)
            yield actual_start, actual_end, passage

        if end >= text_length:
            break
        next_start = max(end - overlap_characters, start + 1)
        while next_start < text_length and not text[next_start].isspace():
            next_start += 1
        start = next_start
