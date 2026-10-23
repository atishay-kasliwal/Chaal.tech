/**
 * Table talk lines (Phase 6): what each character may say at a notable moment. Hand-written, fixed
 * lists, never generated. The owner reviews them here (docs/bots/TABLE_TALK_LINES.md is printed from
 * this file by `node scripts/table-talk-lines.mjs`).
 *
 * House rules for every line: short (it is a speech bubble), friendly, cricket-flavoured, Indian
 * English or Hinglish welcome. Nothing mean about real people, no slurs, nothing that pushes anyone to
 * gamble real money. No em or en dashes. `{name}` is the other player the moment is about (a public
 * name); a line with `{name}` is only used when there is one.
 *
 * Moments (cues). Every one is chosen from public play, and all but BLIND_RAISE only once a hand is over:
 *   WIN                won the hand (any game)
 *   BIG_WIN            won a big pot, a kot, a made bid (any game)
 *   BIG_LOSS           lost a big one ({name}: who took it)
 *   BLIND_WIN          Teen Patti: won without ever looking
 *   BLIND_RAISE        Teen Patti, mid-hand: raised while still blind (the bot has not seen its cards)
 *   BLUFF_THROUGH      Teen Patti: its pressure got everyone to pack (never says what it had)
 *   CAUGHT_BLUFFING    Teen Patti: its weak hand was shown down and lost
 *   CAUGHT_THEIR_BLUFF Teen Patti: {name} raised with a weak hand and it stayed in to see it
 *   GOT_BLUFFED        Teen Patti: it packed, then {name}'s weak hand came out
 *   REVENGE_SUCCESS    beat {name}, who had beaten it lately
 *   RIVAL_ON_STREAK    {name} has won three of the last five
 */
export const TALK_CUES = Object.freeze([
	'WIN',
	'BIG_WIN',
	'BIG_LOSS',
	'BLIND_WIN',
	'BLIND_RAISE',
	'BLUFF_THROUGH',
	'CAUGHT_BLUFFING',
	'CAUGHT_THEIR_BLUFF',
	'GOT_BLUFFED',
	'REVENGE_SUCCESS',
	'RIVAL_ON_STREAK'
]);

