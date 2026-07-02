import { assert, test } from "vitest";
import GameSim from "./index.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { range } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import { dial } from "../player/genTendencies.basketball.ts";
import type { TeamCoaching } from "../../../common/types.ts";

// Verification harness: sim many controlled games and measure whether each sim
// lever (coaching dials, player tendencies, chemistry) moves box-score output in
// the intended direction, and whether aggregate output stays realistic.

const PER_TEAM = 13;

const STAT_KEYS = [
	"fg",
	"fga",
	"fgAtRim",
	"fgaAtRim",
	"fgLowPost",
	"fgaLowPost",
	"tp",
	"tpa",
	"ft",
	"fta",
	"orb",
	"drb",
	"ast",
	"tov",
	"stl",
	"blk",
	"pf",
	"pts",
	"fbp",
	"scp",
] as const;

type Totals = Record<(typeof STAT_KEYS)[number], number>;

const emptyTotals = (): Totals =>
	Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Totals;

// Per-player accumulation across games, for tests about stat distribution
// within a team (star usage, assist concentration).
type PlayerAgg = {
	name: string;
	min: number;
	fga: number;
	tpa: number;
	ast: number;
	pts: number;
	onOFga: number; // team FGA while this player was on the court
};

const clonePlayer = (p: any, tid: number) => {
	const c = structuredClone(p);
	c.tid = tid;
	return c;
};

type Patch = (players: any[]) => void;

const patchRatings = (key: string, value: number): Patch => {
	return (players) => {
		for (const p of players) {
			p.ratings.at(-1)![key] = value;
		}
	};
};
const setTendency = patchRatings;
const setRating = patchRatings;

// Build two equal-talent rosters (team 1 is a clone of team 0), apply optional
// per-side patches and coaching dials, sim n games, return summed team totals.
const run = async ({
	patch0,
	patch1,
	coaching0,
	coaching1,
	basePatch,
	n = 40,
}: {
	patch0?: Patch;
	patch1?: Patch;
	coaching0?: Partial<TeamCoaching>;
	coaching1?: Partial<TeamCoaching>;
	basePatch?: Patch;
	n?: number;
}) => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);

	const base = range(PER_TEAM).map((i) => {
		const p: any = player.generate(0, 25, 2010, true, DEFAULT_LEVEL);
		p.rosterOrder = i;
		return p;
	});
	if (basePatch) {
		basePatch(base);
	}

	const players0 = base.map((p) => clonePlayer(p, 0));
	const players1 = base.map((p) => clonePlayer(p, 1));
	patch0?.(players0);
	patch1?.(players1);

	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);
	await resetCache({
		players: [...players0, ...players1],
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});

	// Compute player values so the sim's substitution ranking works (otherwise
	// nobody subs, starters play 48 min exhausted, and shooting craters).
	for (const p of await idb.cache.players.getAll()) {
		await player.updateValues(p);
		await idb.cache.players.put(p);
	}

	for (const [tid, coaching] of [
		[0, coaching0],
		[1, coaching1],
	] as const) {
		if (coaching) {
			const t = await idb.cache.teams.get(tid);
			Object.assign(t!.coaching!, coaching);
			await idb.cache.teams.put(t!);
		}
	}

	const totals = [emptyTotals(), emptyTotals()];
	const players: [Map<number, PlayerAgg>, Map<number, PlayerAgg>] = [
		new Map(),
		new Map(),
	];
	for (let i = 0; i < n; i++) {
		const teams = await loadTeams([0, 1], {});
		const game = new GameSim({
			gid: 0,
			teams: [teams[0]!, teams[1]!] as any,
			baseInjuryRate: 0,
			doPlayByPlay: false,
			homeCourtFactor: 1,
			allStarGame: false,
			neutralSite: true,
		});
		const res: any = game.run();
		for (const t of [0, 1] as const) {
			for (const k of STAT_KEYS) {
				totals[t]![k] += res.team[t].stat[k] ?? 0;
			}
			for (const p of res.team[t].player) {
				let agg = players[t].get(p.id);
				if (!agg) {
					agg = {
						name: p.name,
						min: 0,
						fga: 0,
						tpa: 0,
						ast: 0,
						pts: 0,
						onOFga: 0,
					};
					players[t].set(p.id, agg);
				}
				agg.min += p.stat.min ?? 0;
				agg.fga += p.stat.fga ?? 0;
				agg.tpa += p.stat.tpa ?? 0;
				agg.ast += p.stat.ast ?? 0;
				agg.pts += p.stat.pts ?? 0;
				agg.onOFga += p.stat.onOFga ?? 0;
			}
		}
	}
	return [totals[0]!, totals[1]!, players] as const;
};

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const threePARate = (t: Totals) => ratio(t.tpa, t.fga);
const atRimRate = (t: Totals) => ratio(t.fgaAtRim, t.fga);
const lowPostRate = (t: Totals) => ratio(t.fgaLowPost, t.fga);
const efg = (t: Totals) => ratio(t.fg + 0.5 * t.tp, t.fga);
const atRimPct = (t: Totals) => ratio(t.fgAtRim, t.fgaAtRim);
const possessions = (t: Totals) => t.fga + 0.44 * t.fta + t.tov;
const orbPct = (t: Totals, opp: Totals) => ratio(t.orb, t.orb + opp.drb);
const astRate = (t: Totals) => ratio(t.ast, t.fg);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

