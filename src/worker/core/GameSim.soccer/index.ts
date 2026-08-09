import { FORMATIONS } from "../../../common/constants.soccer.ts";
import type {
	SoccerFormation,
	SoccerTactics,
	TeamNum,
} from "../../../common/types.ts";
import { recoverSoccerFitness } from "../../../common/soccer/fitness.ts";
import { optimizeSoccerLineup } from "../../../common/soccer/lineup.ts";
import getInjuryRate from "../GameSim.basketball/getInjuryRate.ts";
import GameSimBase from "../GameSim/GameSimBase.ts";

type SimPlayer = {
	id: number;
	name: string;
	pos: string;
	matchPos?: string;
	age?: number;
	fitness?: number;
	fitnessEnd?: number;
	lastMatchDay?: number;
	injured: boolean;
	newInjury?: boolean;
	injury?: {
		gamesRemaining: number;
		playingThrough?: boolean;
		[key: string]: any;
	};
	stat: Record<string, number>;
	compositeRating?: Record<string, number>;
	ovrs: Record<string, number>;
	[key: string]: any;
};

type SimTeam = {
	id: number;
	stat: Record<string, any>;
	player: SimPlayer[];
	soccerTactics?: SoccerTactics;
	[key: string]: any;
};

type Appearance = {
	p: SimPlayer;
	start: number;
	end?: number;
	starter: boolean;
};

type MatchState = {
	active: SimPlayer[];
	appearances: Appearance[];
	bench: SimPlayer[];
	plannedSubIndex: number;
	subMinutes: number[];
	subsUsed: number;
	targetSubs: number;
};

type Strengths = {
	attack: number;
	control: number;
	defense: number;
};

const poisson = (mean: number) => {
	const limit = Math.exp(-Math.max(0, mean));
	let product = 1;
	let count = 0;
	while (product > limit && count < 30) {
		count += 1;
		product *= Math.random();
	}
	return Math.max(0, count - 1);
};

const weightedChoice = (
	players: SimPlayer[],
	weight: (p: SimPlayer) => number,
) => {
	const weights = players.map((p) => Math.max(0.01, weight(p)));
	let value =
		Math.random() * weights.reduce((sum, current) => sum + current, 0);
	for (let i = 0; i < players.length; i++) {
		value -= weights[i]!;
		if (value <= 0) {
			return players[i]!;
		}
	}
	return players.at(-1)!;
};

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

const rating = (p: SimPlayer, key: string, fallback = 0.5) =>
	p.compositeRating?.[key] ?? fallback;

const position = (p: SimPlayer) => p.matchPos ?? p.pos;
const isDefender = (p: SimPlayer) =>
	["CB", "LB", "RB", "DM"].includes(position(p));
const isMidfielder = (p: SimPlayer) =>
	["DM", "CM", "AM", "LW", "RW"].includes(position(p));
const isAttacker = (p: SimPlayer) =>
	["AM", "LW", "RW", "ST"].includes(position(p));
const isWide = (p: SimPlayer) => ["LB", "RB", "LW", "RW"].includes(position(p));

const addStat = (team: SimTeam, p: SimPlayer, stat: string, amount = 1) => {
	p.stat[stat] = (p.stat[stat] ?? 0) + amount;
	team.stat[stat] = (team.stat[stat] ?? 0) + amount;
};

export const dribbleAttemptProbability = (
	p: SimPlayer,
	tactics: SoccerTactics | undefined,
	performance = 1,
) =>
	clamp(
		0.055 +
			rating(p, "dribbler") * 0.135 +
			(isAttacker(p) ? 0.035 : isDefender(p) ? -0.025 : 0) +
			(isWide(p) ? Math.max(0, tactics?.width ?? 0) * 0.012 : 0) +
			Math.max(0, tactics?.transition ?? 0) * 0.009 +
			(tactics?.tempo ?? 0) * 0.006 +
			(performance - 0.8) * 0.08,
		0.035,
		0.3,
	);

export const dribbleSuccessProbability = ({
	attacker,
	attackerPerformance = 1,
	defender,
	defenderPerformance = 1,
	opponentTactics,
}: {
	attacker: SimPlayer;
	attackerPerformance?: number;
	defender: SimPlayer;
	defenderPerformance?: number;
	opponentTactics?: SoccerTactics;
}) =>
	clamp(
		0.48 +
			(rating(attacker, "dribbler") * attackerPerformance -
				rating(defender, "defender") * defenderPerformance) *
				0.38 +
			(rating(attacker, "pace") * attackerPerformance -
				rating(defender, "pace") * defenderPerformance) *
				0.12 -
			(opponentTactics?.pressing ?? 0) * 0.012,
		0.25,
		0.74,
	);

export const dutyFactor = (
	tactics: SoccerTactics | undefined,
	p: SimPlayer,
	area: "attack" | "control" | "defense",
) => {
	const duty = tactics?.duties?.[p.id] ?? "support";
	if (area === "attack") {
		return duty === "attack" ? 1.1 : duty === "defend" ? 0.91 : 1.01;
	}
	if (area === "defense") {
		return duty === "defend" ? 1.09 : duty === "attack" ? 0.92 : 1.01;
	}
	return duty === "support" ? 1.05 : 0.98;
};

