/**
 * People's names as the club writes them: the first letter of every word capital, the rest as
 * typed ("atishay kasliwal" → "Atishay Kasliwal", "McDonald" stays "McDonald"). Tables store
 * names in lowercase, so every name on screen goes through here.
 */
export function properName(name: string): string;
export function properName(name: string | null | undefined): string | null | undefined;
export function properName(name: string | null | undefined) {
	if (!name) return name;
	return name.replace(
		/(^|[\s\-'’.])(\p{Ll})/gu,
		(_, before: string, letter: string) => before + letter.toUpperCase()
	);
}

/** A room as it arrives from the server, with every player's and winner's name capitalised. */
export function withProperNames<
	T extends {
		usersList: { username: string }[];
		result?: { winnerName?: string; winners?: { name: string }[] } | null;
	}
>(room: T): T {
	return {
		...room,
		usersList: room.usersList.map((user) => ({ ...user, username: properName(user.username) })),
		...(room.result
			? {
					result: {
						...room.result,
						...(room.result.winnerName
							? {
									winnerName: room.result.winnerName.split(' & ').map(properName).join(' & ')
								}
							: {}),
						...(room.result.winners
							? {
									winners: room.result.winners.map((winner) => ({
										...winner,
										name: properName(winner.name)
									}))
								}
							: {})
					}
				}
			: {})
	};
}
