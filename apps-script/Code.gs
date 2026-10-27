const MEMBERS_SHEET = 'Members';
const CHECKINS_SHEET = 'SIFAA_Checkins';
const ADMIN_EMAIL = 'sangee2cu@gmail.com';
const PROP_ACTIVE_SHEET_ID = 'SIFAA_ACTIVE_SPREADSHEET_ID';
const PROP_ACTIVE_SHEET_NAME = 'SIFAA_ACTIVE_SPREADSHEET_NAME';
const PROP_ADMIN_PASSWORD_HASH = 'SIFAA_ADMIN_PASSWORD_HASH';
const PROP_ADMIN_PASSWORD_SALT = 'SIFAA_ADMIN_PASSWORD_SALT';
const SESSION_TTL_SECONDS = 21600;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_SECONDS = 900;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SIFAA Event Check-in')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Run manually from the Apps Script editor to set or change the admin password.
// If this project is standalone, use the setup instructions in README instead.
function setAdminPassword() {
  const ui = SpreadsheetApp.getUi();
  const first = ui.prompt('Set SIFAA admin password', 'Enter a strong password (at least 12 characters).', ui.ButtonSet.OK_CANCEL);
  if (first.getSelectedButton() !== ui.Button.OK) return;
  const password = first.getResponseText();
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  const second = ui.prompt('Confirm SIFAA admin password', 'Re-enter the same password.', ui.ButtonSet.OK_CANCEL);
  if (second.getSelectedButton() !== ui.Button.OK) return;
  if (password !== second.getResponseText()) throw new Error('Passwords did not match. Run setAdminPassword again.');
  const salt = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    [PROP_ADMIN_PASSWORD_SALT]: salt,
    [PROP_ADMIN_PASSWORD_HASH]: passwordDigest_(salt, password)
  }, false);
  ui.alert('Admin password saved securely. You can now sign in using ' + ADMIN_EMAIL + '.');
}

function passwordDigest_(salt, password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes);
}

function loginAdmin(email, password) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  if (email !== ADMIN_EMAIL) throw new Error('Invalid email or password.');
  const cache = CacheService.getScriptCache();
  const failureKey = 'SIFAA_LOGIN_FAIL_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email, Utilities.Charset.UTF_8)
  );
  const failures = Number(cache.get(failureKey) || 0);
  if (failures >= LOGIN_FAILURE_LIMIT) throw new Error('Too many failed attempts. Please wait 15 minutes and try again.');
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty(PROP_ADMIN_PASSWORD_SALT);
  const expected = props.getProperty(PROP_ADMIN_PASSWORD_HASH);
  if (!salt || !expected) throw new Error('Admin password has not been configured. Ask the Apps Script owner to set it up.');
  if (passwordDigest_(salt, password) !== expected) {
    const nextFailures = failures + 1;
    cache.put(failureKey, String(nextFailures), LOGIN_LOCK_SECONDS);
    throw new Error(nextFailures >= LOGIN_FAILURE_LIMIT ? 'Too many failed attempts. Please wait 15 minutes and try again.' : 'Invalid email or password.');
  }
  cache.remove(failureKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('SIFAA_ADMIN_SESSION_' + token, ADMIN_EMAIL, SESSION_TTL_SECONDS);
  return { success: true, email: ADMIN_EMAIL, token: token, expiresInSeconds: SESSION_TTL_SECONDS };
}

function logoutAdmin(sessionToken) {
  const token = String(sessionToken || '');
  if (token) CacheService.getScriptCache().remove('SIFAA_ADMIN_SESSION_' + token);
  return { success: true };
}

function requireAdminSession_(sessionToken) {
  const token = String(sessionToken || '');
  if (!token || CacheService.getScriptCache().get('SIFAA_ADMIN_SESSION_' + token) !== ADMIN_EMAIL) {
    throw new Error('Your admin session has expired. Please sign in again.');
  }
  return ADMIN_EMAIL;
}

function getAppConfig() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty(PROP_ACTIVE_SHEET_ID) || '';
  const sheetName = props.getProperty(PROP_ACTIVE_SHEET_NAME) || '';
  let eventName = '';
  if (sheetId) {
    try {
      eventName = getEventNameFromSpreadsheet_(SpreadsheetApp.openById(sheetId));
    } catch (e) {
      throw new Error('The configured event spreadsheet cannot be opened. Ask the SIFAA administrator to verify access and republish it.');
    }
  }
  return { hasActiveEvent: Boolean(sheetId), eventName: eventName, spreadsheetName: sheetName };
}

