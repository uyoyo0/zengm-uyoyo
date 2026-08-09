import { draft, player, freeAgents } from "../../index.ts";
import {
	PHASE,
	PLAYER,
	POSITION_COUNTS,
} from "../../../../common/constants.ts";
import { groupByUnique, orderBy } from "../../../../common/utils.ts";
import type {
	PlayerWithoutKey,
	PlayerContract,
	Team,
} from "../../../../common/types.ts";
import { g } from "../../../util/index.ts";
import { shuffle } from "../../../../common/random.ts";
import { isSport } from "../../../../common/sportFunctions.ts";
import createPremierLeaguePlayers, {
	isDefaultPremierLeague,
} from "./createPremierLeaguePlayers.ts";

export const getNumPlayersPerTeam = () => {
	if (isSport("soccer")) {
		return Object.values(POSITION_COUNTS).reduce(
			(sum, count) => sum + count,
			0,
		);
	}

	// 13 for basketball
	return Math.max(g.get("maxRosterSize") - 2, g.get("minRosterSize"));
};

const createRandomPlayers = async ({
	activeTids,
	onlyFreeAgents,
	scoutingLevel,
	teams,
}: {
	activeTids: number[];
	onlyFreeAgents: boolean;
	scoutingLevel: number;
	teams: Pick<Team, "tid" | "retiredJerseyNumbers">[];
}) => {
	const players: PlayerWithoutKey[] = [];

	if (
		isSport("soccer") &&
		!onlyFreeAgents &&
		isDefaultPremierLeague(activeTids, teams)
	) {
		return createPremierLeaguePlayers(scoutingLevel);
	}

	// Generate past 20 years of draft classes, unless forceRetireSeasons/forceRetireAge/draftAges make that infeasible
	let seasonsSimmed = 20;
	const forceRetireAge = g.get("forceRetireAge");
	const draftAges = g.get("draftAges");
	const forceRetireSeasons = g.get("forceRetireSeasons");
	const averageDraftAge = Math.round((draftAges[0] + draftAges[1]) / 2);
	const forceRetireAgeDiff = forceRetireAge - averageDraftAge;
	let forceRetireDiff;
	if (forceRetireSeasons > 0 && forceRetireAgeDiff > 0) {
		forceRetireDiff = Math.min(forceRetireSeasons, forceRetireAgeDiff);
	} else {
		forceRetireDiff = Math.max(forceRetireSeasons, forceRetireAgeDiff);
	}
	if (forceRetireDiff > 0 && forceRetireDiff < seasonsSimmed) {
		seasonsSimmed = forceRetireDiff;
	} else {
		// Maybe add some extra seasons, for leagues when players start young
		const estimatedRetireAge = forceRetireDiff > 0 ? forceRetireAge : 35;
		const estimatedRetireAgeDiff = estimatedRetireAge - averageDraftAge;
		if (estimatedRetireAgeDiff > seasonsSimmed) {
			seasonsSimmed = estimatedRetireAgeDiff;
		}
	}

	const seasonOffset = g.get("phase") >= PHASE.RESIGN_PLAYERS ? -1 : 0;
	const NUM_PAST_SEASONS = seasonsSimmed + seasonOffset;

	// Keep synced with Dropdown.js seasonsAndOldDrafts and addRelatives
	const rookieSalaries = draft.getRookieSalaries();
	let keptPlayers: PlayerWithoutKey[] = [];

	if (isSport("soccer")) {
		// Soccer starts with many more clubs than the other sports. Generating a
		// complete historical draft class for every past season produces thousands
		// of players who are immediately discarded and makes new-league creation
		// take minutes. Build the initial senior-player pool directly instead. The
		// normal intake generator is still used after league creation.
		const numPlayers = activeTids.length * (getNumPlayersPerTeam() + 6);
		const minAge = g.get("draftAges")[0];
		const maxAge = Math.min(g.get("forceRetireAge") - 1, 35);

		for (let i = 0; i < numPlayers; i++) {
			const age = minAge + (i % (maxAge - minAge + 1));
			const p = await player.generate(
				PLAYER.UNDRAFTED,
				minAge,
				g.get("season"),
				false,
				scoutingLevel,
				await player.name(),
				true,
			);

			await player.develop(p, 0);
			const draftRatings = {
				ovr: p.ratings[0].ovr,
				pot: p.ratings[0].pot,
				skills: p.ratings[0].skills,
			};

			await player.develop(p, age - minAge, true);
			p.draft = {
				round: 0,
				pick: 0,
				tid: -1,
				originalTid: -1,
				year: g.get("season") - (age - minAge),
				...draftRatings,
			};
			p.contract.exp = -Infinity;
			p.contract.temp = true;
			keptPlayers.push(p);
		}
	} else {
		for (
			let numYearsAgo = NUM_PAST_SEASONS;
			numYearsAgo > seasonOffset;
			numYearsAgo--
		) {
			let draftClass = await draft.genPlayersWithoutSaving(
				g.get("season"),
				scoutingLevel,
				[],
			);

			// value is needed for ordering the historical draft class. This is value AT THE TIME OF THE DRAFT! Will be regenerated below for subsequent use.
			for (const p of draftClass) {
				p.value = player.value(p, {
					ovrMean: 47,
					ovrStd: 10,
				});
			}

			// Very rough simulation of a draft
			draftClass = orderBy(draftClass, "value", "desc");
			const tids = [...activeTids];
			shuffle(tids);

			for (const [i, p] of draftClass.entries()) {
				let round = 0;
				let pick = 0;
				const roundTemp = Math.floor(i / activeTids.length) + 1;

				if (roundTemp <= g.get("numDraftRounds")) {
					round = roundTemp;
					pick = (i % activeTids.length) + 1;
				}

				// Save these for later, because player.develop will overwrite them

				const pot = p.ratings[0].pot;
				const ovr = p.ratings[0].ovr;
				const skills = p.ratings[0].skills;

				// Develop player and see if he is still non-retired

				await player.develop(p, numYearsAgo, true);

				// Do this before developing, to save ratings
				p.draft = {
					round,
					pick,
					tid: round === 0 ? -1 : tids[pick - 1]!,
					year: g.get("season") - numYearsAgo,
					originalTid: round === 0 ? -1 : tids[pick - 1]!,
					pot,
					ovr,
					skills,
				};

				if (round === 0) {
					// Guaranteed contracts for undrafted players are overwritten below
					p.contract.exp = -Infinity;
				} else {
					let years;
					if (g.get("draftPickAutoContract")) {
						years = draft.getRookieContractLength(round);
					} else {
						// 2 years for 2nd round, 3 years for 1st round;
						years = Math.min(4 - round, 2);
					}

					const contract: PlayerContract = {
						amount: rookieSalaries[i]!,
						exp: g.get("season") - numYearsAgo + years,
					};
					if (g.get("draftPickAutoContract")) {
						contract.rookie = true;
					}

					player.setContract(p, contract, false);
				}
				p.contract.temp = true;

				keptPlayers.push(p);
			}
		}
	}

	const numPlayerPerTeam = getNumPlayersPerTeam();

	// One extra per team for wiggle room (need min contract FAs sometimes).
	// The soccer path explicitly generates six extras per team.
	if (keptPlayers.length < (numPlayerPerTeam + 1) * activeTids.length) {
		throw new Error("Not enough players!");
	}

	const maxNumFreeAgents = Math.round(
		(activeTids.length / 3) * g.get("maxRosterSize"),
	); // 150 for basketball

	// Needed for sorting the keptPlayers array and inside getBest (only if DRAFT_BY_TEAM_OVR)
	for (const p of keptPlayers) {
		p.value = player.value(p, {
			ovrMean: 47,
			ovrStd: 10,
		});
	}
	keptPlayers.sort((a, b) => b.value - a.value);

	// Keep track of number of players on each team
	const numPlayersByTid: Record<number, number> = {};

	for (const tid2 of activeTids) {
		numPlayersByTid[tid2] = 0;
	}

	const teamJerseyNumbers: Record<number, string[]> = {};
	const playersByTid = new Map(
		activeTids.map((tid) => [tid, [] as PlayerWithoutKey[]]),
	);

	const teamsByTid = groupByUnique(teams, "tid");

	const addPlayerToTeam = async (p: PlayerWithoutKey, tid2: number) => {
		if (!teamJerseyNumbers[tid2]) {
			teamJerseyNumbers[tid2] = [];
		}

		const t = teamsByTid[tid2];
		const retiredJerseyNumbers =
			t?.retiredJerseyNumbers?.map((row) => row.number) ?? [];

		numPlayersByTid[tid2]! += 1;
		p.tid = tid2;
		player.setJerseyNumber(
			p,
			await player.genJerseyNumber(
				p,
				teamJerseyNumbers[tid2],
				retiredJerseyNumbers,
			),
		);

		if (p.jerseyNumber !== undefined) {
			teamJerseyNumbers[tid2].push(p.jerseyNumber);
		}

		// Keep rookie contract, or no?
		if (p.contract.exp >= g.get("season") && g.get("draftPickAutoContract")) {
			delete p.contract.temp;
		}

		players.push(p);
		playersByTid.get(tid2)!.push(p);
	};

	const probStillOnDraftTeam = (p: PlayerWithoutKey) => {
		let prob = 0; // Probability a player is still on his draft team

		const numYearsAgo = g.get("season") - p.draft.year;

		if (typeof p.draft.round === "number") {
			if (numYearsAgo < 8) {
				prob = (8 - numYearsAgo) / 8; // 87.5% for last year, 75% for 2 years ago, etc
			} else {
				prob = 0.125;
			}

			if (p.draft.round > 1) {
				prob *= 0.75;
			}

			if (p.draft.round > 3) {
				prob *= 0.75;
			}

			if (p.draft.round > 5) {
				prob *= 0.75;
			}

			if (p.draft.round > 7) {
				prob *= 0.75;
			}
		}

		return prob;
	};

	// Drafted players kept with own team, with some probability
	const playersStayedOnOwnTeam = new Set();
	for (let i = 0; i < numPlayerPerTeam * activeTids.length; i++) {
		const p = keptPlayers[i]!;

		if (
			p.draft.tid >= 0 &&
			Math.random() < probStillOnDraftTeam(p) &&
			numPlayersByTid[p.draft.tid]! < numPlayerPerTeam
		) {
			await addPlayerToTeam(p, p.draft.tid);
			playersStayedOnOwnTeam.add(p);
		}
	}
	keptPlayers = keptPlayers.filter((p) => !playersStayedOnOwnTeam.has(p));

	// Soccer does not need the expensive team-OVR fit calculation used by some
	// draft sports. The pool is already sorted best-first, and every generated
	// player is eligible while filling the initial 30-player rosters. Reverse it
	// once so each selection is an O(1) pop rather than repeatedly scanning and
	// copying a pool of thousands of players.
	const fastRosterAssignment = isSport("soccer");
	if (fastRosterAssignment) {
		keptPlayers.reverse();
	}

	// Then add other players, up to the limit
	while (true) {
		// Random order tids, so no team is a superpower
		const tids = [...activeTids];
		shuffle(tids);
		let numTeamsDone = 0;

		for (const currentTid of tids) {
			if (numPlayersByTid[currentTid]! >= numPlayerPerTeam) {
				numTeamsDone += 1;
				continue;
			}

			const p = fastRosterAssignment
				? keptPlayers.pop()
				: freeAgents.getBest(playersByTid.get(currentTid)!, keptPlayers);

			if (p) {
				if (!fastRosterAssignment) {
					const index = keptPlayers.indexOf(p);
					if (index >= 0) {
						keptPlayers.splice(index, 1);
					}
				}
				await addPlayerToTeam(p, currentTid);
			} else {
				console.log(currentTid, "can't find player");
				numTeamsDone += 1;
			}
		}

		if (numTeamsDone === activeTids.length) {
			break;
		}
	}

	if (fastRosterAssignment) {
		keptPlayers.reverse();
	}

	// Assume this is all 0 for a new league
	const numPlayersTradedAwayNormalized: Record<number, number> = {};
	for (const tid of activeTids) {
		numPlayersTradedAwayNormalized[tid] = 0;
	}

	const addToFreeAgents = (p: PlayerWithoutKey | undefined) => {
		// TEMP DISABLE WITH ESLINT 9 UPGRADE eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (p) {
			// So half will be eligible to retire after the first season
			p.yearsFreeAgent = Math.random() > 0.5 ? 1 : 0;

			player.setContract(
				p,
				{
					amount: g.get("minContract"),
					exp: g.get("season"),
				},
				false,
			);
			p.contract.temp = true;
			player.addToFreeAgents(p, numPlayersTradedAwayNormalized);
			players.push(p);
		}
	};

	// Finally, free agents
	if (Object.keys(POSITION_COUNTS).length === 0) {
		for (let i = 0; i < maxNumFreeAgents; i++) {
			addToFreeAgents(keptPlayers[i]);
		}
	} else {
		// POSITION_COUNTS exists, so use it to keep a balanced list of free agents
		let positionCountsSum = 0;
		for (const positionCount of Object.values(POSITION_COUNTS)) {
			positionCountsSum += positionCount;
		}

		const groupedPlayers = Object.groupBy(keptPlayers, (p) => p.ratings[0].pos);

		for (const pos of Object.keys(groupedPlayers)) {
			const limit = Math.round(
				(maxNumFreeAgents * POSITION_COUNTS[pos]!) / positionCountsSum,
			);

			for (let i = 0; i < limit; i++) {
				addToFreeAgents(groupedPlayers[pos]![i]);
			}
		}
	}

	if (onlyFreeAgents) {
		// Okay, then why did we create the other players in the first place? Because this ensures the distribution of talnet in the free agent pool is the same as in normal leagues.
		return players.filter((p) => p.tid === PLAYER.FREE_AGENT);
	}

	return players;
};

export default createRandomPlayers;
