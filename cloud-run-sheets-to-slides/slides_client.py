"""Google Slides presentation builder."""

from __future__ import annotations

import datetime
import logging
from typing import Optional

from googleapiclient.discovery import build

from auth import get_credentials
from config import Settings


SLIDES_SCOPE = "https://www.googleapis.com/auth/presentations"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"


class SlidesClient:
    """Create presentations populated with AI-generated content."""

    def __init__(self, settings: Settings):
        self._settings = settings
        scopes = [SLIDES_SCOPE, DRIVE_SCOPE]
        self._credentials = get_credentials(scopes, settings.impersonated_user)
        self._slides = build("slides", "v1", credentials=self._credentials, cache_discovery=False)
        self._drive = build("drive", "v3", credentials=self._credentials, cache_discovery=False)

    def _create_base_presentation(self, title: str) -> dict:
        if self._settings.slide_template_id:
            logging.info("Copying template %s", self._settings.slide_template_id)
            copy = (
                self._drive.files()
                .copy(fileId=self._settings.slide_template_id, body={"name": title})
                .execute()
            )
            presentation_id = copy["id"]
            return self._slides.presentations().get(presentationId=presentation_id).execute()

        return self._slides.presentations().create(body={"title": title}).execute()

    def _get_placeholder_id(self, slide: dict, placeholder_type: str) -> Optional[str]:
        for element in slide.get("pageElements", []):
            shape = element.get("shape")
            if not shape:
                continue
            placeholder = shape.get("placeholder")
            if placeholder and placeholder.get("type") == placeholder_type:
                return element.get("objectId")
        return None

    def create_summary_presentation(
        self,
        *,
        title: str,
        spreadsheet_id: str,
        summary: str,
        raw_excerpt: str,
    ) -> str:
        """Create a slides presentation and return its Drive URL."""

        presentation = self._create_base_presentation(title)
        presentation_id = presentation["presentationId"]
        first_slide = presentation["slides"][0]

        title_id = self._get_placeholder_id(first_slide, "TITLE")
        subtitle_id = self._get_placeholder_id(first_slide, "SUBTITLE")

        requests = []

        if title_id:
            requests.append(
                {
                    "insertText": {
                        "objectId": title_id,
                        "text": title,
                    }
                }
            )
        if subtitle_id:
            subtitle_text = (
                f"Source sheet: {spreadsheet_id}\nGenerated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
            )
            requests.append(
                {
                    "insertText": {
                        "objectId": subtitle_id,
                        "text": subtitle_text,
                    }
                }
            )

        # Create summary slide
        requests.extend(
            [
                {
                    "createSlide": {
                        "slideLayoutReference": {"predefinedLayout": "TITLE_AND_BODY"},
                        "placeholderIdMappings": [
                            {
                                "layoutPlaceholder": {"type": "TITLE"},
                                "objectId": "SummaryTitle",
                            },
                            {
                                "layoutPlaceholder": {"type": "BODY"},
                                "objectId": "SummaryBody",
                            },
                        ],
                    }
                },
                {
                    "insertText": {
                        "objectId": "SummaryTitle",
                        "text": "Key Insights",
                    }
                },
                {
                    "insertText": {
                        "objectId": "SummaryBody",
                        "text": summary,
                    }
                },
            ]
        )

        # Append data excerpt slide for transparency
        requests.extend(
            [
                {
                    "createSlide": {
                        "slideLayoutReference": {"predefinedLayout": "TITLE_AND_BODY"},
                        "placeholderIdMappings": [
                            {
                                "layoutPlaceholder": {"type": "TITLE"},
                                "objectId": "ExcerptTitle",
                            },
                            {
                                "layoutPlaceholder": {"type": "BODY"},
                                "objectId": "ExcerptBody",
                            },
                        ],
                    }
                },
                {
                    "insertText": {
                        "objectId": "ExcerptTitle",
                        "text": "Data Excerpt",
                    }
                },
                {
                    "insertText": {
                        "objectId": "ExcerptBody",
                        "text": raw_excerpt,
                    }
                },
            ]
        )

        if requests:
            self._slides.presentations().batchUpdate(
                presentationId=presentation_id,
                body={"requests": requests},
            ).execute()

        # Fetch shareable link
        drive_metadata = (
            self._drive.files()
            .get(fileId=presentation_id, fields="webViewLink, id")
            .execute()
        )
        link = drive_metadata.get("webViewLink")
        if not link:
            logging.warning("Slides API did not return a webViewLink; returning file ID")
            link = f"https://docs.google.com/presentation/d/{presentation_id}/edit"
        return link

