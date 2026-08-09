import { POSITIONS } from "../../../common/constants.soccer.ts";
import type { PlayerRatings, Position } from "../../../common/types.soccer.ts";
import ovr from "./ovr.soccer.ts";

const pos = (ratings: PlayerRatings): Position => {
	let best = POSITIONS[0]!;
	let bestOvr = -Infinity;
	for (const position of POSITIONS) {
		const value = ovr(ratings, position);
		ratings.ovrs[position] = value;
		if (value > bestOvr) {
			best = position;
			bestOvr = value;
		}
	}
	return best;
};

export default pos;
