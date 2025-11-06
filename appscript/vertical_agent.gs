/**
 * Vertical Agent – Google Ads campaign assistant for marketing agencies.
 *
 * Copy this file into a bound Apps Script project in Google Sheets. The script
 * automates discovery of campaigns missing vertical video assets and enables
 * the "Generate Enhanced YouTube Videos" feature on demand.
 *
 * Note: Enable the Google Ads Advanced Service inside the Apps Script editor
 * (Resources > Advanced Google services...) before running any menu actions.
 */

const SHEETS = {
  CONFIG: 'Config',
  CAMPAIGNS: 'Campaigns',
  LOG: 'Log',
  REFERENCE: 'Reference'
};

const MENU_LABEL = 'Vertical Agent';
const CID_REGEX = /^\d{3}-\d{3}-\d{4}$/;

const STRINGS = {
  menu: {
    initialize: 'Initialize Setup',
    fetch: 'Fetch Campaigns',
    apply: 'Apply Enhancements',
    email: 'Send Summary Email'
  },
  alerts: {
    enableService:
      'Please enable the Google Ads advanced service before continuing.\n' +
      'In the Apps Script editor, open "Services" (puzzle-piece icon),' +
      ' click the "+" button, and add Google Ads.',
    missingConfig:
      'Enter a Customer ID (CID) in Config sheet cell B2 before running this action.',
    noSelection:
      'Select at least one campaign (Enable? checkbox) before applying enhancements.',
    noRecipients:
      'Add at least one email address under Config!C5:C before sending summaries.'
  }
};

const HEADERS = {
  CONFIG: [
    ['Setting', 'Value', 'Notes'],
    ['Customer CID', '', 'Required. Format: xxx-xxx-xxxx'],
    ['Login CID (optional)', '', 'Provide if managing via MCC'],
    ['Last Sync Timestamp', '', 'Managed by script'],
    ['Last Action Timestamp', '', 'Managed by script'],
    ['Email Recipients', '', 'List email addresses starting in this column'],
    ['Default Email Subject', 'Vertical Agent – campaign update', 'Optional'],
    ['Email Intro Text', 'The following campaigns were updated by Vertical Agent.', 'Optional']
  ],
  CAMPAIGNS: [
    'Enable?',
    'Campaign Name',
    'Campaign ID',
    'Status',
    'Channel Type',
    'Generate Enhanced YouTube Videos (Current)',
    'Has Vertical Asset?',
    'Asset Notes',
    'Action Preview',
    'Last Synced'
  ],
  LOG: [
    'Timestamp',
    'Actor',
    'Campaign Name',
    'Campaign ID',
    'Action',
    'Result',
    'Details'
  ]
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu(MENU_LABEL)
    .addItem(STRINGS.menu.initialize, 'initializeSetup')
    .addSeparator()
    .addItem(STRINGS.menu.fetch, 'fetchCampaigns')
    .addItem(STRINGS.menu.apply, 'applyEnhancements')
    .addSeparator()
    .addItem(STRINGS.menu.email, 'sendSummaryEmail')
    .addToUi();
}

function initializeSetup() {
  Guard.ensureGoogleAdsService();
  const ss = SpreadsheetApp.getActive();

  SheetSync.ensureSheetStructure(ss.getSheetByName(SHEETS.CONFIG), SHEETS.CONFIG);
  SheetSync.ensureSheetStructure(ss.getSheetByName(SHEETS.CAMPAIGNS), SHEETS.CAMPAIGNS);
  SheetSync.ensureSheetStructure(ss.getSheetByName(SHEETS.LOG), SHEETS.LOG);
  SheetSync.ensureSheetStructure(ss.getSheetByName(SHEETS.REFERENCE), SHEETS.REFERENCE, true);

  SheetSync.writeConfigDefaults();

  SpreadsheetApp.flush();
  uiAlert('Setup complete. Enter your Customer CID (and Login CID if needed) in the Config sheet.');
}