const tacticalIntensity = (tactics: SoccerTactics | undefined) =>
	clamp(
		1 +
			(tactics?.tempo ?? 0) * 0.07 +
			(tactics?.pressing ?? 0) * 0.1 +
			Math.max(0, tactics?.transition ?? 0) * 0.04,
		0.72,
		1.42,
	);

const selectXI = (team: SimTeam) => {
	const healthy = team.player.filter((p) => !p.injured);
	const available = healthy.length >= 11 ? healthy : team.player;
	const byId = new Map(available.map((p) => [p.id, p]));
	const formation = team.soccerTactics?.formation ?? "4-3-3";
	const slots = FORMATIONS[formation as SoccerFormation] ?? FORMATIONS["4-3-3"];
	const lineupIds = optimizeSoccerLineup({
		candidates: available.map((p) => ({
			id: p.id,
			naturalPosition: p.pos,
			positionRatings: p.ovrs ?? {},
			availability: 0.82 + 0.18 * (p.fitness ?? 1),
		})),
		locked: team.soccerTactics?.starting,
		slots,
	});
	return lineupIds.flatMap((id) => {
		const p = byId.get(id);
		return p ? [p] : [];
	});
};

const createMatchState = (team: SimTeam, starters: SimPlayer[]): MatchState => {
	const used = new Set(starters.map((p) => p.id));
	const healthy = team.player.filter((p) => !p.injured && !used.has(p.id));
	const byId = new Map(healthy.map((p) => [p.id, p]));
	const bench: SimPlayer[] = [];
	for (const pid of team.soccerTactics?.bench ?? []) {
		const p = byId.get(pid);
		if (p) {
			bench.push(p);
			byId.delete(pid);
		}
	}
	if (bench.length < 9) {
		bench.push(...Array.from(byId.values()).slice(0, 9 - bench.length));
	}

	const intensity = tacticalIntensity(team.soccerTactics);
	const availableOutfield = bench.filter((p) => p.pos !== "GK").length;
	const targetSubs = Math.min(
		availableOutfield,
		3 +
			(Math.random() < 0.6 + Math.max(0, intensity - 1) * 0.35 ? 1 : 0) +
			(Math.random() < 0.25 + Math.max(0, intensity - 1) * 0.45 ? 1 : 0),
	);
	const timingShift = (team.soccerTactics?.substitutionTiming ?? 0) * 7;
	const subMinutes = [58, 65, 72, 79, 85].map((minute) =>
		clamp(minute + timingShift, 46, 88),
	);

	return {
		active: [...starters],
		appearances: starters.map((p) => ({
			p,
			start: 0,
			starter: true,
		})),
		bench,
		plannedSubIndex: 0,
		subMinutes,
		subsUsed: 0,
		targetSubs,
	};
};

const getAppearance = (state: MatchState, p: SimPlayer) =>
	state.appearances.find(
		(appearance) => appearance.p.id === p.id && appearance.end === undefined,
	);

export const staminaAtMinute = (
	p: SimPlayer,
	appearance: Appearance,
	minute: number,
	tactics: SoccerTactics | undefined,
) => {
	const elapsed = clamp(minute - appearance.start, 0, 90);
	const endurance = rating(p, "endurance");
	const duty = tactics?.duties?.[p.id] ?? "support";
	const dutyLoad = duty === "support" ? 1 : 1.035;
	const drain =
		(elapsed / 90) *
		(0.34 - endurance * 0.16) *
		tacticalIntensity(tactics) *
		dutyLoad;
	return clamp((p.fitness ?? 1) - drain, 0.35, 1);
};

const playerPerformance = (
	state: MatchState,
	p: SimPlayer,
	minute: number,
	tactics: SoccerTactics | undefined,
) => {
	const appearance = getAppearance(state, p);
	const stamina = appearance
		? staminaAtMinute(p, appearance, minute, tactics)
		: (p.fitness ?? 1);
	return 0.55 + stamina * 0.45;
};

const weightedAverage = (
	players: SimPlayer[],
	filter: (p: SimPlayer) => boolean,
	value: (p: SimPlayer) => number,
) => {
	const selected = players.filter(filter);
	const pool = selected.length > 0 ? selected : players;
	return pool.reduce((sum, p) => sum + value(p), 0) / Math.max(1, pool.length);
};

