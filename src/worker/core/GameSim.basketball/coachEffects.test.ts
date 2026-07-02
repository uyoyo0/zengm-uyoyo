import { assert, test } from "vitest";
import GameSim from "./index.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { coachDevEffect } from "../../../common/coachingConstants.ts";
import { DEFAULT_COACHING, PLAYER } from "../../../common/constants.ts";
import { range } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import ovr from "../coach/ovr.ts";
import { rosterOptimalStyle, seasonStyle } from "../coach/style.ts";
import type {
	Coach,
	CoachWithoutKey,
	TeamCoaching,
} from "../../../common/types.ts";

// Balance harness for coach attributes: two equal-talent clone rosters, coaches
// with controlled ratings, many games, measure win share. These are the numbers
// the coaching constants get tuned against; asserts are deliberately loose
// directional floors until the tuning pass tightens them to bands.

const PER_TEAM = 13;

type CoachRatingsInput = Partial<{
	development: number;
	tactics: number;
	adaptability: number;
	motivation: number;
}>;

const makeCoach = (
	tid: number,
	ratings?: CoachRatingsInput,
	philosophy?: Partial<TeamCoaching>,
): CoachWithoutKey => {
	const noOvr = {
		development: 50,
		tactics: 50,
		adaptability: 50,
		motivation: 50,
		...ratings,
	};
	return {
		tid,
		firstName: "Coach",
		lastName: `Team ${tid}`,
		face: {} as any,
		born: { year: 1970, loc: "USA" },
		contract: { amount: 5000, exp: 2020 },
		ratings: { ...noOvr, ovr: ovr(noOvr) },
		philosophy: { ...DEFAULT_COACHING, ...philosophy },
		awards: [],
	};
};

const clonePlayer = (p: any, tid: number) => {
	const c = structuredClone(p);
	c.tid = tid;
	return c;
};

// Sim n games between two equal rosters whose only difference is the head
// coach. Team dials are derived the same way the preseason does (seasonStyle:
// philosophy blended toward roster-optimal by adaptability), and loadTeams
// applies the tactics-driven availability/matchup adjustments because the coach
// rows are in the cache. Returns win counts and total points.
const runWithCoaches = async ({
	coach0,
	coach1,
	dials0,
	dials1,
	n = 100,
}: {
	coach0: CoachWithoutKey;
	coach1: CoachWithoutKey;
	// When set, team dials are forced directly instead of derived via
	// seasonStyle, for measuring a dial in isolation at full strength.
	dials0?: Partial<TeamCoaching>;
	dials1?: Partial<TeamCoaching>;
	n?: number;
}) => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);

	const base = range(PER_TEAM).map((i) => {
		const p: any = player.generate(0, 25, 2010, true, 50);
		p.rosterOrder = i;
		return p;
	});
	const players0 = base.map((p) => clonePlayer(p, 0));
	const players1 = base.map((p) => clonePlayer(p, 1));

	coach0.tid = 0;
	coach1.tid = 1;

	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);
	await resetCache({
		players: [...players0, ...players1],
		coaches: [coach0, coach1],
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});

	for (const p of await idb.cache.players.getAll()) {
		await player.updateValues(p);
		await idb.cache.players.put(p);
	}

	// Effective season dials, exactly like updateTeamCoaching does at preseason,
	// unless a test forces specific dials to isolate one lever.
	for (const [tid, c, players, dials] of [
		[0, coach0, players0, dials0],
		[1, coach1, players1, dials1],
	] as const) {
		const t = await idb.cache.teams.get(tid);
		t!.coaching = dials
			? { ...DEFAULT_COACHING, ...dials }
			: seasonStyle(c as Coach, rosterOptimalStyle(players));
		await idb.cache.teams.put(t!);
	}

	const wins = [0, 0];
	const pts = [0, 0];
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
		pts[0]! += pts0;
		pts[1]! += pts1;
		if (pts0 !== pts1) {
			wins[pts0 > pts1 ? 0 : 1]! += 1;
		}
	}
	return { wins: wins as [number, number], pts: pts as [number, number] };
};

const winPct = (wins: [number, number]) => wins[0] / (wins[0] + wins[1]);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

// Surfaced by vitest on failure; the numbers feed the tuning pass.
const report = (s: string) => {
	console.log(s);
};

// BASELINE MEASUREMENTS (report-only): as of Phase 1 these numbers show the
// pre-tuning reality - the tactics/adaptability adjustments toward "optimal"
// mild dials can LOSE to extreme dials, because some dial directions are net
// win-positive rather than fitness tradeoffs. The Phase 4 tuning pass uses
// these reports to retune the constants and then tightens them into asserts.