function fetchCampaigns() {
  Guard.ensureGoogleAdsService();
  const config = ConfigService.getConfig();
  Guard.ensureConfig(config);

  const campaigns = CampaignRepository.listCampaignsWithAssets(config);
  SheetSync.writeCampaigns(campaigns);
  ConfigService.setLastSyncTimestamp();

  Logger.logAction('System', 'Fetch Campaigns', 'OK', 'Campaign list refreshed.');
  uiAlert(`Fetched ${campaigns.length} campaigns.`);
}

function applyEnhancements() {
  Guard.ensureGoogleAdsService();
  const config = ConfigService.getConfig();
  Guard.ensureConfig(config);

  const selections = SheetSync.getSelectedCampaigns();
  if (!selections.length) {
    uiAlert(STRINGS.alerts.noSelection);
    return;
  }

  const results = EnhancementService.enableGenerateEnhancedVideos(config, selections);
  SheetSync.updateCampaignStatuses(results);
  ConfigService.setLastActionTimestamp();

  const successes = results.filter((r) => r.success).length;
  const failures = results.length - successes;
  uiAlert(`Completed with ${successes} success(es) and ${failures} failure(s). See Log tab for details.`);
}

function sendSummaryEmail() {
  const config = ConfigService.getConfig();
  const recipients = ConfigService.getRecipients();
  if (!recipients.length) {
    uiAlert(STRINGS.alerts.noRecipients);
    return;
  }

  const payload = EmailService.buildSummaryPayload(config, recipients);
  if (!payload.entries.length) {
    uiAlert('No recent actions to include in summary email.');
    return;
  }

  EmailService.sendSummaryEmail(payload);
  uiAlert('Summary email sent.');
}

/** Utility: Present an alert using the Spreadsheet UI in a safe manner. */
function uiAlert(message) {
  SpreadsheetApp.getUi().alert(message);
}

/** Utility guards. */
const Guard = {
  ensureGoogleAdsService: function () {
    if (typeof GoogleAds === 'undefined' || !GoogleAds.GoogleAdsService) {
      throw new Error(STRINGS.alerts.enableService);
    }
  },

  ensureConfig: function (config) {
    if (!config.customerId) {
      throw new Error(STRINGS.alerts.missingConfig);
    }
  }
};

/** Configuration and validation helpers. */
const ConfigService = {
  getConfig: function () {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(SHEETS.CONFIG);
    if (!sheet) {
      return {};
    }

    const map = {};
    const values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 3).getValues();
    values.forEach(function (row) {
      const key = (row[0] || '').toString().trim().toLowerCase();
      const value = (row[1] || '').toString().trim();
      switch (key) {
        case 'customer cid':
          map.customerId = value;
          break;
        case 'login cid (optional)':
          map.loginCustomerId = value;
          break;
        case 'default email subject':
          map.emailSubject = value;
          break;
        case 'email intro text':
          map.emailIntro = value;
          break;
        default:
          break;
      }
    });

    if (map.customerId && !CID_REGEX.test(map.customerId)) {
      throw new Error('Customer CID must match xxx-xxx-xxxx.');
    }
    if (map.loginCustomerId && !CID_REGEX.test(map.loginCustomerId)) {
      throw new Error('Login CID must match xxx-xxx-xxxx.');
    }

    return map;
  },

  getRecipients: function () {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(SHEETS.CONFIG);
    if (!sheet) {
      return [];
    }
    const startRow = 6;
    const col = 3;
    const numRows = Math.max(sheet.getLastRow() - (startRow - 1), 0);
    if (numRows <= 0) {
      return [];
    }

    const values = sheet.getRange(startRow, col, numRows, 1).getValues();
    return values
      .map(function (row) {
        return (row[0] || '').toString().trim();
      })
      .filter(function (v) {
        return v.length;
      });
  },

  setLastSyncTimestamp: function () {
    ConfigService.writeTimestamp('Last Sync Timestamp');
  },

  setLastActionTimestamp: function () {
    ConfigService.writeTimestamp('Last Action Timestamp');
  },

  writeTimestamp: function (label) {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(SHEETS.CONFIG);
    if (!sheet) {
      return;
    }
    const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1);
    const values = range.getValues();
    for (var i = 0; i < values.length; i++) {
      if ((values[i][0] || '').toString().trim().toLowerCase() === label.toLowerCase()) {
        sheet.getRange(i + 2, 2).setValue(new Date());
        break;
      }
    }
  }
};