// Surfaced by vitest on failure; useful when a directional check trips.
const report = (s: string) => {
	console.log(s);
};

test("coaching: threePointTendency raises 3PA share", async () => {
	const [a, b] = await run({ coaching0: { threePointTendency: 1 } });
	report(
		`[3PT dial] 3PA share: dialed=${pct(threePARate(a))} neutral=${pct(threePARate(b))}`,
	);
	assert(threePARate(a) > threePARate(b) * 1.1);
});

test("coaching: crashOffensiveGlass raises ORB%", async () => {
	const [a, b] = await run({ coaching0: { crashOffensiveGlass: 1 } });
	report(
		`[crash glass] ORB%: dialed=${pct(orbPct(a, b))} neutral=${pct(orbPct(b, a))}`,
	);
	assert(orbPct(a, b) > orbPct(b, a) * 1.05);
});

test("coaching: paintDefense pushes opponent to 3s and lowers their rim FG%", async () => {
	// team 0 packs the paint on defense; team 1 is the offense affected. The rim
	// FG% delta is small (~2pp), so this needs more games than the default 40 to
	// stay clear of sampling noise.
	const [a, b] = await run({ coaching0: { paintDefense: 1 }, n: 120 });
	report(
		`[paint D] opp 3PA share: vsPaint=${pct(threePARate(b))} vsNeutral=${pct(threePARate(a))} | opp rim FG%: vsPaint=${pct(atRimPct(b))} vsNeutral=${pct(atRimPct(a))}`,
	);
	assert(threePARate(b) > threePARate(a) * 1.05);
	assert(atRimPct(b) < atRimPct(a));
});

test("coaching: defensiveAggression forces TOs/blocks/steals at cost of fouls", async () => {
	const [a, b] = await run({ coaching0: { defensiveAggression: 1 } });
	report(
		`[aggression] opp TOV: vsAgg=${b.tov.toFixed(0)} vsNeutral=${a.tov.toFixed(0)} | stl+blk: agg=${(a.stl + a.blk).toFixed(0)} neutral=${(b.stl + b.blk).toFixed(0)} | PF: agg=${a.pf.toFixed(0)} neutral=${b.pf.toFixed(0)}`,
	);
	assert(b.tov > a.tov);
	assert(a.stl + a.blk > b.stl + b.blk);
	assert(a.pf > b.pf);
});

test("coaching: pace raises total possessions", async () => {
	const neutral = await run({});
	const fast = await run({ coaching0: { pace: 1 }, coaching1: { pace: 1 } });
	const pNeutral = possessions(neutral[0]) + possessions(neutral[1]);
	const pFast = possessions(fast[0]) + possessions(fast[1]);
	report(
		`[pace] possessions/40g: neutral=${pNeutral.toFixed(0)} fast=${pFast.toFixed(0)}`,
	);
	assert(pFast > pNeutral * 1.03);
});

test("tendency: three raises 3PA share (equal skill)", async () => {
	const [a, b] = await run({
		patch0: setTendency("tendencyThree", 100),
		patch1: setTendency("tendencyThree", 0),
	});
	report(
		`[tendencyThree] 3PA share: hi=${pct(threePARate(a))} lo=${pct(threePARate(b))}`,
	);
	assert(threePARate(a) > threePARate(b) * 1.2);
});

