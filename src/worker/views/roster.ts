import { PHASE, POSITIONS } from "../../common/constants.ts";
import { finances, season, team } from "../core/index.ts";
import { idb } from "../db/index.ts";
import { g, helpers } from "../util/index.ts";
import type {
	Player,
	TeamCoaching,
	UpdateEvents,
	ViewInput,
	TeamSeasonAttr,
} from "../../common/types.ts";
import { addMood } from "./freeAgents.ts";
import { getAllCoaches } from "./coachCareer.ts";
import addFirstNameShort from "../util/addFirstNameShort.ts";
import {
	fitBreakdown,
	playerCoachFit,
	playerOptimalStyle,
} from "../core/coach/style.ts";
import {
	identityConflict,
	playerRoleScore,
	teamRoleCoverage,
	type RoleNeed,
} from "../../common/roleNeeds.basketball.ts";
import {
	COVERAGE_C0,
	COVERAGE_GAIN,
	FIT_NEUTRAL,
	misfitBenchFactor,
	ROLE_DIAL_DAMP,
} from "../../common/coachingConstants.ts";
import { getActualPlayThroughInjuries } from "../core/game/loadTeams.ts";
import { bySport, isSport } from "../../common/sportFunctions.ts";
import { orderTeams } from "../util/orderTeams.ts";
import { recoverSoccerFitness } from "../../common/soccer/fitness.ts";

const sortByPos = (p: {
	ratings: {
		ovr: number;
		pos: string;
	};
}) => {
	const ind = POSITIONS.indexOf(p.ratings.pos);
	return (POSITIONS.length - ind) * 1000 + p.ratings.ovr;
};

const getStandingsInfo = async (info: { season: number; tid: number }) => {
	const teams = await idb.getCopies.teamsPlus(
		{
			attrs: ["tid"],
			seasonAttrs: [
				"won",
				"lost",
				"tied",
				"otl",
				"wonDiv",
				"lostDiv",
				"tiedDiv",
				"otlDiv",
				"wonConf",
				"lostConf",
				"tiedConf",
				"otlConf",
				"winp",
				"pts",
				"cid",
				"did",
			],
			stats: ["pts", "oppPts", "gp"],
			season: info.season,
			showNoStats: true,
		},
		"noCopyCache",
	);

	const cid = teams.find((t) => t.tid === info.tid)?.seasonAttrs.cid;

	const playoffsByConf = await season.getPlayoffsByConf(info.season);

	const confOrAllTeams = await orderTeams(
		teams.filter((t) => !playoffsByConf || t.seasonAttrs.cid === cid),
		teams,
	);

	const pointsFormula = g.get("pointsFormula", info.season);
	const usePts = pointsFormula !== "";

	const firstPlaceTeam = confOrAllTeams[0];

	if (firstPlaceTeam) {
		let rank = 1;
		for (const t of confOrAllTeams) {
			if (!playoffsByConf || t.seasonAttrs.cid === cid) {
				if (t.tid === info.tid) {
					return {
						gb: usePts
							? firstPlaceTeam.seasonAttrs.pts - t.seasonAttrs.pts
							: helpers.gb(firstPlaceTeam.seasonAttrs, t.seasonAttrs),
						playoffsByConf,
						rank,
						usePts,
					};
				}

				rank += 1;
			}
		}
	}

	return {
		gb: 0,
		playoffsByConf,
		rank: undefined,
		usePts,
	};
};