/** Handles sheet creation and synchronization. */
const SheetSync = {
  ensureSheetStructure: function (sheet, name, hidden) {
    const ss = SpreadsheetApp.getActive();
    let activeSheet = sheet;
    if (!activeSheet) {
      activeSheet = ss.insertSheet(name);
    }
    if (name === SHEETS.CONFIG) {
      SheetSync.setupConfigSheet(activeSheet);
    } else if (name === SHEETS.CAMPAIGNS) {
      SheetSync.setupDataSheet(activeSheet, HEADERS.CAMPAIGNS, true);
    } else if (name === SHEETS.LOG) {
      SheetSync.setupDataSheet(activeSheet, HEADERS.LOG, false);
    } else if (name === SHEETS.REFERENCE) {
      activeSheet.clear();
    }
    if (hidden) {
      activeSheet.hideSheet();
    }
  },

  setupConfigSheet: function (sheet) {
    const header = sheet.getRange('A1').getValue();
    if (header !== 'Setting') {
      sheet.clear();
      sheet.getRange(1, 1, HEADERS.CONFIG.length, 3).setValues(HEADERS.CONFIG);
      sheet.setColumnWidths(1, 3, 220);
    }
  },

  setupDataSheet: function (sheet, headers, prepareCheckboxes) {
    const hasHeaders = sheet.getLastRow() > 0;
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
    if (prepareCheckboxes && !hasHeaders) {
      sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 1).insertCheckboxes();
    }
  },

  writeConfigDefaults: function () {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.CONFIG);
    if (!sheet) {
      return;
    }
    // Preserve existing values; only set defaults if empty.
    const defaultSubject = sheet.getRange('B7').getValue();
    if (!defaultSubject) {
      sheet.getRange('B7').setValue('Vertical Agent – campaign update');
    }
    const intro = sheet.getRange('B8').getValue();
    if (!intro) {
      sheet.getRange('B8').setValue('The following campaigns were updated by Vertical Agent.');
    }
  },

  writeCampaigns: function (campaigns) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.CAMPAIGNS);
    if (!sheet) {
      throw new Error('Campaigns sheet not found. Re-run Initialize Setup.');
    }
    // Preserve checkbox selections by capturing existing values keyed by campaign ID.
    const existing = SheetSync.getCheckboxState(sheet);

    sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), sheet.getLastColumn()).clearContent();
    if (!campaigns.length) {
      return;
    }

    const rows = campaigns.map(function (campaign) {
      const checked = existing[campaign.campaignId] || false;
      return [
        checked,
        campaign.campaignName,
        campaign.campaignId,
        campaign.status,
        campaign.channelType,
        campaign.generateEnhancedYoutubeVideos ? 'Enabled' : 'Disabled',
        campaign.verticalStatus,
        campaign.assetNotes,
        campaign.actionPreview,
        campaign.lastSynced
      ];
    });

    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sheet.getRange(2, 1, rows.length, 1).insertCheckboxes();
  },

  getCheckboxState: function (sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return {};
    }
    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    const state = {};
    data.forEach(function (row) {
      const isChecked = !!row[0];
      const campaignId = row[2];
      if (campaignId) {
        state[campaignId] = isChecked;
      }
    });
    return state;
  },

  getSelectedCampaigns: function () {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.CAMPAIGNS);
    if (!sheet) {
      return [];
    }
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return [];
    }
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    return values
      .filter(function (row) {
        return !!row[0] && row[2];
      })
      .map(function (row) {
        return {
          campaignName: row[1],
          campaignId: row[2],
          generateEnhancedYoutubeVideos: row[5] === 'Enabled'
        };
      });
  },

  updateCampaignStatuses: function (results) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.CAMPAIGNS);
    if (!sheet) {
      return;
    }
    const rows = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), sheet.getLastColumn()).getValues();
    const updateMap = {};
    results.forEach(function (result) {
      updateMap[result.campaignId] = result;
    });
    for (var i = 0; i < rows.length; i++) {
      const row = rows[i];
      const campaignId = row[2];
      if (!campaignId || !updateMap[campaignId]) {
        continue;
      }
      const result = updateMap[campaignId];
      row[0] = false;
      if (result.success) {
        row[5] = 'Enabled';
        row[8] = 'Enabled via Vertical Agent';
      } else {
        row[8] = `Failed: ${result.message}`;
      }
      row[9] = new Date();
    }
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
      sheet.getRange(2, 1, rows.length, 1).insertCheckboxes();
    }
  }
};

