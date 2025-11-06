"""Helpers for authenticating with Google APIs."""

from __future__ import annotations

from typing import Sequence

import google.auth
from google.auth.credentials import Credentials
from google.oauth2.service_account import Credentials as ServiceAccountCredentials


def get_credentials(scopes: Sequence[str], impersonated_user: str | None = None) -> Credentials:
    """Return application default credentials with the requested scopes.

    Args:
        scopes: OAuth scopes required for the client.
        impersonated_user: Optional user email for domain-wide delegation.

    Returns:
        google.auth.credentials.Credentials: scoped credentials ready for API calls.
    """

    credentials, _ = google.auth.default(scopes=scopes)
    if impersonated_user and isinstance(credentials, ServiceAccountCredentials):
        # Domain-wide delegation requires service account credentials.
        credentials = credentials.with_subject(impersonated_user)
    return credentials

