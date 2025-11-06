Vertical Agent – AppSheet Deployment Design
==========================================

Overview
--------
Vertical Agent is an Apps Script solution bound to a Google Sheet so that
marketing agencies can audit and enable YouTube vertical video generation for
their clients. Agencies paste the script once, authorize with their Google Ads
login, and then manage everything from the sheet through checkboxes and custom
menus.

Key Requirements
----------------
- Works for agencies that manage clients through MCC accounts.
- Requires only customer IDs (child CID and optional login CID) and email
  recipients, entered directly in the sheet.
- Non-technical deployment: copy/paste script, authorize, run menu-driven
  actions.
- Manual control of enabling vertical video generation per campaign.
- Sends summary emails to a configurable distribution list.
- Maintains an audit trail of actions and errors inside the sheet.

Sheet Architecture
------------------

Config Tab
- Headers: `Setting`, `Value`, supplementary columns for lists.
- Required entries:
  - Customer CID (formatted `xxx-xxx-xxxx`).
  - Login CID (optional, formatted `xxx-xxx-xxxx`).
  - Email Recipients (column of addresses).
- Script-maintained fields:
  - Last Sync Timestamp.
  - Last Action Timestamp.
  - Default Email Subject.
  - Email Intro Text.
- User sees helper notes injected by the script on first run.

Campaigns Tab
- Headers: `Enable?`, `Campaign Name`, `Campaign ID`, `Status`, `Channel Type`,
  `Generate Enhanced YouTube Videos (Current)`, `Has Vertical Asset?`,
  `Asset Notes`, `Action Preview`, `Last Synced`.
- The `Enable?` column is a checkbox the user toggles; other columns are
  protected.
- `Action Preview` explains what will happen when Apply Enhancements runs.

Log Tab
- Headers: `Timestamp`, `Actor`, `Campaign Name`, `Campaign ID`, `Action`,
  `Result`, `Details`.
- Receives entries for every fetch, enable attempt, and error.
- Used to build email summaries and provide an in-sheet audit trail.

Reference Tab (hidden)
- Stores raw payload snapshots if we need a cache for subsequent runs.
- Simplifies debugging without cluttering user workspace.

Apps Script Module Structure
----------------------------

Menu
- onOpen() adds a "Vertical Agent" menu with items:
  - Initialize Setup
  - Fetch Campaigns
  - Apply Enhancements
  - Send Summary Email

ConfigService
- Reads and validates CID/login CID/email recipients from Config tab.
- Writes timestamps and ensures format compliance.
- Supplies default email subject/intro strings.

AdsClient
- Wraps Google Ads Advanced Service.
- Handles MCC vs direct access by selecting login CID when provided.
- Provides methods to list campaigns, fetch associated assets, and mutate
  campaign settings.

CampaignRepository
- listEligibleCampaigns(): returns campaigns eligible for vertical videos.
- fetchCampaignAssets(): determines whether each campaign has vertical assets by
  inspecting asset metadata (portrait aspect ratio flags).

SheetSync
- writeCampaignRows(): clears and repopulates Campaigns tab while preserving
  checkboxes.
- readSelectedCampaigns(): returns selected campaign IDs with validation.
- appendLogEntry(): adds rows to Log tab.

EnhancementService
- enableEnhancedVideo(): enables the Generate Enhanced YouTube Videos feature
  for supplied campaigns and returns success/failure per campaign.
- Updates Campaigns tab to reflect new state after mutation.

EmailService
- Builds HTML summary tables of applied changes using Log entries since the last
  send.
- Sends emails to recipients from Config tab; warns if list is empty.

Manual Workflow Summary
-----------------------
1. User pastes script into the sheet's Apps Script editor and runs Initialize
   Setup.
2. Script prompts for authorization and creates the tabs, helper notes, and
   custom menu.
3. User fills Customer CID, optional Login CID, and Email Recipients.
4. User runs Fetch Campaigns; Campaigns tab populates with status and asset
   insights.
5. User checks Enable? for campaigns missing vertical assets and runs Apply
   Enhancements.
6. Script updates campaign settings, logs actions, and suggests sending the
   summary email.
7. User optionally runs Send Summary Email, which uses the configured
   distribution list and marks the last send time.

Error Handling
--------------
- Input validation for CID formats and missing recipients.
- Per-campaign error capture during enable operations, surfaced in Log tab and
  email summary.
- Non-fatal failures allow other campaigns to continue processing.
- Advanced service status checks with user-friendly prompts if Google Ads
  service is not enabled.

Localization and Extensibility
-------------------------------
- All user-facing strings stored in a constants block for potential future i18n.
- Structure allows future automation (time-driven triggers) or additional
  campaign checks without changing sheet layout.