/** Lightweight logger that writes to Log tab and console. */
const Logger = {
  logAction: function (actor, action, result, details, campaign) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.LOG);
    if (!sheet) {
      return;
    }
    const row = [
      new Date(),
      actor || 'System',
      campaign ? campaign.campaignName : '',
      campaign ? campaign.campaignId : '',
      action,
      result,
      details || ''
    ];
    sheet.appendRow(row);
    console.log('[Vertical Agent]', row.join(' | '));
  }
};

/** Wrapper around Google Ads API calls. */
const AdsClient = {
  searchGoogleAds: function (config, query) {
    const request = {
      customerId: AdsClient.normalizeId(config.customerId),
      query: query
    };
    const loginId = AdsClient.normalizeId(config.loginCustomerId);
    if (loginId) {
      request.loginCustomerId = loginId;
    }

    const batches = [];
    const iterable = GoogleAds.GoogleAdsService.searchStream(request);
    iterable.forEach(function (batch) {
      batches.push.apply(batches, batch.results);
    });
    return batches;
  },

  mutateCampaigns: function (config, operations) {
    const request = {
      customerId: AdsClient.normalizeId(config.customerId),
      operations: operations,
      partialFailure: true
    };
    const loginId = AdsClient.normalizeId(config.loginCustomerId);
    if (loginId) {
      request.loginCustomerId = loginId;
    }
    return GoogleAds.GoogleAdsService.mutateCampaigns(request);
  },

  normalizeId: function (value) {
    if (!value) {
      return undefined;
    }
    return value.replace(/-/g, '');
  }
};

