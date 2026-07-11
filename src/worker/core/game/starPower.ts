import { helpers } from "../../util/index.ts";

// Multiplier on base attendance from the home roster's star power: the mean
// popularity of its top 3 most popular players. A roster of anonymous players
// (popularity ~30) sells slightly fewer tickets; a superteam of beloved stars
// sells more. Bounded tight because it flows into attendance, merch, sponsor,
// and local TV revenue together.
export const getStarPowerFactor = (popularities: number[]) => {
	const top3 = [...popularities].sort((a, b) => b - a).slice(0, 3);
	if (top3.length === 0) {
		return 1;
	}
	const starPower = top3.reduce((sum, x) => sum + x, 0) / top3.length;
	return helpers.bound(1 + (0.2 * (starPower - 50)) / 100, 0.92, 1.08);
};
