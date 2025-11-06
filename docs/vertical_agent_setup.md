Vertical Agent Deployment Guide
===============================

Use this guide to deploy the Vertical Agent Apps Script in a Google Sheet and
connect it to a Google Ads account (or client account under an MCC). The entire
process is copy/paste friendly and requires no coding once the script is in
place.

Prerequisites
-------------
- Google Workspace account with access to Google Sheets and Google Ads.
- The Google Ads account (CID) you wish to manage. If you operate through an
  MCC, have both the login CID (your MCC) and the client CID handy.
- Authorization to enable the "Generate Enhanced YouTube Videos" feature on the
  selected campaigns.

Provision the Sheet
-------------------
1. Create a new Google Sheet (e.g., named "Vertical Agent").
2. Open the sheet, then open **Extensions → Apps Script**. A new Apps Script
   tab appears.
3. Delete any placeholder code in the default `Code.gs` file.
4. Copy the full contents of `appscript/vertical_agent.gs` from this repo and
   paste it into the Apps Script editor. Save the project (File → Save) with a
   recognizable name, such as "Vertical Agent".

Enable the Google Ads Advanced Service
--------------------------------------
1. In the Apps Script editor, click the **Services** icon (puzzle piece) on the
   left sidebar.
2. Click the **+** button, find **Google Ads API**, and enable it.
3. When prompted on first run, authorize the script with the Google account that
   has access to the relevant Ads account(s). If you manage clients via MCC,
   make sure that account can access both the MCC and the client CID.

Initialize the Sheet
--------------------
1. Return to the Sheet tab and refresh the page to load the custom menu.
2. You should see a new menu named **Vertical Agent**. If not, run `onOpen` once
   from the Apps Script editor.
3. From the Vertical Agent menu, choose **Initialize Setup**. Grant any
   additional permissions requested.
4. The script creates four sheets:
   - `Config` – enter account IDs and email recipients here.
   - `Campaigns` – campaign inventory with enable checkboxes.
   - `Log` – audit trail of actions.
   - `Reference` (hidden) – reserved for cached payloads.

Configure Access & Notifications
--------------------------------
1. In the `Config` sheet, fill in:
   - **Customer CID** (format `xxx-xxx-xxxx`).
   - **Login CID (optional)** – required only if you act via MCC. Leave blank
     when working directly inside the client account.
   - Under **Email Recipients**, add one or more addresses vertically in column
     C starting at row 6.
2. Optionally adjust the default email subject and intro text.

Fetch Campaign Status
---------------------
1. From the menu, click **Fetch Campaigns**.
2. The script retrieves eligible campaigns, notes whether vertical creatives are
   detected, and shows if auto-generated vertical videos are already enabled.
3. Review the `Has Vertical Asset?` and `Action Preview` columns for context.

Enable Generate Enhanced YouTube Videos
---------------------------------------
1. In the `Campaigns` tab, check the `Enable?` box for each campaign that should
   receive auto-generated vertical videos.
2. Click **Apply Enhancements** from the menu.
3. The script updates each selected campaign, clears the checkbox, and writes a
   result in the `Action Preview` column.
4. Inspect the `Log` tab if any campaign fails to update.

Send Summary Emails
-------------------
1. After applying enhancements, choose **Send Summary Email**.
2. The script emails the configured recipients a table of successful and failed
   updates (taken from the log).
3. If no recipients are configured or no recent actions exist, you will see a
   helpful alert instead.

Tips & Troubleshooting
----------------------
- **Advanced service disabled**: If you see an error about the Google Ads
  service, return to the Apps Script editor and confirm the Google Ads API is
  enabled.
- **CID formatting**: All CIDs must include dashes (e.g., `123-456-7890`). The
  script validates the format and stops with an alert if it is incorrect.
- **Partial failures**: The Google Ads API may enable some campaigns and fail on
  others within the same batch. Check the `Log` tab for the failure reason and
  correct any account-level restrictions before retrying.
- **MCC usage**: When managing a client through an MCC, enter the MCC CID as the
  Login CID and the client CID as the Customer CID. The script automatically
  strips dashes when sending requests.
- **Re-running Initialize Setup**: This is safe. Your Config values, logs, and
  campaign selections are preserved.

Next Steps
----------
- Consider duplicating the Sheet per client for clearer separation.
- Extend the Apps Script (in `vertical_agent.gs`) if you need scheduled
  refreshes or additional asset checks—core modules are organized to make that
  easy.

