export const VARIANT_CATALOG = [
	{
		rulesVersion: 'classic-1',
		selectionLabel: 'Classic',
		tableLabel: 'Classic · highest hand wins',
		description: 'Highest Classic hand wins.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'muflis-1',
		selectionLabel: 'Muflis: lowest hand wins',
		tableLabel: 'Muflis · lowest Classic hand wins',
		description: 'Lowest Classic hand wins; equal Show hands lose for the requester.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'ak47-1',
		selectionLabel: 'AK47: A, K, 4 and 7 are wild',
		tableLabel: 'AK47 · A, K, 4 and 7 are wild',
		description: 'Aces, Kings, 4s and 7s are wild. Best Classic hand wins.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'joker-1',
		selectionLabel: 'Joker: one revealed rank is wild',
		tableLabel: 'Joker · one revealed rank is wild',
		description: 'The next undealt card reveals the rank that is wild for this hand.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'lowest-joker-1',
		selectionLabel: 'Lowest Joker: lowest rank is wild',
		tableLabel: 'Lowest Joker · each hand’s lowest rank is wild',
		description: 'All cards of the lowest rank in each player’s hand are wild.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: '999-1',
		selectionLabel: '999: highest three-digit value wins',
		tableLabel: '999 · highest three-digit value wins',
		description: 'Arrange values high to low; 10/J/Q/K=0 and Ace=1. Closest to 999 wins.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: '2-card-1',
		selectionLabel: '2 Card: pairs beat high card',
		tableLabel: '2 Card · pairs beat high card',
		description: 'Two cards per player. A pair beats every high-card hand.',
		cardsPerPlayer: 2
	},
	{
		rulesVersion: '4-card-1',
		selectionLabel: '4 Card: best three of four',
		tableLabel: '4 Card · best three of four',
		description: 'Deal four cards and use the best three-card Teen Patti hand.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'highest-joker-1',
		selectionLabel: 'Highest Joker: your highest card is wild',
		tableLabel: 'Highest Joker · your highest rank is wild',
		description: 'All cards of the highest rank in your own hand are wild for you.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'one-eyed-jack-1',
		selectionLabel: 'One-Eyed Jack: J♥ and J♠ are wild',
		tableLabel: 'One-Eyed Jack · J♥ and J♠ are wild',
		description: 'The two one-eyed Jacks (hearts and spades) are wild. J♦ and J♣ are normal.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'color-joker-1',
		selectionLabel: 'Color Joker: one colour is wild',
		tableLabel: 'Color Joker · an open card picks the wild colour',
		description: 'An open card picks red or black. Every card of that colour is wild.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'lallan-kallan-1',
		selectionLabel: 'Lallan Kallan: odd colour out is wild',
		tableLabel: 'Lallan Kallan · odd-coloured card is wild',
		description:
			'Two cards of one colour and one of the other? The odd-coloured card is your joker.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'odd-even-1',
		selectionLabel: 'Odd/Even: odd rank out is wild',
		tableLabel: 'Odd/Even · the odd-parity card is wild',
		description:
			'Two odd ranks and one even (or the reverse)? The odd-one-out card is your joker. Ace counts as even.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'best-of-five-1',
		selectionLabel: 'Best of Five: get five, keep the best three',
		tableLabel: 'Best of Five · throw two, play the best three',
		description:
			'Get five cards. After you look, throw two away and play your best three. Stay blind and your first three count.',
		cardsPerPlayer: 5
	},
	{
		rulesVersion: 'worst-of-four-1',
		selectionLabel: 'Worst of Four: your lowest three, lowest wins',
		tableLabel: 'Worst of Four · your lowest three cards play, lowest wins',
		description:
			'Four cards, no throwing. Your lowest three-card hand counts automatically, and the lowest hand wins.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'hukum-1',
		selectionLabel: 'Hukum: an open card names the trump suit',
		tableLabel: 'Hukum · more trump cards win within a hand type',
		description:
			'An open card names the trump suit. Within the same hand type, more trump cards beat higher ranks.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'red-black-1',
		selectionLabel: 'Red & Black: all one colour beats a pair',
		tableLabel: 'Red & Black · three red or three black beats a pair',
		description:
			'Three cards all red or all black (not one suit, not a sequence) rank above a Pair and below a Colour.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'progressive-joker-1',
		selectionLabel: 'Progressive Joker: jokers grow with the pot',
		tableLabel: 'Progressive Joker · jokers appear at ₹100, ₹200, ₹400',
		description:
			'A hidden card turns over as the pot reaches ₹100: its rank is wild. At ₹200 the ranks either side join, and at ₹400 every card of its suit does.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'open-card-1',
		selectionLabel: 'Open Card: one card face up',
		tableLabel: 'Open Card · one card lies face up for everyone',
		description: 'One of your three cards lies face up for everyone. The other two stay hidden.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'one-hidden-1',
		selectionLabel: 'One Hidden: two cards face up',
		tableLabel: 'One Hidden · two cards face up, one hidden',
		description: 'Two of your three cards lie face up for everyone. Only one stays hidden.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'stud-1',
		selectionLabel: 'Stud: cards turn up as the pot grows',
		tableLabel: 'Stud · a second card turns up at ₹100',
		description:
			'One card is dealt face up. A second turns up when the pot reaches ₹100. The third stays hidden.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'draw-1',
		selectionLabel: 'Draw: swap one card from the deck',
		tableLabel: 'Draw · swap one card once per hand',
		description:
			'After you look, throw one card away and take a new one from the deck, once per hand. Blind players cannot draw.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'trade-one-1',
		selectionLabel: 'Trade One: swap a card with a rival',
		tableLabel: 'Trade One · trade a card with a rival, unseen',
		description:
			'After you look, give one card to a rival and take the card in the same place in their hand. Once per hand.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'pass-the-card-1',
		selectionLabel: 'Pass the Card: everyone passes one',
		tableLabel: 'Pass the Card · each player passes one card on',
		description:
			'Everyone picks a card to pass. When all have picked, each passes it to the next seat. Blind players pass without looking.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'high-low-1',
		selectionLabel: 'High Low: the Show says high or low',
		tableLabel: 'High Low · the Show calls high or low',
		description:
			'Whoever asks for the Show says whether the high or the low hand wins. Equal hands lose for the asker.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'split-pot-1',
		selectionLabel: 'Split Pot: best and worst share the pot',
		tableLabel: 'Split Pot · best and worst hand split a big pot',
		description:
			'With three or more players in and a big pot, all show: the best hand takes half and the worst hand the other half.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'faceoff-1',
		selectionLabel: 'Faceoff: challenge one player',
		tableLabel: 'Faceoff · challenge a player, the loser is out',
		description:
			'On your turn, pay the Show fee and challenge one player. Both hands are shown and the weaker one is out.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'buying-joker-2',
		selectionLabel: 'Buying Joker: pay to learn a joker',
		tableLabel: 'Buying Joker · pay 5 boots to learn a hidden joker',
		description:
			'A joker rank is hidden. Pay 5 boots into the pot to learn it: that rank is wild in your hand only.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'auction-2',
		selectionLabel: 'Auction: sealed bids for a joker',
		tableLabel: 'Auction · highest sealed bid wins a hidden joker',
		description:
			'Everyone makes one sealed bid. The highest bidder pays it into the pot and wins the hidden joker.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'knockout-1',
		selectionLabel: 'Knockout: lowest hand out every lap',
		tableLabel: 'Knockout · the lowest hand goes after every lap',
		description:
			'After every lap of betting the lowest hand is knocked out and shown, until two players are left.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'sudden-death-1',
		selectionLabel: 'Sudden Death: stakes double every lap',
		tableLabel: 'Sudden Death · stakes double and the lowest hand goes',
		description: 'The stake doubles every lap and the lowest hand is knocked out, so hands end fast.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'survivor-1',
		selectionLabel: 'Survivor: no Show, last one standing',
		tableLabel: 'Survivor · no Show, the lowest hand goes every lap',
		description:
			'No Show. After every lap of betting the lowest hand is knocked out, until one player remains.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'banko-1',
		selectionLabel: 'Banko: play against the banker',
		tableLabel: 'Banko · the dealer is the banker',
		description:
			'The dealer is the banker. Equal hands go to the banker, and a big pot sends everyone against the banker.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'community-1',
		selectionLabel: 'Community: two cards plus shared cards',
		tableLabel: 'Community · best three of your two and the shared cards',
		description:
			'Two cards each plus shared cards in the middle that open as the pot grows. Your hand is the best three.',
		cardsPerPlayer: 2
	},
	{
		rulesVersion: 'pot-blind-1',
		selectionLabel: 'Pot Blind: nobody looks',
		tableLabel: 'Pot Blind · everyone plays blind',
		description: 'Nobody can see their cards. Everyone bets blind until the Show.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'discard-one-1',
		selectionLabel: 'Discard One: get four, throw one',
		tableLabel: 'Discard One · look, then throw one away',
		description:
			'Get four cards. After you look, throw one away and play three. Stay blind and your first three count.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'folding-joker-2',
		selectionLabel: 'Folding Joker: every folded rank is a shared joker',
		tableLabel: 'Folding Joker · folded ranks are wild for everyone',
		description:
			'Get four cards. Fold one face down: cards of its rank in your hand are wild. Stay blind and your fourth card is the joker.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'muflis-4-1',
		selectionLabel: 'Muflis 4: four cards, lowest wins',
		tableLabel: 'Muflis 4 · throw one, lowest three wins',
		description: 'Get four, throw one. The lowest three-card hand wins.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'joker-4-1',
		selectionLabel: 'Joker 4: four cards, common joker',
		tableLabel: 'Joker 4 · throw one, revealed rank is wild',
		description: 'Get four, throw one. A revealed card sets the wild rank for everyone.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'lowest-joker-4-1',
		selectionLabel: 'Lowest Joker 4: four cards, lowest is wild',
		tableLabel: 'Lowest Joker 4 · throw one, your lowest rank is wild',
		description: 'Get four, throw one. The lowest rank in the three you keep is wild.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'highest-joker-4-1',
		selectionLabel: 'Highest Joker 4: four cards, highest is wild',
		tableLabel: 'Highest Joker 4 · throw one, your highest rank is wild',
		description: 'Get four, throw one. The highest rank in the three you keep is wild.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'color-joker-4-1',
		selectionLabel: 'Color Joker 4: four cards, a colour is wild',
		tableLabel: 'Color Joker 4 · throw one, a colour is wild',
		description: 'Get four, throw one. An open card picks red or black; that colour is wild.',
		cardsPerPlayer: 4
	},
	{
		rulesVersion: 'chatai-1',
		selectionLabel: 'Chatai 3×3: open the mat, pick a line',
		tableLabel: 'Chatai 3×3 · open cards are jokers, then lock a line',
		description:
			'Nine cards face down on the mat. Pay, open one: open cards are jokers. All nine open? Lock one line as your jokers.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'running-1',
		selectionLabel: 'Running: table cards open with the pot',
		tableLabel: 'Running · cards open at ₹200, ₹400, ₹600',
		description:
			'Three table cards open as the pot grows. The first two set jokers; the third card’s suit knocks players out.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'rotating-joker-1',
		selectionLabel: 'Rotating Joker: packed cards become jokers',
		tableLabel: 'Rotating Joker · a pack hands its cards to the table',
		description:
			'Three jokers open on the table. When someone packs, their cards are the new jokers.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'revolving-joker-1',
		selectionLabel: 'Revolving Joker: fresh jokers on every pack',
		tableLabel: 'Revolving Joker · each pack deals new jokers',
		description: 'Three jokers open on the table. Every pack deals three fresh jokers.',
		cardsPerPlayer: 3
	},
	{
		rulesVersion: 'kiss-miss-bliss-1',
		selectionLabel: 'Kiss-Miss-Bliss: make a joker from five',
		tableLabel: 'Kiss-Miss-Bliss · two cards become one joker',
		description:
			'Get five. Two cards next to each other, one apart or the same become one joker. Keep three.',
		cardsPerPlayer: 5
	},
	{
		rulesVersion: 'kissing-missing-1',
		selectionLabel: 'Kissing-Missing: make a joker from four',
		tableLabel: 'Kissing-Missing · Kiss or Miss makes a joker',
		description:
			'Get four. Two cards next to each other or one apart become one joker. Keep three.',
		cardsPerPlayer: 4
	}
] as const;

export type RulesVersion = (typeof VARIANT_CATALOG)[number]['rulesVersion'];

export const VARIANT_BY_VERSION = Object.fromEntries(
	VARIANT_CATALOG.map((variant) => [variant.rulesVersion, variant])
) as Record<(typeof VARIANT_CATALOG)[number]['rulesVersion'], (typeof VARIANT_CATALOG)[number]>;
