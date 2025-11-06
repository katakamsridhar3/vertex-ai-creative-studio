"""Cloud Run entrypoint for Sheets ➝ Slides summarization."""

from __future__ import annotations

import logging
import os
from http import HTTPStatus

from flask import Flask, jsonify, request

from bigquery_client import BigQueryExporter
from config import Settings, load_settings
from sheets_client import SheetsClient, chunk_rows
from slides_client import SlidesClient
from vertex_client import VertexSummarizer


logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))

app = Flask(__name__)


class ServiceContainer:
    """Lazy container for service singletons."""

    def __init__(self) -> None:
        self._settings: Settings | None = None
        self._sheets: SheetsClient | None = None
        self._slides: SlidesClient | None = None
        self._summarizer: VertexSummarizer | None = None
        self._bigquery: BigQueryExporter | None = None

    @property
    def settings(self) -> Settings:
        if self._settings is None:
            self._settings = load_settings()
        return self._settings

    @property
    def sheets(self) -> SheetsClient:
        if self._sheets is None:
            self._sheets = SheetsClient(self.settings)
        return self._sheets

    @property
    def slides(self) -> SlidesClient:
        if self._slides is None:
            self._slides = SlidesClient(self.settings)
        return self._slides

    @property
    def summarizer(self) -> VertexSummarizer:
        if self._summarizer is None:
            self._summarizer = VertexSummarizer(self.settings)
        return self._summarizer

    @property
    def bigquery(self) -> BigQueryExporter | None:
        if not self.settings.bigquery_enabled:
            return None
        if self._bigquery is None:
            self._bigquery = BigQueryExporter(self.settings)
        return self._bigquery


services = ServiceContainer()


@app.get("/healthz")
def healthcheck():
    return ("OK", HTTPStatus.OK)


@app.post("/generate")
def generate():
    try:
        payload = request.get_json(force=True) or {}
    except Exception as exc:  # pragma: no cover - Flask handles JSON parsing
        logging.exception("Invalid JSON payload: %s", exc)
        return jsonify({"error": "Invalid JSON payload"}), HTTPStatus.BAD_REQUEST

    sheet_id = payload.get("sheetId")
    if not sheet_id:
        return jsonify({"error": "`sheetId` is required"}), HTTPStatus.BAD_REQUEST

    sheet_range = payload.get("range")
    summary_goal = payload.get("goal")
    presentation_title = payload.get(
        "title",
        f"{services.settings.title_prefix} — {sheet_id}",
    )

    logging.info(
        "Processing sheet_id=%s range=%s title=%s",
        sheet_id,
        sheet_range or services.settings.default_sheet_range,
        presentation_title,
    )

    try:
        rows = services.sheets.fetch_rows(sheet_id, range_a1=sheet_range)
    except Exception as exc:
        logging.exception("Failed to fetch sheet data: %s", exc)
        return (
            jsonify({"error": "Failed to fetch sheet data", "details": str(exc)}),
            HTTPStatus.BAD_GATEWAY,
        )

    rendered_rows = chunk_rows(rows)

    try:
        summary = services.summarizer.summarize_rows(rendered_rows, goal=summary_goal)
    except Exception as exc:
        logging.exception("Vertex AI summarization failed: %s", exc)
        return (
            jsonify({"error": "Failed to summarize sheet data", "details": str(exc)}),
            HTTPStatus.BAD_GATEWAY,
        )

    try:
        presentation_url = services.slides.create_summary_presentation(
            title=presentation_title,
            spreadsheet_id=sheet_id,
            summary=summary,
            raw_excerpt=rendered_rows,
        )
    except Exception as exc:
        logging.exception("Slides generation failed: %s", exc)
        return (
            jsonify({"error": "Failed to create presentation", "details": str(exc)}),
            HTTPStatus.BAD_GATEWAY,
        )

    bigquery_job_id = None
    if services.bigquery:
        try:
            bigquery_job_id = services.bigquery.export_rows(rows)
        except Exception as exc:
            logging.exception("BigQuery export failed: %s", exc)

    response = {
        "presentationUrl": presentation_url,
        "summary": summary,
    }
    if bigquery_job_id:
        response["bigQueryJobId"] = bigquery_job_id

    return jsonify(response), HTTPStatus.CREATED


if __name__ == "__main__":  # pragma: no cover
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))