// The shot-mix tendencies encode target shot shares (tendencyShares.basketball.ts):
// tendencyThree 50 -> 35% 3PA share, 18 -> ~10% (career Larry Bird), 79 -> ~57%
// (peak-era Curry). These tests pin the realized shares to those targets, which
// is the property that makes real players' sim shot mixes match their careers.
test("tendency: three maps to target 3PA share, skill does not inflate volume", async () => {
	// Both teams are elite shooters by skill; only willingness differs. The
	// low-tendency team must stay low volume despite the skill (the Bird case).
	const [bird, curry] = await run({
		basePatch: setRating("tp", 80),
		patch0: setTendency("tendencyThree", 18),
		patch1: setTendency("tendencyThree", 79),
	});
	report(
		`[3PA share targets] tendency 18: ${pct(threePARate(bird))} (target ~10%) | tendency 79: ${pct(threePARate(curry))} (target ~57%)`,
	);
	assert(
		threePARate(bird) > 0.05 && threePARate(bird) < 0.16,
		`Bird-like 3PA share off target: ${threePARate(bird)}`,
	);
	assert(
		threePARate(curry) > 0.48 && threePARate(curry) < 0.67,
		`Curry-like 3PA share off target: ${threePARate(curry)}`,
	);
});

test("tendency: neutral three tendency lands at the neutral 3PA share", async () => {
	const [a, b] = await run({
		patch0: setTendency("tendencyThree", 50),
		patch1: setTendency("tendencyThree", 50),
	});
	const share = ratio(a.tpa + b.tpa, a.fga + b.fga);
	report(`[3PA share targets] tendency 50: ${pct(share)} (target ~35%)`);
	assert(
		share > 0.28 && share < 0.43,
		`neutral 3PA share off target: ${share}`,
	);
});

test("tendency: neutral 2P mix lands at target rim/post shares", async () => {
	const patchMix = (players: any[]) => {
		for (const p of players) {
			p.ratings.at(-1)!.tendencyAtRim = 50;
			p.ratings.at(-1)!.tendencyPost = 50;
		}
	};
	const [a, b] = await run({ patch0: patchMix, patch1: patchMix });
	const rimShare = ratio(a.fgaAtRim + b.fgaAtRim, a.fga + b.fga - a.tpa - b.tpa);
	const postShare = ratio(
		a.fgaLowPost + b.fgaLowPost,
		a.fga + b.fga - a.tpa - b.tpa,
	);
	report(
		`[2P mix targets] rim share of 2PA: ${pct(rimShare)} (target ~40%) | post share: ${pct(postShare)} (target ~10%)`,
	);
	assert(rimShare > 0.33 && rimShare < 0.47, `rim share off: ${rimShare}`);
	assert(postShare > 0.05 && postShare < 0.16, `post share off: ${postShare}`);
});

test("tendency: atRim raises at-rim share (equal skill)", async () => {
	const [a, b] = await run({
		patch0: setTendency("tendencyAtRim", 100),
		patch1: setTendency("tendencyAtRim", 0),
	});
	report(
		`[tendencyAtRim] at-rim share: hi=${pct(atRimRate(a))} lo=${pct(atRimRate(b))}`,
	);
	assert(atRimRate(a) > atRimRate(b));
});

test("tendency: post raises low-post share (equal skill)", async () => {
	const [a, b] = await run({
		patch0: setTendency("tendencyPost", 100),
		patch1: setTendency("tendencyPost", 0),
	});
	report(
		`[tendencyPost] low-post share: hi=${pct(lowPostRate(a))} lo=${pct(lowPostRate(b))}`,
	);
	assert(lowPostRate(a) > lowPostRate(b));
});

test("chemistry: spacing raises eFG at equal shooting skill (report)", async () => {
	// Both rosters have identical (good) shooting skill; only willingness to shoot
	// 3s differs, so only the "spacer" count (synergy) changes.
	const [spaced, clogged] = await run({
		basePatch: setRating("tp", 70),
		patch0: setTendency("tendencyThree", 80),
		patch1: setTendency("tendencyThree", 20),
		n: 80,
	});
	report(
		`[chemistry: spacing] eFG: spaced=${pct(efg(spaced))} clogged=${pct(efg(clogged))} (expect spaced slightly higher)`,
	);
});

