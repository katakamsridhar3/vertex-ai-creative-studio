"""Utilities for reading Google Sheet data."""

from __future__ import annotations

from typing import Iterable, List, Sequence

from googleapiclient.discovery import build

from config import Settings
from auth import get_credentials


SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"


class SheetsClient:
    """Thin wrapper over the Google Sheets API."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._credentials = get_credentials([SHEETS_SCOPE], settings.impersonated_user)
        self._service = build("sheets", "v4", credentials=self._credentials, cache_discovery=False)

    def fetch_rows(self, spreadsheet_id: str, range_a1: str | None = None, *, max_rows: int | None = None) -> list[dict[str, str]]:
        """Return the sheet rows as a list of dictionaries (header ➝ value).

        Args:
            spreadsheet_id: Identifier of the spreadsheet to read.
            range_a1: Optional A1 range; defaults to configuration value.
            max_rows: Optional maximum number of data rows to keep (excluding header).
        """

        range_a1 = range_a1 or self._settings.default_sheet_range
        max_rows = max_rows or self._settings.max_rows

        resource = (
            self._service.spreadsheets()
            .values()
            .get(spreadsheetId=spreadsheet_id, range=range_a1, valueRenderOption="UNFORMATTED_VALUE")
        )
        result = resource.execute()
        values: List[Sequence[str]] = result.get("values", [])

        if not values:
            return []

        header = [str(h).strip() or f"Column {idx+1}" for idx, h in enumerate(values[0])]
        rows = []
        for row in values[1 : max_rows + 1 if max_rows else None]:
            normalized = {header[idx]: (row[idx] if idx < len(row) else "") for idx in range(len(header))}
            rows.append(normalized)
        return rows


def chunk_rows(rows: Iterable[dict[str, str]], *, max_chars: int = 8000) -> str:
    """Render rows into a text block suitable for prompting an LLM."""

    if not rows:
        return "(No data rows were found in the provided sheet range.)"

    lines = []
    for idx, row in enumerate(rows, start=1):
        entries = [f"{key}: {value}" for key, value in row.items() if f"{value}".strip()]
        if not entries:
            continue
        lines.append(f"Row {idx}: " + "; ".join(entries))
        if sum(len(line) for line in lines) > max_chars:
            lines.append("… (truncated for model input)")
            break

    return "\n".join(lines)