/** Repository for campaign data. */
const CampaignRepository = {
  listCampaignsWithAssets: function (config) {
    const query = [
      'SELECT',
      '  campaign.id,',
      '  campaign.name,',
      '  campaign.status,',
      '  campaign.advertising_channel_type,',
      '  campaign.video_brand_lift_settings.generate_enhanced_youtube_videos,',
      '  campaign.resource_name,',
      '  campaign_asset.asset,',
      '  campaign_asset.field_type,',
      '  asset.id,',
      '  asset.name,',
      '  asset.resource_name,',
      '  asset.type,',
      '  asset.image_asset.full_size.width_pixels,',
      '  asset.image_asset.full_size.height_pixels',
      'FROM campaign',
      "LEFT JOIN campaign_asset ON campaign_asset.campaign = campaign.resource_name",
      'LEFT JOIN asset ON campaign_asset.asset = asset.resource_name',
      'WHERE campaign.status IN ("ENABLED", "PAUSED")',
      '  AND campaign.serving_status != "ENDED"'
    ].join('\n');

    const rows = AdsClient.searchGoogleAds(config, query);
    const map = {};
    rows.forEach(function (row) {
      const campaign = row.campaign;
      const id = campaign.id;
      if (!map[id]) {
        map[id] = {
          campaignId: id,
          campaignName: campaign.name,
          status: campaign.status,
          channelType: campaign.advertisingChannelType,
          resourceName: campaign.resourceName,
          generateEnhancedYoutubeVideos: !!campaign.videoBrandLiftSettings.generateEnhancedYoutubeVideos,
          assets: []
        };
      }
      if (row.asset) {
        map[id].assets.push(row);
      }
    });

    return Object.keys(map)
      .map(function (key) {
        return CampaignRepository.transform(map[key]);
      })
      .sort(function (a, b) {
        return a.campaignName.localeCompare(b.campaignName);
      });
  },

  transform: function (campaign) {
    const summary = CampaignRepository.summarizeAssets(campaign.assets);
    return {
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      status: campaign.status,
      channelType: campaign.channelType,
      resourceName: campaign.resourceName,
      generateEnhancedYoutubeVideos: campaign.generateEnhancedYoutubeVideos,
      verticalStatus: summary.verticalStatus,
      assetNotes: summary.assetNotes,
      actionPreview: campaign.generateEnhancedYoutubeVideos
        ? 'Already enabled'
        : 'Will enable Generate Enhanced YouTube Videos',
      lastSynced: new Date()
    };
  },

  summarizeAssets: function (assets) {
    if (!assets || !assets.length) {
      return {
        verticalStatus: 'Not detected',
        assetNotes: 'No linked assets found.'
      };
    }

    var verticalCount = 0;
    var videoCount = 0;
    var notes = [];

    assets.forEach(function (row) {
      const asset = row.asset;
      const type = (asset.type || '').replace('ASSET_', '').replace(/_/g, ' ').toLowerCase();
      if (asset.youtubeVideoAsset) {
        videoCount++;
        notes.push('Video asset: ' + (asset.name || asset.resourceName));
      }
      if (asset.imageAsset && asset.imageAsset.fullSize) {
        const { widthPixels: w, heightPixels: h } = asset.imageAsset.fullSize;
        if (w && h && h > w) {
          verticalCount++;
          notes.push('Vertical image asset: ' + (asset.name || asset.resourceName));
        }
      }
      if (!asset.youtubeVideoAsset && !asset.imageAsset) {
        notes.push('Asset: ' + (asset.name || asset.resourceName) + ' (' + type + ')');
      }
    });

    const verticalStatus = verticalCount > 0
      ? 'Manual vertical creative present'
      : videoCount > 0
        ? 'Video assets found (orientation unknown)'
        : 'Not detected';

    return {
      verticalStatus: verticalStatus,
      assetNotes: notes.join('\n') || 'No asset notes.'
    };
  }
};

/** Service for enabling Enhanced YouTube videos. */
const EnhancementService = {
  enableGenerateEnhancedVideos: function (config, selections) {
    const operations = [];
    const targetMap = {};

    selections.forEach(function (selection) {
      const resourceName = EnhancementService.buildResourceName(config.customerId, selection.campaignId);
      const operation = {
        updateMask: 'video_brand_lift_settings.generate_enhanced_youtube_videos',
        update: {
          resourceName: resourceName,
          videoBrandLiftSettings: {
            generateEnhancedYoutubeVideos: true
          }
        }
      };
      operations.push(operation);
      targetMap[selection.campaignId] = selection;
    });

    if (!operations.length) {
      return [];
    }

    const response = AdsClient.mutateCampaigns(config, operations);
    const results = [];

    (response.results || []).forEach(function (res) {
      const campaignId = res.resourceName.split('/').pop();
      const campaign = targetMap[campaignId];
      const summary = {
        campaignId: campaignId,
        campaignName: campaign ? campaign.campaignName : campaignId,
        success: true,
        message: 'Enabled'
      };
      Logger.logAction('Vertical Agent', 'Enable Enhanced Videos', 'Success', 'Enabled', campaign);
      results.push(summary);
    });

    if (response.partialFailureError) {
      const errors = response.partialFailureError.details || [];
      errors.forEach(function (detail) {
        if (!detail.errors) {
          return;
        }
        detail.errors.forEach(function (error) {
          const info = error.location ? error.location.fieldPathElements || [] : [];
          const campaignId = EnhancementService.extractCampaignId(info) || 'unknown';
          const campaign = targetMap[campaignId];
          const message = error.message || 'Unspecified error';
          Logger.logAction('Vertical Agent', 'Enable Enhanced Videos', 'Error', message, campaign);
          results.push({
            campaignId: campaignId,
            campaignName: campaign ? campaign.campaignName : campaignId,
            success: false,
            message: message
          });
        });
      });
    }

    // Include campaigns that did not appear in success or error (edge cases).
    selections.forEach(function (selection) {
      const seen = results.some(function (res) {
        return res.campaignId === selection.campaignId;
      });
      if (!seen) {
        Logger.logAction('Vertical Agent', 'Enable Enhanced Videos', 'Unknown', 'No API response returned.', selection);
        results.push({
          campaignId: selection.campaignId,
          campaignName: selection.campaignName,
          success: false,
          message: 'No API response returned.'
        });
      }
    });

    return results;
  },

  buildResourceName: function (customerId, campaignId) {
    const cleanCustomer = AdsClient.normalizeId(customerId);
    return 'customers/' + cleanCustomer + '/campaigns/' + campaignId;
  },

  extractCampaignId: function (fieldPathElements) {
    for (var i = 0; i < fieldPathElements.length; i++) {
      const elem = fieldPathElements[i];
      if (elem && elem.fieldName === 'campaign' && elem.index !== undefined) {
        return elem.index.toString();
      }
    }
    return null;
  }
};