const calculateStrengths = (
	state: MatchState,
	minute: number,
	tactics: SoccerTactics | undefined,
): Strengths => {
	const players = state.active;
	if (players.length === 0) {
		return { attack: 0.05, control: 0.05, defense: 0.05 };
	}
	const effective = (p: SimPlayer, key: string, fallback = 0.5) =>
		rating(p, key, fallback) * playerPerformance(state, p, minute, tactics);
	const attack = weightedAverage(
		players,
		isAttacker,
		(p) =>
			dutyFactor(tactics, p, "attack") *
			(0.5 * effective(p, "scoring") +
				0.28 * effective(p, "creator") +
				0.22 * effective(p, "dribbler")),
	);
	const midfield = weightedAverage(
		players,
		isMidfielder,
		(p) =>
			dutyFactor(tactics, p, "control") *
			(0.52 * effective(p, "creator") +
				0.25 * effective(p, "dribbler") +
				0.23 * effective(p, "endurance")),
	);
	const defending = weightedAverage(
		players,
		isDefender,
		(p) =>
			dutyFactor(tactics, p, "defense") *
			(0.72 * effective(p, "defender") +
				0.16 * effective(p, "pace") +
				0.12 * effective(p, "aerial")),
	);
	const keeper = players.find((p) => position(p) === "GK") ?? players[0];
	const manpower = players.length / 11;
	return {
		attack:
			(attack +
				(tactics?.mentality ?? 0) * 0.018 +
				(tactics?.tempo ?? 0) * 0.008 +
				(tactics?.directness ?? 0) * 0.005 +
				(tactics?.transition ?? 0) * 0.008) *
			manpower,
		defense:
			(defending * 0.76 +
				effective(keeper!, "goalkeeping") * 0.24 +
				(tactics?.pressing ?? 0) * 0.009 +
				(tactics?.defensiveLine ?? 0) * -0.003 +
				(tactics?.marking ?? 0) * 0.008 -
				(tactics?.transition ?? 0) * 0.005 -
				(tactics?.mentality ?? 0) * 0.011) *
			manpower,
		control:
			(midfield +
				(tactics?.pressing ?? 0) * 0.01 +
				(tactics?.width ?? 0) * 0.004 +
				(tactics?.defensiveLine ?? 0) * 0.006 -
				Math.abs(tactics?.directness ?? 0) * 0.005 -
				Math.max(0, tactics?.transition ?? 0) * 0.005) *
			manpower,
	};
};

const initializeAppearance = (p: SimPlayer, starter: boolean) => {
	p.stat.gp = 1;
	p.stat.gs = starter ? 1 : (p.stat.gs ?? 0);
};

const finishAppearance = (state: MatchState, p: SimPlayer, minute: number) => {
	const appearance = getAppearance(state, p);
	if (appearance) {
		appearance.end = minute;
	}
	state.active = state.active.filter((active) => active.id !== p.id);
};

const chooseReplacement = (state: MatchState, outgoing: SimPlayer) => {
	const candidates = state.bench.filter((p) =>
		position(outgoing) === "GK" ? p.pos === "GK" : p.pos !== "GK",
	);
	if (candidates.length === 0) {
		return;
	}
	return candidates.toSorted((a, b) => {
		const aScore =
			(a.ovrs?.[position(outgoing)] ??
				Math.max(...Object.values(a.ovrs ?? { x: 0 }))) *
			(0.78 + 0.22 * (a.fitness ?? 1));
		const bScore =
			(b.ovrs?.[position(outgoing)] ??
				Math.max(...Object.values(b.ovrs ?? { x: 0 }))) *
			(0.78 + 0.22 * (b.fitness ?? 1));
		return bScore - aScore;
	})[0];
};

const performSubstitution = (
	state: MatchState,
	t: TeamNum,
	minute: number,
	tactics: SoccerTactics | undefined,
	events: any[],
	forcedOutgoing?: SimPlayer,
) => {
	if (state.subsUsed >= 5) {
		if (forcedOutgoing) {
			finishAppearance(state, forcedOutgoing, minute);
		}
		return false;
	}
	const outfield = state.active.filter((p) => position(p) !== "GK");
	const outgoing =
		forcedOutgoing ??
		outfield.toSorted((a, b) => {
			const appearanceA = getAppearance(state, a)!;
			const appearanceB = getAppearance(state, b)!;
			const scoreA =
				staminaAtMinute(a, appearanceA, minute, tactics) * 0.7 +
				(a.ovrs?.[position(a)] ?? 50) * 0.003;
			const scoreB =
				staminaAtMinute(b, appearanceB, minute, tactics) * 0.7 +
				(b.ovrs?.[position(b)] ?? 50) * 0.003;
			return scoreA - scoreB;
		})[0];
	if (!outgoing) {
		return false;
	}
	const incoming = chooseReplacement(state, outgoing);
	if (!incoming) {
		if (forcedOutgoing) {
			finishAppearance(state, outgoing, minute);
		}
		return false;
	}

	finishAppearance(state, outgoing, minute);
	outgoing.stat.subOut = (outgoing.stat.subOut ?? 0) + 1;
	state.bench = state.bench.filter((p) => p.id !== incoming.id);
	incoming.matchPos = position(outgoing);
	state.active.push(incoming);
	state.appearances.push({
		p: incoming,
		start: minute,
		starter: false,
	});
	initializeAppearance(incoming, false);
	incoming.stat.subIn = (incoming.stat.subIn ?? 0) + 1;
	state.subsUsed += 1;
	events.push({
		type: "substitution",
		clock: 90 - minute,
		quarter: minute <= 45 ? 1 : 2,
		t,
		names: [incoming.name, outgoing.name],
		pids: [incoming.id, outgoing.id],
	});
	return true;
};

const addDefensiveAction = (
	state: MatchState,
	team: SimTeam,
	type: "int" | "tkl" | "clr" | "blk",
) => {
	if (state.active.length === 0) {
		return;
	}
	const defender = weightedChoice(
		state.active,
		(p) =>
			(0.2 + rating(p, "defender", 0.4) ** 2) * (isDefender(p) ? 1.8 : 0.65),
	);
	addStat(team, defender, type);
	return defender;
};

