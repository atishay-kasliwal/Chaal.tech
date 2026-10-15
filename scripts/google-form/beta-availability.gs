/**
 * Creates the "Teen Patti night: pick a night" Google Form plus a responses sheet.
 *
 * 1. Open https://script.google.com → New project, paste this file, save.
 * 2. Run createBetaForm (approve the Forms/Sheets/Drive permissions once).
 * 3. View → Logs (or Execution log) prints the share link. Put it in .env as BETA_FORM_URL.
 *
 * It offers Friday and Saturday of next weekend, the same nights as the email. Set
 * NIGHTS_OVERRIDE to a Friday like '2026-10-23' to offer other nights.
 */
const NIGHTS_OVERRIDE = '';
const TIME_ZONE = 'Asia/Kolkata';

function createBetaForm() {
	const friday = NIGHTS_OVERRIDE ? new Date(NIGHTS_OVERRIDE + 'T12:00:00') : nextFriday_();
	const saturday = new Date(friday.getTime() + 24 * 60 * 60 * 1000);
	const night = (date) => Utilities.formatDate(date, TIME_ZONE, 'EEE, d MMM');

	const form = FormApp.create('Teen Patti night: pick a night');
	form
		.setDescription(
			'A small Teen Patti night on chaal.tech with a few friends: ' +
				night(friday) +
				' or ' +
				night(saturday) +
				'. 6 seats, just for our circle. Takes 30 seconds. ♠'
		)
		.setConfirmationMessage('Got it, thank you! I’ll send the final night and time soon. ♠')
		.setAllowResponseEdits(true)
		.setProgressBar(false)
		.setShowLinkToRespondAgain(false);

	form.addTextItem().setTitle('Your name').setRequired(true);

	form
		.addMultipleChoiceItem()
		.setTitle('Which night works for you?')
		.setChoiceValues([night(friday), night(saturday), 'Either works', 'Can’t make it this time'])
		.setRequired(true);

	form
		.addMultipleChoiceItem()
		.setTitle('What time suits you? (IST)')
		.setChoiceValues(['7 pm', '8 pm', '9 pm', '10 pm or later'])
		.setRequired(false);

	form
		.addMultipleChoiceItem()
		.setTitle('How long can you play?')
		.setChoiceValues(['About an hour', '2 hours', '3+ hours', 'Till the last chip'])
		.setRequired(true);

	form
		.addCheckboxItem()
		.setTitle('What will you play on?')
		.setChoiceValues(['Phone', 'Laptop / desktop', 'Tablet'])
		.setRequired(true);

	form
		.addMultipleChoiceItem()
		.setTitle('Camera and mic at the table?')
		.setChoiceValues(['Camera + mic', 'Mic only', 'Neither, just cards'])
		.setRequired(false);

	form
		.addParagraphTextItem()
		.setTitle('Anything else? (friends to add, game ideas, roasts)')
		.setRequired(false);

	const sheet = SpreadsheetApp.create('chaal.tech beta availability (responses)');
	form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
	// Newer Forms need an explicit publish before anyone can respond.
	if (typeof form.setPublished === 'function') form.setPublished(true);
	form.setAcceptingResponses(true);

	const shareUrl = form.shortenFormUrl(form.getPublishedUrl());
	Logger.log('Nights: ' + night(friday) + ' or ' + night(saturday));
	Logger.log('Share link (BETA_FORM_URL): ' + shareUrl);
	Logger.log('Edit the form: ' + form.getEditUrl());
	Logger.log('Responses sheet: ' + sheet.getUrl());
}

/** Friday of next weekend: the first Friday at least five days away, as in the email. */
function nextFriday_() {
	const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
	while (Utilities.formatDate(date, TIME_ZONE, 'u') !== '5') date.setDate(date.getDate() + 1);
	return date;
}
