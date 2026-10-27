const MEMBERS_SHEET = 'Members';
const CHECKINS_SHEET = 'SIFAA_Checkins';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SIFAA Event Check-in')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Event name is the suffix after the final hyphen in the spreadsheet file name.
function getEventName() {
  const fileName = SpreadsheetApp.getActiveSpreadsheet().getName();
  const lastHyphen = fileName.lastIndexOf('-');
  return (lastHyphen >= 0 ? fileName.substring(lastHyphen + 1) : fileName).trim();
}

// Search by first and/or last name. Returns only the matching member records.
function searchMembers(firstName, lastName) {
  firstName = String(firstName || '').trim().toLowerCase();
  lastName = String(lastName || '').trim().toLowerCase();
  if (!firstName && !lastName) throw new Error('Enter a first name, last name, or both.');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MEMBERS_SHEET);
  if (!sheet) throw new Error('Could not find a sheet named "' + MEMBERS_SHEET + '".');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(v => String(v).trim().toLowerCase());
  const idCol = findHeader(headers, ['user id', 'userid', 'member id']);
  const firstCol = findHeader(headers, ['first name', 'firstname']);
  const lastCol = findHeader(headers, ['last name', 'lastname']);
  if (idCol < 0 || firstCol < 0 || lastCol < 0) {
    throw new Error('Members sheet needs User ID, First name, and Last name columns.');
  }

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
  if (!userId) throw new Error('Enter or scan a member User ID.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
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
  eventName = String(eventName || '').trim();
  if (!eventName) throw new Error('Enter the event name.');
  const count = Math.max(1, Math.floor(Number(headCount) || 1));

  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

  // Keep the legacy Volunteer column blank when the existing log has it.
  // New log rows omit collecting or storing any volunteer name.
  sheet.appendRow([new Date(), eventName, member.userId, member.firstName, member.lastName, count, '', member.membershipStatus]);
  return { success: true, member: member, eventName: eventName, headCount: count, summary: getEventSummary(eventName) };
}

function getEventSummary(eventName) {
  eventName = String(eventName || '').trim();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHECKINS_SHEET);
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
  return { checkIns: checkIns, people: people, recent: recent.slice(0, 10) };
}