const updateRoster = async (
	inputs: ViewInput<"roster">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("gameAttributes") ||
		updateEvents.includes("playerMovement") ||
		updateEvents.includes("team") ||
		(inputs.season === g.get("season") &&
			(updateEvents.includes("gameSim") ||
				updateEvents.includes("newPhase"))) ||
		(updateEvents.includes("newPhase") && g.get("phase") === PHASE.PRESEASON) ||
		inputs.abbrev !== state.abbrev ||
		inputs.playoffs !== state.playoffs ||
		inputs.season !== state.season
	) {
		const stats = bySport({
			baseball: ["gp", "keyStats", "war"],
			basketball: ["gp", "min", "pts", "trb", "ast", "per"],
			football: ["gp", "keyStats", "av"],
			hockey: ["gp", "amin", "keyStats", "ops", "dps", "ps"],
			soccer: ["gp", "min", "keyStats", "g", "a", "matchRating"],
		});

		const editable =
			inputs.season === g.get("season") &&
			inputs.tid === g.get("userTid") &&
			!g.get("spectator") &&
			isSport("basketball");

		const showRelease =
			inputs.season === g.get("season") &&
			inputs.tid === g.get("userTid") &&
			!g.get("spectator");

		const seasonAttrs: TeamSeasonAttr[] = [
			"profit",
			"won",
			"lost",
			"tied",
			"otl",
			"playoffRoundsWon",
			"imgURL",
			"region",
			"name",
			"avgAge",
			"note",
		];
		const t = await idb.getCopy.teamsPlus(
			{
				season: inputs.season,
				tid: inputs.tid,
				attrs: [
					"tid",
					"strategy",
					"region",
					"name",
					"keepRosterSorted",
					"playThroughInjuries",
					"coaching",
					"soccerTactics",
				],
				seasonAttrs,
				stats: ["pts", "oppPts", "gp"],
				addDummySeason: true,
			},
			"noCopyCache",
		);

		if (!t) {
			const returnValue = {
				errorMessage: "Invalid team ID.",
			};
			return returnValue;
		}

		const attrs = [
			"pid",
			"tid",
			"draft",
			"firstName",
			"lastName",
			"age",
			"born",
			"contract",
			"cashOwed",
			"rosterOrder",
			"injury",
			"ptModifier",
			"watch",
			"untradable",
			"hof",
			"latestTransaction",
			"mood",
			"value",
			"awards",
			"soccerFitness",
			"soccerLastMatchDay",
		]; // tid and draft are used for checking if a player can be released without paying his salary

		const ratings = [
			"ovr",
			"pot",
			"dovr",
			"dpot",
			"skills",
			"pos",
			"ovrs",
			"endu",
		];
		const stats2 = [...stats, "yearsWithTeam", "jerseyNumber", "min", "gp"];

		let players: any[];
		let payroll: number | undefined;
		let luxuryTaxAmount: number | undefined;
		let minPayrollAmount: number | undefined;
		let teamChemistry:
			| {
					cohesion: number;
					shortages: { need: RoleNeed; severity: number }[];
					surpluses: { kind: "spacing" | "creation"; severity: number }[];
			  }
			| undefined;

		if (inputs.season === g.get("season")) {
			const schedule = await season.getSchedule();

			// Show players currently on the roster
			const playersAll = await addMood(
				await idb.cache.players.indexGetAll("playersByTid", inputs.tid),
			);
			payroll = await team.getPayroll(inputs.tid);
			luxuryTaxAmount = finances.getLuxuryTaxAmount(payroll);
			minPayrollAmount = finances.getMinPayrollAmount(payroll);

			// numGamesRemaining doesn't need to be calculated except for userTid, but it is.
			let numGamesRemaining = 0;

			for (const matchup of schedule) {
				if (inputs.tid === matchup.homeTid || inputs.tid === matchup.awayTid) {
					numGamesRemaining += 1;
				}
			}

			players = await idb.getCopies.playersPlus(playersAll, {
				attrs,
				ratings,
				playoffs: inputs.playoffs === "playoffs",
				regularSeason: inputs.playoffs === "regularSeason",
				combined: inputs.playoffs === "combined",
				stats: stats2,
				season: inputs.season,
				tid: inputs.tid,
				showNoStats: true,
				showRookies: true,
				fuzz: true,
				numGamesRemaining,
			});
			if (isSport("soccer")) {
				const nextMatchDay = schedule
					.filter(
						(game) =>
							game.homeTid === inputs.tid || game.awayTid === inputs.tid,
					)
					.map((game) => game.day)
					.filter((day): day is number => typeof day === "number")
					.toSorted((a, b) => a - b)[0];
				for (const p of players) {
					p.soccerFitness = recoverSoccerFitness({
						day: nextMatchDay,
						endurance: (50 + (p.ratings.endu ?? 50)) / 200,
						fitness: p.soccerFitness,
						lastMatchDay: p.soccerLastMatchDay,
					});
				}
			}

			if (isSport("basketball")) {
				players.sort((a, b) => a.rosterOrder - b.rosterOrder);
			} else {
				players.sort((a, b) => sortByPos(b) - sortByPos(a));
			}

			for (const p of players) {
				// Can alway release player, even if below the minimum roster limit, cause why not. Except in the playoffs.
				if (
					inputs.tid === g.get("userTid") &&
					(g.get("phase") !== PHASE.PLAYOFFS ||
						(g.get("phase") === PHASE.PLAYOFFS &&
							players.length > g.get("minRosterSize"))) &&
					!g.get("gameOver") &&
					!g.get("otherTeamsWantToHire") &&
					g.get("phase") !== PHASE.FANTASY_DRAFT &&
					g.get("phase") !== PHASE.EXPANSION_DRAFT
				) {
					p.canRelease = true;
				} else {
					p.canRelease = false;
				}

				// Convert ptModifier to string so it doesn't cause unneeded knockout re-rendering
				p.ptModifier = String(p.ptModifier);
			}

			// System fit vs the coach's current system, per player plus a
			// roster-wide chemistry summary (role-demand coverage). Raw
			// (unfuzzed) ratings - a letter grade is coarse, and the UI hides it
			// under challengeNoRatings.
			if (isSport("basketball") && t.coaching) {
				const coaching = t.coaching;
				const coachesForTeam = await idb.cache.coaches.indexGetAll(
					"coachesByTid",
					inputs.tid,
				);
				const adaptability = coachesForTeam[0]?.ratings.adaptability ?? 50;
				const rawByPid = new Map(playersAll.map((p2) => [p2.pid, p2]));

				let weightSum = 0;
				let fitSum = 0;

				for (const p of players) {
					const raw = rawByPid.get(p.pid);
					const ratings = raw?.ratings.at(-1);
					if (!ratings) {
						continue;
					}

					p.systemFit = playerCoachFit(ratings as any, coaching, adaptability);
					const role = playerRoleScore(ratings as any, coaching);
					if (role.score >= 0.55) {
						p.fitRole = role;
					}
					// Top style mismatches, for the chemistry messages, damped for
					// players whose demanded role rescues their fit. Only
					// meaningful gaps (0.3+ on a [-1, 1] dial).
					p.fitDetails = fitBreakdown(
						playerOptimalStyle(ratings as any),
						coaching,
						1 - ROLE_DIAL_DAMP * role.score,
					)
						.filter((row) => row.magnitude >= 0.3)
						.slice(0, 2);
					p.systemFitFactor = misfitBenchFactor(
						identityConflict(ratings as any, coaching),
						role.score,
						adaptability,
					);

					const weight = Math.max(0, raw!.value ?? 0);
					weightSum += weight;
					fitSum += weight * p.systemFit;
				}

				if (weightSum > 0) {
					// Coverage over the rotation: top 9 by value, best first.
					const rotation = [...playersAll]
						.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
						.slice(0, 9)
						.map((p2) => ({ ratings: p2.ratings.at(-1) as any }));
					const coverage = teamRoleCoverage(rotation, coaching);

					teamChemistry = {
						cohesion:
							0.5 * (fitSum / weightSum) +
							0.5 *
								(FIT_NEUTRAL +
									(coverage.coverageMean - COVERAGE_C0) * COVERAGE_GAIN),
						shortages: coverage.shortages,
						surpluses: coverage.surpluses,
					};
				}
			}
		} else {
			// Show all players with stats for the given team and year
			const playersAll = await idb.getCopies.players(
				{
					activeSeason: inputs.season,
					statsTid: inputs.tid,
				},
				"noCopyCache",
			);
			players = await idb.getCopies.playersPlus(playersAll, {
				attrs,
				ratings,
				playoffs: inputs.playoffs === "playoffs",
				regularSeason: inputs.playoffs === "regularSeason",
				combined: inputs.playoffs === "combined",
				stats: stats2,
				season: inputs.season,
				tid: inputs.tid,
				fuzz: true,
			});

			if (isSport("basketball")) {
				players.sort(
					(a, b) => b.stats.gp * b.stats.min - a.stats.gp * a.stats.min,
				);
			} else {
				players.sort((a, b) => sortByPos(b) - sortByPos(a));
			}

			for (const p of players) {
				p.canRelease = false;
			}

			const teamSeason = await idb.getCopy.teamSeasons({
				season: inputs.season,
				tid: inputs.tid,
			});

			// >0 check handles old leagues that might have it undefined, and real players leagues that have a dummy negative value
			if (teamSeason && teamSeason.payrollEndOfSeason > 0) {
				payroll = teamSeason.payrollEndOfSeason;
				luxuryTaxAmount = teamSeason.expenses.luxuryTax;
				minPayrollAmount = teamSeason.expenses.minTax;
			}
		}

		const playoffsOvr =
			(g.get("phase") === PHASE.PLAYOFFS &&
				g.get("season") === inputs.season) ||
			inputs.playoffs === "playoffs";

		const { gb, playoffsByConf, rank, usePts } = await getStandingsInfo(inputs);

		const t2 = {
			...t,
			ovr: team.ovr(players, {
				playoffs: playoffsOvr,
			}),
			ovrCurrent: team.ovr(players, {
				accountForInjuredPlayers: {
					numDaysInFuture: 0,
					playThroughInjuries: getActualPlayThroughInjuries(t),
				},
				playoffs: playoffsOvr,
			}),
			roundsWonText: helpers.roundsWonText({
				playoffRoundsWon: t.seasonAttrs.playoffRoundsWon,
				numPlayoffRounds: g.get("numGamesPlayoffSeries", inputs.season).length,
				playoffsByConf: await season.getPlayoffsByConf(inputs.season),
			}),
			gb,
			rank,
		};
		t2.seasonAttrs.avgAge = t2.seasonAttrs.avgAge ?? team.avgAge(players);

		for (const p of players) {
			p.awards = p.awards.filter(
				(award: Player["awards"][number]) => award.season === inputs.season,
			);
		}

		let coach;
		if (isSport("basketball")) {
			if (inputs.season === g.get("season")) {
				const coaches = await idb.cache.coaches.indexGetAll(
					"coachesByTid",
					inputs.tid,
				);
				const c = coaches[0];
				if (c) {
					coach = {
						cid: c.cid,
						firstName: c.firstName,
						lastName: c.lastName,
						age: g.get("season") - c.born.year,
						ratings: c.ratings,
						contract: c.contract,
						// Current season uses the live team.coaching dials instead.
						style: undefined as TeamCoaching | undefined,
					};
				}
			} else {
				// Who coached this team in the season being viewed, and their style
				// that season (dial snapshot when available, else their philosophy).
				const c = (await getAllCoaches()).find((c) =>
					c.seasons?.some(
						(s) => s.season === inputs.season && s.tid === inputs.tid,
					),
				);
				if (c) {
					const seasonRow = c.seasons!.find(
						(s) => s.season === inputs.season && s.tid === inputs.tid,
					)!;
					const ratingsRow = c.ratingsHistory?.find(
						(r) => r.season === inputs.season,
					);
					coach = {
						cid: c.cid,
						firstName: c.firstName,
						lastName: c.lastName,
						age: inputs.season - c.born.year,
						ratings: ratingsRow ?? c.ratings,
						contract: undefined,
						style: seasonRow.coaching ?? c.philosophy,
					};
				}
			}
		}

		return {
			abbrev: inputs.abbrev,
			coach,
			editable,
			maxRosterSize: g.get("maxRosterSize"),
			numPlayersOnCourt: g.get("numPlayersOnCourt"),
			luxuryTaxAmount,
			minPayrollAmount,
			payroll,
			playoffs: inputs.playoffs,
			playoffsByConf,
			players: addFirstNameShort(players),
			season: inputs.season,
			showSpectatorWarning:
				inputs.season === g.get("season") &&
				inputs.tid === g.get("userTid") &&
				g.get("spectator"),
			showRelease,
			showTradeFor:
				!isSport("soccer") &&
				inputs.season === g.get("season") &&
				inputs.tid !== g.get("userTid") &&
				!g.get("spectator"),
			showTradingBlock:
				!isSport("soccer") &&
				inputs.season === g.get("season") &&
				inputs.tid === g.get("userTid") &&
				!g.get("spectator"),
			stats,
			soccerTactics: isSport("soccer") ? t.soccerTactics : undefined,
			t: t2,
			teamChemistry,
			tid: inputs.tid,
			usePts,
		};
	}
};

export default updateRoster;
