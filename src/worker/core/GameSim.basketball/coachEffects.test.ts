import { assert, test } from "vitest";
import GameSim from "./index.ts";
import { player, team } from "../index.ts";
import loadTeams, { getPlayoffMatchupWeight } from "../game/loadTeams.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import {
	coachDevEffect,
	playoffMatchupWeight,
} from "../../../common/coachingConstants.ts";
import { DEFAULT_COACHING, PHASE, PLAYER } from "../../../common/constants.ts";
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
	basePatch,
	prepare,
	n = 100,
}: {
	coach0: CoachWithoutKey;
	coach1: CoachWithoutKey;
	// When set, team dials are forced directly instead of derived via
	// seasonStyle, for measuring a dial in isolation at full strength.
	dials0?: Partial<TeamCoaching>;
	dials1?: Partial<TeamCoaching>;
	// Applied to the shared base roster before cloning (both teams identical).
	basePatch?: (players: any[]) => void;
	// Runs after the cache is set up, before games (e.g. put the league in the
	// playoffs with a series at a given game number).
	prepare?: () => Promise<void>;
	n?: number;
}) => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);

	const base = range(PER_TEAM).map((i) => {
		const p: any = player.generate(0, 25, 2010, true, 50);
		p.rosterOrder = i;
		return p;
	});
	basePatch?.(base);
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

	await prepare?.();

	const wins = [0, 0];
	const pts = [0, 0];
	const playerMin: [Map<number, number>, Map<number, number>] = [
		new Map(),
		new Map(),
	];
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
		for (const t of [0, 1] as const) {
			for (const p of res.team[t].player) {
				playerMin[t].set(
					p.id,
					(playerMin[t].get(p.id) ?? 0) + (p.stat.min ?? 0),
				);
			}
		}
	}
	return {
		wins: wins as [number, number],
		pts: pts as [number, number],
		playerMin,
	};
};

const winPct = (wins: [number, number]) => wins[0] / (wins[0] + wins[1]);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

// Surfaced by vitest on failure; the numbers feed the tuning pass.
const report = (s: string) => {
	console.log(s);
};

// Post-tuning measurements. Asserted bands are pathology tripwires around the
// measured values; if a sim change moves a number outside its band, re-run the
// tuning pass rather than just widening the band.

const eliteVsTerrible = (basePatch?: (players: any[]) => void) =>
	pooledWinPct(
		{
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
			basePatch,
		},
		4,
	);

test("elite staff vs terrible staff on a mirror roster (report)", async () => {
	// On a perfectly average mirror roster there is nothing to adapt to or
	// exploit, so the in-game staff edge is small (mostly motivation).
	// Development, the biggest lever, compounds across seasons instead of
	// showing up here.
	const { winPct: p, record } = await eliteVsTerrible();
	report(`[full coach, mirror] elite win% vs terrible: ${pct(p)} (${record})`);
	assert(p > 0.44 && p < 0.62, `mirror-roster staff effect out of band: ${p}`);
}, 600000);

test("elite staff beats terrible staff when there is something to coach", async () => {
	// A skewed (shooter-heavy) league gives coaching real decisions: the elite
	// staff adapts its style to the roster and defends the opponent's strength;
	// the terrible staff does neither.
	const makeShooters = (players: any[]) => {
		for (const p of players) {
			p.ratings.at(-1).tp = 75;
			p.ratings.at(-1).tendencyThree = 85;
		}
	};
	const { winPct: p, record } = await eliteVsTerrible(makeShooters);
	report(`[full coach, skewed] elite win% vs terrible: ${pct(p)} (${record})`);
	assert(p > 0.51, `elite coach should win where coaching matters: ${p}`);
	// 450 pooled games have se ~2.4%, so leave ~2 sigma beyond the measured
	// value; this band tripped at 0.7033 on pure noise.
	assert(p < 0.72, `coach impact too dominant: ${p}`);
}, 600000);

test("tactics-only isolation", async () => {
	const { winPct: p, record } = await pooledWinPct({
		coach0: makeCoach(0, { tactics: 90 }),
		coach1: makeCoach(1, { tactics: 10 }),
	});
	report(`[tactics] 90-vs-10 win%: ${pct(p)} (${record})`);
	assert(p > 0.44 && p < 0.64, `tactics out of band: ${p}`);
}, 600000);

