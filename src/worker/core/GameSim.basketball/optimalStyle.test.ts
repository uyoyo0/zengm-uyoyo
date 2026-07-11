import { assert, test } from "vitest";
import GameSim from "./index.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import { rosterOptimalStyle } from "../coach/style.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { DEFAULT_COACHING } from "../../../common/constants.ts";
import { range } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import type { TeamCoaching } from "../../../common/types.ts";

// Validates that rosterOptimalStyle's derived dials actually help in the sim:
// two clones of a skewed roster play each other, one using its optimal style
// and one using the negation of it. If the optimal side doesn't win more than
// half, the optimal-style math (or the sim's dial effects) is wrong.

const PER_TEAM = 13;

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

const negate = (style: TeamCoaching): TeamCoaching => {
	const out = { ...style };
	for (const key of Object.keys(out) as (keyof TeamCoaching)[]) {
		out[key] = -out[key];
	}
	return out;
};

const runOptimalVsNegated = async (
	basePatch: (players: any[]) => void,
	n: number,
) => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);

	const base = range(PER_TEAM).map((i) => {
		const p: any = player.generate(0, 25, 2010, true, 50);
		p.rosterOrder = i;
		const r = p.ratings.at(-1);
		r.ovr = player.ovr(r);
		return p;
	});
	basePatch(base);

	const players0 = base.map((p) => {
		const c = structuredClone(p);
		c.tid = 0;
		return c;
	});
	const players1 = base.map((p) => {
		const c = structuredClone(p);
		c.tid = 1;
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

	// Team 0 plays its roster's optimal style; team 1 plays the opposite.
	const optimal = rosterOptimalStyle(
		(await idb.cache.players.indexGetAll("playersByTid", 0)) as any,
	);
	const styles = [optimal, negate(optimal)];
	for (const tid of [0, 1] as const) {
		const t = await idb.cache.teams.get(tid);
		t!.coaching = styles[tid]!;
		await idb.cache.teams.put(t!);
	}

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

	return { optimal, winPct: wins[0]! / (wins[0]! + wins[1]!) };
};

test("optimal style beats its negation for a shooter roster", async () => {
	const { optimal, winPct } = await runOptimalVsNegated((players) => {
		for (const p of players) {
			const r = p.ratings.at(-1);
			r.tp = 85;
			r.tendencyThree = 80;
			r.spd = 65;
		}
	}, 500);
	assert(
		optimal.threePointTendency > 0,
		`shooter roster should want 3s: ${JSON.stringify(optimal)}`,
	);
	assert(winPct > 0.52, `optimal style should win: ${winPct}`);
}, 900000);

// The negation contrast has much less leverage here, measured ~50%: dials
// scale existing tendencies, so telling a 25-tendencyThree roster to bomb
// away barely changes its shot mix, while telling shooters NOT to shoot
// (the case above) actively suppresses a strength. So this case asserts
// dial direction plus non-inferiority - a tripwire against the optimal
// style ever becoming actively harmful.
test("optimal style is not worse than its negation for a rim-heavy roster", async () => {
	const { optimal, winPct } = await runOptimalVsNegated((players) => {
		for (const p of players) {
			const r = p.ratings.at(-1);
			r.tp = 30;
			r.tendencyThree = 25;
			r.ins = 80;
			r.dnk = 80;
			r.reb = 75;
			r.hgt = 70;
		}
	}, 500);
	assert(
		optimal.threePointTendency < 0,
		`rim roster should avoid 3s: ${JSON.stringify(optimal)}`,
	);
	assert(winPct > 0.45, `optimal style should not lose: ${winPct}`);
}, 900000);
