/**
 * Observation Notebook — three-tab Google Sheets template creator.
 *
 * Paste this file into a standalone Apps Script project and run
 * createObservationTemplate(). Running it again creates a fresh template.
 */

var TEMPLATE_TITLE = 'Observation Notebook Template';
var TEMPLATE_TIME_ZONE = 'America/New_York';

var DEFAULT_SUBJECTS = [
  ['Literacy', '📖'],
  ['Math', '🔢'],
  ['Science & Inquiry', '🔎'],
  ['Social & Emotional', '💛'],
  ['Play & Collaboration', '🧩'],
  ['Physical Development', '🏃'],
  ['Arts & Creativity', '🎨']
];

var COLORS = {
  ink: '#17253f',
  white: '#ffffff',
  navy: '#1a2e56',
  blue: '#3659d9',
  yellow: '#e8c66a'
};

function createObservationTemplate() {
  var ss = SpreadsheetApp.create(TEMPLATE_TITLE);
  ss.setSpreadsheetTimeZone(TEMPLATE_TIME_ZONE);
  ss.setSpreadsheetLocale('en_US');

  var roster = ss.getSheets()[0];
  roster.setName('Class Roster');
  var subjects = ss.insertSheet('Subjects');
  var notes = ss.insertSheet('Notes');

  buildRoster_(roster);
  buildSubjects_(subjects);
  buildNotes_(notes);

  roster.setTabColor(COLORS.yellow);
  subjects.setTabColor(COLORS.blue);
  notes.setTabColor(COLORS.navy);
  ss.setActiveSheet(roster);
  SpreadsheetApp.flush();

  var url = ss.getUrl();
  console.log('Template created: ' + url);
  Logger.log('Template created: ' + url);
  return url;
}

function buildRoster_(sheet) {
  prepareSheet_(sheet, ['Name', 'Initials'], COLORS.yellow, COLORS.ink);
  sheet.getRange('A1').setNote('Enter one student per row. Keep every name unique.');
  sheet.getRange('B1').setNote('Optional. Leave blank and the app creates initials.');
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 110);
  sheet.getRange('A2:B1000').setNumberFormat('@');
}

function buildSubjects_(sheet) {
  prepareSheet_(sheet, ['Subject', 'Emoji'], COLORS.blue, COLORS.white);
  sheet.getRange('A1').setNote('The app shows these choices when you write a note. You can also manage them in the Subjects screen.');
  sheet.getRange('B1').setNote('Optional.');
  sheet.getRange(2, 1, DEFAULT_SUBJECTS.length, 2).setValues(DEFAULT_SUBJECTS);
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 90);
  sheet.getRange('A2:B1000').setNumberFormat('@');
  sheet.getRange('B2:B1000').setHorizontalAlignment('center');
}

function buildNotes_(sheet) {
  prepareSheet_(sheet, ['Date & time', 'Student', 'Subject', 'Note'], COLORS.navy, COLORS.white);
  sheet.getRange('A1').setNote('Recorded automatically by the app, including the time.');
  sheet.getRange('B1').setNote('Matches a name in Class Roster.');
  sheet.getRange('C1').setNote('Matches a choice in Subjects when the note was written.');
  sheet.getRange('D1').setNote('The classroom observation.');
  sheet.getRange('A2:A1000').setNumberFormat('@');
  sheet.getRange('D2:D1000').setWrap(true);
  sheet.setColumnWidth(1, 165);
  sheet.setColumnWidth(2, 210);
  sheet.setColumnWidth(3, 210);
  sheet.setColumnWidth(4, 540);
}

function prepareSheet_(sheet, headers, background, foreground) {
  sheet.clear();
  sheet.setFrozenRows(1);
  var header = sheet.getRange(1, 1, 1, headers.length);
  header.setValues([headers]).setBackground(background).setFontColor(foreground)
    .setFontWeight('bold').setFontFamily('Arial').setFontSize(10)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);
  sheet.getRange(2, 1, Math.min(999, sheet.getMaxRows() - 1), headers.length)
    .setFontFamily('Arial').setFontColor(COLORS.ink).setVerticalAlignment('middle');
}