function publishEventSpreadsheet(sheetUrl, sessionToken) {
  const adminEmail = requireAdminSession_(sessionToken);
  const url = String(sheetUrl || '').trim();
  const urlParts = url.split('/spreadsheets/d/');
  const spreadsheetId = urlParts.length > 1 ? urlParts[1].split('/')[0].split('?')[0] : '';
  if (!spreadsheetId) throw new Error('Paste a valid Google Sheets URL.');
  const spreadsheetId = match[1];
  let ss;
  try {
    ss = SpreadsheetApp.openById(spreadsheetId);
  } catch (e) {
    throw new Error('The spreadsheet could not be opened by the app owner. Check the URL and make sure the app owner has access.');
  }
  const members = ss.getSheetByName(MEMBERS_SHEET);
  if (!members) throw new Error('This spreadsheet must contain a tab named "Members".');
  const values = members.getDataRange().getValues();
  if (!values.length) throw new Error('The Members tab is empty. Add the header row first.');
  const headers = values[0].map(v => String(v).trim().toLowerCase());
  const required = [
    { label: 'User ID', aliases: ['user id', 'userid', 'member id'] },
    { label: 'First name', aliases: ['first name', 'firstname'] },
    { label: 'Last name', aliases: ['last name', 'lastname'] },
    { label: 'Membership status', aliases: ['membership status', 'status'] }
  ];
  const missing = required.filter(item => findHeader(headers, item.aliases) < 0).map(item => item.label);
  if (missing.length) throw new Error('Members tab is missing required column(s): ' + missing.join(', ') + '.');
  let checkins = ss.getSheetByName(CHECKINS_SHEET);
  if (!checkins) {
    checkins = ss.insertSheet(CHECKINS_SHEET);
    checkins.appendRow(['Timestamp', 'Event', 'User ID', 'First name', 'Last name', 'Head count', 'Volunteer', 'Membership status']);
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_ACTIVE_SHEET_ID, spreadsheetId);
  props.setProperty(PROP_ACTIVE_SHEET_NAME, ss.getName());
  return { success: true, adminEmail: adminEmail, spreadsheetName: ss.getName(), eventName: getEventNameFromSpreadsheet_(ss), memberRows: Math.max(0, values.length - 1) };
}

function getConfiguredSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_ACTIVE_SHEET_ID);
  if (!id) throw new Error('No event is published yet. Ask the SIFAA administrator to publish a Google Sheet.');
  return SpreadsheetApp.openById(id);
}

function getEventNameFromSpreadsheet_(ss) {
  const fileName = ss.getName();
  const lastHyphen = fileName.lastIndexOf('-');
  return (lastHyphen >= 0 ? fileName.substring(lastHyphen + 1) : fileName).trim();
}

function getEventName() {
  return getEventNameFromSpreadsheet_(getConfiguredSpreadsheet_());
}

function searchMembers(firstName, lastName) {
  firstName = String(firstName || '').trim().toLowerCase();
  lastName = String(lastName || '').trim().toLowerCase();
  if (!firstName && !lastName) throw new Error('Enter a first name, last name, or both.');
  const sheet = getConfiguredSpreadsheet_().getSheetByName(MEMBERS_SHEET);
  if (!sheet) throw new Error('Could not find a sheet named "' + MEMBERS_SHEET + '".');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(v => String(v).trim().toLowerCase());
  const idCol = findHeader(headers, ['user id', 'userid', 'member id']);
  const firstCol = findHeader(headers, ['first name', 'firstname']);
  const lastCol = findHeader(headers, ['last name', 'lastname']);
  if (idCol < 0 || firstCol < 0 || lastCol < 0) throw new Error('Members sheet needs User ID, First name, and Last name columns.');
  const matches = [];
  for (let i = 1; i < values.length; i++) {
    const first = String(values[i][firstCol] || '').trim();
    const last = String(values[i][lastCol] || '').trim();
    if ((!firstName || first.toLowerCase().includes(firstName)) &&
        (!lastName || last.toLowerCase().includes(lastName))) {
      const member = getMember(String(values[i][idCol]).trim());
      if (member) matches.push(member);
      if (matches.length >= 50) break;
    }
  }
  return matches;
}