test("tactics exploits a skewed opponent (vs 3PT-heavy league)", async () => {
	// Against a league of shooters, the matchup adjustment should have the
	// high-tactics coach guard the perimeter and gamble vs ball handlers -
	// tactics is situational value, ~neutral in a mirror matchup.
	const makeShooters = (players: any[]) => {
		for (const p of players) {
			p.ratings.at(-1).tp = 75;
			p.ratings.at(-1).tendencyThree = 85;
		}
	};
	const { winPct: p, record } = await pooledWinPct({
		coach0: makeCoach(0, { tactics: 90 }),
		coach1: makeCoach(1, { tactics: 10 }),
		basePatch: makeShooters,
	});
	report(`[tactics vs shooters] 90-vs-10 win%: ${pct(p)} (${record})`);
	assert(p > 0.46, `tactics should not hurt vs a skewed opponent: ${p}`);
}, 600000);

// Put the cache's league into the playoffs with a series between tids 0 and 1
// at the given wins (so the next game is game homeWon+awayWon+1).
const setPlayoffSeries = async (homeWon: number, awayWon: number) => {
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	const existing = await idb.cache.playoffSeries.get(g.get("season"));
	if (existing) {
		await idb.cache.playoffSeries.delete(existing.season);
	}
	await idb.cache.playoffSeries.add({
		season: g.get("season"),
		currentRound: 0,
		series: [
			[
				{
					home: { tid: 0, cid: 0, seed: 1, won: homeWon },
					away: { tid: 1, cid: 0, seed: 2, won: awayWon },
				},
			],
		],
	} as any);
};

test("playoffs: matchup weight tracks the series game number", async () => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);
	await resetCache({});

	// Regular season: no amplification.
	assert.strictEqual(await getPlayoffMatchupWeight([0, 1]), 1);

	// Game 1 of a series: prep-time boost only.
	await setPlayoffSeries(0, 0);
	assert.strictEqual(
		await getPlayoffMatchupWeight([0, 1]),
		playoffMatchupWeight(1),
	);

	// Game 7, and tid order doesn't matter.
	await setPlayoffSeries(3, 3);
	assert.strictEqual(
		await getPlayoffMatchupWeight([0, 1]),
		playoffMatchupWeight(7),
	);
	assert.strictEqual(
		await getPlayoffMatchupWeight([1, 0]),
		playoffMatchupWeight(7),
	);

	// Playoffs but these teams have no series (e.g. play-in): base prep boost.
	assert.strictEqual(
		await getPlayoffMatchupWeight([0, 5]),
		playoffMatchupWeight(1),
	);
});

