/**
 * Class Notes — template creator (participation grade book + observation notes)
 *
 * One-time use:
 *   1. Go to https://script.google.com and create a new project.
 *   2. Paste this entire file into Code.gs.
 *   3. Run createParticipationTemplate().
 *   4. Approve the Google Sheets permission.
 *   5. Open the URL shown in the execution log.
 *   6. Share that spreadsheet as the copyable template for the Svelte app.
 *
 * Running the function again creates a separate, fresh template.
 */

var TEMPLATE_TITLE = 'Class Notes Template';
var TEMPLATE_TIME_ZONE = 'America/New_York';

var TAB_DAY = 'Day Records';
var TAB_WEEKLY = 'Weekly Grades';
var TAB_ROSTER = 'Class Roster';
var TAB_WEEKS = 'Week Ranges';
var TAB_SUBJECTS = 'Subjects';
var TAB_NOTES = 'Notes';

var DIMENSIONS = [
  'Timely-ness',
  'Prepared-ness',
  'Attentive-ness',
  'Contribution-ness',
  'Collaboration-ness'
];

// Starting subjects for the notes. Teachers add, rename, or delete rows on the Subjects tab; keep
// this list in step with DEFAULT_SUBJECTS in src/lib/types.ts, which seeds older copies.
var DEFAULT_SUBJECTS = [
  ['Literacy', '📖'],
  ['Math', '🔢'],
  ['Science & Inquiry', '🔬'],
  ['Social-Emotional', '💛'],
  ['Self-Regulation', '🧘'],
  ['Play & Collaboration', '🧩'],
  ['Fine Motor', '✂️'],
  ['Gross Motor', '🏃'],
  ['Arts & Creativity', '🎨'],
  ['Language & Communication', '🗣️']
];

var COLORS = {
  ink: '#26324a',
  muted: '#6e7890',
  white: '#ffffff',
  line: '#dfe5ef',
  blue: '#5b6fe8',
  blueSoft: '#eef0ff',
  green: '#3f9b77',
  greenSoft: '#e7f6ef',
  coral: '#e77d72',
  coralSoft: '#ffefec',
  yellowSoft: '#fff3ce'
};

function createParticipationTemplate() {
  var ss = SpreadsheetApp.create(TEMPLATE_TITLE);
  ss.setSpreadsheetTimeZone(TEMPLATE_TIME_ZONE);
  ss.setSpreadsheetLocale('en_US');

  var roster = ss.getSheets()[0];
  roster.setName(TAB_ROSTER);

  var day = ss.insertSheet(TAB_DAY);
  var weeks = ss.insertSheet(TAB_WEEKS);
  var weekly = ss.insertSheet(TAB_WEEKLY);
  var subjects = ss.insertSheet(TAB_SUBJECTS);
  var notes = ss.insertSheet(TAB_NOTES);

  buildRoster_(roster);
  buildDayRecords_(day);
  buildWeekRanges_(weeks);
  buildWeeklyGrades_(weekly);
  buildSubjects_(subjects);
  buildNotes_(notes);

  roster.setTabColor(COLORS.coral);
  day.setTabColor(COLORS.blue);
  weeks.setTabColor('#e7b94e');
  weekly.setTabColor(COLORS.green);
  subjects.setTabColor('#8e6fe8');
  notes.setTabColor('#8e6fe8');

  ss.setActiveSheet(roster);
  ss.moveActiveSheet(1);
  SpreadsheetApp.flush();

  var url = ss.getUrl();
  console.log('Template created: ' + url);
  Logger.log('Template created: ' + url);

  try {
    SpreadsheetApp.getUi().alert(
      'Template created',
      'Open this spreadsheet, add any instructions you want teachers to see, then share it as a view-only copyable template:\n\n' + url,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    // Standalone Apps Script projects have no spreadsheet UI.
  }

  return url;
}

function buildRoster_(sheet) {
  prepareSheet_(sheet, ['Name', 'Initials'], COLORS.coral);

  sheet.getRange('A1').setNote(
    'Enter one student per row. Names are used to match daily and weekly records, so keep each name unique.'
  );
  sheet.getRange('B1').setNote(
    'Optional. Leave blank and the app will create initials automatically.'
  );

  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 110);
  sheet.getRange('A2:B1000').setVerticalAlignment('middle');
  sheet.getRange('A2:A1000').setNumberFormat('@');
  sheet.getRange('B2:B1000').setNumberFormat('@');
}

