const TELEGRAM_API_URL =
  'https://voice-widget-backend-delmar.up.railway.app/api/meta-leads/google-sheets';

// Тестовые строки Meta не отправляем ни в Telegram, ни в CRM.
const SEND_TEST_LEADS = false;

const TELEGRAM_SENT_HEADER = 'telegram_sent_at';
const CRM_SENT_HEADER = 'estate_crm_sent_at';
const CRM_URL_PROPERTY = 'ESTATE_CRM_WEBHOOK_URL';
const CRM_SECRET_PROPERTY = 'ESTATE_CRM_WEBHOOK_SECRET';
const CRM_START_ROW_PROPERTY = 'ESTATE_CRM_START_ROW';

function sendNewMetaLeads() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const telegramSentColumn = ensureColumn(sheet, headers, TELEGRAM_SENT_HEADER);
  const crmSentColumn = ensureColumn(sheet, headers, CRM_SENT_HEADER);

  const index = {};
  headers.forEach((header, i) => {
    index[String(header).trim()] = i;
  });

  ['id', 'full_name', 'phone_number'].forEach((column) => {
    if (index[column] === undefined) throw new Error(`Не найдена колонка: ${column}`);
  });

  const properties = PropertiesService.getScriptProperties();
  const crmUrl = String(properties.getProperty(CRM_URL_PROPERTY) || '').trim();
  const crmSecret = String(properties.getProperty(CRM_SECRET_PROPERTY) || '').trim();
  const crmStartRow = Number(properties.getProperty(CRM_START_ROW_PROPERTY) || 0);
  const crmConfigured = Boolean(crmUrl && crmSecret && crmStartRow >= 2);
  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const errors = [];

  rows.forEach((row, rowIndex) => {
    const sheetRow = rowIndex + 2;
    const metaLeadId = getOptionalValue(row, index, 'id');
    if (!metaLeadId) return;

    const isTestLead = row.some((cell) =>
      String(cell || '').toLowerCase().includes('<test lead:')
    );
    if (isTestLead && !SEND_TEST_LEADS) return;

    const fullName = getOptionalValue(row, index, 'full_name');
    const phoneNumber = getOptionalValue(row, index, 'phone_number').replace(/^p:/i, '').trim();
    const comment = buildComment(row, index, metaLeadId);

    if (!String(row[telegramSentColumn] || '').trim()) {
      try {
        postJson(TELEGRAM_API_URL, {
          clientId: 'delmar',
          name: fullName || 'Meta-лид без имени',
          phoneNumber,
          comment,
          createdAt: getValue(row, index, 'created_time'),
        });
        sheet.getRange(sheetRow, telegramSentColumn + 1).setValue(new Date());
      } catch (error) {
        errors.push(`Telegram, строка ${sheetRow}: ${error.message}`);
      }
    }

    if (crmConfigured && sheetRow >= crmStartRow && !String(row[crmSentColumn] || '').trim()) {
      try {
        postJson(crmUrl, {
          externalId: metaLeadId,
          name: fullName || 'Meta-лид без имени',
          phone: phoneNumber,
          message: comment,
          createdAt: getValue(row, index, 'created_time'),
          metadata: buildMetadata(row, index),
        }, { 'x-estate-crm-secret': crmSecret });
        sheet.getRange(sheetRow, crmSentColumn + 1).setValue(new Date());
      } catch (error) {
        errors.push(`Estate CRM, строка ${sheetRow}: ${error.message}`);
      }
    }
  });

  if (errors.length) throw new Error(errors.slice(0, 8).join('\n'));
}

// Запустить один раз после добавления URL и секрета в свойства скрипта.
// Текущие строки считаются историей и в CRM не отправляются.
function initializeEstateCrmIntegration() {
  const properties = PropertiesService.getScriptProperties();
  const crmUrl = String(properties.getProperty(CRM_URL_PROPERTY) || '').trim();
  const crmSecret = String(properties.getProperty(CRM_SECRET_PROPERTY) || '').trim();
  if (!crmUrl || !crmSecret) {
    throw new Error(`Добавьте свойства ${CRM_URL_PROPERTY} и ${CRM_SECRET_PROPERTY}`);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  ensureColumn(sheet, headers, CRM_SENT_HEADER);
  properties.setProperty(CRM_START_ROW_PROPERTY, String(sheet.getLastRow() + 1));
}

function ensureColumn(sheet, headers, columnName) {
  let index = headers.indexOf(columnName);
  if (index !== -1) return index;
  index = headers.length;
  sheet.getRange(1, index + 1).setValue(columnName);
  headers.push(columnName);
  return index;
}

function buildComment(row, index, metaLeadId) {
  return [
    '📣 Meta Lead Ads',
    `Meta Lead ID: ${metaLeadId}`,
    `Дата Meta: ${getValue(row, index, 'created_time')}`,
    `Кампания: ${getValue(row, index, 'campaign_name')}`,
    `Ad set: ${getValue(row, index, 'adset_name')}`,
    `Объявление: ${getValue(row, index, 'ad_name')}`,
    `Форма: ${getValue(row, index, 'form_name')}`,
    `Платформа: ${getValue(row, index, 'platform')}`,
    `Органический: ${getValue(row, index, 'is_organic')}`,
    `Когда планирует покупку: ${getValue(row, index, 'коли_плануєте_купівлю?')}`,
    `Нужна рассрочка: ${getValue(row, index, 'чи_потрібна_вам_розстрочка?')}`,
    `Статус лида: ${getValue(row, index, 'lead_status')}`,
  ].filter((line) => !line.endsWith(': -')).join('\n');
}

function buildMetadata(row, index) {
  return {
    campaignId: getValue(row, index, 'campaign_id'),
    campaignName: getValue(row, index, 'campaign_name'),
    adsetId: getValue(row, index, 'adset_id'),
    adsetName: getValue(row, index, 'adset_name'),
    adId: getValue(row, index, 'ad_id'),
    adName: getValue(row, index, 'ad_name'),
    formId: getValue(row, index, 'form_id'),
    formName: getValue(row, index, 'form_name'),
    platform: getValue(row, index, 'platform'),
    isOrganic: String(getValue(row, index, 'is_organic')).toLowerCase() === 'true',
    leadStatus: getValue(row, index, 'lead_status'),
  };
}

function postJson(url, payload, extraHeaders) {
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: extraHeaders || {},
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Backend вернул ${status}: ${response.getContentText()}`);
  }
}

function getValue(row, index, columnName) {
  return getOptionalValue(row, index, columnName) || '-';
}

function getOptionalValue(row, index, columnName) {
  if (index[columnName] === undefined) return '';
  const value = String(row[index[columnName]] || '').trim();
  return value;
}
