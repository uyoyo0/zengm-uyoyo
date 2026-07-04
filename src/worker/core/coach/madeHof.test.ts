import { assert, beforeEach, describe, test } from "vitest";
import madeHof from "./madeHof.ts";
import ovr from "./ovr.ts";
import { g } from "../../util/index.ts";
import { resetG } from "../../../test/helpers.ts";
import { DEFAULT_COACHING } from "../../../common/constants.ts";
import type { Coach } from "../../../common/types.ts";

// A career of numSeasons seasons with a fixed per-season record. Championship
// seasons get champion flags, matching "Won Championship" awards.
const makeCoach = ({
	numSeasons,
	won,
	expectedWins,
	playoffWonPerSeason = 0,
	championships = 0,
	coy = 0,
	includePlayoffFields = true,
}: {
	numSeasons: number;
	won: number;
	expectedWins: number;
	playoffWonPerSeason?: number;
	championships?: number;
	coy?: number;
	includePlayoffFields?: boolean;
}): Coach => {
	const noOvr = {
		development: 50,
		tactics: 50,
		adaptability: 50,
		motivation: 50,
	};

	const seasons: NonNullable<Coach["seasons"]> = [];
	const awards: Coach["awards"] = [];
	for (let i = 0; i < numSeasons; i++) {
		const season = 2000 + i;
		const champion = i < championships;
		seasons.push({
			season,
			tid: 0,
			won,
			lost: 82 - won,
			expectedWins,
			...(includePlayoffFields
				? {
						playoffWon: playoffWonPerSeason,
						playoffLost: 4,
						playoffRoundsWon: champion ? 4 : 0,
						champion,
					}
				: undefined),
		});
		if (champion) {
			awards.push({ season, type: "Won Championship" });
		}
		if (i < coy) {
			awards.push({ season, type: "Coach of the Year" });
		}
	}

	return {
		cid: 1,
		tid: 0,
		firstName: "Test",
		lastName: "Coach",
		face: {} as any,
		born: { year: 1960, loc: "USA" },
		contract: { amount: 5000, exp: 2030 },
		ratings: { ...noOvr, ovr: ovr(noOvr) },
		philosophy: { ...DEFAULT_COACHING },
		awards,
		seasons,
	};
};

describe("madeHof", () => {
	beforeEach(() => {
		resetG();
	});

	test("dynasty coach gets in", () => {
		const coach = makeCoach({
			numSeasons: 25,
			won: 60,
			expectedWins: 50,
			playoffWonPerSeason: 10,
			championships: 5,
			coy: 3,
		});
		assert(madeHof(coach));
	});

	test("journeyman with no hardware stays out", () => {
		const coach = makeCoach({
			numSeasons: 12,
			won: 38,
			expectedWins: 41,
		});
		assert(!madeHof(coach));
	});

	test("no completed seasons means no induction", () => {
		const coach = makeCoach({ numSeasons: 0, won: 0, expectedWins: 0 });
		assert(!madeHof(coach));
	});

	test("monotonic in wins and championships", () => {
		// A decorated career scores at least as well as the same career with
		// fewer wins or fewer championships.
		const base = makeCoach({
			numSeasons: 15,
			won: 48,
			expectedWins: 44,
			playoffWonPerSeason: 5,
			championships: 1,
			coy: 1,
		});
		assert(madeHof(base));

		const fewerWins = makeCoach({
			numSeasons: 15,
			won: 30,
			expectedWins: 44,
			playoffWonPerSeason: 0,
			championships: 0,
			coy: 0,
		});
		assert(!madeHof(fewerWins));
	});

	test("hofFactor scales the threshold", () => {
		const coach = makeCoach({
			numSeasons: 15,
			won: 48,
			expectedWins: 44,
			playoffWonPerSeason: 5,
			championships: 1,
			coy: 1,
		});
		assert(madeHof(coach));

		g.setWithoutSavingToDB("hofFactor", 100);
		assert(!madeHof(coach));

		g.setWithoutSavingToDB("hofFactor", 0.01);
		assert(madeHof(coach));
	});

	test("tolerates seasons without playoff fields (pre-migration rows)", () => {
		const coach = makeCoach({
			numSeasons: 25,
			won: 60,
			expectedWins: 50,
			includePlayoffFields: false,
		});
		// No crash, and a huge win total still gets in on its own.
		assert(madeHof(coach));
	});
});
