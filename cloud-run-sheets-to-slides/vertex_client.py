"""Vertex AI Gemini summarization utilities."""

from __future__ import annotations

import logging
from vertexai import init as vertex_init
from vertexai.generative_models import (
    Content,
    GenerationConfig,
    GenerativeModel,
    Part,
    SafetySetting,
)

from config import Settings


DEFAULT_SAFETY_SETTINGS = [
    SafetySetting(category=SafetySetting.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold=SafetySetting.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE),
    SafetySetting(category=SafetySetting.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold=SafetySetting.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE),
    SafetySetting(category=SafetySetting.HarmCategory.HARM_CATEGORY_SEXUAL, threshold=SafetySetting.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE),
    SafetySetting(category=SafetySetting.HarmCategory.HARM_CATEGORY_DANGEROUS, threshold=SafetySetting.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE),
]


class VertexSummarizer:
    """Generate textual summaries from sheet data using Gemini."""

    def __init__(self, settings: Settings):
        if not settings.project_id:
            raise ValueError("PROJECT_ID must be configured to use Vertex AI")

        logging.info(
            "Initializing Vertex AI with project=%s location=%s model=%s",
            settings.project_id,
            settings.location,
            settings.model_name,
        )
        vertex_init(project=settings.project_id, location=settings.location)
        self._model = GenerativeModel(settings.model_name)
        self._default_goal = settings.summary_goal

    def summarize_rows(
        self,
        rendered_rows: str,
        *,
        goal: str | None = None,
        temperature: float = 0.4,
        max_output_tokens: int = 1024,
    ) -> str:
        """Return an LLM-generated summary for the provided rows."""

        prompt_goal = goal or self._default_goal

        prompt = (
            "You are an analyst helping a business user prepare a presentation based on a spreadsheet.\n"
            "Summarize the provided rows as concise bullet points. Highlight trends and anomalies,"
            " and note risks or opportunities when relevant.\n"
            f"Objective: {prompt_goal}\n\n"
            "Spreadsheet rows (already sanitized):\n"
            f"{rendered_rows}\n\n"
            "Respond with bullet points suitable for a presentation slide."
        )

        logging.debug("Sending prompt to Gemini (chars=%s)", len(prompt))

        response = self._model.generate_content(
            contents=[Content(parts=[Part.from_text(prompt)])],
            generation_config=GenerationConfig(temperature=temperature, max_output_tokens=max_output_tokens),
            safety_settings=DEFAULT_SAFETY_SETTINGS,
        )

        if not response or not response.text:
            logging.warning("Gemini response was empty; using fallback message")
            return "No summary was generated. Please review the source data manually."

        return response.text.strip()