export const TALK_LINES = Object.freeze({
	// Rohit: the big-hitter. Proud of playing blind, relaxed, a little lazy, loves a six.
	'rohit-sharma': {
		WIN: [
			'Easy runs, yaar.',
			'Timing, not power.',
			'Arre, that was a simple one.',
			'Picked the gap. Thank you.',
			'Nice and relaxed. Next ball.',
			'Didn’t even break a sweat.',
			'Good. Now where is my chai?'
		],
		BIG_WIN: [
			'Out of the stadium!',
			'That one is still going up.',
			'Pull shot, row twenty.',
			'Big hit. Somebody fetch the ball.',
			'When I connect, I connect.',
			'Sixer. Write it in the book.',
			'That is what a big innings looks like.'
		],
		BIG_LOSS: [
			'Arre, top edge. Happens.',
			'Went for the big one. No regrets.',
			'Caught at the rope. Next over.',
			'Okay {name}, that was a good catch.',
			'Played on to my own stumps, yaar.',
			'One bad shot. The innings is long.',
			'{name} took that one. Fair.'
		],
		BLIND_WIN: [
			'Blind and still winning. Classic.',
			'Who needs to look? Not me.',
			'Eyes closed, bat swinging.',
			'Never saw them. Never needed to.',
			'Blind cricket is my format.',
			'Looking is for the nervous ones.',
			'See? Told you blind works.'
		],
		BLIND_RAISE: [
			'Blind hi khelenge.',
			'Why look? Swing first.',
			'Free hit. Going big.',
			'Eyes closed, bat open.',
			'I like it blind. Up we go.',
			'No peeking. Just hitting.'
		],
		BLUFF_THROUGH: [
			'Thank you for the respect.',
			'Nobody wanted to bowl to me?',
			'Field spread out. Easy single.',
			'You all backed off. Wise.',
			'Reputation does half the work.',
			'Walked off without a ball bowled.'
		],
		CAUGHT_BLUFFING: [
			'Okay okay, you caught that one.',
			'Went for the hook. Got the edge.',
			'Not my finest shot, I admit.',
			'Bad ball to attack. My mistake.',
			'You read that like a scorecard.',
			'Fine. That one goes in the bloopers.'
		],
		CAUGHT_THEIR_BLUFF: [
			'Nice try, {name}. I stayed.',
			'{name}, I saw that one coming.',
			'Not today, {name}. Not today.',
			'Big appeal, {name}. Not out.',
			'I left the bouncer alone, {name}.',
			'That raise had no runs in it.'
		],
		GOT_BLUFFED: [
			'Arre {name}, you had nothing?',
			'Fooled me, {name}. Well bowled.',
			'Slower ball from {name}. Got me.',
			'I walked for nothing. Ouch.',
			'{name}, that was cheeky.',
			'Should have stayed. Lesson.'
		],
		REVENGE_SUCCESS: [
			'Paid you back, {name}.',
			'Remember last time, {name}? Square.',
			'{name}, revenge tastes like biryani.',
			'Told you I would come back, {name}.',
			'Account settled, {name}.',
			'Return match goes to me.'
		],
		RIVAL_ON_STREAK: [
			'{name} is batting on a flat pitch.',
			'Somebody get {name} out, please.',
			'{name}, leave some runs for us.',
			'{name} is in form. I am watching.',
			'Hot streak, {name}. Enjoy it.',
			'Every ball is going for four, {name}?',
			'Somebody is on a hot streak here.'
		]
	},

	// Virat: all aggression. Fiery, loud when he wins, takes losses personally (in a fun way).
	'virat-kohli': {
		WIN: [
			'Come on! That is mine!',
			'Yes! Keep it coming.',
			'That is how you chase.',
			'Intent. Always intent.',
			'Another one. Let us go!',
			'Next. Who is next?',
			'Pressure? I live there.'
		],
		BIG_WIN: [
			'COME ON! What a hand!',
			'Chase complete. Big one.',
			'That is a statement win.',
			'Did you see that? Did you SEE that?',
			'Full energy, full reward.',
			'This is my table tonight.',
			'Big match player. Simple.'
		],
		BIG_LOSS: [
			'No no no. Not like that.',
			'Okay {name}. I am coming back.',
			'That hurts. Good. Fuel.',
			'Unbelievable. Next one is mine.',
			'{name}, enjoy it. It won’t last.',
			'I am not happy. At all.',
			'Reset. Refocus. Again.'
		],
		BLIND_WIN: [
			'Did not even need to look!',
			'Blind and fearless. Yes!',
			'Pure intent. No peeking.',
			'Won it blind. Come on!',
			'Eyes closed, heart open.',
			'Who needs cards? I have fire.'
		],
		BLIND_RAISE: [
			'Up! Let us go!',
			'Blind and raising. Try me.',
			'No fear. Raise.',
			'Pressure on, from ball one.',
			'Matching energy? Come on.',
			'I am not waiting. Up.'
		],
		BLUFF_THROUGH: [
			'Nobody wants a fight? Fine.',
			'Intent wins pots.',
			'You all blinked first.',
			'Aggression pays. Always.',
			'You all stepped back. Thank you.',
			'That is what pressure does.'
		],
		CAUGHT_BLUFFING: [
			'Okay, you called it. Respect.',
			'Too much intent. My bad.',
			'Fine. You read me. Once.',
			'I will take that on the chin.',
			'Pushed too hard. Noted.',
			'That one stung. Moving on.'
		],
		CAUGHT_THEIR_BLUFF: [
			'Caught you, {name}! Come on!',
			'{name}, not on my watch.',
			'I knew it, {name}. I KNEW it.',
			'Nice try, {name}. Not enough.',
			'{name}, I am not backing down.',
			'Bluff? Against me? No.'
		],
		GOT_BLUFFED: [
			'{name}! You had THAT?',
			'Unreal. {name}, well played. Grr.',
			'I folded to that? No way.',
			'{name}, I will remember this.',
			'That is cheeky, {name}. Very cheeky.',
			'Okay. Next time I call. Always.'
		],
		REVENGE_SUCCESS: [
			'That is for last time, {name}!',
			'Told you, {name}. Told you!',
			'Payback, {name}. Come on!',
			'{name}, we are even now.',
			'I never forget a loss, {name}.',
			'Revenge done. Back to business.'
		],
		RIVAL_ON_STREAK: [
			'{name}, your run ends now.',
			'{name} again? Not for long.',
			'Okay {name}, game on. Properly.',
			'I see you, {name}. Coming for you.',
			'{name} is hot. I am hotter.',
			'Somebody has to stop {name}. Me.',
			'Enjoy the streak. It ends with me.'
		]
	},

	// GG: the watchful one. Intense, quiet, reads people and tells you he noticed.
	gg: {
		WIN: [
			'As expected.',
			'Patience. Then the pot.',
			'I was watching. It paid.',
			'Disciplined. That is all.',
			'Read the table. Took the pot.',
			'Noted, and collected.',
			'Quietly done.'
		],
		BIG_WIN: [
			'I waited for exactly this.',
			'Every hand before was homework.',
			'The read was right. Big pot.',
			'Watched for an hour. Worth it.',
			'Calm wins big ones.',
			'You showed me too much earlier.',
			'That is the payoff for discipline.'
		],
		BIG_LOSS: [
			'Hm. I will remember that, {name}.',
			'Wrong read. Rare. Noted.',
			'{name}, that was well hidden.',
			'Adjusting. Give me a hand or two.',
			'I misjudged it. Once.',
			'That goes in the notebook.',
			'Good hand, {name}. Very good.'
		],
		BLIND_WIN: [
			'Blind, but not careless.',
			'Even blind, I was watching you.',
			'Sometimes the read is enough.',
			'I read the table, not the cards.',
			'Did not look. Did not need to.',
			'Your faces told me enough.'
		],
		BLIND_RAISE: [
			'Blind. Watching you instead.',
			'A small test, blind.',
			'Let us see who flinches.',
			'Raising blind. Your move.',
			'I am reading you, not my cards.',
			'Blind raise. Show me something.'
		],
		BLUFF_THROUGH: [
			'You all read it the same way.',
			'Interesting. Nobody stayed.',
			'Everyone believed. Noted.',
			'Respect is a powerful thing.',
			'I will not tell you what I had.',
			'The table decided. Not me.'
		],
		CAUGHT_BLUFFING: [
			'You read me. That is rare.',
			'Well caught. I will adjust.',
			'Good. You were paying attention.',
			'Fine. You saw through it.',
			'My tell? I will find it.',
			'Respect. That was a good call.'
		],
		CAUGHT_THEIR_BLUFF: [
			'I saw it in your raise, {name}.',
			'{name}, you sped up. I noticed.',
			'Too loud, {name}. Too loud.',
			'{name}, I have seen that line before.',
			'Your timing gave it away, {name}.',
			'I knew, {name}. I always watch.',
			'That raise was a story. I did not buy it.'
		],
		GOT_BLUFFED: [
			'Well played, {name}. Noted.',
			'{name}, that was clean. I missed it.',
			'Hm. {name} is braver than I thought.',
			'I will not fall for that twice.',
			'Good bluff, {name}. Filed away.',
			'You fooled me. Once.'
		],
		REVENGE_SUCCESS: [
			'I was waiting for you, {name}.',
			'Patience, {name}. Always patience.',
			'{name}, I learned from last time.',
			'Notes from before helped, {name}.',
			'Balance restored, {name}.',
			'I remembered, {name}.',
			'I keep notes. They paid off.'
		],
		RIVAL_ON_STREAK: [
			'{name} is running hot. I am watching.',
			'Three of five, {name}. I counted.',
			'{name}, streaks end. Quietly.',
			'Everyone, keep an eye on {name}.',
			'{name} is reading us well. For now.',
			'I see the pattern, {name}.',
			'A streak is a pattern. I study patterns.'
		]
	},

	// Samay: calls to see it. The comedian: self-roasting, chaotic, always curious.
	'samay-raina': {
		WIN: [
			'Wait, I won? Okay, I won.',
			'Skill. Definitely skill.',
			'Write this down, it is rare.',
			'Chaos theory, proven.',
			'I would like to thank my bad decisions.',
			'Ha! Even I did not see that coming.',
			'Okay, applause please.'
		],
		BIG_WIN: [
			'Bhai, I am rich. In chips. Only chips.',
			'Somebody clip that.',
			'Biggest pot of my career. Low bar.',
			'I came here to watch and I WON.',
			'This is going in my stand-up set.',
			'My strategy is called hope.',
			'Main character moment.'
		],
		BIG_LOSS: [
			'Wow. Okay. Cool. Cool cool.',
			'I called to see it. I saw it.',
			'{name}, take it, it was never mine.',
			'That was expensive content.',
			'Pain. But the curiosity was worth it.',
			'I am fine. I am totally fine.',
			'Roast me, I deserve it.'
		],
		BLIND_WIN: [
			'Never looked. Still won. Genius.',
			'Plot twist: blind is a strategy.',
			'Ignorance is bliss and profitable.',
			'I don’t even know what I had.',
			'Didn’t look, didn’t care, won.',
			'Blindfold mode: activated.'
		],
		BLIND_RAISE: [
			'Raising blind. For science.',
			'I have no idea. Up!',
			'Why not? Life is short.',
			'Blind raise. Trust the process?',
			'No clue, full confidence.',
			'Let us make this interesting.'
		],
		BLUFF_THROUGH: [
			'Everyone left? Was it my face?',
			'Wow, you all trust me? Mistake.',
			'Free chips. Don’t ask questions.',
			'I will never tell. Probably.',
			'Acting classes paying off.',
			'Thank you, thank you, no questions.'
		],
		CAUGHT_BLUFFING: [
			'Okay yes, I had nothing. Clap.',
			'Caught. Like a kid with sweets.',
			'That was a bit, not a bluff.',
			'In my defence, it was funny.',
			'My poker face needs a software update.',
			'Worth it for the drama.'
		],
		CAUGHT_THEIR_BLUFF: [
			'{name}! You also had nothing!',
			'I called to see it, {name}. Saw it.',
			'{name}, I respect the audacity.',
			'This is why I always call, {name}.',
			'{name}, that was my move. Copyright.',
			'Curiosity wins again!'
		],
		GOT_BLUFFED: [
			'{name}, you villain. I love it.',
			'I packed to THAT, {name}?',
			'{name}, that is a crime. Brilliant.',
			'Should have called. I always call!',
			'Note to self: never pack.',
			'{name} played me like a mobile game.'
		],
		REVENGE_SUCCESS: [
			'{name}, remember me? I remember you.',
			'Revenge arc complete, {name}.',
			'Sorry {name}, it is my episode now.',
			'{name}, we are even. Emotionally too.',
			'Season two belongs to me, {name}.',
			'Character development!'
		],
		RIVAL_ON_STREAK: [
			'{name}, okay, teach me. Please.',
			'{name} is cooking and I am the onion.',
			'{name}, leave some for the comedians.',
			'{name}, share the secret recipe.',
			'{name}, I am a fan now. Unwillingly.',
			'{name} keeps winning, I keep watching.',
			'Someone is cooking tonight. Not me.'
		]
	},

	// Dhoni: Captain Cool. Calm, few words, trusts the process, finishes it off.
	'ms-dhoni': {
		WIN: [
			'Finished.',
			'Process. Result.',
			'Calm head, small pot.',
			'One at a time.',
			'That is the plan working.',
			'Quietly taken.',
			'No hurry. It came.'
		],
		BIG_WIN: [
			'Finished it off in style.',
			'Took it deep. Then finished.',
			'Helicopter shot. Game over.',
			'Waited for the last over.',
			'Big pots need a cool head.',
			'Last ball, and it is gone.',
			'Pressure is a privilege.'
		],
		BIG_LOSS: [
			'It happens. Next hand.',
			'Good hand, {name}.',
			'Not the result. Still the process.',
			'Some days the ball does not come.',
			'Well played, {name}. Noted.',
			'We go again. Calm.',
			'Lose small, lose big. Move on.'
		],
		BLIND_WIN: [
			'Did not need to look.',
			'Blind and calm. Enough.',
			'Sometimes you trust the situation.',
			'No look. No panic. Pot.',
			'Read the game, not the cards.',
			'Kept it simple.'
		],
		BLIND_RAISE: [
			'Small push. Blind.',
			'Let us see how you react.',
			'Blind. No rush.',
			'Calm raise. Your call.',
			'A little pressure, nothing more.',
			'Testing the field.'
		],
		BLUFF_THROUGH: [
			'Pressure did the job.',
			'Field set. Nobody came.',
			'Sometimes the situation wins it.',
			'Calm face, quiet pot.',
			'No need to show everything.',
			'That is captaincy.'
		],
		CAUGHT_BLUFFING: [
			'Good call. Well read.',
			'You held your nerve. Respect.',
			'Wrong time to push. Noted.',
			'Fair. That was a good call.',
			'Even the plan misses sometimes.',
			'Learn and move.'
		],
		CAUGHT_THEIR_BLUFF: [
			'Stayed calm, {name}. It paid.',
			'{name}, patience beats noise.',
			'I waited, {name}. You showed.',
			'{name}, big raise, small hand.',
			'No panic, {name}. That is the trick.',
			'Calm call. Good result.'
		],
		GOT_BLUFFED: [
			'Well played, {name}. Clean.',
			'{name}, you held it well.',
			'Good bluff, {name}. Noted.',
			'I let that one go. Fine.',
			'{name} played the situation.',
			'Respect, {name}. Next time.'
		],
		REVENGE_SUCCESS: [
			'We are even, {name}.',
			'{name}, the game comes back around.',
			'Took it back, {name}. Calmly.',
			'Patience, {name}. Always works.',
			'{name}, last time was last time.',
			'Settled.'
		],
		RIVAL_ON_STREAK: [
			'{name} is in good rhythm.',
			'{name}, nice run. Long night.',
			'Let {name} have the overs. Then we see.',
			'Good form, {name}. Form changes.',
			'{name} is playing well. Fine.',
			'Watching {name}. No panic.',
			'Streaks come, streaks go.'
		]
	}
});
