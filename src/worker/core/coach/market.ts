import { idb } from "../../db/index.ts";
import { g, helpers, logEvent } from "../../util/index.ts";
import { PLAYER, DEFAULT_COACHING } from "../../../common/constants.ts";
import { orderBy } from "../../../common/utils.ts";
import genContract from "./genContract.ts";
import hire from "./hire.ts";
import fire from "./fire.ts";
import ensureCoaches from "./ensureCoaches.ts";
import developCoach, { shouldRetire } from "./develop.ts";
import retireCoach from "./retire.ts";
import { rosterOptimalStyle } from "./style.ts";
import type {
	Coach,
	Conditions,
	PlayerContract,
	TeamCoaching,
} from "../../../common/types.ts";

// What a coach asks for from a given team: their market rate, discounted for
// loyalty to their previous team, marked up for bad situations (a coach demands
// more to take over a losing team).
export const coachDemand = (
	coach: Coach,
	tid: number,
	teamWinp: number,
): PlayerContract => {
	const base = genContract(coach.ratings.ovr);

	let amount = base.amount;
	if (coach.prevTid === tid) {
		amount *= 0.9;
	}
	amount *= 1.15 - 0.3 * helpers.bound(teamWinp, 0, 1);
	amount = Math.round(amount / 50) * 50;

	// Established coaches demand multi-year deals.
	const minYears = coach.ratings.ovr >= 60 ? 2 : 1;
	const years = helpers.bound(base.exp - g.get("season"), minYears, 5);

	return {
		amount,
		exp: g.get("season") + years,
	};
};

// How well a coach's preferred style matches a roster: 1 = identical dials,
// 0 = maximally opposed (dials are in [-1, 1]).
export const philosophyFit = (
	philosophy: TeamCoaching,
	rosterOptimal: TeamCoaching,
) => {
	const keys = Object.keys(DEFAULT_COACHING) as (keyof TeamCoaching)[];
	const meanDist =
		keys.reduce(
			(sum, key) => sum + Math.abs(philosophy[key] - rosterOptimal[key]),
			0,
		) / keys.length;
	return 1 - meanDist / 2;
};

// AI hiring score: mostly quality, then fit with the roster, then price.
export const scoreCandidate = (
	coach: Coach,
	rosterOptimal: TeamCoaching,
	demand: number,
	medianDemand: number,
) => {
	const priceFit =
		medianDemand > 0
			? helpers.bound(1 - (demand - medianDemand) / medianDemand, 0, 1)
			: 0.5;
	return (
		0.6 * (coach.ratings.ovr / 100) +
		0.3 * philosophyFit(coach.philosophy, rosterOptimal) +
		0.1 * priceFit
	);
};

// Annual firing check for an AI team's coach. Management judges the coach on
// their "perceived" record: actual win% adjusted by the roster excuse (wins
// above/below the talent-based expectation, per game). An overachiever on a
// bad roster reads like a .500 coach and is spared; an underachiever on a
// decent roster reads like a losing coach and hits the hot seat even at .500.
// Reputation (ovr) and dead money (years remaining) both buy patience.
export const fireProbability = ({
	winp,
	deltaPerGame,
	ovr,
	yearsRemaining,
}: {
	winp: number;
	deltaPerGame: number; // (won - expectedWins) / gp from last season, 0 if unknown
	ovr: number;
	yearsRemaining: number;
}) => {
	// Cap the excuse/blame at ~12 wins per 82 so one weird season can't fully
	// dominate the record.
	const perceived = helpers.bound(
		winp + helpers.bound(deltaPerGame, -0.15, 0.15),
		0,
		1,
	);
	return (
		(helpers.bound(0.45 - perceived, 0, 0.45) * (1 - ovr / 130)) /
		(1 + 0.5 * yearsRemaining)
	);
};

