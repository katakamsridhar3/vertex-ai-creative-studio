# Sheets ➝ Slides Summarization Service

Cloud Run microservice that ingests Google Sheets data, summarizes it with Vertex AI Gemini, and generates Google Slides decks populated with key insights and a data excerpt. Optional BigQuery export is included for downstream analytics.

---

## 1. Prerequisites

- Google Cloud project ID with billing enabled
- `gcloud` CLI ≥ 460.0.0
- Service account with the following roles (or granular equivalents):
  - `roles/aiplatform.user`
  - `roles/bigquery.dataEditor` *(optional – only when BigQuery export is enabled)*
  - `roles/drive.file`
  - `roles/presentations.editor`
  - `roles/sheets.reader`
- Vertex AI, BigQuery, Drive, Slides, and Sheets APIs enabled

If the service account must access user-owned spreadsheets, configure domain-wide delegation and supply the impersonated user email via the `IMPERSONATED_USER_EMAIL` environment variable.

---

## 2. Local Development (optional)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export PROJECT_ID=your-project
export VERTEX_LOCATION=us-central1
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
flask --app main run --port 8080
```

Invoke the endpoint:

```bash
curl -X POST http://localhost:8080/generate \
  -H "Content-Type: application/json" \
  -d '{
        "sheetId": "<spreadsheet-id>",
        "range": "A1:F40",
        "title": "Weekly Performance Summary",
        "goal": "Highlight KPI trends and risks."
      }'
```

---

## 3. Deployment Guide (Cloud Run)

> **Note:** Replace bracketed placeholders with your own values before running commands.

1. **Clone / copy the service**

   ```bash
   git clone <repo-containing-this-folder>
   cd cloud-run-sheets-to-slides
   ```

2. **Enable required APIs**

   ```bash
   gcloud services enable \
     run.googleapis.com \
     aiplatform.googleapis.com \
     bigquery.googleapis.com \
     sheets.googleapis.com \
     slides.googleapis.com \
     drive.googleapis.com
   ```

3. **Create (or reuse) a service account**

   ```bash
   gcloud iam service-accounts create sheets-to-slides-sa \
     --display-name "Sheets to Slides summarizer"

   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:sheets-to-slides-sa@$PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/run.invoker"

   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:sheets-to-slides-sa@$PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/aiplatform.user"

   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:sheets-to-slides-sa@$PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/presentations.editor"

   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:sheets-to-slides-sa@$PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/drive.file"

   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:sheets-to-slides-sa@$PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/sheets.reader"

   # Optional BigQuery access
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:sheets-to-slides-sa@$PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/bigquery.dataEditor"
   ```

   Download the key if you plan to run locally, or keep it in Secret Manager for deployment.

4. **(Optional) Configure BigQuery dataset**

   ```bash
   bq --location=US mk --dataset $PROJECT_ID:sheet_exports
   ```

5. **Deploy to Cloud Run (build from source)**

   ```bash
   export PROJECT_ID=<your-project-id>
   export REGION=us-central1

   gcloud run deploy sheets-to-slides \
     --source . \
     --region $REGION \
     --project $PROJECT_ID \
     --service-account sheets-to-slides-sa@$PROJECT_ID.iam.gserviceaccount.com \
     --set-env-vars PROJECT_ID=$PROJECT_ID,VERTEX_LOCATION=us-central1 \
     --set-env-vars TITLE_PREFIX="Automated Summary" \
     --set-env-vars DEFAULT_SHEET_RANGE="A1:AF30" \
     --no-allow-unauthenticated
   ```

   Add optional variables:

   - `ENABLE_BIGQUERY=true`
   - `BIGQUERY_DATASET=sheet_exports`
   - `BIGQUERY_TABLE=raw_rows`
   - `PRESENTATION_TEMPLATE_ID=<drive-file-id>`
   - `IMPERSONATED_USER_EMAIL=<user@domain.com>`

6. **Grant invocation access**

   ```bash
   gcloud run services add-iam-policy-binding sheets-to-slides \
     --member="user:<your-email@domain.com>" \
     --role="roles/run.invoker" \
     --region $REGION \
     --project $PROJECT_ID
   ```

7. **Invoke the service**

   ```bash
   gcloud run services describe sheets-to-slides \
     --region $REGION \
     --project $PROJECT_ID \
     --format='value(status.url)'

   curl -X POST <SERVICE_URL>/generate \
     -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
     -H "Content-Type: application/json" \
     -d '{
           "sheetId": "<spreadsheet-id>",
           "range": "A1:F40",
           "title": "Monthly Business Review",
           "goal": "Surface wins, risks, and next steps."
         }'
   ```

8. **Automate (optional)**

   - Use Cloud Scheduler + Pub/Sub to publish payloads on a schedule.
   - Wire Google Chat / email notifications with Cloud Functions or Workflows using the output URL.

---

## 4. Request / Response Schema

**POST** `/generate`

```json
{
  "sheetId": "<required string>",
  "range": "<optional string, A1 notation>",
  "title": "<optional string>",
  "goal": "<optional analyst prompt>"
}
```

**Successful response** (`201 Created`):

```json
{
  "presentationUrl": "https://docs.google.com/presentation/d/...",
  "summary": "- Bullet point\n- ...",
  "bigQueryJobId": "<optional>"
}
```

**Error response** (`502 Bad Gateway`, etc.):

```json
{
  "error": "Failed to fetch sheet data",
  "details": "Reason from upstream API"
}
```

---

## 5. Troubleshooting

- **Authentication failures** – Confirm the service account has access to the target Sheet/Slides. For external sheets, share the document with the service account or enable domain-wide delegation.
- **Vertex AI quota errors** – Verify region, model name, and project billing status. Adjust `MAX_SAMPLE_ROWS` or the sheet range to stay within token limits.
- **BigQuery permission errors** – Ensure the dataset exists and the service account has `roles/bigquery.dataEditor` (or custom role with `bigquery.tables.updateData`).
- **Slides API rate limits** – Add retry logic or exponential backoff for high-volume workloads.

---

## 6. Extensibility

- Attach custom slide templates by setting `PRESENTATION_TEMPLATE_ID`.
- Enrich prompts with BigQuery-derived metrics before calling Gemini.
- Add chart detection by reading `sheets.spreadsheets().get` chart specs and embedding exported images into slides.