test("baseline: elite staff vs terrible staff (all in-game attributes)", async () => {
	const { wins } = await runWithCoaches({
		coach0: makeCoach(0, {
			development: 90,
			tactics: 90,
			adaptability: 90,
			motivation: 90,
		}),
		coach1: makeCoach(1, {
			development: 10,
			tactics: 10,
			adaptability: 10,
			motivation: 10,
		}),
		n: 400,
	});
	report(
		`[full coach] elite win% vs terrible: ${pct(winPct(wins))} (${wins[0]}-${wins[1]})`,
	);
});

test("baseline: tactics-only isolation", async () => {
	const { wins } = await runWithCoaches({
		coach0: makeCoach(0, { tactics: 90 }),
		coach1: makeCoach(1, { tactics: 10 }),
		n: 400,
	});
	report(
		`[tactics] 90-vs-10 win%: ${pct(winPct(wins))} (${wins[0]}-${wins[1]})`,
	);
});

test("baseline: adaptability with a philosophy opposite the roster", async () => {
	// Both coaches prefer the exact opposite of what the roster is good at; the
	// adaptable one abandons that philosophy for the roster-optimal style.
	resetG();
	g.setWithoutSavingToDB("season", 2016);
	const probe = range(PER_TEAM).map(() =>
		player.generate(0, 25, 2010, true, 50),
	);
	const optimal = rosterOptimalStyle(probe as any);
	const philosophy = Object.fromEntries(
		Object.entries(optimal).map(([k, v]) => [k, -Math.sign(v)]),
	) as Partial<TeamCoaching>;

	const { wins } = await runWithCoaches({
		coach0: makeCoach(0, { adaptability: 90 }, philosophy),
		coach1: makeCoach(1, { adaptability: 10 }, philosophy),
		n: 400,
	});
	report(
		`[adaptability] 90-vs-10 (bad philosophy) win%: ${pct(winPct(wins))} (${wins[0]}-${wins[1]})`,
	);
});

test("baseline: motivation-only isolation (bench energy recovery)", async () => {
	const { wins } = await runWithCoaches({
		coach0: makeCoach(0, { motivation: 90 }),
		coach1: makeCoach(1, { motivation: 10 }),
		n: 400,
	});
	report(
		`[motivation] 90-vs-10 win%: ${pct(winPct(wins))} (${wins[0]}-${wins[1]})`,
	);
	// Fresher legs should never systematically lose; loose floor until tuning.
	assert(
		winPct(wins) > 0.45,
		`motivated team should not lose: ${winPct(wins)}`,
	);
});

test("baseline: per-dial win impact at extremes", async () => {
	// Which dials are true tradeoffs vs strictly better in one direction? Feeds
	// the Phase 4 retune. Coaches are identical (neutral); only team dials vary.
	const DIAL_KEYS = Object.keys(DEFAULT_COACHING) as (keyof TeamCoaching)[];
	for (const key of DIAL_KEYS) {
		const out: string[] = [];
		for (const value of [1, -1]) {
			const { wins } = await runWithCoaches({
				coach0: makeCoach(0),
				coach1: makeCoach(1),
				dials0: { [key]: value },
				dials1: {},
				n: 200,
			});
			out.push(`${value > 0 ? "+1" : "-1"}: ${pct(winPct(wins))}`);
		}
		report(`[dial ${key}] win% vs neutral at ${out.join(", ")}`);
	}
}, 120000);

test("coach development effect: linear, neutral at 50, monotonic", async () => {
	assert.strictEqual(coachDevEffect(50), 0);
	assert.strictEqual(coachDevEffect(100), -coachDevEffect(0));
	assert(coachDevEffect(100) > 0);

	// Distribution check on actual player development: mean annual ovr change
	// must be monotonic in the coach's development rating.
	resetG();
	g.setWithoutSavingToDB("season", 2016);
	const TRIALS = 1000;
	const meanDelta = async (devRating: number) => {
		let total = 0;
		for (let i = 0; i < TRIALS; i++) {
			const p: any = player.generate(PLAYER.UNDRAFTED, 22, 2015, true, 50);
			// generate() leaves ovr uncomputed; a zero-year develop fills it in.
			await player.develop(p, 0, false, 50, true);
			const before = p.ratings.at(-1).ovr;
			await player.develop(p, 1, false, devRating, true);
			total += p.ratings.at(-1).ovr - before;
		}
		return total / TRIALS;
	};

	const [lo, hi] = [await meanDelta(0), await meanDelta(100)];
	const mid = await meanDelta(50);
	report(
		`[dev effect] mean ovr delta at age 22: dev0=${lo.toFixed(2)} dev50=${mid.toFixed(2)} dev100=${hi.toFixed(2)} (0->100 swing ${(hi - lo).toFixed(2)})`,
	);
	// dev50 sits between the extremes in expectation but with sampling noise, so
	// only the 0-vs-100 gap (2x the per-side effect) is a hard assert.
	assert(hi > lo, `dev100 (${hi}) should beat dev0 (${lo})`);
}, 120000);
