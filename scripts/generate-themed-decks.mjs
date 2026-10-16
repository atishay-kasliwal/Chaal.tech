import { DECKS } from '../src/lib/decks.ts';
import { generateThemedDeck } from './lib/generate-themed-deck.mjs';
const selected = process.argv.slice(2);
for (const theme of DECKS.filter(
	(d) => d.id !== 'diwali-taash' && (!selected.length || selected.includes(d.id))
))
	await generateThemedDeck(theme);
