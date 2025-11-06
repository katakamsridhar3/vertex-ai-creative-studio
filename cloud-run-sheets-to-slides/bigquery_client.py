"""Optional BigQuery export for sheet data."""

from __future__ import annotations

import logging
from typing import Iterable

from google.cloud import bigquery

from config import Settings


class BigQueryExporter:
    """Persist sheet rows into BigQuery for downstream analysis."""

    def __init__(self, settings: Settings):
        if not settings.project_id:
            raise ValueError("PROJECT_ID is required for BigQuery usage")

        self._settings = settings
        self._client = bigquery.Client(
            project=settings.project_id,
            location=settings.bigquery_location,
        )

    def export_rows(self, rows: Iterable[dict[str, str]], *, dataset: str | None = None, table: str | None = None) -> str | None:
        """Load rows into BigQuery if enabled.

        Returns a job ID if a load job was created, otherwise None.
        """

        rows = list(rows)
        if not rows:
            logging.info("No rows to export to BigQuery; skipping")
            return None

        dataset = dataset or self._settings.bigquery_dataset
        table = table or self._settings.bigquery_table

        if not dataset or not table:
            logging.warning("BigQuery dataset/table not configured; skipping export")
            return None

        table_id = f"{self._settings.project_id}.{dataset}.{table}"

        job_config = bigquery.LoadJobConfig(write_disposition=bigquery.WriteDisposition.WRITE_APPEND)

        logging.info("Starting BigQuery load job for %s (%d rows)", table_id, len(rows))
        job = self._client.load_table_from_json(rows, table_id, job_config=job_config)

        job.result()  # Wait for completion
        logging.info("BigQuery load complete: job_id=%s", job.job_id)
        return job.job_id

