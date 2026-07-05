import { g, helpers } from "../../util/index.ts";
import type { CoachWithoutKey } from "../../../common/types.ts";

// Is a coach worthy of the Hall of Fame? Pure function over the coach's career
// record (seasons) and hardware (awards), mirroring player/madeHof.
//
// Roughly: 1000 wins alone gets you most of the way there, but sustained
// overachievement (wins above talent expectation), playoff success,
// championships, and Coach of the Year awards are the real separators. A
// dynasty coach clears the bar easily; a long-tenured journeyman with no
// hardware does not.
const madeHof = (coach: CoachWithoutKey): boolean => {
	const seasons = coach.seasons ?? [];
	if (seasons.length === 0) {
		return false;
	}

	let won = 0;
	let winsAboveExpected = 0;
	let playoffWon = 0;
	for (const s of seasons) {
		won += s.won;
		winsAboveExpected += s.won - s.expectedWins;
		// Missing on seasons recorded before playoff tracking existed.
		playoffWon += s.playoffWon ?? 0;
	}

	let championships = 0;
	let coy = 0;
	for (const award of coach.awards) {
		if (award.type === "Won Championship") {
			championships += 1;
		} else if (award.type === "Coach of the Year") {
			coy += 1;
		}
	}

	// Normalize win counts to a default-length (82 game) season.
	const scale = helpers.gameAndSeasonLengthScaleFactor();

	const score =
		(0.15 * won) / scale +
		(1.0 * winsAboveExpected) / scale +
		(0.5 * playoffWon) / scale +
		40 * championships +
		15 * coy;

	return score > 150 * g.get("hofFactor");
};

export default madeHof;
