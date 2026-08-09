import { describe, expect, test } from "vitest";
import type { SoccerTactics } from "../../../common/types.ts";
import { resetG } from "../../../test/helpers.ts";
import GameSim, {
	dribbleAttemptProbability,
	dribbleSuccessProbability,
	dutyFactor,
	staminaAtMinute,
} from "./index.ts";

const positions = [
	"GK",
	"LB",
	"CB",
	"CB",
	"RB",
	"DM",
	"CM",
	"AM",
	"LW",
	"ST",
	"RW",
	"CB",
	"CM",
	"LW",
	"ST",
	"RB",
	"AM",
	"GK",
];

const makeTeam = (tid: number, strength: number) => {
	const players = positions.map((pos, index) => ({
		id: tid * 100 + index,
		name: `Player ${tid}-${index}`,
		pos,
		injured: false,
		stat: {} as Record<string, number>,
		compositeRating: {
			scoring: pos === "ST" ? strength + 0.08 : strength,
			finisher: pos === "ST" ? strength + 0.08 : strength,
			creator: strength,
			dribbler: strength,
			crosser: strength,
			aerial: strength,
			defender: strength,
			goalkeeping: pos === "GK" ? strength : 0.05,
			endurance: strength,
			pace: strength,
		},
		ovrs: { [pos]: Math.round(strength * 100) },
	}));
	const soccerTactics: SoccerTactics = {
		formation: "4-3-3",
		starting: players.slice(0, 11).map((p) => p.id),
		bench: players.slice(11).map((p) => p.id),
		duties: {},
		mentality: 0,
		tempo: 0,
		pressing: 0,
		defensiveLine: 0,
		width: 0,
		directness: 0,
		transition: 0,
		marking: 0,
		substitutionTiming: 0,
	};
	return {
		id: tid,
		stat: {},
		player: players,
		soccerTactics,
	};
};

