import { helpers } from "../../util/index.ts";
import type { PlayerRatings, Position, RatingKey } from "../../../common/types.soccer.ts";

const weights: Record<Position, Partial<Record<RatingKey, number>>> = {
	GK: { gkr: 1.4, gkh: 1.2, gkp: 1, cmp: 0.35, pas: 0.25, hgt: 0.3 },
	CB: { tck: 1.2, diq: 1.2, hea: 0.8, stre: 0.7, hgt: 0.45, spd: 0.35, pas: 0.25 },
	LB: { spd: 0.9, acc: 0.8, endu: 0.7, tck: 0.7, diq: 0.55, crs: 0.65, pas: 0.4 },
	RB: { spd: 0.9, acc: 0.8, endu: 0.7, tck: 0.7, diq: 0.55, crs: 0.65, pas: 0.4 },
	DM: { tck: 0.9, diq: 1, pas: 0.8, cmp: 0.55, stre: 0.45, endu: 0.45, ftc: 0.4 },
	CM: { pas: 1.1, ftc: 0.75, oiq: 0.75, cmp: 0.65, endu: 0.5, tck: 0.35, drb: 0.35 },
	AM: { pas: 0.9, oiq: 1, ftc: 0.75, drb: 0.7, cmp: 0.6, fin: 0.4, sht: 0.35 },
	LW: { spd: 0.85, acc: 0.8, drb: 1, crs: 0.65, oiq: 0.65, fin: 0.5, ftc: 0.5 },
	RW: { spd: 0.85, acc: 0.8, drb: 1, crs: 0.65, oiq: 0.65, fin: 0.5, ftc: 0.5 },
	ST: { fin: 1.25, oiq: 1, cmp: 0.65, ftc: 0.55, hea: 0.55, spd: 0.5, acc: 0.5, stre: 0.35 },
};

const ovr = (ratings: PlayerRatings, pos?: Position) => {
	const position = pos ?? ratings.pos;
	let total = 0;
	let weight = 0;
	for (const [key, value] of Object.entries(weights[position])) {
		total += ratings[key as RatingKey] * value!;
		weight += value!;
	}
	return helpers.bound(Math.round(total / weight), 0, 100);
};

export default ovr;