test("chemistry: ball-dominance lowers eFG (report)", async () => {
	const [hog, balanced] = await run({
		patch0: setTendency("tendencyUsage", 85),
		patch1: setTendency("tendencyUsage", 50),
		n: 80,
	});
	report(
		`[chemistry: ball-dominance] eFG: allHogs=${pct(efg(hog))} balanced=${pct(efg(balanced))} (expect hogs slightly lower)`,
	);
});

test("tendency: pass first raises assist rate", async () => {
	const [a, b] = await run({
		patch0: setTendency("tendencyPass", 100),
		patch1: setTendency("tendencyPass", 0),
	});
	report(
		`[tendencyPass] assist rate (ast/fg): passFirst=${pct(astRate(a))} neutral=${pct(astRate(b))}`,
	);
	assert(astRate(a) > astRate(b) * 1.05);
});

// Aggregate realism bands, shared by the neutral test and the tendency-noise
// test. Wide bands: catch true pathologies, not era/roster-dependent style.
// (3PA rate spans ~3%-45% historically; these synthetic rosters shoot few 3s.)
const assertRealismBands = (a: Totals, b: Totals, games: number) => {
	const efgAll = efg({
		...a,
		fg: a.fg + b.fg,
		fga: a.fga + b.fga,
		tp: a.tp + b.tp,
	} as Totals);
	const tpaShare = ratio(a.tpa + b.tpa, a.fga + b.fga);
	const ftRate = ratio(a.fta + b.fta, a.fga + b.fga);
	const tovPct = ratio(a.tov + b.tov, possessions(a) + possessions(b));
	const possPerTeamGame = (possessions(a) + possessions(b)) / (2 * games);
	const ptsPerTeamGame = (a.pts + b.pts) / (2 * games);
	const astPerTeamGame = (a.ast + b.ast) / (2 * games);
	const astShareOfMakes = ratio(a.ast + b.ast, a.fg + b.fg);

	report(
		`[realism] eFG=${pct(efgAll)} 3PAshare=${pct(tpaShare)} FTrate=${pct(ftRate)} TOV%=${pct(tovPct)} poss/team/g=${possPerTeamGame.toFixed(1)} pts/team/g=${ptsPerTeamGame.toFixed(1)} ast/team/g=${astPerTeamGame.toFixed(1)} ast/FG=${pct(astShareOfMakes)}`,
	);

	assert(efgAll > 0.44 && efgAll < 0.58, `eFG out of band: ${efgAll}`);
	assert(
		tpaShare > 0.02 && tpaShare < 0.6,
		`3PA share out of band: ${tpaShare}`,
	);
	assert(ftRate > 0.08 && ftRate < 0.4, `FT rate out of band: ${ftRate}`);
	assert(tovPct > 0.08 && tovPct < 0.2, `TOV% out of band: ${tovPct}`);
	assert(
		possPerTeamGame > 80 && possPerTeamGame < 122,
		`possessions out of band: ${possPerTeamGame}`,
	);
	assert(
		ptsPerTeamGame > 85 && ptsPerTeamGame < 135,
		`points out of band: ${ptsPerTeamGame}`,
	);
	// NBA teams average ~22-29 assists/game, ~50-65% of makes assisted.
	assert(
		astPerTeamGame > 16 && astPerTeamGame < 33,
		`assists/game out of band: ${astPerTeamGame}`,
	);
	assert(
		astShareOfMakes > 0.4 && astShareOfMakes < 0.75,
		`assisted share of makes out of band: ${astShareOfMakes}`,
	);
};

test("league realism: neutral aggregates are in believable bands", async () => {
	const [a, b] = await run({ n: 60 });
	assertRealismBands(a, b, 60);
});

test("league realism: derived-with-variation tendencies stay in bands", async () => {
	// Apply the same sigma-7 noise league creation uses in "Historical +
	// variation" mode to every tendency on both rosters; aggregate output must
	// stay realistic (no crazy stat lines from the variation).
	const TENDENCY_KEYS = [
		"tendencyUsage",
		"tendencyThree",
		"tendencyAtRim",
		"tendencyPost",
		"tendencyPass",
		"tendencyClutch",
	];
	const addNoise = (players: any[]) => {
		for (const p of players) {
			const r = p.ratings.at(-1)!;
			for (const k of TENDENCY_KEYS) {
				r[k] = dial(r[k] ?? 50, 7);
			}
		}
	};
	const [a, b] = await run({ patch0: addNoise, patch1: addNoise, n: 60 });
	assertRealismBands(a, b, 60);
});