function buildDayRecords_(sheet) {
  var headers = ['Name', 'Date'].concat(DIMENSIONS).concat(['Total']);
  prepareSheet_(sheet, headers, COLORS.blue);

  sheet.getRange('A1').setNote(
    'The app creates one row per student per day. Do not rename this tab or its headers.'
  );
  sheet.getRange('B1').setNote(
    'Dates are written using the spreadsheet timezone: ' + TEMPLATE_TIME_ZONE
  );
  sheet.getRange('H1').setNote(
    'Calculated automatically from the five participation columns.'
  );

  sheet.getRange('H2').setFormula(
    '=ARRAYFORMULA(IF(A2:A="","",N(C2:C="Yes")+N(D2:D="Yes")+N(E2:E="Yes")+N(F2:F="Yes")+N(G2:G="Yes")))'
  );

  sheet.getRange('B2:B1000').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('H2:H1000').setNumberFormat('0');
  sheet.getRange('H2:H1000').setBackground(COLORS.blueSoft);

  var yesNoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Yes', 'No'], true)
    .setAllowInvalid(false)
    .setHelpText('Choose Yes or No.')
    .build();
  sheet.getRange('C2:G1000').setDataValidation(yesNoRule);

  var participationRange = sheet.getRange('C2:G1000');
  var yesFormat = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Yes')
    .setBackground(COLORS.greenSoft)
    .setFontColor('#246348')
    .setRanges([participationRange])
    .build();
  var noFormat = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('No')
    .setBackground(COLORS.coralSoft)
    .setFontColor('#a7444f')
    .setRanges([participationRange])
    .build();
  sheet.setConditionalFormatRules([yesFormat, noFormat]);

  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 115);
  sheet.setColumnWidths(3, 5, 150);
  sheet.setColumnWidth(8, 90);

  sheet.getRange('H2:H1000')
    .protect()
    .setDescription('Automatic participation total')
    .setWarningOnly(true);
}

function buildWeekRanges_(sheet) {
  prepareSheet_(sheet, ['Week', 'Start Date', 'End Date'], '#e7b94e');

  sheet.getRange('A1').setNote(
    'Enter one unique week number per row, such as 1, 2, 3.'
  );
  sheet.getRange('B1').setNote('First class date included in this week.');
  sheet.getRange('C1').setNote('Last class date included in this week.');

  var weekRule = SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThan(0)
    .setAllowInvalid(false)
    .setHelpText('Enter a week number greater than zero.')
    .build();
  var dateRule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .setHelpText('Enter a valid date.')
    .build();

  sheet.getRange('A2:A1000').setDataValidation(weekRule).setNumberFormat('0');
  sheet.getRange('B2:C1000').setDataValidation(dateRule).setNumberFormat('yyyy-mm-dd');
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidths(2, 2, 140);
}