const winpLastSeason = async (tid: number) => {
	const ts = await idb.cache.teamSeasons.indexGet("teamSeasonsByTidSeason", [
		tid,
		g.get("season") - 1,
	]);
	if (!ts) {
		return 0.5;
	}
	const gp = ts.won + ts.lost + (ts.tied ?? 0);
	return gp > 0 ? (ts.won + 0.5 * (ts.tied ?? 0)) / gp : 0.5;
};

// The offseason coach market, run each preseason (replaces the old
// autoHireFire): develop/retire coaches, expire contracts onto the open
// market (no more silent auto-renewals), AI firings (weighted by the dead
// money they would eat), then fill coachless AI teams in attractiveness order
// so good situations get first pick of the pool.
const processCoachMarket = async (conditions?: Conditions) => {
	const season = g.get("season");
	const userTids = g.get("userTids");
	const spectator = g.get("spectator");

	// 1. Develop, and retire old coaches who are between contracts.
	for (const coach of await idb.cache.coaches.getAll()) {
		developCoach(coach, season);

		// Grandfather pre-market saves: the old code renewed expired contracts in
		// place, so a coach can arrive here multiple seasons past exp. Treat only
		// last season's expirations as "expiring now"; bump older ones.
		if (coach.tid >= 0 && coach.contract.exp < season - 1) {
			coach.contract.exp = season - 1;
		}

		const age = season - coach.born.year;
		const betweenContracts =
			coach.tid === PLAYER.FREE_AGENT ||
			(coach.tid >= 0 && coach.contract.exp < season);
		if (betweenContracts && shouldRetire(age)) {
			await retireCoach(coach, conditions);
			continue;
		}

		await idb.cache.coaches.put(coach);
	}

	const teams = (await idb.cache.teams.getAll()).filter((t) => !t.disabled);

	// Prune fully paid-out dead money.
	for (const t of teams) {
		if (t.deadCoachMoney?.some((d) => d.exp < season)) {
			t.deadCoachMoney = t.deadCoachMoney.filter((d) => d.exp >= season);
			await idb.cache.teams.put(t);
		}
	}

	const rosterOptimalByTid = new Map<number, TeamCoaching>();
	const rosterOptimal = async (tid: number) => {
		let style = rosterOptimalByTid.get(tid);
		if (!style) {
			const players = await idb.cache.players.indexGetAll("playersByTid", tid);
			style = rosterOptimalStyle(players);
			rosterOptimalByTid.set(tid, style);
		}
		return style;
	};

	const freeAgents = async () =>
		(await idb.cache.coaches.getAll()).filter(
			(c) => c.tid === PLAYER.FREE_AGENT,
		);

	const medianFADemand = async () => {
		const amounts = (await freeAgents())
			.map((c) => genContract(c.ratings.ovr).amount)
			.sort((a, b) => a - b);
		return amounts.length > 0
			? amounts[Math.floor(amounts.length / 2)]!
			: genContract(50).amount;
	};

	// 2. Expirations: no auto-renew. AI teams first decide whether to re-sign
	// their expiring coach at market rate; otherwise the coach hits free agency.
	for (const t of teams) {
		const coaches = await idb.cache.coaches.indexGetAll("coachesByTid", t.tid);
		const coach = coaches[0];
		if (!coach || coach.contract.exp >= season) {
			continue;
		}

		const isUserTeam = userTids.includes(t.tid) && !spectator;
		if (!isUserTeam) {
			// Re-sign if the incumbent scores at least as well as the best free
			// agent, with a small incumbency bonus (continuity has value).
			const optimal = await rosterOptimal(t.tid);
			const median = await medianFADemand();
			const winp = await winpLastSeason(t.tid);
			const demand = coachDemand(coach, t.tid, winp);
			const ownScore = scoreCandidate(coach, optimal, demand.amount, median);
			let bestFAScore = 0;
			for (const fa of await freeAgents()) {
				const faDemand = coachDemand(fa, t.tid, winp);
				const s = scoreCandidate(fa, optimal, faDemand.amount, median);
				if (s > bestFAScore) {
					bestFAScore = s;
				}
			}
			if (ownScore * 1.1 >= bestFAScore) {
				coach.contract = demand;
				await idb.cache.coaches.put(coach);
				await logEvent(
					{
						type: "coachContract",
						text: `${coach.firstName} ${coach.lastName} re-signed with the ${t.region} ${t.name} (${helpers.formatCurrency(demand.amount / 1000, "M")}/year through ${demand.exp}).`,
						tids: [t.tid],
						showNotification: false,
						score: 10,
					},
					conditions,
				);
				continue;
			}
		}

		// The coach hits the market. Remember the team for loyalty/display, and
		// notify the user if it's their coach walking.
		coach.tid = PLAYER.FREE_AGENT;
		coach.prevTid = t.tid;
		await idb.cache.coaches.put(coach);
		await logEvent(
			{
				type: "coachContract",
				text: `${coach.firstName} ${coach.lastName}'s contract with the ${t.region} ${t.name} expired; they are now a free agent.`,
				tids: [t.tid],
				showNotification: isUserTeam,
				score: 15,
			},
			conditions,
		);
	}

	// 3. AI firings: losing gets a coach fired, but wins above/below the
	// talent-based expectation shift the blame (see fireProbability), damped by
	// how much dead money the team would eat for the remaining contract years.
	for (const t of teams) {
		if (userTids.includes(t.tid) || spectator) {
			continue;
		}
		const coaches = await idb.cache.coaches.indexGetAll("coachesByTid", t.tid);
		const coach = coaches[0];
		if (!coach) {
			continue;
		}

		const winp = await winpLastSeason(t.tid);

		// Last season's overachievement with this team, if the coach was here.
		let deltaPerGame = 0;
		const lastSeasonRow = coach.seasons?.findLast(
			(s) => s.tid === t.tid && s.season === season - 1,
		);
		if (lastSeasonRow) {
			const gp = lastSeasonRow.won + lastSeasonRow.lost;
			if (gp > 0) {
				deltaPerGame =
					(lastSeasonRow.won - lastSeasonRow.expectedWins) / gp;
			}
		}

		const fireProb = fireProbability({
			winp,
			deltaPerGame,
			ovr: coach.ratings.ovr,
			yearsRemaining: Math.max(0, coach.contract.exp - season + 1),
		});
		if (Math.random() < fireProb) {
			await fire(t.tid, conditions);
		}
	}

	// 4. Market resolution: coachless AI teams pick in attractiveness order
	// (winning situations get their choice of the pool), each hiring the
	// best-scoring candidate at that coach's asking price.
	const coachlessAiTids: { tid: number; winp: number }[] = [];
	for (const t of teams) {
		if (userTids.includes(t.tid) && !spectator) {
			continue;
		}
		const coaches = await idb.cache.coaches.indexGetAll("coachesByTid", t.tid);
		if (coaches.length === 0) {
			coachlessAiTids.push({ tid: t.tid, winp: await winpLastSeason(t.tid) });
		}
	}

	for (const { tid, winp } of orderBy(coachlessAiTids, "winp", "desc")) {
		const pool = await freeAgents();
		if (pool.length === 0) {
			break;
		}
		const optimal = await rosterOptimal(tid);
		const median = await medianFADemand();
		const scored = pool.map((c) => {
			const demand = coachDemand(c, tid, winp);
			return {
				coach: c,
				demand,
				score: scoreCandidate(c, optimal, demand.amount, median),
			};
		});
		const best = orderBy(scored, "score", "desc")[0]!;
		await hire(best.coach.cid, tid, {
			contract: best.demand,
			conditions,
		});
	}

	// 5. Top up the pool (and backstop any team still without a coach, including
	// a user who never hires one).
	await ensureCoaches();
};

export default processCoachMarket;