class GameSim extends GameSimBase {
	team: [SimTeam, SimTeam];
	doPlayByPlay: boolean;
	homeCourtFactor: number;

	constructor({
		gid,
		day,
		teams,
		doPlayByPlay,
		homeCourtFactor,
		allStarGame,
		baseInjuryRate,
		neutralSite,
	}: {
		gid: number;
		day?: number;
		teams: [SimTeam, SimTeam];
		doPlayByPlay: boolean;
		homeCourtFactor: number;
		allStarGame: boolean;
		baseInjuryRate: number;
		neutralSite: boolean;
	}) {
		super({ gid, day, allStarGame, baseInjuryRate, neutralSite });
		this.team = teams;
		this.doPlayByPlay = doPlayByPlay;
		this.homeCourtFactor = homeCourtFactor;
	}

	run() {
		for (const team of this.team) {
			for (const p of team.player) {
				if (
					typeof this.day === "number" &&
					typeof p.lastMatchDay === "number"
				) {
					p.fitness = recoverSoccerFitness({
						day: this.day,
						endurance: rating(p, "endurance"),
						fitness: p.fitness,
						lastMatchDay: p.lastMatchDay,
					});
				}
			}
		}
		const lineups = this.team.map(selectXI) as [SimPlayer[], SimPlayer[]];
		for (const t of [0, 1] as TeamNum[]) {
			const formation = this.team[t].soccerTactics?.formation ?? "4-3-3";
			const slots =
				FORMATIONS[formation as SoccerFormation] ?? FORMATIONS["4-3-3"];
			for (const [index, p] of lineups[t].entries()) {
				p.matchPos = slots[index] ?? p.pos;
			}
		}
		const states = this.team.map((team, t) =>
			createMatchState(team, lineups[t]!),
		) as [MatchState, MatchState];
		const events: any[] = [];
		const scoringSummary: any[] = [];
		const homeBonus = this.neutralSite ? 0 : 0.025 * this.homeCourtFactor;

		for (const t of [0, 1] as TeamNum[]) {
			Object.assign(this.team[t].stat, {
				pts: 0,
				min: 90,
				g: 0,
				a: 0,
				sh: 0,
				sot: 0,
				xg: 0,
				pos: 0,
				pas: 0,
				pasCmp: 0,
				drbAtt: 0,
				drbCmp: 0,
				prgP: 0,
				prgC: 0,
				crs: 0,
				crsCmp: 0,
				recov: 0,
				possLost: 0,
				prs: 0,
				prsWon: 0,
				tkl: 0,
				int: 0,
				clr: 0,
				blk: 0,
				fouled: 0,
				off: 0,
				penG: 0,
				penA: 0,
				penM: 0,
				penWon: 0,
				penCon: 0,
				psxg: 0,
				gkClaims: 0,
				cor: 0,
				fl: 0,
				yc: 0,
				rc: 0,
				sv: 0,
				ptsQtrs: [0, 0],
			});
			for (const p of this.team[t].player) {
				p.stat.gp = 0;
				p.stat.gs = 0;
				p.stat.min = 0;
			}
			for (const p of lineups[t]) {
				initializeAppearance(p, true);
			}
		}

		const recordGoal = ({
			assister,
			keeper,
			minute,
			penalty = false,
			shooter,
			t,
		}: {
			assister?: SimPlayer;
			keeper?: SimPlayer;
			minute: number;
			penalty?: boolean;
			shooter: SimPlayer;
			t: TeamNum;
		}) => {
			addStat(this.team[t], shooter, "g");
			this.team[t].stat.pts += 1;
			this.team[t].stat.ptsQtrs[minute <= 45 ? 0 : 1] += 1;
			if (penalty) {
				addStat(this.team[t], shooter, "penG");
			}
			if (keeper) {
				keeper.stat.ga = (keeper.stat.ga ?? 0) + 1;
			}
			if (assister && !penalty) {
				addStat(this.team[t], assister, "a");
			}
			const event = {
				type: "goal",
				clock: 90 - minute,
				quarter: minute <= 45 ? 1 : 2,
				t,
				names: assister ? [shooter.name, assister.name] : [shooter.name],
				pids: assister ? [shooter.id, assister.id] : [shooter.id],
				goalType: penalty ? "penalty" : "ev",
				shotType: penalty ? "penalty" : "shot",
				totalGA: undefined,
			};
			scoringSummary.push(event);
			if (this.doPlayByPlay) {
				events.push(event);
			}
		};

		for (let minute = 1; minute <= 90; minute++) {
			for (const t of [0, 1] as TeamNum[]) {
				const state = states[t];
				while (
					state.plannedSubIndex < state.targetSubs &&
					state.subMinutes[state.plannedSubIndex] === minute
				) {
					state.plannedSubIndex += 1;
					performSubstitution(
						state,
						t,
						minute,
						this.team[t].soccerTactics,
						events,
					);
				}
				for (const p of state.active) {
					p.stat.min = (p.stat.min ?? 0) + 1;
				}
			}

			const strengths = states.map((state, t) =>
				calculateStrengths(
					state,
					minute,
					this.team[t as TeamNum].soccerTactics,
				),
			) as [Strengths, Strengths];
			const possession0 = clamp(
				0.5 + (strengths[0].control - strengths[1].control) * 0.33 + homeBonus,
				0.34,
				0.66,
			);
			const possessionTeam: TeamNum = Math.random() < possession0 ? 0 : 1;
			this.team[possessionTeam].stat.pos += 1;

			// Two possession sequences per minute produces realistic pass volume while
			// keeping every attacking and defensive action tied to the team with the ball.
			for (let sequence = 0; sequence < 2; sequence++) {
				const t: TeamNum = Math.random() < possession0 ? 0 : 1;
				const opponent = (t === 0 ? 1 : 0) as TeamNum;
				const state = states[t];
				const opponentState = states[opponent];
				if (state.active.length === 0 || opponentState.active.length === 0) {
					continue;
				}
				const tactics = this.team[t].soccerTactics;
				const opponentTactics = this.team[opponent].soccerTactics;
				const possessionShare = t === 0 ? possession0 : 1 - possession0;
				const presser = weightedChoice(
					opponentState.active,
					(p) =>
						(0.25 + rating(p, "defender")) *
						(isMidfielder(p) ? 1.35 : isDefender(p) ? 1.15 : 0.75),
				);
				const pressureCount =
					1 +
					(Math.random() < 0.35 + (opponentTactics?.pressing ?? 0) * 0.08
						? 1
						: 0);
				addStat(this.team[opponent], presser, "prs", pressureCount);
				let attackAlive = true;
				let chanceBoost = 0;
				let creator: SimPlayer | undefined;

				const passAttempts = poisson(
					2.6 + possessionShare * 5 - (tactics?.directness ?? 0) * 0.18,
				);
				for (let i = 0; i < passAttempts && attackAlive; i++) {
					const passer = weightedChoice(
						state.active,
						(p) =>
							0.35 +
							rating(p, "creator") *
								(isMidfielder(p) ? 1.5 : position(p) === "GK" ? 0.65 : 0.9),
					);
					addStat(this.team[t], passer, "pas");
					const performance = playerPerformance(state, passer, minute, tactics);
					const completionProbability = clamp(
						0.68 +
							rating(passer, "creator") * 0.23 -
							(opponentTactics?.pressing ?? 0) * 0.012 -
							Math.max(0, tactics?.directness ?? 0) * 0.015 +
							(performance - 0.8) * 0.12,
						0.6,
						0.93,
					);
					if (Math.random() < completionProbability) {
						addStat(this.team[t], passer, "pasCmp");
						const progressiveProbability = clamp(
							0.045 +
								rating(passer, "creator") * 0.115 +
								Math.max(0, tactics?.directness ?? 0) * 0.018 +
								(isMidfielder(passer) ? 0.025 : 0),
							0.04,
							0.24,
						);
						if (Math.random() < progressiveProbability) {
							addStat(this.team[t], passer, "prgP");
							chanceBoost += 0.012;
						}
					} else {
						addStat(this.team[t], passer, "possLost");
						if (
							Math.random() <
							0.28 + (opponentTactics?.pressing ?? 0) * 0.055
						) {
							addStat(this.team[opponent], presser, "prsWon");
							addStat(this.team[opponent], presser, "recov");
						} else {
							const interceptor = addDefensiveAction(
								opponentState,
								this.team[opponent],
								"int",
							);
							if (interceptor) {
								addStat(this.team[opponent], interceptor, "recov");
							}
						}
						// The aggregate sequence can contain an immediate counter-press recovery,
						// so a turnover only ends the whole attacking phase some of the time.
						attackAlive = Math.random() >= 0.38;
					}
				}

				let carrier: SimPlayer | undefined;
				if (attackAlive) {
					carrier = weightedChoice(
						state.active,
						(p) =>
							(0.08 + rating(p, "dribbler") ** 2) *
							(isWide(p)
								? 1.55
								: isAttacker(p)
									? 1.25
									: isDefender(p)
										? 0.5
										: 1),
					);
					const defender = weightedChoice(
						opponentState.active,
						(p) =>
							(0.2 + rating(p, "defender") ** 2) * (isDefender(p) ? 1.5 : 0.75),
					);
					const carrierPerformance = playerPerformance(
						state,
						carrier,
						minute,
						tactics,
					);
					if (
						Math.random() <
						dribbleAttemptProbability(carrier, tactics, carrierPerformance)
					) {
						addStat(this.team[t], carrier, "drbAtt");
						const successProbability = dribbleSuccessProbability({
							attacker: carrier,
							attackerPerformance: carrierPerformance,
							defender,
							defenderPerformance: playerPerformance(
								opponentState,
								defender,
								minute,
								opponentTactics,
							),
							opponentTactics,
						});
						if (Math.random() < successProbability) {
							addStat(this.team[t], carrier, "drbCmp");
							chanceBoost += 0.045;
							if (Math.random() < 0.55 + rating(carrier, "pace") * 0.18) {
								addStat(this.team[t], carrier, "prgC");
								chanceBoost += 0.035;
							}
						} else {
							addStat(this.team[t], carrier, "possLost");
							addStat(this.team[opponent], defender, "tkl");
							addStat(this.team[opponent], defender, "recov");
							attackAlive = false;
						}
					}
				}

				if (
					attackAlive &&
					state.active.some((p) => position(p) !== "GK") &&
					Math.random() <
						0.008 +
							Math.max(0, tactics?.directness ?? 0) * 0.004 +
							Math.max(0, opponentTactics?.defensiveLine ?? 0) * 0.003
				) {
					const offsidePlayer = weightedChoice(
						state.active.filter((p) => position(p) !== "GK"),
						(p) =>
							(isAttacker(p) ? 1.6 : 0.55) * dutyFactor(tactics, p, "attack"),
					);
					addStat(this.team[t], offsidePlayer, "off");
					addStat(this.team[t], offsidePlayer, "possLost");
					attackAlive = false;
				}

				if (attackAlive && state.active.some((p) => position(p) !== "GK")) {
					const crosser = weightedChoice(
						state.active.filter((p) => position(p) !== "GK"),
						(p) => (0.15 + rating(p, "crosser")) * (isWide(p) ? 1.8 : 0.55),
					);
					const crossProbability = clamp(
						0.075 +
							(isWide(crosser) ? 0.04 : 0) +
							(tactics?.width ?? 0) * 0.012 +
							Math.max(0, tactics?.directness ?? 0) * 0.008,
						0.035,
						0.18,
					);
					if (Math.random() < crossProbability) {
						addStat(this.team[t], crosser, "crs");
						const crossComplete =
							Math.random() <
							clamp(
								0.11 +
									rating(crosser, "crosser") * 0.25 -
									strengths[opponent].defense * 0.045,
								0.12,
								0.38,
							);
						if (crossComplete) {
							addStat(this.team[t], crosser, "crsCmp");
							creator = crosser;
							chanceBoost += 0.065;
							const attacker = weightedChoice(
								state.active.filter((p) => position(p) !== "GK"),
								(p) =>
									0.2 + rating(p, "aerial") * (isAttacker(p) ? 1.35 : 0.75),
							);
							const defender = weightedChoice(
								opponentState.active,
								(p) => 0.2 + rating(p, "aerial") * (isDefender(p) ? 1.45 : 0.8),
							);
							attacker.stat.aa = (attacker.stat.aa ?? 0) + 1;
							defender.stat.aa = (defender.stat.aa ?? 0) + 1;
							const attackerChance =
								rating(attacker, "aerial") /
								Math.max(
									0.05,
									rating(attacker, "aerial") + rating(defender, "aerial"),
								);
							const aerialWinner =
								Math.random() < attackerChance ? attacker : defender;
							aerialWinner.stat.aw = (aerialWinner.stat.aw ?? 0) + 1;
						} else {
							addStat(this.team[t], crosser, "possLost");
							const keeper = opponentState.active.find(
								(p) => position(p) === "GK",
							);
							if (
								keeper &&
								Math.random() < 0.12 + rating(keeper, "goalkeeping") * 0.16
							) {
								addStat(this.team[opponent], keeper, "gkClaims");
							} else {
								const clearer = addDefensiveAction(
									opponentState,
									this.team[opponent],
									"clr",
								);
								if (clearer) {
									addStat(this.team[opponent], clearer, "recov");
								}
							}
							attackAlive = Math.random() >= 0.66;
						}
					}
				}

				let penaltyTaken = false;
				const foulProbability = clamp(
					0.105 +
						(opponentTactics?.pressing ?? 0) * 0.009 +
						(opponentTactics?.marking ?? 0) * 0.006,
					0.065,
					0.17,
				);
				if (Math.random() < foulProbability) {
					const offender = weightedChoice(
						opponentState.active,
						(p) => 0.35 + rating(p, "defender") * (isDefender(p) ? 1.3 : 0.7),
					);
					const victim =
						carrier ??
						weightedChoice(
							state.active.filter((p) => position(p) !== "GK"),
							(p) =>
								0.25 + rating(p, "dribbler") * (isAttacker(p) ? 1.35 : 0.8),
						);
					addStat(this.team[opponent], offender, "fl");
					addStat(this.team[t], victim, "fouled");
					const penalty = Math.random() < 0.012 + chanceBoost * 0.035;
					if (penalty) {
						penaltyTaken = true;
						addStat(this.team[opponent], offender, "penCon");
						addStat(this.team[t], victim, "penWon");
						const taker = weightedChoice(
							state.active.filter((p) => position(p) !== "GK"),
							(p) => 0.08 + rating(p, "finisher", rating(p, "scoring")) ** 2,
						);
						const keeper = opponentState.active.find(
							(p) => position(p) === "GK",
						);
						addStat(this.team[t], taker, "penA");
						addStat(this.team[t], taker, "sh");
						addStat(this.team[t], taker, "xg", 0.76);
						const penaltyOnTarget = Math.random() < 0.92;
						if (penaltyOnTarget) {
							addStat(this.team[t], taker, "sot");
							if (keeper) {
								addStat(this.team[opponent], keeper, "psxg", 0.78);
							}
						}
						const penaltyGoalProbability = clamp(
							0.75 +
								(rating(taker, "finisher", rating(taker, "scoring")) -
									(keeper ? rating(keeper, "goalkeeping") : 0.5)) *
									0.16,
							0.67,
							0.86,
						);
						if (penaltyOnTarget && Math.random() < penaltyGoalProbability) {
							recordGoal({ keeper, minute, penalty: true, shooter: taker, t });
						} else {
							addStat(this.team[t], taker, "penM");
							if (penaltyOnTarget && keeper) {
								addStat(this.team[opponent], keeper, "sv");
							}
						}
					}

					const directRed = Math.random() < 0.006;
					if (directRed) {
						offender.stat.rc = 1;
						this.team[opponent].stat.rc += 1;
						finishAppearance(opponentState, offender, minute);
					} else if (Math.random() < 0.16) {
						addStat(this.team[opponent], offender, "yc");
						if ((offender.stat.yc ?? 0) >= 2) {
							offender.stat.rc = 1;
							this.team[opponent].stat.rc += 1;
							finishAppearance(opponentState, offender, minute);
						}
					}
				}

				const chanceProbability = clamp(
					(0.085 + possessionShare * 0.155 + chanceBoost) *
						Math.exp(
							(strengths[t].attack - strengths[opponent].defense) * 1.45,
						) *
						(1 + (tactics?.tempo ?? 0) * 0.035) *
						(1 +
							Math.max(0, tactics?.transition ?? 0) *
								Math.max(0, opponentTactics?.defensiveLine ?? 0) *
								0.04 +
							Math.max(0, tactics?.directness ?? 0) *
								Math.max(0, opponentTactics?.defensiveLine ?? 0) *
								0.025),
					0.035,
					0.38,
				);
				if (attackAlive && !penaltyTaken && Math.random() < chanceProbability) {
					const outfield = state.active.filter((p) => position(p) !== "GK");
					const shootingPool = outfield.length > 0 ? outfield : state.active;
					const shooter = weightedChoice(
						shootingPool,
						(p) =>
							(0.07 + rating(p, "scoring", 0.3) ** 2) *
							dutyFactor(tactics, p, "attack") *
							(isAttacker(p) ? 1.45 : isDefender(p) ? 0.55 : 1),
					);
					const bigChance =
						Math.random() <
						0.08 + chanceBoost + Math.max(0, strengths[t].attack - 0.65) * 0.12;
					const shotXg = clamp(
						0.04 +
							rating(shooter, "finisher", rating(shooter, "scoring", 0.3)) *
								0.09 +
							(strengths[t].attack - strengths[opponent].defense) * 0.035 +
							(bigChance ? 0.13 : 0),
						0.02,
						0.4,
					);
					addStat(this.team[t], shooter, "sh");
					addStat(this.team[t], shooter, "xg", shotXg);

					const possibleCreators = state.active.filter(
						(p) => p.id !== shooter.id && position(p) !== "GK",
					);
					if (!creator && possibleCreators.length > 0 && Math.random() < 0.82) {
						creator = weightedChoice(
							possibleCreators,
							(p) =>
								(0.1 + rating(p, "creator", 0.3) ** 2) *
								dutyFactor(tactics, p, "control"),
						);
					}
					if (creator) {
						creator.stat.kp = (creator.stat.kp ?? 0) + 1;
						creator.stat.xa = (creator.stat.xa ?? 0) + shotXg;
					}

					const keeper =
						opponentState.active.find((p) => position(p) === "GK") ??
						opponentState.active[0];
					const blocker = weightedChoice(
						opponentState.active.filter((p) => position(p) !== "GK"),
						(p) => (0.15 + rating(p, "defender")) * (isDefender(p) ? 1.5 : 0.7),
					);
					const blocked =
						Math.random() <
						clamp(
							0.11 +
								strengths[opponent].defense * 0.1 -
								(bigChance ? 0.055 : 0),
							0.08,
							0.22,
						);
					if (blocked) {
						addStat(this.team[opponent], blocker, "blk");
						if (Math.random() < 0.38) {
							this.team[t].stat.cor += 1;
						}
						continue;
					}

					const onTargetProbability = clamp(
						0.25 + rating(shooter, "finisher", 0.4) * 0.3,
						0.3,
						0.68,
					);
					const onTarget = Math.random() < onTargetProbability;
					if (onTarget) {
						addStat(this.team[t], shooter, "sot");
					}
					let goal = false;
					if (onTarget) {
						const postShotXg = clamp(
							0.045 +
								shotXg * 1.35 +
								rating(shooter, "finisher", 0.4) * 0.04 +
								(Math.random() - 0.5) * 0.08,
							0.04,
							0.88,
						);
						if (keeper) {
							addStat(this.team[opponent], keeper, "psxg", postShotXg);
						}
						const keeperRating = keeper ? rating(keeper, "goalkeeping") : 0.25;
						goal =
							Math.random() <
							postShotXg * clamp(1.08 - (keeperRating - 0.6) * 0.42, 0.8, 1.18);
						if (goal) {
							const assister =
								creator && Math.random() < 0.9 ? creator : undefined;
							recordGoal({ assister, keeper, minute, shooter, t });
						} else if (keeper) {
							addStat(this.team[opponent], keeper, "sv");
						}
					}
					if (!goal && Math.random() < (onTarget ? 0.28 : 0.18)) {
						this.team[t].stat.cor += 1;
						addDefensiveAction(opponentState, this.team[opponent], "clr");
					}
				}
			}

			for (const t of [0, 1] as TeamNum[]) {
				const state = states[t];
				const tactics = this.team[t].soccerTactics;
				for (const p of state.active) {
					if (this.baseInjuryRate === 0) {
						continue;
					}
					const appearance = getAppearance(state, p)!;
					const stamina = staminaAtMinute(p, appearance, minute, tactics);
					const injuryRate =
						getInjuryRate(
							this.baseInjuryRate,
							p.age ?? 26,
							(p.injury?.gamesRemaining ?? 0) > 0,
						) *
						tacticalIntensity(tactics) *
						(1 + Math.max(0, 0.72 - stamina) * 1.8);
					if (Math.random() < injuryRate) {
						p.injured = true;
						p.newInjury = true;
						if (this.doPlayByPlay) {
							events.push({
								type: "injury",
								clock: 90 - minute,
								quarter: minute <= 45 ? 1 : 2,
								t,
								names: [p.name],
								pids: [p.id],
							});
						}
						performSubstitution(state, t, minute, tactics, events, p);
					}
				}
			}
		}

		for (const t of [0, 1] as TeamNum[]) {
			const state = states[t];
			const tactics = this.team[t].soccerTactics;
			for (const appearance of state.appearances) {
				const p = appearance.p;
				const finalMinute = appearance.end ?? 90;
				p.fitnessEnd = staminaAtMinute(p, appearance, finalMinute, tactics);
				p.stat.cs =
					(p.stat.min ?? 0) >= 60 &&
					(position(p) !== "GK" || (p.stat.ga ?? 0) === 0) &&
					this.team[t === 0 ? 1 : 0].stat.g === 0
						? 1
						: 0;
				const passAttempts = p.stat.pas ?? 0;
				const passValue =
					passAttempts > 0 ? (p.stat.pasCmp ?? 0) / passAttempts : 0;
				const defensiveValue =
					(p.stat.tkl ?? 0) +
					(p.stat.int ?? 0) +
					(p.stat.clr ?? 0) * 0.35 +
					(p.stat.blk ?? 0) * 0.75 +
					(p.stat.prsWon ?? 0) * 0.2;
				const dribbleValue =
					(p.stat.drbCmp ?? 0) * 0.075 -
					((p.stat.drbAtt ?? 0) - (p.stat.drbCmp ?? 0)) * 0.04 +
					(p.stat.prgC ?? 0) * 0.025 +
					(p.stat.prgP ?? 0) * 0.008;
				const goalsPrevented = (p.stat.psxg ?? 0) - (p.stat.ga ?? 0);
				p.stat.matchRating = clamp(
					6.25 +
						(p.stat.g ?? 0) * 1.15 +
						(p.stat.a ?? 0) * 0.7 +
						(p.stat.cs ?? 0) * (position(p) === "GK" ? 0.55 : 0.25) +
						(p.stat.sv ?? 0) * 0.08 +
						(position(p) === "GK" ? goalsPrevented * 0.18 : 0) +
						defensiveValue * 0.035 +
						dribbleValue +
						(p.stat.kp ?? 0) * 0.055 +
						(p.stat.possLost ?? 0) * -0.008 +
						(passValue - 0.75) * 0.8 -
						(p.stat.ga ?? 0) * (position(p) === "GK" ? 0.18 : 0) -
						(p.stat.yc ?? 0) * 0.2 -
						(p.stat.rc ?? 0) * 1.15 +
						(p.stat.penM ?? 0) * -0.55 +
						(Math.random() - 0.5) * 0.55,
					4,
					10,
				);
			}

			delete this.team[t].compositeRating;
			delete this.team[t].pace;
			delete this.team[t].soccerTactics;
			for (const p of this.team[t].player) {
				delete p.compositeRating;
				delete p.age;
				delete p.valueNoPot;
				delete p.ptModifier;
				delete p.matchPos;
				delete p.stat.benchTime;
				delete p.stat.courtTime;
				delete p.stat.energy;
			}
		}

		if (this.doPlayByPlay) {
			events.sort((a, b) => b.clock - a.clock);
			events.unshift({
				type: "init",
				lineups: lineups.map((players) => players.map((p) => p.id)),
			});
			events.push(
				{
					type: "finalStats",
					teams: this.team.map((team) => ({
						stat: team.stat,
						players: team.player.map((p) => ({ id: p.id, stat: p.stat })),
					})),
				},
				{ type: "gameOver", clock: 0, quarter: 2 },
			);
		}
		scoringSummary.sort((a, b) => b.clock - a.clock);
		return {
			gid: this.id,
			day: this.day,
			overtimes: 0,
			team: this.team,
			clutchPlays: [],
			playByPlay: this.doPlayByPlay ? events : undefined,
			neutralSite: this.neutralSite,
			scoringSummary,
		};
	}
}

export default GameSim;
