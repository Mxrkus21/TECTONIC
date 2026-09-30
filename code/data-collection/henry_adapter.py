"""Translate Henry's UI SearchBrief into the data-collection contract."""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import Field

from contracts import (
    AskRequest,
    ContractModel,
    SearchContext,
    SearchOptions,
    UserContext,
)


class HenryScope(ContractModel):
    country: Optional[str] = Field(default=None, min_length=2, max_length=10)
    client: Optional[str] = Field(default=None, max_length=80)
    employee_category: Optional[str] = Field(default=None, max_length=80)


class HenrySearchBrief(ContractModel):
    """Public request body matching code/interface's SearchBrief type."""

    question: str = Field(min_length=1, max_length=500)
    topic_tags: List[str] = Field(default_factory=list, max_length=20)
    scope: HenryScope = Field(default_factory=HenryScope)
    reference_date: date
    source_types: Optional[List[str]] = Field(default=None, max_length=20)

    def to_ask_request(
        self,
        *,
        request_id: Optional[str] = None,
        employee_id: Optional[str] = None,
        language: str = "en",
        department: Optional[str] = None,
        search: Optional[SearchOptions] = None,
    ) -> AskRequest:
        """Map UI-owned fields without leaking provider configuration to the UI."""

        values = {
            "question": self.question,
            "user_context": UserContext(
                employee_id=employee_id,
                country=_country_code(self.scope.country),
                language=language,
                department=department,
            ),
            "search_context": SearchContext(
                topic_tags=self.topic_tags,
                client=self.scope.client,
                employee_category=self.scope.employee_category,
                reference_date=self.reference_date,
                source_types=self.source_types or [],
            ),
            "search": search or SearchOptions(),
        }
        if request_id:
            values["request_id"] = request_id
        return AskRequest.model_validate(values)


def _country_code(value: Optional[str]) -> Optional[str]:
    """The collector uses ISO alpha-2 country codes when one is available."""

    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized if len(normalized) == 2 else None