/** Email orchestration. */
const EmailService = {
  buildSummaryPayload: function (config, recipients) {
    const logSheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.LOG);
    if (!logSheet) {
      return { entries: [] };
    }
    const lastRow = logSheet.getLastRow();
    if (lastRow < 2) {
      return { entries: [] };
    }
    const range = logSheet.getRange(2, 1, lastRow - 1, HEADERS.LOG.length);
    const values = range.getValues();
    const entries = values.map(function (row) {
      return {
        timestamp: row[0],
        actor: row[1],
        campaignName: row[2],
        campaignId: row[3],
        action: row[4],
        result: row[5],
        details: row[6]
      };
    }).filter(function (entry) {
      return entry.action === 'Enable Enhanced Videos' && entry.timestamp;
    });

    return {
      subject: config.emailSubject || 'Vertical Agent – campaign update',
      intro: config.emailIntro || 'The following campaigns were updated by Vertical Agent.',
      recipients: recipients.join(','),
      entries: entries
    };
  },

  sendSummaryEmail: function (payload) {
    const html = EmailService.buildHtml(payload);
    MailApp.sendEmail({
      to: payload.recipients,
      subject: payload.subject,
      htmlBody: html
    });
  },

  buildHtml: function (payload) {
    const rows = payload.entries.map(function (entry) {
      return [
        Utilities.formatDate(new Date(entry.timestamp), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
        entry.campaignName || '—',
        entry.campaignId || '—',
        entry.result,
        entry.details || ''
      ];
    });

    const tableRows = rows.map(function (cells) {
      return '<tr>' + cells.map(function (cell) {
        return '<td style="padding:6px 10px;border:1px solid #d1d1d1;">' + cell + '</td>';
      }).join('') + '</tr>';
    }).join('');

    return [
      '<div style="font-family:Arial,sans-serif;font-size:14px;color:#202124;">',
      '<p>' + payload.intro + '</p>',
      '<table style="border-collapse:collapse;min-width:480px;">',
      '<thead>',
      '<tr>',
      '<th style="text-align:left;padding:6px 10px;border:1px solid #d1d1d1;background:#f1f3f4;">Time</th>',
      '<th style="text-align:left;padding:6px 10px;border:1px solid #d1d1d1;background:#f1f3f4;">Campaign</th>',
      '<th style="text-align:left;padding:6px 10px;border:1px solid #d1d1d1;background:#f1f3f4;">Campaign ID</th>',
      '<th style="text-align:left;padding:6px 10px;border:1px solid #d1d1d1;background:#f1f3f4;">Result</th>',
      '<th style="text-align:left;padding:6px 10px;border:1px solid #d1d1d1;background:#f1f3f4;">Details</th>',
      '</tr>',
      '</thead>',
      '<tbody>',
      tableRows,
      '</tbody>',
      '</table>',
      '</div>'
    ].join('');
  }
};

