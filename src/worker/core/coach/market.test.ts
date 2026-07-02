import { assert, describe, test } from "vitest";
import processCoachMarket, {
	coachDemand,
	philosophyFit,
	scoreCandidate,
} from "./market.ts";
import generate from "./generate.ts";
import ovr from "./ovr.ts";
import { coach, team } from "../index.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { PLAYER, DEFAULT_COACHING } from "../../../common/constants.ts";
import { idb } from "../../db/index.ts";
import type { Coach, TeamCoaching } from "../../../common/types.ts";

const makeCoach = (
	tid: number,
	{
		ovr: targetOvr = 50,
		age = 45,
		exp = 2025,
		prevTid,
		philosophy,
	}: {
		ovr?: number;
		age?: number;
		exp?: number;
		prevTid?: number;
		philosophy?: Partial<TeamCoaching>;
	} = {},
): Coach => {
	const noOvr = {
		development: targetOvr,
		tactics: targetOvr,
		adaptability: targetOvr,
		motivation: targetOvr,
	};
	return {
		cid: 0,
		tid,
		firstName: "Test",
		lastName: `Coach${tid}`,
		face: {} as any,
		born: { year: 2020 - age, loc: "USA" },
		contract: { amount: 5000, exp },
		ratings: { ...noOvr, ovr: ovr(noOvr) },
		philosophy: { ...DEFAULT_COACHING, ...philosophy },
		awards: [],
		prevTid,
	};
};

const setupLeague = async (numTeams = 4) => {
	resetG();
	g.setWithoutSavingToDB("season", 2020);
	const teamsDefault = helpers.getTeamsDefault().slice(0, numTeams);
	await resetCache({
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});
};

describe("coachDemand", () => {
	test("monotonic in ovr", async () => {
		await setupLeague();
		const low = coachDemand(makeCoach(PLAYER.FREE_AGENT, { ovr: 30 }), 0, 0.5);
		const high = coachDemand(makeCoach(PLAYER.FREE_AGENT, { ovr: 80 }), 0, 0.5);
		assert(high.amount > low.amount);
	});

	test("loyalty discount for previous team", async () => {
		await setupLeague();
		const c = makeCoach(PLAYER.FREE_AGENT, { prevTid: 0 });
		const loyal = coachDemand(c, 0, 0.5);
		const stranger = coachDemand(c, 1, 0.5);
		assert(loyal.amount < stranger.amount);
	});

	test("bad situations cost more", async () => {
		await setupLeague();
		const c = makeCoach(PLAYER.FREE_AGENT);
		const winner = coachDemand(c, 0, 0.7);
		const loser = coachDemand(c, 0, 0.3);
		assert(loser.amount > winner.amount);
	});

	test("good coaches demand multi-year deals", async () => {
		await setupLeague();
		const elite = coachDemand(
			makeCoach(PLAYER.FREE_AGENT, { ovr: 80 }),
			0,
			0.5,
		);
		assert(elite.exp - g.get("season") >= 2);
	});
});

describe("scoreCandidate", () => {
	test("prefers philosophy fit at equal ovr and price", () => {
		const optimal: TeamCoaching = {
			threePointTendency: 0.8,
			pace: 0.5,
			crashOffensiveGlass: 0,
			paintDefense: -0.5,
			defensiveAggression: 0.3,
		};
		const fits = makeCoach(PLAYER.FREE_AGENT, { philosophy: optimal });
		const clashes = makeCoach(PLAYER.FREE_AGENT, {
			philosophy: {
				threePointTendency: -0.8,
				pace: -0.5,
				paintDefense: 0.5,
				defensiveAggression: -0.3,
			},
		});
		const a = scoreCandidate(fits, optimal, 5000, 5000);
		const b = scoreCandidate(clashes, optimal, 5000, 5000);
		assert(a > b);
		assert.strictEqual(philosophyFit(optimal, optimal), 1);
	});
});

