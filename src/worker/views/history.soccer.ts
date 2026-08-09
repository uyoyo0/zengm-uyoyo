import type { AwardPlayer, Position } from "../../common/types.soccer.ts";
import { idb } from "../db/index.ts";

const number = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? value : 0;

const getSoccerCupMvp = async ({
	abbrev,
	season,
	tid,
}: {
	abbrev: string;
	season: number;
	tid: number;
}): Promise<AwardPlayer | undefined> => {
	const playersAll = await idb.getCopies.players(
		{ activeSeason: season },
		"noCopyCache",
	);
	const players = await idb.getCopies.playersPlus(playersAll, {
		attrs: ["pid", "name"],
		ratings: ["pos"],
		stats: [
			"gp",
			"g",
			"a",
			"xg",
			"xa",
			"tkl",
			"int",
			"clr",
			"sv",
			"ga",
			"psxg",
			"cs",
			"svPct",
			"matchRating",
		],
		season,
		playoffs: true,
		regularSeason: false,
		tid,
	});

	const winner = players
		.filter((p) => number(p.stats.gp) > 0)
		.toSorted((a, b) => {
			const score = (p: (typeof players)[number]) =>
				number(p.stats.gp) * number(p.stats.matchRating) +
				number(p.stats.g) * 4 +
				number(p.stats.a) * 2.5 +
				number(p.stats.cs) * 0.5 +
				number(p.stats.sv) * 0.05 +
				(number(p.stats.psxg) - number(p.stats.ga)) * 0.4;
			return score(b) - score(a);
		})[0];
	if (!winner) {
		return;
	}

	return {
		pid: winner.pid,
		name: winner.name,
		tid,
		abbrev,
		pos: winner.ratings.pos as Position,
		gp: number(winner.stats.gp),
		g: number(winner.stats.g),
		a: number(winner.stats.a),
		xg: number(winner.stats.xg),
		xa: number(winner.stats.xa),
		cs: number(winner.stats.cs),
		tkl: number(winner.stats.tkl),
		int: number(winner.stats.int),
		clr: number(winner.stats.clr),
		sv: number(winner.stats.sv),
		ga: number(winner.stats.ga),
		svPct: number(winner.stats.svPct),
		matchRating: number(winner.stats.matchRating),
	};
};

export default getSoccerCupMvp;
