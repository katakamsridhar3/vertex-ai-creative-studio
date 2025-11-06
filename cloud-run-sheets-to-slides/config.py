"""Runtime configuration for the Sheets ➝ Slides summarization service."""

from __future__ import annotations

from dataclasses import dataclass
import logging
import os
from typing import Optional


def _get_env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _get_env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logging.warning("Invalid integer for %s: %s (using default %s)", name, raw, default)
        return default


@dataclass(frozen=True)
class Settings:
    """Configuration values loaded from environment variables."""

    project_id: str = os.environ.get("PROJECT_ID", "")
    location: str = os.environ.get("VERTEX_LOCATION", "us-central1")
    model_name: str = os.environ.get("VERTEX_MODEL_NAME", "gemini-1.5-pro")
    default_sheet_range: str = os.environ.get("DEFAULT_SHEET_RANGE", "A1:AF30")
    max_rows: int = _get_env_int("MAX_SAMPLE_ROWS", 40)
    summary_goal: str = os.environ.get(
        "DEFAULT_SUMMARY_GOAL",
        "Summarize the spreadsheet, highlighting key themes, metrics, trends, and risks.",
    )
    impersonated_user: Optional[str] = os.environ.get("IMPERSONATED_USER_EMAIL")

    # Slides configuration
    slide_template_id: Optional[str] = os.environ.get("PRESENTATION_TEMPLATE_ID")
    title_prefix: str = os.environ.get("TITLE_PREFIX", "Automated Summary")

    # Optional BigQuery export
    bigquery_enabled: bool = _get_env_bool("ENABLE_BIGQUERY", False)
    bigquery_dataset: Optional[str] = os.environ.get("BIGQUERY_DATASET")
    bigquery_table: Optional[str] = os.environ.get("BIGQUERY_TABLE")
    bigquery_location: Optional[str] = os.environ.get("BIGQUERY_LOCATION")


def load_settings() -> Settings:
    settings = Settings()
    if not settings.project_id:
        logging.warning(
            "PROJECT_ID is not set. Vertex AI and BigQuery calls that require it may fail."
        )
    if settings.bigquery_enabled and not (settings.bigquery_dataset and settings.bigquery_table):
        logging.warning(
            "ENABLE_BIGQUERY is true but BIGQUERY_DATASET or BIGQUERY_TABLE is not configured; BigQuery export will be skipped."
        )
    return settings

