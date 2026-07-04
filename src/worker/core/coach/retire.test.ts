import { assert, beforeEach, describe, test } from "vitest";
import retire from "./retire.ts";
import ovr from "./ovr.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { PLAYER, DEFAULT_COACHING } from "../../../common/constants.ts";
import type { Coach } from "../../../common/types.ts";

const makeCoach = (seasons: Coach["seasons"], awards: Coach["awards"]): Coach => {
	const noOvr = {
		development: 50,
		tactics: 50,
		adaptability: 50,
		motivation: 50,
	};
	return {
		cid: 1,
		tid: PLAYER.FREE_AGENT,
		firstName: "Test",
		lastName: "Coach",
		face: {} as any,
		born: { year: 1955, loc: "USA" },
		contract: { amount: 5000, exp: 2019 },
		ratings: { ...noOvr, ovr: ovr(noOvr) },
		philosophy: { ...DEFAULT_COACHING },
		awards,
		seasons,
	};
};

describe("retire", () => {
	beforeEach(async () => {
		resetG();
		g.setWithoutSavingToDB("season", 2020);
		await resetCache({});
	});

	test("HoF-worthy coach is inducted on retirement", async () => {
		const seasons: NonNullable<Coach["seasons"]> = [];
		const awards: Coach["awards"] = [];
		for (let i = 0; i < 20; i++) {
			const champion = i < 4;
			seasons.push({
				season: 2000 + i,
				tid: 0,
				won: 58,
				lost: 24,
				expectedWins: 48,
				playoffWon: champion ? 16 : 5,
				playoffLost: 5,
				playoffRoundsWon: champion ? 4 : 1,
				champion,
			});
			if (champion) {
				awards.push({ season: 2000 + i, type: "Won Championship" });
			}
		}
		const coach = makeCoach(seasons, awards);
		await idb.cache.coaches.add(coach);

		await retire(coach);

		assert.strictEqual(coach.tid, PLAYER.RETIRED);
		assert.strictEqual(coach.retiredYear, 2020);
		assert.strictEqual(coach.hof, 1);
		assert(
			coach.awards.some((a) => a.type === "Inducted into the Hall of Fame"),
		);

		const stored = await idb.cache.coaches.get(coach.cid);
		assert.strictEqual(stored?.hof, 1);
	});

	test("unremarkable coach retires without induction", async () => {
		const seasons: NonNullable<Coach["seasons"]> = [];
		for (let i = 0; i < 8; i++) {
			seasons.push({
				season: 2010 + i,
				tid: 0,
				won: 38,
				lost: 44,
				expectedWins: 41,
				playoffWon: 0,
				playoffLost: 0,
				playoffRoundsWon: -1,
				champion: false,
			});
		}
		const coach = makeCoach(seasons, []);
		await idb.cache.coaches.add(coach);

		await retire(coach);

		assert.strictEqual(coach.tid, PLAYER.RETIRED);
		assert.strictEqual(coach.retiredYear, 2020);
		assert.strictEqual(coach.hof, undefined);
		assert(
			!coach.awards.some((a) => a.type === "Inducted into the Hall of Fame"),
		);
	});
});
