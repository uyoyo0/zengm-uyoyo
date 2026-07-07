import { assert, describe, test } from "vitest";
import updatePopularity, {
	type PopularityContext,
} from "./updatePopularity.basketball.ts";
import { getStarPowerFactor } from "../game/starPower.ts";
import { fanVoteScore } from "../allStar/create.ts";

const context = (
	overrides: Partial<PopularityContext> = {},
): PopularityContext => ({
	lastSeason: 2020,
	numGames: 82,
	playoffRoundsWonByTid: new Map(),
	numPlayoffRounds: 4,
	...overrides,
});

const makePlayer = ({
	popularity = 50,
	charisma = 50,
	seasons = [] as {
		season: number;
		tid: number;
		gp: number;
		pts: number;
		ewa?: number;
		clutchPts?: number;
	}[],
	awards = [] as { season: number; type: string }[],
	draft = { year: 2010, round: 1, pick: 30, tid: 0 },
	dnk = 50,
	tendencyUsage = 50,
	tendencyThree = 50,
} = {}): any => ({
	ratings: [
		{
			season: 2021,
			popularity,
			charisma,
			dnk,
			tendencyUsage,
			tendencyThree,
		},
	],
	stats: seasons.map((s) => ({ playoffs: false, ewa: 0, ...s })),
	awards,
	draft,
});

const pop = (p: any) => p.ratings.at(-1).popularity;

describe("updatePopularity", () => {
	test("an MVP season jumps popularity sharply", () => {
		const p = makePlayer({
			popularity: 60,
			seasons: [{ season: 2020, tid: 0, gp: 78, pts: 78 * 28, ewa: 20 }],
			awards: [
				{ season: 2020, type: "Most Valuable Player" },
				{ season: 2020, type: "All-Star" },
				{ season: 2020, type: "First Team All-League" },
			],
			tendencyUsage: 75,
		});
		updatePopularity(p, context());
		assert(pop(p) >= 75, `expected big jump, got ${pop(p)}`);
	});

	test("an anonymous benchwarmer decays toward obscurity", () => {
		const p = makePlayer({
			popularity: 50,
			seasons: [{ season: 2020, tid: 0, gp: 40, pts: 40 * 3, ewa: 0 }],
		});
		updatePopularity(p, context());
		assert(pop(p) < 45, `expected decay, got ${pop(p)}`);
	});

	test("charisma diverges otherwise identical players", () => {
		const stats = [{ season: 2020, tid: 0, gp: 70, pts: 70 * 15, ewa: 5 }];
		const magnetic = makePlayer({ charisma: 80, seasons: stats });
		const dull = makePlayer({ charisma: 20, seasons: stats });
		updatePopularity(magnetic, context());
		updatePopularity(dull, context());
		assert(pop(magnetic) > pop(dull));
	});

	test("a number one pick arrives with hype despite never playing", () => {
		const p = makePlayer({
			popularity: 40,
			draft: { year: 2020, round: 1, pick: 1, tid: 0 },
		});
		const later = makePlayer({
			popularity: 40,
			draft: { year: 2020, round: 2, pick: 45, tid: 0 },
		});
		updatePopularity(p, context());
		updatePopularity(later, context());
		assert(pop(p) > pop(later));
	});

	test("deep playoff runs add fame", () => {
		const stats = [{ season: 2020, tid: 3, gp: 70, pts: 70 * 18, ewa: 8 }];
		const finalist = makePlayer({ seasons: stats });
		const eliminated = makePlayer({ seasons: stats });
		updatePopularity(
			finalist,
			context({ playoffRoundsWonByTid: new Map([[3, 3]]) }),
		);
		updatePopularity(
			eliminated,
			context({ playoffRoundsWonByTid: new Map([[3, 0]]) }),
		);
		assert(pop(finalist) > pop(eliminated));
	});

	test("bounds hold and missing fields don't throw", () => {
		const p: any = {
			ratings: [{ season: 2021 }],
			stats: [],
			awards: [],
			draft: { year: 2000, round: 0, pick: 0, tid: -1 },
		};
		updatePopularity(p, context());
		assert(p.ratings[0].popularity >= 0 && p.ratings[0].popularity <= 100);
	});
});

describe("fanVoteScore", () => {
	test("flips near-equals but not big stat gaps", () => {
		// Equal stats: popular player wins.
		assert(fanVoteScore(50, 90) > fanVoteScore(50, 20));
		// Even the maximum popularity spread (0 vs 100, ~28% combined swing)
		// can't close a 35% stat gap.
		assert(fanVoteScore(65, 0) > fanVoteScore(48, 100));
	});
});

describe("getStarPowerFactor", () => {
	test("neutral at 50, bounded, empty-safe", () => {
		assert.strictEqual(getStarPowerFactor([50, 50, 50, 10]), 1);
		assert.strictEqual(getStarPowerFactor([]), 1);
		assert.strictEqual(getStarPowerFactor([100, 100, 100]), 1.08);
		assert(getStarPowerFactor([0, 0, 0]) >= 0.92);
		// Only the top 3 count.
		assert(
			getStarPowerFactor([90, 90, 90, 0, 0, 0]) ===
				getStarPowerFactor([90, 90, 90]),
		);
	});
});