function buildWeeklyGrades_(sheet) {
  prepareSheet_(sheet, ['Name', 'Week', 'Average'], COLORS.green);

  sheet.getRange('A1').setNote(
    'This tab is automatic. It creates one row for every student and week.'
  );
  sheet.getRange('C1').setNote(
    'Average daily score out of 5 for records inside the matching week range.'
  );

  sheet.getRange('A2').setFormula(
    '=IFERROR(LET(names,FILTER(\'' + TAB_ROSTER + '\'!A2:A,\'' + TAB_ROSTER + '\'!A2:A<>""),weeks,FILTER(\'' + TAB_WEEKS + '\'!A2:A,\'' + TAB_WEEKS + '\'!A2:A<>""),TOCOL(MAKEARRAY(ROWS(names),ROWS(weeks),LAMBDA(r,c,INDEX(names,r))),1)),"")'
  );
  sheet.getRange('B2').setFormula(
    '=IFERROR(LET(names,FILTER(\'' + TAB_ROSTER + '\'!A2:A,\'' + TAB_ROSTER + '\'!A2:A<>""),weeks,FILTER(\'' + TAB_WEEKS + '\'!A2:A,\'' + TAB_WEEKS + '\'!A2:A<>""),TOCOL(MAKEARRAY(ROWS(names),ROWS(weeks),LAMBDA(r,c,INDEX(weeks,c))),1)),"")'
  );
  sheet.getRange('C2').setFormula(
    '=IFERROR(MAP(FILTER(A2:A,A2:A<>""),FILTER(B2:B,A2:A<>""),LAMBDA(student,wk,IFERROR(AVERAGEIFS(\'' +
      TAB_DAY + '\'!H:H,\'' + TAB_DAY + '\'!A:A,student,\'' + TAB_DAY +
      '\'!B:B,">="&XLOOKUP(wk,\'' + TAB_WEEKS + '\'!A:A,\'' + TAB_WEEKS +
      '\'!B:B),\'' + TAB_DAY + '\'!B:B,"<="&XLOOKUP(wk,\'' + TAB_WEEKS +
      '\'!A:A,\'' + TAB_WEEKS + '\'!C:C)),""))),"")'
  );

  sheet.getRange('C2:C1000').setNumberFormat('0.00');
  sheet.getRange('A2:C1000')
    .protect()
    .setDescription('Automatic weekly grade calculations')
    .setWarningOnly(true);

  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 110);
}

function buildSubjects_(sheet) {
  prepareSheet_(sheet, ['Subject', 'Emoji'], '#8e6fe8');

  sheet.getRange('A1').setNote(
    'One subject or topic per row. Notes are filed under these; add, rename, or delete rows freely.'
  );
  sheet.getRange('B1').setNote('Optional. Shown next to the subject in the app.');

  sheet.getRange(2, 1, DEFAULT_SUBJECTS.length, 2).setValues(DEFAULT_SUBJECTS);
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 80);
  sheet.getRange('A2:B1000').setNumberFormat('@');
  sheet.getRange('B2:B1000').setHorizontalAlignment('center');
}

function buildNotes_(sheet) {
  prepareSheet_(sheet, ['Date', 'Student', 'Subject', 'Note'], '#8e6fe8');

  sheet.getRange('A1').setNote(
    'The app adds one row per observation. Rows can be edited or deleted here; do not rename this tab or its headers.'
  );
  sheet.getRange('B1').setNote('Must match a name on the Class Roster tab exactly.');
  sheet.getRange('C1').setNote('A subject from the Subjects tab. Leave blank for a general note.');

  sheet.getRange('A2:A1000').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('D2:D1000').setWrap(true);
  sheet.setColumnWidth(1, 115);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 520);
}

function prepareSheet_(sheet, headers, headerColor) {
  sheet.clear();
  sheet.clearConditionalFormatRules();
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(false);

  var header = sheet.getRange(1, 1, 1, headers.length);
  header
    .setValues([headers])
    .setBackground(headerColor)
    .setFontColor(COLORS.white)
    .setFontWeight('bold')
    .setFontFamily('Arial')
    .setFontSize(10)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  sheet.setRowHeight(1, 38);
  sheet.getRange(2, 1, Math.min(999, sheet.getMaxRows() - 1), headers.length)
    .setFontFamily('Arial')
    .setFontColor(COLORS.ink)
    .setVerticalAlignment('middle');
}
