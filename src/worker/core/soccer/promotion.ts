import type {
	SoccerCompetition,
	SoccerCompetitionSeason,
	SoccerCompetitionTeamSeason,
} from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";

const orderedTable = async (compId: string) => {
	const rows = await idb.league.getAllFromIndex(
		"soccerCompetitionTeamSeasons",
		"season",
		g.get("season"),
	);
	return rows
		.filter((row) => row.compId === compId)
		.toSorted(
			(a, b) =>
				b.pts - a.pts ||
				b.gf - b.ga - (a.gf - a.ga) ||
				b.gf - a.gf ||
				a.tid - b.tid,
		);
};

const putOutcome = async (
	row: SoccerCompetitionTeamSeason | undefined,
	outcome: SoccerCompetitionTeamSeason["outcome"],
) => {
	if (!row) {
		return;
	}
	row.outcome = outcome;
	await idb.league.put("soccerCompetitionTeamSeasons", row);
};

const createPromotionPlayoffs = async () => {
	const season = g.get("season");
	for (const aid of ["eng", "esp", "ita"] as const) {
		for (const sourceTier of [2, 3] as const) {
			const leagueCompId = `${aid}-league-${sourceTier}`;
			const table = await orderedTable(leagueCompId);
			if (table.length < 6) {
				continue;
			}
			await Promise.all([
				putOutcome(table[0], "promoted"),
				putOutcome(table[1], "promoted"),
			]);
			const compId = `${aid}-promotion-${sourceTier}`;
			const participants = table.slice(2, 6).map((row) => row.tid);
			const competition: SoccerCompetition = {
				compId,
				name: `${aid.toUpperCase()} Division ${sourceTier} Promotion Playoff`,
				shortName: `${aid.toUpperCase()} PO`,
				type: "promotionPlayoff",
				aid,
				tier: sourceTier,
			};
			const ties = [
				{
					tieId: `${compId}:${season}:r1:0`,
					homeTid: participants[0]!,
					awayTid: participants[3]!,
				},
				{
					tieId: `${compId}:${season}:r1:1`,
					homeTid: participants[1]!,
					awayTid: participants[2]!,
				},
			];
			const competitionSeason: SoccerCompetitionSeason = {
				key: `${season}:${compId}`,
				season,
				compId,
				status: "active",
				participantTids: participants,
				rounds: [{ name: "Semifinals", ties }],
			};
			await idb.league.put("soccerCompetitions", competition);
			await idb.league.put("soccerCompetitionSeasons", competitionSeason);
			for (const tid of participants) {
				const row: SoccerCompetitionTeamSeason = {
					key: `${season}:${compId}:${tid}`,
					season,
					compId,
					tid,
					gp: 0,
					won: 0,
					drawn: 0,
					lost: 0,
					gf: 0,
					ga: 0,
					pts: 0,
				};
				await idb.league.put("soccerCompetitionTeamSeasons", row);
			}
			for (const tie of ties) {
				await idb.cache.schedule.add({
					homeTid: tie.homeTid,
					awayTid: tie.awayTid,
					day: 1,
					compId,
					competitionStage: "Semifinals",
					tieId: tie.tieId,
					requiresWinner: true,
				});
			}
		}
	}
};

const applyPromotions = async () => {
	const season = g.get("season");
	for (let associationIndex = 0; associationIndex < 3; associationIndex++) {
		const aid = ["eng", "esp", "ita"][associationIndex]!;
		for (const sourceTier of [2, 3] as const) {
			const sourceTable = await orderedTable(`${aid}-league-${sourceTier}`);
			const destinationTable = await orderedTable(
				`${aid}-league-${sourceTier - 1}`,
			);
			const playoff = await idb.league.get(
				"soccerCompetitionSeasons",
				`${season}:${aid}-promotion-${sourceTier}`,
			);
			const promoted = [
				sourceTable[0]?.tid,
				sourceTable[1]?.tid,
				playoff?.championTid,
			].filter((tid): tid is number => tid !== undefined);
			const relegated = destinationTable.slice(-3).map((row) => row.tid);
			for (const tid of promoted) {
				const t = await idb.cache.teams.get(tid);
				if (!t) {
					continue;
				}
				t.did = associationIndex * 3 + sourceTier - 2;
				t.soccerTier = (sourceTier - 1) as 1 | 2;
				await idb.cache.teams.put(t);
				await putOutcome(
					sourceTable.find((row) => row.tid === tid),
					"promoted",
				);
			}
			for (const tid of relegated) {
				const t = await idb.cache.teams.get(tid);
				if (!t) {
					continue;
				}
				t.did = associationIndex * 3 + sourceTier - 1;
				t.soccerTier = sourceTier;
				await idb.cache.teams.put(t);
				await putOutcome(
					destinationTable.find((row) => row.tid === tid),
					"relegated",
				);
			}
		}
	}
	await idb.league.put("soccerCompetitionSeasons", {
		key: `${season}:promotion-applied`,
		season,
		compId: "promotion-applied",
		status: "complete",
		participantTids: [],
	});
};

export const ensurePromotionStage = async () => {
	const season = g.get("season");
	if (
		await idb.league.get(
			"soccerCompetitionSeasons",
			`${season}:promotion-applied`,
		)
	) {
		return "complete" as const;
	}
	const existing = await idb.league.get(
		"soccerCompetitionSeasons",
		`${season}:eng-promotion-2`,
	);
	if (!existing) {
		await createPromotionPlayoffs();
		return "scheduled" as const;
	}
	const all = await idb.league.getAllFromIndex(
		"soccerCompetitionSeasons",
		"season",
		season,
	);
	const promotionCompetitions = all.filter((row) =>
		row.compId.includes("-promotion-"),
	);
	if (
		promotionCompetitions.length === 6 &&
		promotionCompetitions.every((row) => row.status === "complete")
	) {
		await applyPromotions();
		return "complete" as const;
	}
	return "active" as const;
};

export default ensurePromotionStage;