test("tendency: an elite distributor concentrates team assists realistically", async () => {
	// One clear floor general (high passing skill AND pass-first tendency) among
	// neutral teammates: he should lead the team in assists by a wide margin
	// with a star-but-plausible APG, like a real primary ball handler.
	const makeDistributor = (players: any[]) => {
		const star = players[0].ratings.at(-1)!;
		star.pss = 90;
		star.oiq = 70;
		star.endu = 70;
		star.tendencyPass = 95;
		for (const p of players.slice(1)) {
			p.ratings.at(-1)!.tendencyPass = 40;
		}
	};
	const n = 40;
	const [a, , players] = await run({ patch0: makeDistributor, n });
	const team0 = [...players[0].values()];
	const top = team0.reduce((best, p) => (p.ast > best.ast ? p : best));
	const apg = top.ast / n;
	const mpg = top.min / n;
	const share = ratio(top.ast, a.ast);
	report(
		`[distributor] top passer: ${apg.toFixed(1)} apg in ${mpg.toFixed(1)} mpg, ${pct(share)} of team assists (team ${(a.ast / n).toFixed(1)}/g)`,
	);
	assert(
		share > 0.2 && share < 0.55,
		`assist concentration out of band: ${share}`,
	);
	assert(apg > 4.5 && apg < 13, `star APG out of band: ${apg}`);
});

test("tendency: a ball-dominant star takes star-level, not absurd, volume", async () => {
	// A skilled star among average teammates, with vs without a high usage
	// tendency (a ~33 usg% career derives to ~73). The tendency's own lift must
	// stay in its designed bounded range (it's a +/-50% multiplier at the
	// extremes, so 75-vs-50 is at most ~1.25x), and even with it the star's
	// share of team shots while he's on the court must stay in a plausible
	// alpha-scorer range - the skill funnel on this synthetic roster (one real
	// scorer, twelve equals) is already extreme, and tendency shouldn't turn
	// that into a one-man offense.
	const starSkills = (players: any[]) => {
		const star = players[0].ratings.at(-1)!;
		star.ins = 75;
		star.dnk = 75;
		star.fg = 75;
		star.oiq = 70;
		star.endu = 75;
	};
	const makeStar = (tendencyUsage: number) => (players: any[]) => {
		starSkills(players);
		players[0].ratings.at(-1)!.tendencyUsage = tendencyUsage;
	};
	const n = 40;
	const [, , playersHi] = await run({
		patch0: makeStar(75),
		patch1: makeStar(50),
		n,
	});
	const topOf = (m: Map<number, PlayerAgg>) =>
		[...m.values()].reduce((best, p) => (p.fga > best.fga ? p : best));
	const hi = topOf(playersHi[0]);
	const control = topOf(playersHi[1]);
	const fgaPg = hi.fga / n;
	const mpg = hi.min / n;
	const onCourtShare = ratio(hi.fga, hi.onOFga);
	const controlShare = ratio(control.fga, control.onOFga);
	const lift = ratio(hi.fga, control.fga);
	report(
		`[ball-dominant] tendency 75: ${fgaPg.toFixed(1)} fga/g in ${mpg.toFixed(1)} mpg, ${pct(onCourtShare)} of on-court team FGA | tendency 50 control: ${(control.fga / n).toFixed(1)} fga/g, ${pct(controlShare)} on-court share | lift ${lift.toFixed(2)}x`,
	);
	// Usage tendency 75 encodes ~34 usg% vs the control's 20%, so the expected
	// structural lift is ~1.7x pre-normalization, ~1.3x realized within a
	// lineup. The on-court share cap is the real guardrail: even a maximal-usage
	// star among weak teammates must stay below the all-time real-world range
	// (Jordan/Kobe peaked around 40-45% of on-court shots) - this is the band
	// that catches the "everyone averages 40" pathology.
	assert(lift > 1.1 && lift < 1.55, `usage tendency lift out of band: ${lift}`);
	assert(
		onCourtShare > 0.25 && onCourtShare < 0.5,
		`star on-court FGA share out of band: ${onCourtShare}`,
	);
	assert(
		controlShare > 0.2 && controlShare < 0.42,
		`neutral-tendency star on-court FGA share out of band: ${controlShare}`,
	);
});

