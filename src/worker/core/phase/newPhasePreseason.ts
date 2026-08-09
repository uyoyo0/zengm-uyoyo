import {
	PLAYER,
	DEFAULT_PLAY_THROUGH_INJURIES,
	PHASE,
} from "../../../common/constants.ts";
import {
	coach,
	finances,
	freeAgents,
	league,
	player,
	realRosters,
	team,
} from "../index.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local, logEvent, toUI } from "../../util/index.ts";
import type {
	Conditions,
	PhaseReturn,
	TeamCoaching,
	TeamSeason,
} from "../../../common/types.ts";
import { playerCoachFit } from "../coach/style.ts";
import {
	driftShotTendencies,
	driftUsageTendency,
} from "../player/genTendencies.basketball.ts";
import {
	deriveTendenciesPerSeason,
	lerpTendenciesToward,
} from "../realRosters/deriveTendencies.basketball.ts";
import loadStatsBasketball, {
	type BasketballStats,
} from "../realRosters/loadStats.basketball.ts";
import { fitAdjustedCoachingLevel } from "../../../common/coachingConstants.ts";
import { groupByUnique, maxBy } from "../../../common/utils.ts";
import { applyRealTeamInfo } from "../../../common/applyRealTeamInfo.ts";
import getRealTeamInfo from "../../util/getRealTeamInfo.ts";
import { bySport, isSport } from "../../../common/sportFunctions.ts";
import { choice, randInt, uniform } from "../../../common/random.ts";
import { env } from "../../util/env.ts";

