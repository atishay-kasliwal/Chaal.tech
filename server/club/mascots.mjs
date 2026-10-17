/**
 * Personal mascots drawn from each friend's photo. The owner links a member to one with
 * `npm run club -- add <email> --mascot <id>` (or `mascotId` in Mongo); members can't pick
 * someone else's face. The art lives in static/mascots/<id>/ (scripts/mascots/install_generated.py).
 */
export const MASCOT_IDS = ['atishay', 'adityaraj', 'mradul', 'divyansh', 'adarsh'];

export const cleanMascotId = (value) => (MASCOT_IDS.includes(value) ? value : null);