// On/off accumulators are recorded for every on-court player on each scoring /
// turnover event, so they satisfy exact identities vs the team box score:
//   sum(onOPts) = N * teamPts;  sum(onOTov) = N * teamTov;
//   sum(pm)     = N * (teamPts - oppPts);  onDPts = onOPts - pm  => sum = N*oppPts
// where N = numPlayersOnCourt. These prove the on-court points-for/against split
// (which drives ORtg/DRtg/TOV% on/off) is recorded correctly.
test("on/off: on-court accumulators reconcile exactly with team totals", async () => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);
	const N = g.get("numPlayersOnCourt");

	const base = range(PER_TEAM).map((i) => {
		const p: any = player.generate(0, 25, 2010, true, DEFAULT_LEVEL);
		p.rosterOrder = i;
		return p;
	});
	const players0 = base.map((p) => clonePlayer(p, 0));
	const players1 = base.map((p) => clonePlayer(p, 1));

	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);
	await resetCache({
		players: [...players0, ...players1],
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});
	for (const p of await idb.cache.players.getAll()) {
		await player.updateValues(p);
		await idb.cache.players.put(p);
	}

	for (let i = 0; i < 5; i++) {
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

		for (const t of [0, 1] as const) {
			const opp = t === 0 ? 1 : 0;
			const teamPts = res.team[t].stat.pts;
			const oppPts = res.team[opp].stat.pts;
			const teamTov = res.team[t].stat.tov;
			const teamFga = res.team[t].stat.fga;
			const teamFta = res.team[t].stat.fta;

			let sumOnOPts = 0;
			let sumOnOTov = 0;
			let sumOnOFga = 0;
			let sumOnOFta = 0;
			let sumPm = 0;
			for (const p of res.team[t].player) {
				sumOnOPts += p.stat.onOPts ?? 0;
				sumOnOTov += p.stat.onOTov ?? 0;
				sumOnOFga += p.stat.onOFga ?? 0;
				sumOnOFta += p.stat.onOFta ?? 0;
				sumPm += p.stat.pm ?? 0;
			}
			const sumOnDPts = sumOnOPts - sumPm;

			assert.equal(sumOnOPts, N * teamPts, "sum(onOPts) = N*teamPts");
			assert.equal(sumOnOTov, N * teamTov, "sum(onOTov) = N*teamTov");
			assert.equal(sumOnOFga, N * teamFga, "sum(onOFga) = N*teamFga");
			assert.equal(sumOnOFta, N * teamFta, "sum(onOFta) = N*teamFta");
			assert.equal(sumPm, N * (teamPts - oppPts), "sum(pm) = N*MOV");
			assert.equal(sumOnDPts, N * oppPts, "sum(onDPts) = N*oppPts");

			// On/off TOV% is an exact split of team TOV% (same denominator), so the
			// team value must lie between each player's on-court and off-court TOV%.
			// This is the property the user expects: team TOV% sits between on/off.
			const tovp = (tov: number, fga: number, fta: number) =>
				(100 * tov) / (fga + 0.44 * fta + tov);
			const teamTovp = tovp(teamTov, teamFga, teamFta);
			for (const p of res.team[t].player) {
				const onTov = p.stat.onOTov ?? 0;
				const onFga = p.stat.onOFga ?? 0;
				const onFta = p.stat.onOFta ?? 0;
				const offFga = teamFga - onFga;
				// Only meaningful when the player has both on- and off-court shot
				// volume (otherwise one side has no possessions).
				if (onFga > 0 && offFga > 0) {
					const onTovp = tovp(onTov, onFga, onFta);
					const offTovp = tovp(teamTov - onTov, offFga, teamFta - onFta);
					const lo = Math.min(onTovp, offTovp) - 1e-9;
					const hi = Math.max(onTovp, offTovp) + 1e-9;
					assert(
						teamTovp >= lo && teamTovp <= hi,
						`team TOV% ${teamTovp} not between on ${onTovp} and off ${offTovp}`,
					);
				}
			}
		}
	}
});