function getMember(userId) {
  userId = String(userId || '').trim();
  if (!userId) throw new Error('Enter a member User ID.');
  const ss = getConfiguredSpreadsheet_();
  const sheet = ss.getSheetByName(MEMBERS_SHEET);
  if (!sheet) throw new Error('Could not find a sheet named "' + MEMBERS_SHEET + '".');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('The Members sheet has no member records.');
  const headers = values[0].map(v => String(v).trim().toLowerCase());
  const col = {
    id: findHeader(headers, ['user id', 'userid', 'member id']),
    first: findHeader(headers, ['first name', 'firstname']),
    last: findHeader(headers, ['last name', 'lastname']),
    email: findHeader(headers, ['email', 'email address']),
    phone: findHeader(headers, ['phone', 'phone number', 'mobile']),
    level: findHeader(headers, ['membership level', 'level']),
    status: findHeader(headers, ['membership status', 'status']),
    renewal: findHeader(headers, ['renewal due', 'renewal date', 'expiry date', 'expiration date'])
  };
  if (col.id < 0) throw new Error('Members sheet needs a "User ID" column.');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col.id]).trim() === userId) {
      const row = values[i];
      const statusText = col.status >= 0 ? String(row[col.status] || '').trim() : '';
      const renewal = col.renewal >= 0 ? row[col.renewal] : '';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const renewalDate = renewal instanceof Date ? new Date(renewal) : (renewal ? new Date(renewal) : null);
      if (renewalDate && !isNaN(renewalDate.getTime())) renewalDate.setHours(0, 0, 0, 0);
      const activeStatus = statusText.toLowerCase() === 'active';
      const notExpired = !renewalDate || isNaN(renewalDate.getTime()) || renewalDate >= today;
      const active = activeStatus && notExpired;
      return {
        userId: userId,
        firstName: col.first >= 0 ? String(row[col.first] || '') : '',
        lastName: col.last >= 0 ? String(row[col.last] || '') : '',
        email: col.email >= 0 ? String(row[col.email] || '') : '',
        phone: col.phone >= 0 ? String(row[col.phone] || '') : '',
        membershipLevel: col.level >= 0 ? String(row[col.level] || '') : '',
        membershipStatus: statusText || 'Unknown',
        renewalDue: renewalDate && !isNaN(renewalDate.getTime()) ? Utilities.formatDate(renewalDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(renewal || ''),
        active: active,
        statusMessage: active ? 'Active — eligible to check in' : 'Inactive or expired — check-in not allowed'
      };
    }
  }
  return null;
}

function findHeader(headers, choices) {
  for (let i = 0; i < choices.length; i++) {
    const index = headers.indexOf(choices[i]);
    if (index >= 0) return index;
  }
  return -1;
}

function checkIn(userId, eventName, headCount) {
  const member = getMember(userId);
  if (!member) throw new Error('No member found for User ID: ' + userId);
  if (!member.active) throw new Error('Membership is inactive or expired. Check-in was not recorded.');
  const ss = getConfiguredSpreadsheet_();
  const configuredEventName = getEventNameFromSpreadsheet_(ss);
  eventName = String(eventName || '').trim();
  if (!eventName || eventName !== configuredEventName) throw new Error('The active event changed. Refresh the app and try again.');
  const count = Math.min(6, Math.max(1, Math.floor(Number(headCount) || 1)));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let sheet = ss.getSheetByName(CHECKINS_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(CHECKINS_SHEET);
      sheet.appendRow(['Timestamp', 'Event', 'User ID', 'First name', 'Last name', 'Head count', 'Volunteer', 'Membership status']);
    }
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]).trim().toLowerCase() === eventName.toLowerCase() &&
          String(rows[i][2]).trim() === String(userId).trim()) {
        throw new Error('This member has already checked in for "' + eventName + '".');
      }
    }
    sheet.appendRow([new Date(), eventName, member.userId, member.firstName, member.lastName, count, '', member.membershipStatus]);
  } finally {
    lock.releaseLock();
  }
  return { success: true, member: member, eventName: eventName, headCount: count, summary: getEventSummary(eventName) };
}

function getEventSummary(eventName) {
  const ss = getConfiguredSpreadsheet_();
  eventName = getEventNameFromSpreadsheet_(ss);
  const sheet = ss.getSheetByName(CHECKINS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { checkIns: 0, people: 0, recent: [] };
  const rows = sheet.getDataRange().getValues();
  const recent = [];
  let checkIns = 0, people = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim().toLowerCase() === eventName.toLowerCase()) {
      checkIns++;
      people += Number(rows[i][5]) || 0;
      recent.push({
        timestamp: rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], Session.getScriptTimeZone(), 'h:mm a') : String(rows[i][0]),
        userId: String(rows[i][2]),
        name: [rows[i][3], rows[i][4]].filter(String).join(' '),
        headCount: Number(rows[i][5]) || 0
      });
    }
  }
  recent.reverse();
  return { checkIns: checkIns, people: people, recent: recent };
}