const newPhasePreseason = async (
	conditions: Conditions,
): Promise<PhaseReturn> => {
	// In case some weird situation results in games still in the schedule, clear them
	await idb.cache.schedule.clear();

	const repeatSeason = g.get("repeatSeason");
	const forceHistoricalRosters = g.get("forceHistoricalRosters");
	if (repeatSeason?.type !== "playersAndRosters" && !forceHistoricalRosters) {
		await freeAgents.autoSign();
	}
	const newSeason = g.get("season") + 1;
	await league.setGameAttributes({
		season: newSeason,
	});
	await toUI("updateLocal", [
		{
			games: [],
		},
	]);

	const teams = await idb.cache.teams.getAll();
	const teamsByTid = groupByUnique(teams, "tid");

	const realTeamInfo = await getRealTeamInfo();

	const popInfo: Record<
		string,
		{
			oldPop: number;
			newPop: number;
		}
	> = {};
	const sameRegionOverrides: Record<string, string> = {
		"San Jose": "San Francisco",
		"Golden State": "San Francisco",
		Brooklyn: "New York",
	};

	let updatedTeams = false;
	let scoutingLevel: number | undefined;
	for (const t of teams) {
		// Check if we need to override team info based on a season-specific entry in realTeamInfo
		if (realTeamInfo && t.srID && realTeamInfo[t.srID]) {
			const old = {
				region: t.region,
				name: t.name,
				imgURL: t.imgURL,
			};

			const updated = applyRealTeamInfo(t, realTeamInfo, newSeason, {
				exactSeason: true,
			});

			if (updated) {
				updatedTeams = true;
				await idb.cache.teams.put(t);

				if (t.region !== old.region) {
					const text = `The ${old.region} ${
						old.name
					} are now the <a href="${helpers.leagueUrl([
						"roster",
						`${t.abbrev}_${t.tid}`,
						newSeason,
					])}">${t.region} ${t.name}</a>.`;

					logEvent({
						text,
						type: "teamRelocation",
						tids: [t.tid],
						showNotification: false,
						score: 20,
					});
				} else if (t.name !== old.name) {
					const text = `the ${old.region} ${
						old.name
					} are now the <a href="${helpers.leagueUrl([
						"roster",
						`${t.abbrev}_${t.tid}`,
						newSeason,
					])}">${t.region} ${t.name}</a>.`;

					logEvent({
						text: helpers.upperCaseFirstLetter(text),
						type: "teamRename",
						tids: [t.tid],
						showNotification: false,
						score: 20,
					});
				} else if (t.imgURL && t.imgURL !== old.imgURL) {
					logEvent({
						text: `The <a href="${helpers.leagueUrl([
							"roster",
							`${t.abbrev}_${t.tid}`,
							newSeason,
						])}">${t.region} ${t.name}</a> got a new logo:<br><img src="${
							t.imgURL
						}" class="mt-2" style="max-width:120px;max-height:120px;">`,
						type: "teamLogo",
						tids: [t.tid],
						showNotification: false,
						score: 20,
					});
				}
			}
		}

		if (t.disabled) {
			continue;
		}

		let prevSeason: TeamSeason | undefined;
		// Only need scoutingLevel for the user's team to calculate fuzz when ratings are updated below.
		// This is done BEFORE a new season row is added.
		if (t.tid === g.get("userTid")) {
			const teamSeasons = await idb.getCopies.teamSeasons(
				{
					tid: t.tid,
					seasons: [newSeason - 3, newSeason - 1],
				},
				"noCopyCache",
			);
			scoutingLevel = await finances.getLevelLastThree("scouting", {
				t,
				teamSeasons,
			});
			prevSeason = teamSeasons.at(-1);
		} else {
			prevSeason = await idb.cache.teamSeasons.indexGet(
				"teamSeasonsByTidSeason",
				[t.tid, newSeason - 1],
			);
		}

		const newTeamSeason = team.genSeasonRow(t, prevSeason);

		t.pop ??= newTeamSeason.pop;
		t.stadiumCapacity ??= newTeamSeason.stadiumCapacity;

		// Mean population should stay constant, otherwise the economics change too much
		if (!g.get("equalizeRegions")) {
			// Check if this is the same region as another team, in which case keep the populations in sync
			const actualRegion = sameRegionOverrides[t.region] ?? t.region;
			if (
				actualRegion !== "" &&
				popInfo[actualRegion] &&
				popInfo[actualRegion].oldPop === t.pop
			) {
				t.pop = popInfo[actualRegion].newPop;
			} else {
				const newPop = t.pop * uniform(0.98, 1.02);
				popInfo[actualRegion] = {
					oldPop: t.pop,
					newPop,
				};
				t.pop = newPop;
			}
		}
		newTeamSeason.pop = t.pop;

		await idb.cache.teamSeasons.add(newTeamSeason);
		await idb.cache.teamStats.add(team.genStatsRow(t.tid));

		if (t.disabled) {
			// Active teams are persisted below
			await idb.cache.teams.put(t);
		}
	}

	const activeTeams = teams.filter((t) => !t.disabled);
	const popRanks = helpers.getPopRanks(activeTeams);
	for (const [i, t] of activeTeams.entries()) {
		if (
			!g.get("userTids").includes(t.tid) ||
			local.autoPlayUntil ||
			g.get("spectator")
		) {
			await team.resetTicketPrice(t, popRanks[i]!);

			// Sometimes update budget items for AI teams
			for (const key of [
				"scouting",
				"coaching",
				"health",
				"facilities",
			] as const) {
				if (Math.random() < 0.5) {
					t.budget[key] = finances.defaultBudgetLevel(popRanks[i]!);
				}
			}

			t.adjustForInflation = true;
			t.autoTicketPrice = true;
			t.keepRosterSorted = true;
			t.playThroughInjuries = DEFAULT_PLAY_THROUGH_INJURIES;

			await idb.cache.teams.put(t);
		}
	}

	if (updatedTeams) {
		await league.setGameAttributes({
			teamInfoCache: teams.map((t) => ({
				abbrev: t.abbrev,
				disabled: t.disabled,
				imgURL: t.imgURL,
				imgURLSmall: t.imgURLSmall,
				name: t.name,
				region: t.region,
			})),
		});
	}

	if (scoutingLevel === undefined) {
		throw new Error("scoutingLevel should be defined");
	}

	// Update every team's effective coaching style from its coach + roster, and
	// drive player development from the coach's development rating (basketball).
	// Other sports keep using the team's coaching budget level.
	const coachingLevels: Record<number, number> = {};
	// Lazily loaded real career stats, for Tendency Determinism (only needed
	// when a real player is still within his real-data span). Failure-tolerant:
	// leagues without access to the stats file just fall back to skill drift.
	let tendencyStatsBySlug:
		Map<string, BasketballStats["stats"]> | null | undefined;
	const getTendencyStatsBySlug = async () => {
		if (tendencyStatsBySlug === undefined) {
			try {
				const { stats } = await loadStatsBasketball();
				tendencyStatsBySlug = new Map();
				for (const row of stats) {
					const existing = tendencyStatsBySlug.get(row.slug);
					if (existing) {
						existing.push(row);
					} else {
						tendencyStatsBySlug.set(row.slug, [row]);
					}
				}
			} catch {
				tendencyStatsBySlug = null;
			}
		}
		return tendencyStatsBySlug;
	};

	// Each team's effective style dials, for the per-player system-fit
	// development adjustment. Read fresh after updateTeamCoaching runs.
	const teamCoachingByTid = new Map<number, TeamCoaching>();
	const coachAdaptabilityByTid = new Map<number, number>();
	const coachTacticsByTid = new Map<number, number>();
	if (isSport("basketball")) {
		await coach.processCoachMarket(conditions);
		await coach.updateTeamCoaching();
		const coaches = await idb.cache.coaches.getAll();
		const developmentByTid = new Map(
			coaches.map((c) => [c.tid, c.ratings.development]),
		);
		for (const c of coaches) {
			if (c.tid >= 0) {
				coachAdaptabilityByTid.set(c.tid, c.ratings.adaptability);
				coachTacticsByTid.set(c.tid, c.ratings.tactics);
			}
		}
		for (const t of teams) {
			// Coachless team = neutral coach (dev 50), not the budget-level default.
			coachingLevels[t.tid] = developmentByTid.get(t.tid) ?? 50;
		}
		for (const t of await idb.cache.teams.getAll()) {
			if (t.coaching) {
				teamCoachingByTid.set(t.tid, t.coaching);
			}
		}
	} else {
		for (const t of teams) {
			const teamSeasons = await idb.getCopies.teamSeasons(
				{
					tid: t.tid,
					seasons: [newSeason - 3, newSeason - 1],
				},
				"noCopyCache",
			);
			coachingLevels[t.tid] = await finances.getLevelLastThree("coaching", {
				t,
				teamSeasons,
			});
		}
	}

	const players = await idb.cache.players.indexGetAll("playersByTid", [
		PLAYER.FREE_AGENT,
		Infinity,
	]);

	if (forceHistoricalRosters) {
		// Also need to bring in the previous draft class who haven't been assigned a team yet
		players.push(
			...(await idb.cache.players.indexGetAll("playersByDraftYearRetiredYear", [
				[newSeason - 1],
				[newSeason - 1, Infinity],
			])),
		);
	}

	// Small chance that a player was lying about his age!
	if (!repeatSeason && !forceHistoricalRosters && Math.random() < 0.01) {
		const p = player.getPlayerFakeAge(players);

		if (p) {
			const gender = g.get("gender");
			const years = randInt(1, 4);
			const age0 = newSeason - p.born.year;
			p.born.year -= years;
			const age1 = newSeason - p.born.year;
			const name = `<a href="${helpers.leagueUrl(["player", p.pid])}">${
				p.firstName
			} ${p.lastName}</a>`;
			const reason = choice([
				`A newly discovered Kenyan birth certificate suggests that ${name}`,
				`In a televised press conference, the parents of ${name} explained how they faked ${helpers.pronoun(
					gender,
					"his",
				)} age as a child to make ${helpers.pronoun(
					gender,
					"him",
				)} perform better against younger competition. ${helpers.pronoun(
					gender,
					"He",
				)}`,
				`Internet sleuths on /r/${bySport({
					baseball: "baseball",
					basketball: "nba",
					football: "nfl",
					hockey: "hockey",
				})} uncovered evidence that ${name}`,
				`Internet sleuths on Twitter uncovered evidence that ${name}`,
				`In an emotional interview on 60 Minutes, ${name} admitted that ${helpers.pronoun(
					gender,
					"he",
				)}`,
				`During a preseason locker room interview, ${name} accidentally revealed that ${helpers.pronoun(
					gender,
					"he",
				)}`,
				`In a Reddit AMA, ${name} confirmed that ${helpers.pronoun(
					gender,
					"he",
				)}`,
				`A recent Wikileaks report revealed that ${name}`,
				`A foreign ID from the stolen luggage of ${name} revealed ${helpers.pronoun(
					gender,
					"he",
				)}`,
			]);
			logEvent(
				{
					type: "ageFraud",
					text: `${reason} is actually ${age1} years old, not ${age0} as was previously thought.`,
					showNotification: p.tid === g.get("userTid"),
					pids: [p.pid],
					tids: [p.tid],
					persistent: true,
					score: 20,
				},
				conditions,
			);
		}
	}

	// Context for the preseason popularity update (basketball): last season's
	// playoff results, built once instead of per player.
	const popularityContext = {
		lastSeason: newSeason - 1,
		numGames: g.get("numGames"),
		playoffRoundsWonByTid: new Map<number, number>(),
		numPlayoffRounds: g.get("numGamesPlayoffSeries", newSeason - 1).length,
	};
	if (isSport("basketball")) {
		const lastTeamSeasons = await idb.cache.teamSeasons.indexGetAll(
			"teamSeasonsBySeasonTid",
			[[newSeason - 1], [newSeason - 1, "Z"]],
		);
		for (const ts of lastTeamSeasons) {
			popularityContext.playoffRoundsWonByTid.set(ts.tid, ts.playoffRoundsWon);
		}
	}

	// Loop through all non-retired players
	for (const p of players) {
		if (isSport("hockey") && p.numConsecutiveGamesG !== undefined) {
			p.numConsecutiveGamesG = 0;
		}
		if (isSport("baseball") && p.pFatigue !== undefined && p.pFatigue > 0) {
			p.pFatigue = 0;
		}
		if (isSport("soccer")) {
			p.soccerFitness = 1;
			p.soccerLastMatchDay = undefined;
		}

		if (repeatSeason) {
			if (repeatSeason.type === "playersAndRosters") {
				const info = repeatSeason.players[p.pid];
				if (info) {
					p.tid = info.tid;
					p.injury = helpers.deepCopy(info.injury);
					p.contract = helpers.deepCopy(info.contract);

					p.contract.exp += newSeason - repeatSeason.startingSeason;
					p.salaries.push({
						season: p.contract.exp,
						amount: p.contract.amount,
					});
				} else {
					p.tid = PLAYER.FREE_AGENT;
				}
			}

			// First entry for last season, so it skips injuries
			const newRatings = helpers.deepCopy(
				p.ratings.find((pr) => pr.season === newSeason - 1),
			);
			if (newRatings) {
				newRatings.season += 1;
				p.ratings.push(newRatings);
			}

			p.transactions = [];
			p.born.year += 1;
		} else {
			// Update ratings
			player.addRatingsRow(p, scoutingLevel);

			// System fit tweaks how much this player gets out of the coach:
			// good-fit players develop as if the coach's development rating were
			// a bit higher, bad-fit a bit lower.
			let coachingLevel = coachingLevels[p.tid];
			const teamCoaching = teamCoachingByTid.get(p.tid);
			if (teamCoaching && coachingLevel !== undefined) {
				const ratings = p.ratings.at(-1);
				if (ratings) {
					const fit = playerCoachFit(
						ratings as any,
						teamCoaching,
						coachAdaptabilityByTid.get(p.tid) ?? 50,
					);
					coachingLevel = fitAdjustedCoachingLevel(coachingLevel, fit);
				}
			}
			await player.develop(p, 1, false, coachingLevel);

			// Fan popularity for the new season, from last season's play.
			if (isSport("basketball")) {
				player.updatePopularity(p, popularityContext);

				// Behavioral identity for the new season. Two forces:
				// - Tendency Determinism: while the league is still within a real
				//   player's real-data span, pull his tendencies toward his real
				//   career arc for this season (100% = re-track it exactly).
				// - Skill drift: toward what his CURRENT (sim-developed) skills
				//   imply, paced by the coach's tactics. Full strength for
				//   fictional players and beyond the real-data span; scaled by
				//   (1 - determinism) within it - so at 0% determinism, real
				//   players match real life at creation and then immediately
				//   develop like fictional players.
				const ratings = p.ratings.at(-1);
				if (ratings) {
					const coachTactics = coachTacticsByTid.get(p.tid) ?? 50;
					const dataEnd = (ratings as any).tendencyDataEnd;
					// Walk the player's own career arc, not the league calendar:
					// tendencyVintage is the real season his current tendencies
					// represent (equal to the calendar in a normal real league, but a
					// cross-era 1996 vintage or a random debut ages through HIS
					// career years). Falls back to the calendar for rows from before
					// vintage tracking existed.
					const vintage = (ratings as any).tendencyVintage;
					const virtualSeason = vintage !== undefined ? vintage + 1 : newSeason;
					const withinRealSpan =
						typeof p.srID === "string" &&
						dataEnd !== undefined &&
						virtualSeason <= dataEnd;
					let driftStrength = 1;
					let lerped = false;
					if (withinRealSpan) {
						const determinism = helpers.bound(
							g.get("realTendencyDeterminism") ?? 1,
							0,
							1,
						);
						driftStrength = 1 - determinism;
						if (determinism > 0) {
							const statsBySlug = await getTendencyStatsBySlug();
							const careerStats = statsBySlug?.get(p.srID!) ?? [];
							if (careerStats.length > 0) {
								const target = deriveTendenciesPerSeason(
									careerStats,
									[{ ...(ratings as any), season: virtualSeason }],
									helpers.bound(g.get("realTendenciesSeasonality") ?? 1, 0, 1),
									0,
								).get(virtualSeason);
								if (target) {
									lerpTendenciesToward(ratings, target, determinism);
									lerped = true;
								}
							}
						}
					}
					// Advance the vintage even when not lerping (the lerp target
					// already carries it), so the arc position keeps tracking.
					if (!lerped && vintage !== undefined) {
						(ratings as any).tendencyVintage = virtualSeason;
					}
					driftUsageTendency(ratings as any, coachTactics, driftStrength);
					driftShotTendencies(ratings as any, coachTactics, driftStrength);
				}
			}
		}

		if (
			forceHistoricalRosters &&
			p.draft.year < newSeason &&
			p.tid !== PLAYER.RETIRED
		) {
			if (p.srID === undefined) {
				p.tid = PLAYER.FREE_AGENT;
			} else {
				const playerActiveSeasons = await realRosters.getPlayerActiveSeasons();
				let tid = playerActiveSeasons[p.srID]?.[newSeason];
				if (tid !== undefined) {
					const newTeam = teamsByTid[tid];
					if (!newTeam || newTeam.disabled) {
						// When editing league, a team that should exist could be deleted or disabled. In which case it makes no sense to use forceHistoricalRosters probably, but we still shouldn't assign to an invalid tid because that causes many other errors.
						tid = undefined;
					}
				}

				p.tid = tid ?? PLAYER.FREE_AGENT;

				if (p.tid >= 0 && p.contract.exp < newSeason) {
					p.contract = {
						amount: player.genContract(p).amount,
						exp:
							newSeason -
							1 +
							randInt(g.get("minContractLength"), g.get("maxContractLength")),
					};
				}
			}
		}
	}

	// Again, so updateValues can happen after new mean/std is calculated
	local.playerOvrMeanStdStale = true;
	for (const p of players) {
		if (!repeatSeason) {
			// Update player values after ratings changes
			await player.updateValues(p);
		}
	}

	if (repeatSeason?.type !== "playersAndRosters") {
		await freeAgents.normalizeContractDemands({
			type: "dummyExpiringContracts",

			// Set this because otherwise the season+phase combo appears off when setting contract expiration
			nextSeason: true,
		});
	}

	local.minFractionDiffs = undefined;

	// Handle jersey number conflicts
	const playersByTeam = Map.groupBy(
		players.filter((p) => p.tid >= 0),
		(p) => p.tid,
	);
	for (const roster of playersByTeam.values()) {
		if (!roster[0]) {
			continue;
		}
		const retiredJerseyNumbers = new Set(
			teamsByTid[roster[0].tid]?.retiredJerseyNumbers?.map((row) => row.number),
		);

		for (const p of roster) {
			const jerseyNumber = p.jerseyNumber;
			if (jerseyNumber === undefined) {
				continue;
			}

			// Conflicts with retired numbers
			if (retiredJerseyNumbers.has(jerseyNumber)) {
				player.setJerseyNumber(p, await player.genJerseyNumber(p), {
					phase: PHASE.PRESEASON,
				});
			} else {
				// Conflicts with teammates
				const conflicts = roster.filter(
					(p2) => p2.jerseyNumber === jerseyNumber,
				);
				if (conflicts.length > 1) {
					// Conflict! Who gets to keep the number? The one with the highest career peak ovr!
					const playerWhoKeepsIt = maxBy(
						conflicts,
						(p) => maxBy(p.ratings, "ovr")!.ovr,
					);

					for (const p of conflicts) {
						if (p !== playerWhoKeepsIt) {
							player.setJerseyNumber(p, await player.genJerseyNumber(p), {
								phase: PHASE.PRESEASON,
							});
						}
					}
				}
			}
		}

		// One more pass, for players without jersey numbers at all (draft picks)
		for (const p of roster) {
			if (p.jerseyNumber === undefined) {
				player.setJerseyNumber(p, await player.genJerseyNumber(p), {
					phase: PHASE.PRESEASON,
				});
			}
		}
	}

	for (const p of players) {
		await idb.cache.players.put(p);
	}

	await realRosters.checkDisableForceHistoricalRosters(
		newSeason,
		PHASE.PRESEASON,
	);

	// No ads during multi season auto sim
	if (env.enableLogging && !local.autoPlayUntil) {
		toUI("showModal", [], conditions);
	}

	return {
		updateEvents: ["playerMovement"],
	};
};

export default newPhasePreseason;