describe("processCoachMarket", () => {
	// Note: team 0 is the user's team (resetG default), so AI behavior is
	// exercised on teams 1+.

	test("expiring AI coach re-signs on a fresh deal when no better option exists", async () => {
		await setupLeague(2);
		const expiring = makeCoach(1, { exp: 2019, age: 45 });
		delete (expiring as any).cid;
		await idb.cache.coaches.add(expiring);

		await processCoachMarket();

		const all = await idb.cache.coaches.getAll();
		const c = all.find((x) => x.lastName === "Coach1")!;
		// Empty FA pool at decision time -> re-signs, but on a NEW contract.
		assert.strictEqual(c.tid, 1);
		assert(c.contract.exp >= 2020, "re-signed on a fresh contract");
	});

	test("expiring AI coach walks when a clearly better free agent exists", async () => {
		await setupLeague(2);
		const expiring = makeCoach(1, { ovr: 40, exp: 2019, age: 45 });
		delete (expiring as any).cid;
		await idb.cache.coaches.add(expiring);
		const elite = makeCoach(PLAYER.FREE_AGENT, { ovr: 90, age: 45 });
		elite.lastName = "Elite";
		delete (elite as any).cid;
		await idb.cache.coaches.add(elite);

		await processCoachMarket();

		const all = await idb.cache.coaches.getAll();
		const old = all.find((x) => x.lastName === "Coach1")!;
		const hired = all.find((x) => x.lastName === "Elite")!;
		assert.strictEqual(old.prevTid, 1);
		assert(old.tid !== 1, "incumbent lost the job");
		assert.strictEqual(hired.tid, 1, "elite FA hired by the vacated team");
	});

	test("every AI team ends up with a coach; better teams draw from the pool", async () => {
		await setupLeague(4);
		// Team 2 had a strong prior season, team 3 a bad one (teams 1-3 are AI).
		for (const [tid, won, lost] of [
			[2, 60, 22],
			[3, 20, 62],
		] as const) {
			const teamsDefault = helpers.getTeamsDefault().slice(0, 4);
			const ts = team.genSeasonRow(teamsDefault[tid]!);
			ts.season = 2019;
			ts.won = won;
			ts.lost = lost;
			await idb.cache.teamSeasons.add(ts);
		}
		// Free agents of varying quality; no team has a coach.
		for (const targetOvr of [80, 60, 45, 40, 35, 30]) {
			const c = makeCoach(PLAYER.FREE_AGENT, { ovr: targetOvr, age: 45 });
			delete (c as any).cid;
			await idb.cache.coaches.add(c);
		}

		await processCoachMarket();

		const all = await idb.cache.coaches.getAll();
		for (const tid of [0, 1, 2, 3]) {
			const teamCoaches = all.filter((c) => c.tid === tid);
			assert.strictEqual(teamCoaches.length, 1, `team ${tid} has one coach`);
		}
		// The winning AI team picked before the losing AI team, so its coach
		// should be at least as good (equal philosophies -> score is ovr-driven).
		const coachGood = all.find((c) => c.tid === 2)!;
		const coachBad = all.find((c) => c.tid === 3)!;
		assert(
			coachGood.ratings.ovr >= coachBad.ratings.ovr,
			`good team's coach (${coachGood.ratings.ovr}) >= bad team's (${coachBad.ratings.ovr})`,
		);
	});

	test("dead money accrues on firing and is pruned when expired", async () => {
		await setupLeague(2);
		const c = makeCoach(0, { exp: 2022, age: 45 });
		delete (c as any).cid;
		await idb.cache.coaches.add(c);

		await coach.fire(0, undefined, false);

		let t = await idb.cache.teams.get(0);
		assert.strictEqual(t!.deadCoachMoney!.length, 1);
		assert.strictEqual(t!.deadCoachMoney![0]!.exp, 2022);

		// Jump past expiration; the market prunes it.
		g.setWithoutSavingToDB("season", 2023);
		await processCoachMarket();
		t = await idb.cache.teams.get(0);
		assert.strictEqual(
			t!.deadCoachMoney!.filter((d) => d.exp >= 2023).length,
			t!.deadCoachMoney!.length,
		);
		assert.strictEqual(t!.deadCoachMoney!.length, 0);
	});

	test("grandfathers old saves: contracts multiple years past exp don't retire-storm", async () => {
		await setupLeague(2);
		// Simulates an old save where the old auto-renew left exp far in the past.
		const c = makeCoach(0, { exp: 2015, age: 50 });
		delete (c as any).cid;
		await idb.cache.coaches.add(c);

		await processCoachMarket();

		const all = await idb.cache.coaches.getAll();
		const found = all.find((x) => x.lastName === "Coach0")!;
		// Treated as expiring now: either re-signed fresh or a free agent, never
		// still on the ancient contract.
		assert(
			found.tid === PLAYER.FREE_AGENT || found.contract.exp >= 2020,
			"ancient contract resolved",
		);
	});
});

describe("generate", () => {
	test("pool coaches get randomized expirations", async () => {
		await setupLeague(2);
		const c = await generate(PLAYER.FREE_AGENT, { age: 45 });
		assert(c.contract.exp >= 2020 - 1);
	});
});
