/**
 * Print the table talk lines (shared/talk-lines.mjs) to docs/bots/TABLE_TALK_LINES.md for the
 * owner to review. `node scripts/table-talk-lines.mjs`; a test fails while the doc is out of date.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TALK_CUES, TALK_LINES } from '../shared/talk-lines.mjs';
import { CHANCE } from '../server/bots/table-talk.mjs';
import { CAST } from '../src/lib/bots/cast.js';

const WHEN = {
	WIN: 'Won the hand (any game).',
	BIG_WIN:
		'Won a big pot (20 boots or more), a kot in 10 Pakad, a made bid or a game in 29, +2 or better in 3 2 5.',
	BIG_LOSS: 'Lost a big one. {name} is who took it.',
	BLIND_WIN: 'Teen Patti: won without ever looking at the cards.',
	BLIND_RAISE:
		'Teen Patti, during the hand: raised while still blind (the bot has not seen its own cards).',
	BLUFF_THROUGH: 'Teen Patti: its pressure made everyone pack. Lines never say what it held.',
	CAUGHT_BLUFFING: 'Teen Patti: its weak hand was shown down and lost.',
	CAUGHT_THEIR_BLUFF: 'Teen Patti: {name} raised with a weak hand and the bot stayed in to see it.',
	GOT_BLUFFED: 'Teen Patti: the bot packed, then {name} showed a weak hand.',
	REVENGE_SUCCESS: 'Beat {name}, who had beaten it lately.',
	RIVAL_ON_STREAK: '{name} has won three of the last five hands.'
};

export function renderLines() {
	const out = [
		'# Table talk lines',
		'',
		'What the five characters say at the table (Phase 6). Printed from `shared/talk-lines.mjs`',
		'by `node scripts/table-talk-lines.mjs`: edit the lines there, then run the script.',
		'',
		'How it works: at most one line per moment, one per bot per hand, at least 9 seconds between',
		'any two lines at a table and 30 seconds between two lines from the same character. Each moment',
		'speaks only by chance (below), so most hands pass in silence. Lines are chosen from public play',
		'and, except for a blind raise, only once the hand is over. `{name}` is the other player the',
		'moment is about. Players can turn it off with the Bot chat button.',
		'',
		'| Moment | When | Chance |',
		'| --- | --- | --- |',
		...TALK_CUES.map((cue) => `| ${cue} | ${WHEN[cue]} | ${Math.round(CHANCE[cue] * 100)}% |`),
		''
	];
	for (const member of CAST) {
		out.push(`## ${member.name}`, '');
		for (const cue of TALK_CUES) {
			out.push(`### ${cue}`, '');
			for (const line of TALK_LINES[member.id][cue]) out.push(`- ${line}`);
			out.push('');
		}
	}
	return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const target = new URL('../docs/bots/TABLE_TALK_LINES.md', import.meta.url);
	writeFileSync(target, renderLines());
	console.log(`Wrote ${fileURLToPath(target)}`);
}