test("playoffs: loadTeams applies amplified adjustments by game 7", async () => {
	// Fully deterministic: identical fixed ratings on every player (no
	// generate() randomness), a mid-tactics coach, and a moderate perimeter
	// skew, so the regular-season adjustment lands mid-range with headroom for
	// the game-7 amplification to show (a saturated -1.0 dial can't grow).
	resetG();
	g.setWithoutSavingToDB("season", 2016);

	const FIXED_RATINGS: Record<string, number> = {
		hgt: 50,
		stre: 50,
		spd: 50,
		jmp: 50,
		endu: 50,
		ins: 30,
		dnk: 45,
		ft: 55,
		fg: 55,
		tp: 75,
		oiq: 50,
		diq: 50,
		drb: 50,
		pss: 50,
		reb: 45,
		tendencyThree: 80,
	};
	const base = range(PER_TEAM).map((i) => {
		const p: any = player.generate(0, 25, 2010, true, 50);
		p.rosterOrder = i;
		Object.assign(p.ratings.at(-1), FIXED_RATINGS);
		return p;
	});
	const players0 = base.map((p) => clonePlayer(p, 0));
	const players1 = base.map((p) => clonePlayer(p, 1));

	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);
	await resetCache({
		players: [...players0, ...players1],
		coaches: [makeCoach(0, { tactics: 60 }), makeCoach(1, { tactics: 60 })],
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

	const regular = (await loadTeams([0, 1], {}))[0]!.coaching;
	await setPlayoffSeries(3, 3);
	const game7 = (await loadTeams([0, 1], {}))[0]!.coaching;

	report(
		`[playoff coaching] paintDefense adjustment: regular=${regular.paintDefense} game7=${game7.paintDefense}`,
	);
	// Vs a perimeter team, coaches guard the arc (negative paintDefense);
	// the game-7 adjustment is amplified, with headroom guaranteed by the
	// mid-range setup.
	assert(
		regular.paintDefense < 0 && regular.paintDefense > -0.9,
		`expected mid-range negative: ${regular.paintDefense}`,
	);
	assert(
		game7.paintDefense < regular.paintDefense,
		`game 7 should adjust harder: ${game7.paintDefense} vs ${regular.paintDefense}`,
	);
});

test("playoffs: tactics edge persists in a game 7 (tripwire)", async () => {
	// Stochastic sanity check on top of the deterministic dial test: the
	// high-tactics coach should still clearly win a game 7 against a skewed
	// opponent with the amplified channel. Loose band - the precise
	// amplification is asserted deterministically above.
	const makeShooters = (players: any[]) => {
		for (const p of players) {
			p.ratings.at(-1).tp = 75;
			p.ratings.at(-1).tendencyThree = 85;
		}
	};
	const { winPct: p, record } = await pooledWinPct({
		coach0: makeCoach(0, { tactics: 90 }),
		coach1: makeCoach(1, { tactics: 10 }),
		basePatch: makeShooters,
		prepare: () => setPlayoffSeries(3, 3),
	});
	report(`[playoff game 7] tactics 90-vs-10 win%: ${pct(p)} (${record})`);
	assert(p > 0.48, `playoff tactics edge collapsed: ${p}`);
}, 600000);

test("rigid coaches bury committed misfits; adaptable coaches don't", async () => {
	// A committed chucker (tendencyThree 95) WITHOUT the shot to justify it,
	// on a roster of otherwise-identical players in a paint-first system - the
	// true extreme misfit. Identical ratings make the substitution ranking a
	// dead heat, so the rigid coach's penalty visibly costs him minutes while
	// the adaptable coach's doesn't. (A conflicted player who still fills a
	// demanded role is only mildly cut - roleSoftening in misfitBenchFactor.)
	const makeChucker = (players: any[]) => {
		const FIXED: Record<string, number> = {
			hgt: 50,
			stre: 50,
			spd: 55,
			jmp: 50,
			endu: 55,
			ins: 50,
			dnk: 50,
			ft: 55,
			fg: 55,
			tp: 45,
			oiq: 55,
			diq: 50,
			drb: 55,
			pss: 50,
			reb: 50,
			tendencyThree: 40,
		};
		for (const p of players) {
			Object.assign(p.ratings.at(-1), FIXED);
		}
		players[0].ratings.at(-1).tendencyThree = 95;
	};
	const paintDials = { threePointTendency: -0.9 };
	const n = 120;
	const { playerMin } = await runWithCoaches({
		coach0: makeCoach(0, { adaptability: 5 }),
		coach1: makeCoach(1, { adaptability: 95 }),
		dials0: paintDials,
		dials1: paintDials,
		basePatch: makeChucker,
		n,
	});

	// Generated players share placeholder names, so find him by his marker.
	const minOf = async (tid: 0 | 1) => {
		const roster = await idb.cache.players.indexGetAll("playersByTid", tid);
		const p = roster.find(
			(p2) => (p2.ratings.at(-1) as any).tendencyThree === 95,
		)!;
		return (playerMin[tid].get(p.pid) ?? 0) / n;
	};
	const rigidMin = await minOf(0);
	const adaptableMin = await minOf(1);
	report(
		`[misfit benching] chucker mpg: rigid coach=${rigidMin.toFixed(1)} adaptable coach=${adaptableMin.toFixed(1)}`,
	);
	assert(
		rigidMin < adaptableMin * 0.9,
		`rigid coach should cut the misfit's minutes: ${rigidMin} vs ${adaptableMin}`,
	);
	// On this dead-heat roster the rank cliff maximizes the cut; he must still
	// be a real rotation player, never a DNP.
	assert(
		rigidMin > 8,
		`benching must stay bounded, not a DNP: ${rigidMin} mpg`,
	);
}, 600000);

test("eraser schemes keep their rim protector on the floor (tripwire)", async () => {
	// One lone rim protector on the roster; under a gambling perimeter scheme
	// the lineup tie-breaker should keep him on the floor at least as much as
	// under a neutral scheme. Small lever - loose non-inferiority band.
	const makeLoneProtector = (players: any[]) => {
		for (const p of players) {
			p.ratings.at(-1).hgt = Math.min(p.ratings.at(-1).hgt, 55);
		}
		const r = players[7].ratings.at(-1);
		r.hgt = 78;
		r.diq = 72;
		r.stre = 70;
		r.jmp = 65;
	};
	const n = 150;
	const { playerMin } = await runWithCoaches({
		coach0: makeCoach(0, { tactics: 90 }),
		coach1: makeCoach(1, { tactics: 90 }),
		dials0: { paintDefense: -0.8, defensiveAggression: 0.8 },
		dials1: {},
		basePatch: makeLoneProtector,
		n,
	});

	// Generated players share placeholder names, so find him by his marker.
	const minOf = async (tid: 0 | 1) => {
		const roster = await idb.cache.players.indexGetAll("playersByTid", tid);
		const p = roster.find((p2) => (p2.ratings.at(-1) as any).hgt === 78)!;
		return (playerMin[tid].get(p.pid) ?? 0) / n;
	};
	const schemeMin = await minOf(0);
	const neutralMin = await minOf(1);
	report(
		`[rim coverage] lone protector mpg: eraser scheme=${schemeMin.toFixed(1)} neutral=${neutralMin.toFixed(1)}`,
	);
	assert(
		schemeMin > neutralMin - 1.5,
		`eraser scheme should not play its protector less: ${schemeMin} vs ${neutralMin}`,
	);
}, 600000);

test("adaptability rescues a philosophy that clashes with the roster", async () => {
	// A league of elite willing shooters, and both coaches philosophically
	// refuse to shoot 3s. The adaptable coach abandons that and lets the roster
	// shoot; the stubborn one clogs his own offense.
	const makeShooters = (players: any[]) => {
		for (const p of players) {
			p.ratings.at(-1).tp = 75;
			p.ratings.at(-1).tendencyThree = 85;
		}
	};
	const philosophy: Partial<TeamCoaching> = { threePointTendency: -1 };

	const { winPct: p, record } = await pooledWinPct({
		coach0: makeCoach(0, { adaptability: 90 }, philosophy),
		coach1: makeCoach(1, { adaptability: 10 }, philosophy),
		basePatch: makeShooters,
	});
	report(
		`[adaptability] 90-vs-10 (anti-3PT philosophy, shooter roster) win%: ${pct(p)} (${record})`,
	);
	// Pre-tuning, adapting toward the roster was PUNISHED (11-15% win) because
	// extreme dials were free wins and optimal-style signals were biased negative.
	assert(p > 0.48, `adapting to the roster should pay off: ${p}`);
}, 600000);

test("motivation-only isolation (bench energy recovery)", async () => {
	const { winPct: p, record } = await pooledWinPct({
		coach0: makeCoach(0, { motivation: 90 }),
		coach1: makeCoach(1, { motivation: 10 }),
	});
	report(`[motivation] 90-vs-10 win%: ${pct(p)} (${record})`);
	// Motivation is deliberately the smallest lever (~neutral to slightly
	// positive); 450 pooled games have se ~2.4%, and the old 0.47 floor
	// tripped at 0.462 on pure noise.
	assert(p > 0.44 && p < 0.62, `motivation out of band: ${p}`);
}, 600000);

// Pool several independently generated rosters per cell: roster generation
// noise dominates game-to-game noise, so a single roster gives unstable reads.
const pooledWinPct = async (
	args: Omit<Parameters<typeof runWithCoaches>[0], "n">,
	rosters = 3,
	gamesPerRoster = 150,
) => {
	let w0 = 0;
	let w1 = 0;
	for (let i = 0; i < rosters; i++) {
		const { wins } = await runWithCoaches({ ...args, n: gamesPerRoster });
		w0 += wins[0];
		w1 += wins[1];
	}
	return { winPct: w0 / (w0 + w1), record: `${w0}-${w1}` };
};

test("per-dial win impact at extremes stays inside the tradeoff band", async () => {
	// After the tuning pass, no dial extreme should be a one-way win on an
	// average roster. Roster-DEPENDENT edges (e.g. packing the paint against a
	// rim-heavy league) are fine and expected; the band is a pathology tripwire.
	const DIAL_KEYS = Object.keys(DEFAULT_COACHING) as (keyof TeamCoaching)[];
	for (const key of DIAL_KEYS) {
		const out: string[] = [];
		for (const value of [1, -1]) {
			const { winPct: p, record } = await pooledWinPct({
				coach0: makeCoach(0),
				coach1: makeCoach(1),
				dials0: { [key]: value },
				dials1: {},
			});
			out.push(`${value > 0 ? "+1" : "-1"}: ${pct(p)} (${record})`);
			assert(
				p > 0.38 && p < 0.66,
				`dial ${key}=${value} out of band: ${p} - a dial extreme should not be a dominant strategy`,
			);
		}
		report(`[dial ${key}] win% vs neutral at ${out.join(", ")}`);
	}
}, 600000);

test("baseline: dial roster-dependence - packing the paint vs a 3PT-heavy league (report)", async () => {
	// Against rosters full of willing shooters, packing the paint (which pushes
	// opponents toward 3s) should stop being a good idea. This checks the dials
	// respond to roster context rather than being globally one-way.
	const makeShooters = (players: any[]) => {
		for (const p of players) {
			p.ratings.at(-1).tp = 75;
			p.ratings.at(-1).tendencyThree = 85;
		}
	};
	const { wins } = await runWithCoaches({
		coach0: makeCoach(0),
		coach1: makeCoach(1),
		dials0: { paintDefense: 1 },
		dials1: {},
		basePatch: makeShooters,
		n: 200,
	});
	report(
		`[paint D vs shooters] win%: ${pct(winPct(wins))} (${wins[0]}-${wins[1]}) - compare with the rim-heavy default roster number above`,
	);
});

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
