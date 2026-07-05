import { assert, test } from "vitest";
import GameSim from "../GameSim.basketball/index.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import winProbFromOvr from "./winProbFromOvr.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { DEFAULT_COACHING } from "../../../common/constants.ts";
import { range } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";

// Calibration harness for winProbFromOvr, in the same spirit as
// coachEffects.test.ts: clone a roster, shift one side's skill ratings down by
// a known amount, play many games with neutral coaches/dials, and check that
// the logistic's predicted win% tracks the sim's actual win%. If a sim change
// moves these outside their bands, re-run this tuning pass (bump the games
// counts for a tighter estimate) rather than just widening the bands.

const PER_TEAM = 13;

const SKILL_KEYS = [
	"stre",
	"spd",
	"jmp",
	"endu",
	"ins",
	"dnk",
	"ft",
	"fg",
	"tp",
	"oiq",
	"diq",
	"drb",
	"pss",
	"reb",
];

const neutralCoach = (tid: number): any => ({
	tid,
	firstName: "Coach",
	lastName: `Team ${tid}`,
	face: {},
	born: { year: 1970, loc: "USA" },
	contract: { amount: 5000, exp: 2020 },
	ratings: {
		development: 50,
		tactics: 50,
		adaptability: 50,
		motivation: 50,
		ovr: 50,
	},
	philosophy: { ...DEFAULT_COACHING },
	awards: [],
});

const runGap = async (ratingShift: number, n: number) => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);

	const base = range(PER_TEAM).map((i) => {
		const p: any = player.generate(0, 25, 2010, true, 50);
		p.rosterOrder = i;
		// generate() leaves ratings.ovr at 0; compute it like league init does.
		const r = p.ratings.at(-1);
		r.ovr = player.ovr(r);
		return p;
	});

	const players0 = base.map((p) => {
		const c = structuredClone(p);
		c.tid = 0;
		return c;
	});
	const players1 = base.map((p) => {
		const c = structuredClone(p);
		c.tid = 1;
		const r = c.ratings.at(-1);
		for (const key of SKILL_KEYS) {
			r[key] = helpers.bound(r[key] - ratingShift, 0, 100);
		}
		r.ovr = player.ovr(r);
		return c;
	});

	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);
	await resetCache({
		players: [...players0, ...players1],
		coaches: [neutralCoach(0), neutralCoach(1)],
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});

	for (const p of await idb.cache.players.getAll()) {
		await player.updateValues(p);
		await idb.cache.players.put(p);
	}
	for (const tid of [0, 1]) {
		const t = await idb.cache.teams.get(tid);
		t!.coaching = { ...DEFAULT_COACHING };
		await idb.cache.teams.put(t!);
	}

	const teamOvr = (players: any[]) =>
		team.ovr(
			players.map((p) => ({
				pid: p.pid,
				injury: { type: "Healthy", gamesRemaining: 0 },
				value: p.value ?? 0,
				ratings: {
					ovr: p.ratings.at(-1).ovr,
					pos: p.ratings.at(-1).pos,
				},
			})),
			{},
		);
	const ovrDiff = teamOvr(players0) - teamOvr(players1);

	const wins = [0, 0];
	for (let i = 0; i < n; i++) {
		const teams = await loadTeams([0, 1], {});
		const res: any = new GameSim({
			gid: 0,
			teams: [teams[0]!, teams[1]!] as any,
			baseInjuryRate: 0,
			doPlayByPlay: false,
			homeCourtFactor: 1,
			allStarGame: false,
			neutralSite: true,
		}).run();
		const pts0 = res.team[0].stat.pts;
		const pts1 = res.team[1].stat.pts;
		if (pts0 !== pts1) {
			wins[pts0 > pts1 ? 0 : 1]! += 1;
		}
	}

	return { ovrDiff, wins: wins as [number, number] };
};

const measureGap = async (shift: number, rosters: number, games: number) => {
	let w0 = 0;
	let w1 = 0;
	let diffSum = 0;
	for (let i = 0; i < rosters; i++) {
		const { ovrDiff, wins } = await runGap(shift, games);
		diffSum += ovrDiff;
		w0 += wins[0];
		w1 += wins[1];
	}
	return {
		avgDiff: diffSum / rosters,
		actual: w0 / (w0 + w1),
		record: `${w0}-${w1}`,
	};
};

test("equal teams split games evenly", async () => {
	const { actual, record } = await measureGap(0, 2, 250);
	assert(
		actual > 0.44 && actual < 0.56,
		`equal rosters should be ~50/50: ${actual} (${record})`,
	);
}, 900000);

test("winProbFromOvr tracks the sim across talent gaps", async () => {
	const report: string[] = [];
	let maxErr = 0;
	for (const shift of [1, 2, 4, 7]) {
		const { avgDiff, actual, record } = await measureGap(shift, 3, 250);
		const predicted = winProbFromOvr(avgDiff);
		const impliedScale = avgDiff / Math.log(actual / (1 - actual));
		report.push(
			`shift=${shift}: ovrDiff=${avgDiff.toFixed(1)} actual=${(100 * actual).toFixed(1)}% predicted=${(100 * predicted).toFixed(1)}% impliedScale=${impliedScale.toFixed(1)} (${record})`,
		);
		maxErr = Math.max(maxErr, Math.abs(predicted - actual));
	}
	// 750 games -> binomial se ~1.8%. The logistic's worst fit is ~4pp at
	// mid-range gaps; 9pp allows that plus noise while still catching real
	// miscalibration (the old scale-12 constant was off by 19pp at a 32 gap).
	assert(maxErr < 0.09, `winProbFromOvr is miscalibrated:\n${report.join("\n")}`);
}, 900000);
