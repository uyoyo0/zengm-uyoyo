import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import type { Lineup, UpdateEvents, ViewInput } from "../../common/types.ts";
import { isSport } from "../../common/sportFunctions.ts";
import {
	fitBreakdown,
	playerCoachFit,
	playerOptimalStyle,
} from "../core/coach/style.ts";
import {
	identityConflict,
	playerRoleScore,
	teamRoleCoverage,
} from "../../common/roleNeeds.basketball.ts";
import {
	coachDevEffect,
	COVERAGE_C0,
	COVERAGE_GAIN,
	FIT_NEUTRAL,
	fitAdjustedCoachingLevel,
	fitEffect,
	FIT_MOOD_SCALE,
	misfitBenchFactor,
	ROLE_DIAL_DAMP,
} from "../../common/coachingConstants.ts";
import getRole from "../../common/getRole.basketball.ts";

// The full chemistry report: how every player fits the coach's system, what
// roles the system demands vs what the roster supplies, and how cohesive the
// actual 5-man lineups have been.
const updateTeamChemistryPage = async (
	inputs: ViewInput<"teamChemistryPage">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("gameSim") ||
		updateEvents.includes("playerMovement") ||
		updateEvents.includes("newPhase") ||
		inputs.abbrev !== state.abbrev
	) {
		if (!isSport("basketball")) {
			return { errorMessage: "Only basketball has coach chemistry." };
		}

		const t = await idb.cache.teams.get(inputs.tid);
		if (!t) {
			return { errorMessage: "Invalid team ID." };
		}

		const coaches = await idb.cache.coaches.indexGetAll(
			"coachesByTid",
			inputs.tid,
		);
		const headCoach = coaches[0];
		const coaching = t.coaching;

		if (!headCoach || !coaching) {
			return {
				abbrev: inputs.abbrev,
				tid: inputs.tid,
				season: g.get("season"),
				coach: undefined,
				coaching: undefined,
				cohesion: undefined,
				teamMessageData: undefined,
				needs: [],
				players: [],
				lineups: [],
				challengeNoRatings: g.get("challengeNoRatings"),
			};
		}

		const adaptability = headCoach.ratings.adaptability;
		const development = headCoach.ratings.development;

		const rosterAll = await idb.cache.players.indexGetAll(
			"playersByTid",
			inputs.tid,
		);
		const roster = [...rosterAll].sort(
			(a, b) => (b.value ?? 0) - (a.value ?? 0),
		);

		// Per-player chemistry rows.
		const players = roster.map((p) => {
			const ratings = p.ratings.at(-1) as any;
			const fit = playerCoachFit(ratings, coaching, adaptability);
			const role = playerRoleScore(ratings, coaching);
			const conflict = identityConflict(ratings, coaching);
			const minutesFactor = misfitBenchFactor(
				conflict,
				role.score,
				adaptability,
			);
			const devLevel = fitAdjustedCoachingLevel(development, fit);

			return {
				pid: p.pid,
				firstName: p.firstName,
				lastName: p.lastName,
				pos: ratings.pos,
				age: g.get("season") - p.born.year,
				value: p.value,
				role: getRole(ratings),
				systemFit: fit,
				fitRole: role.score >= 0.55 ? role : undefined,
				fitDetails: fitBreakdown(
					playerOptimalStyle(ratings),
					coaching,
					1 - ROLE_DIAL_DAMP * role.score,
				)
					.filter((row) => row.magnitude >= 0.3)
					.slice(0, 2),
				moodEffect: FIT_MOOD_SCALE * fitEffect(fit),
				devEffect: coachDevEffect(devLevel) - coachDevEffect(development),
				minutesFactor,
			};
		});

		// Team-level coverage.
		const rotation = roster
			.slice(0, 9)
			.map((p) => ({ ratings: p.ratings.at(-1) as any }));
		const coverage = teamRoleCoverage(rotation, coaching);

		let weightSum = 0;
		let fitSum = 0;
		for (const p of roster) {
			const weight = Math.max(0, p.value ?? 0);
			const row = players.find((row2) => row2.pid === p.pid);
			if (row) {
				weightSum += weight;
				fitSum += weight * row.systemFit;
			}
		}
		const cohesion =
			weightSum > 0
				? 0.5 * (fitSum / weightSum) +
					0.5 *
						(FIT_NEUTRAL + (coverage.coverageMean - COVERAGE_C0) * COVERAGE_GAIN)
				: undefined;

		// Lineup chemistry: actual 5-man units this season (regular season),
		// scored for role coverage against the system, next to their real
		// on-court results.
		const season = g.get("season");
		const lineupRows = (
			await idb.cache.lineups.indexGetAll("lineupsByTidSeason", [
				[inputs.tid, season],
				[inputs.tid, season],
			])
		).filter((l: Lineup) => !l.playoffs);

		const ratingsByPid = new Map(
			rosterAll.map((p) => [p.pid, p.ratings.at(-1) as any]),
		);
		const nameByPid = new Map(
			rosterAll.map((p) => [p.pid, `${p.firstName} ${p.lastName}`]),
		);

		const lineups = lineupRows
			.filter((l) => l.stats.min >= 10)
			.map((l) => {
				// Only score units whose players are all still on the roster.
				const unitRatings = l.pids
					.map((pid) => ratingsByPid.get(pid))
					.filter((r) => r !== undefined);
				const unitCoverage =
					unitRatings.length === l.pids.length
						? teamRoleCoverage(
								unitRatings.map((r) => ({ ratings: r })),
								coaching,
							)
						: undefined;

				const net =
					(l.stats.poss > 0 ? (100 * l.stats.pts) / l.stats.poss : 0) -
					(l.stats.oppPoss > 0 ? (100 * l.stats.oppPts) / l.stats.oppPoss : 0);

				return {
					players: l.pids.map((pid) => ({
						pid,
						name: nameByPid.get(pid) ?? "???",
					})),
					min: l.stats.min,
					net,
					chemistry: unitCoverage?.coverageMean,
					topShortage: unitCoverage?.shortages[0]?.need,
				};
			})
			.sort((a, b) => (b.chemistry ?? -1) - (a.chemistry ?? -1));

		return {
			abbrev: inputs.abbrev,
			tid: inputs.tid,
			season,
			coach: {
				cid: headCoach.cid,
				firstName: headCoach.firstName,
				lastName: headCoach.lastName,
				tactics: headCoach.ratings.tactics,
				adaptability,
			},
			coaching,
			cohesion,
			teamMessageData: {
				cohesion: cohesion ?? FIT_NEUTRAL,
				shortages: coverage.shortages,
				surpluses: coverage.surpluses,
			},
			needs: coverage.needs,
			players,
			lineups: lineups.slice(0, 25),
			challengeNoRatings: g.get("challengeNoRatings"),
		};
	}
};

export default updateTeamChemistryPage;