describe("soccer game simulation", () => {
	test("applies player duties to the intended phase of play", () => {
		const p = { id: 9 } as any;
		const attacking = { duties: { 9: "attack" } } as any;
		const defending = { duties: { 9: "defend" } } as any;
		expect(dutyFactor(attacking, p, "attack")).toBeGreaterThan(
			dutyFactor(defending, p, "attack"),
		);
		expect(dutyFactor(defending, p, "defense")).toBeGreaterThan(
			dutyFactor(attacking, p, "defense"),
		);
	});

	test("bases dribble decisions and outcomes on skill, matchup, role, and fatigue", () => {
		const eliteWinger = makeTeam(0, 0.9).player[8]!;
		const limitedDefender = makeTeam(1, 0.45).player[1]!;
		const eliteDefender = makeTeam(1, 0.9).player[1]!;
		const limitedCentreBack = makeTeam(0, 0.45).player[2]!;
		const tactics = makeTeam(0, 0.7).soccerTactics;

		expect(dribbleAttemptProbability(eliteWinger, tactics, 1)).toBeGreaterThan(
			dribbleAttemptProbability(limitedCentreBack, tactics, 1),
		);
		expect(dribbleAttemptProbability(eliteWinger, tactics, 1)).toBeGreaterThan(
			dribbleAttemptProbability(eliteWinger, tactics, 0.65),
		);
		expect(
			dribbleSuccessProbability({
				attacker: eliteWinger,
				defender: limitedDefender,
			}),
		).toBeGreaterThan(
			dribbleSuccessProbability({
				attacker: eliteWinger,
				defender: eliteDefender,
			}),
		);
	});

	test("uses substitutes and keeps player and team totals consistent", () => {
		resetG();
		const result = new GameSim({
			gid: 1,
			teams: [makeTeam(0, 0.72), makeTeam(1, 0.67)],
			doPlayByPlay: true,
			homeCourtFactor: 1,
			allStarGame: false,
			baseInjuryRate: 0,
			neutralSite: false,
		}).run();

		for (const team of result.team) {
			const participants = team.player.filter((p) => p.stat.gp === 1);
			expect(participants.length).toBeGreaterThanOrEqual(14);
			expect(participants.length).toBeLessThanOrEqual(16);
			const teamMinutes = participants.reduce(
				(total, p) => total + (p.stat.min ?? 0),
				0,
			);
			expect(teamMinutes).toBeLessThanOrEqual(990);
			expect(teamMinutes).toBeGreaterThan(850);
			expect(
				participants.reduce((total, p) => total + (p.stat.g ?? 0), 0),
			).toBe(team.stat.g);
			expect(
				participants.reduce((total, p) => total + (p.stat.a ?? 0), 0),
			).toBe(team.stat.a);
			expect(Number.isFinite(team.stat.xg)).toBe(true);
			expect(Number.isFinite(team.stat.pas)).toBe(true);
		}
		expect(
			result.playByPlay?.some((event) => event.type === "substitution"),
		).toBe(true);
	});

	test("replaces an unavailable starter without shifting later formation slots", () => {
		resetG();
		const teams = [makeTeam(0, 0.72), makeTeam(1, 0.67)] as any;
		const originalLeftBack = teams[0].player[1];
		const originalStriker = teams[0].player[9];
		originalLeftBack.injured = true;
		originalLeftBack.injury = { gamesRemaining: 2 };

		const result = new GameSim({
			gid: 2,
			teams,
			doPlayByPlay: true,
			homeCourtFactor: 1,
			allStarGame: false,
			baseInjuryRate: 0,
			neutralSite: false,
		}).run();
		const init = result.playByPlay?.find(
			(event) => event.type === "init",
		) as any;

		expect(init.lineups[0][1]).not.toBe(originalLeftBack.id);
		expect(init.lineups[0][9]).toBe(originalStriker.id);
	});

	test("keeps every team total consistent with its player totals", () => {
		resetG();
		for (let game = 0; game < 25; game++) {
			const result = new GameSim({
				gid: game,
				teams: [makeTeam(0, 0.74), makeTeam(1, 0.65)],
				doPlayByPlay: false,
				homeCourtFactor: 1,
				allStarGame: false,
				baseInjuryRate: 0,
				neutralSite: false,
			}).run();

			for (const team of result.team) {
				const participants = team.player.filter((p) => p.stat.gp === 1);
				const sum = (stat: string) =>
					participants.reduce((total, p) => total + (p.stat[stat] ?? 0), 0);
				expect(team.stat.g).toBe(sum("g"));
				expect(team.stat.a).toBe(sum("a"));
				expect(team.stat.sh).toBe(sum("sh"));
				expect(team.stat.sot).toBe(sum("sot"));
				expect(team.stat.pas).toBe(sum("pas"));
				expect(team.stat.pasCmp).toBe(sum("pasCmp"));
				expect(team.stat.drbAtt).toBe(sum("drbAtt"));
				expect(team.stat.drbCmp).toBe(sum("drbCmp"));
				expect(team.stat.prgP).toBe(sum("prgP"));
				expect(team.stat.prgC).toBe(sum("prgC"));
				expect(team.stat.crs).toBe(sum("crs"));
				expect(team.stat.crsCmp).toBe(sum("crsCmp"));
				expect(team.stat.recov).toBe(sum("recov"));
				expect(team.stat.prs).toBe(sum("prs"));
				expect(team.stat.prsWon).toBe(sum("prsWon"));
				expect(team.stat.blk).toBe(sum("blk"));
				expect(team.stat.penA).toBe(sum("penA"));
				expect(team.stat.penG).toBe(sum("penG"));
				expect(team.stat.penM).toBe(sum("penM"));
				expect(team.stat.psxg).toBeCloseTo(sum("psxg"), 10);
				expect(team.stat.gkClaims).toBe(sum("gkClaims"));
				expect(team.stat.fl).toBe(sum("fl"));
				expect(team.stat.yc).toBe(sum("yc"));
				expect(team.stat.rc).toBe(sum("rc"));
				expect(team.stat.xg).toBeCloseTo(sum("xg"), 10);
				expect(team.stat.g).toBeLessThanOrEqual(team.stat.sot);
				expect(team.stat.sot).toBeLessThanOrEqual(team.stat.sh);
				expect(team.stat.pasCmp).toBeLessThanOrEqual(team.stat.pas);
				expect(team.stat.drbCmp).toBeLessThanOrEqual(team.stat.drbAtt);
				expect(team.stat.crsCmp).toBeLessThanOrEqual(team.stat.crs);
				expect(team.stat.penA).toBe(team.stat.penG + team.stat.penM);
			}
			expect(result.team[0].stat.tkl).toBe(
				result.team[1].stat.drbAtt - result.team[1].stat.drbCmp,
			);
			expect(result.team[1].stat.tkl).toBe(
				result.team[0].stat.drbAtt - result.team[0].stat.drbCmp,
			);
			expect(result.team[0].stat.pos + result.team[1].stat.pos).toBe(90);
			expect(result.team[0].stat.sv).toBe(
				result.team[1].stat.sot - result.team[1].stat.g,
			);
			expect(result.team[1].stat.sv).toBe(
				result.team[0].stat.sot - result.team[0].stat.g,
			);
		}
	});

	test("produces plausible league-level match statistics", () => {
		resetG();
		let goals = 0;
		let shots = 0;
		let passes = 0;
		let fouls = 0;
		let dribblesAttempted = 0;
		let dribblesCompleted = 0;
		let crosses = 0;
		let progressivePasses = 0;
		let pressures = 0;
		let penalties = 0;
		const games = 250;
		for (let game = 0; game < games; game++) {
			const result = new GameSim({
				gid: game,
				teams: [makeTeam(0, 0.69), makeTeam(1, 0.69)],
				doPlayByPlay: false,
				homeCourtFactor: 1,
				allStarGame: false,
				baseInjuryRate: 0,
				neutralSite: false,
			}).run();
			for (const team of result.team) {
				goals += team.stat.g;
				shots += team.stat.sh;
				passes += team.stat.pas;
				fouls += team.stat.fl;
				dribblesAttempted += team.stat.drbAtt;
				dribblesCompleted += team.stat.drbCmp;
				crosses += team.stat.crs;
				progressivePasses += team.stat.prgP;
				pressures += team.stat.prs;
				penalties += team.stat.penA;
			}
		}
		const teamGames = games * 2;
		expect(goals / games).toBeGreaterThan(1.8);
		expect(goals / games).toBeLessThan(4);
		expect(shots / teamGames).toBeGreaterThan(8);
		expect(shots / teamGames).toBeLessThan(18);
		expect(passes / teamGames).toBeGreaterThan(320);
		expect(passes / teamGames).toBeLessThan(620);
		expect(fouls / teamGames).toBeGreaterThan(7);
		expect(fouls / teamGames).toBeLessThan(15);
		expect(dribblesAttempted / teamGames).toBeGreaterThan(8);
		expect(dribblesAttempted / teamGames).toBeLessThan(28);
		expect(dribblesCompleted / dribblesAttempted).toBeGreaterThan(0.35);
		expect(dribblesCompleted / dribblesAttempted).toBeLessThan(0.65);
		expect(crosses / teamGames).toBeGreaterThan(5);
		expect(crosses / teamGames).toBeLessThan(20);
		expect(progressivePasses / teamGames).toBeGreaterThan(20);
		expect(progressivePasses / teamGames).toBeLessThan(100);
		expect(pressures / teamGames).toBeGreaterThan(80);
		expect(pressures / teamGames).toBeLessThan(170);
		expect(penalties / games).toBeGreaterThan(0.08);
		expect(penalties / games).toBeLessThan(0.5);
	});

	test("turns a clear ratings advantage into a clear results advantage", () => {
		resetG();
		let strongerWins = 0;
		let weakerWins = 0;
		const games = 300;
		for (let game = 0; game < games; game++) {
			const result = new GameSim({
				gid: game,
				teams: [makeTeam(0, 0.82), makeTeam(1, 0.55)],
				doPlayByPlay: false,
				homeCourtFactor: 1,
				allStarGame: false,
				baseInjuryRate: 0,
				neutralSite: true,
			}).run();
			if (result.team[0].stat.g > result.team[1].stat.g) {
				strongerWins += 1;
			}
			if (result.team[1].stat.g > result.team[0].stat.g) {
				weakerWins += 1;
			}
		}
		expect(strongerWins / games).toBeGreaterThan(0.58);
		expect(strongerWins).toBeGreaterThan(weakerWins * 2);
	});

	test("drains stamina based on endurance, minutes, and tactical intensity", () => {
		const lowEndurance = makeTeam(0, 0.45).player[1]!;
		const highEndurance = makeTeam(0, 0.85).player[1]!;
		const appearance = { p: lowEndurance, start: 0, starter: true };
		const balanced = makeTeam(0, 0.7).soccerTactics;
		const intense = { ...balanced, tempo: 2, pressing: 2 } as SoccerTactics;

		const balancedStamina = staminaAtMinute(
			lowEndurance,
			appearance,
			90,
			balanced,
		);
		const intenseStamina = staminaAtMinute(
			lowEndurance,
			appearance,
			90,
			intense,
		);
		const highEnduranceStamina = staminaAtMinute(
			highEndurance,
			{ ...appearance, p: highEndurance },
			90,
			balanced,
		);

		expect(intenseStamina).toBeLessThan(balancedStamina);
		expect(highEnduranceStamina).toBeGreaterThan(balancedStamina);
	});

	test("generates match injuries and replaces injured players", () => {
		resetG();
		const result = new GameSim({
			gid: 99,
			teams: [makeTeam(0, 0.7), makeTeam(1, 0.7)],
			doPlayByPlay: true,
			homeCourtFactor: 1,
			allStarGame: false,
			baseInjuryRate: 0.2,
			neutralSite: false,
		}).run();
		expect(
			result.team.some((team) => team.player.some((p) => p.newInjury)),
		).toBe(true);
		expect(result.playByPlay?.some((event) => event.type === "injury")).toBe(
			true,
		);
	});

	test("honors early and late substitution instructions", () => {
		resetG();
		const run = (timing: -1 | 1) => {
			const teams = [makeTeam(0, 0.7), makeTeam(1, 0.7)] as any;
			teams[0].soccerTactics.substitutionTiming = timing;
			teams[1].soccerTactics.substitutionTiming = timing;
			return new GameSim({
				gid: timing,
				teams,
				doPlayByPlay: true,
				homeCourtFactor: 1,
				allStarGame: false,
				baseInjuryRate: 0,
				neutralSite: false,
			}).run();
		};
		const firstSubMinute = (result: any) =>
			Math.min(
				...result.playByPlay
					.filter(
						(event: any) => event.type === "substitution" && event.t === 0,
					)
					.map((event: any) => 90 - event.clock),
			);

		expect(firstSubMinute(run(-1))).toBe(51);
		expect(firstSubMinute(run(1))).toBe(65);
	});
});
