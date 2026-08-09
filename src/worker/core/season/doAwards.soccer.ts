import type { Conditions, PlayerFiltered } from "../../../common/types.ts";
import type {
	AwardPlayer,
	Awards,
	Position,
} from "../../../common/types.soccer.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import {
	addSimpleAndTeamAwardsToAwardsByPlayer,
	getPlayers,
	getTopPlayers,
	saveAwardsByPlayer,
	teamAwards,
	type AwardsByPlayer,
} from "./awards.ts";

const info = (p: PlayerFiltered): AwardPlayer => ({
	pid: p.pid,
	name: p.name,
	tid: p.tid,
	pos: p.pos as Position,
	gp: p.currentStats.gp ?? 0,
	g: p.currentStats.g ?? 0,
	a: p.currentStats.a ?? 0,
	xg: p.currentStats.xg ?? 0,
	xa: p.currentStats.xa ?? 0,
	cs: p.currentStats.cs ?? 0,
	tkl: p.currentStats.tkl ?? 0,
	int: p.currentStats.int ?? 0,
	clr: p.currentStats.clr ?? 0,
	sv: p.currentStats.sv ?? 0,
	ga: p.currentStats.ga ?? 0,
	svPct: p.currentStats.svPct ?? 0,
	matchRating: p.currentStats.matchRating ?? 0,
});

export const mvpScore = (p: PlayerFiltered) =>
	(p.currentStats.g ?? 0) * 5 +
	(p.currentStats.a ?? 0) * 3 +
	(p.currentStats.drbCmp ?? 0) * 0.08 +
	(p.currentStats.prgP ?? 0) * 0.01 +
	(p.currentStats.prgC ?? 0) * 0.04 +
	(p.currentStats.matchRating ?? 0) * 0.3;
export const cupMvpScore = (p: PlayerFiltered) =>
	(p.currentStats.gp ?? 0) * (p.currentStats.matchRating ?? 0) +
	(p.currentStats.g ?? 0) * 4 +
	(p.currentStats.a ?? 0) * 2.5 +
	(p.currentStats.cs ?? 0) * 0.5 +
	(p.currentStats.sv ?? 0) * 0.05 +
	((p.currentStats.psxg ?? 0) - (p.currentStats.ga ?? 0)) * 0.4;
export const defenderScore = (p: PlayerFiltered) =>
	(p.currentStats.tkl ?? 0) +
	(p.currentStats.int ?? 0) * 1.5 +
	(p.currentStats.clr ?? 0) * 0.25 +
	(p.currentStats.blk ?? 0) * 0.6 +
	(p.currentStats.recov ?? 0) * 0.08 +
	(p.currentStats.prsWon ?? 0) * 0.1 +
	(p.currentStats.matchRating ?? 0) * 0.15;
export const goalkeeperScore = (p: PlayerFiltered) =>
	p.pos === "GK"
		? (p.currentStats.cs ?? 0) * 3 +
			((p.currentStats.psxg ?? 0) - (p.currentStats.ga ?? 0)) * 2 +
			(p.currentStats.sv ?? 0) * 0.08 +
			(p.currentStats.matchRating ?? 0) * 0.3
		: -Infinity;
export const youngFilter = (p: PlayerFiltered) =>
	g.get("season") - p.born.year <= 21;

const selectTeam = (players: PlayerFiltered[], used = new Set<number>()) => {
	const slots: Position[] = [
		"GK",
		"LB",
		"CB",
		"CB",
		"RB",
		"DM",
		"CM",
		"AM",
		"LW",
		"RW",
		"ST",
	];
	return slots.map((pos) => {
		const exact = players.find((p) => !used.has(p.pid) && p.pos === pos);
		const picked = exact ?? players.find((p) => !used.has(p.pid));
		if (!picked) {
			throw new Error("Not enough players for Team of the Season");
		}
		used.add(picked.pid);
		return info(picked);
	});
};

const doAwards = async (conditions: Conditions) => {
	const awardsByPlayer: AwardsByPlayer = [];
	const players = await getPlayers(g.get("season"));
	const ranked = getTopPlayers({ amount: Infinity, score: mvpScore }, players);
	const young = getTopPlayers(
		{ amount: Infinity, score: mvpScore, filter: youngFilter },
		players,
	);
	const defenders = getTopPlayers(
		{
			amount: 1,
			score: defenderScore,
			filter: (p) => ["CB", "LB", "RB", "DM"].includes(p.pos),
		},
		players,
	);
	const keepers = getTopPlayers(
		{ amount: 1, score: goalkeeperScore, filter: (p) => p.pos === "GK" },
		players,
	);
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
				"playoffRoundsWon",
				"abbrev",
				"region",
				"name",
				"cid",
				"did",
			],
			stats: ["pts", "oppPts", "gp"],
			season: g.get("season"),
			showNoStats: true,
		},
		"noCopyCache",
	);
	const { bestRecord, bestRecordConfs } = await teamAwards(teams);
	const used = new Set<number>();
	const allLeague = [
		{ title: "First Team", players: selectTeam(ranked, used) },
		{ title: "Second Team", players: selectTeam(ranked, used) },
	];
	let finalsMvp: AwardPlayer | undefined;
	const champTeam = teams.find(
		(t) =>
			t.seasonAttrs.playoffRoundsWon ===
			g.get("numGamesPlayoffSeries", "current").length,
	);
	if (champTeam) {
		const champPlayersAll = await idb.cache.players.indexGetAll(
			"playersByTid",
			champTeam.tid,
		);
		const noCup = g.get("numGamesPlayoffSeries", "current").length === 0;
		const champPlayers = await idb.getCopies.playersPlus(champPlayersAll, {
			attrs: ["pid", "name", "tid", "abbrev", "born"],
			ratings: ["pos"],
			stats: [
				"gp",
				"g",
				"a",
				"xg",
				"xa",
				"tkl",
				"int",
				"clr",
				"sv",
				"ga",
				"psxg",
				"cs",
				"svPct",
				"matchRating",
			],
			season: g.get("season"),
			playoffs: !noCup,
			regularSeason: noCup,
			tid: champTeam.tid,
		});

		for (const p of champPlayers) {
			p.currentStats = p.stats;
			p.pos = p.ratings.pos;
		}
		const winner = getTopPlayers(
			{ score: cupMvpScore },
			champPlayers as PlayerFiltered[],
		)[0];
		if (winner) {
			finalsMvp = info(winner);
		}
	}

	const awards: Awards = {
		season: g.get("season"),
		bestRecord,
		bestRecordConfs,
		mvp: ranked[0] ? info(ranked[0]) : undefined,
		roy: young[0] ? info(young[0]) : undefined,
		dpoy: defenders[0] ? info(defenders[0]) : undefined,
		goy: keepers[0] ? info(keepers[0]) : undefined,
		finalsMvp,
		allLeague,
		allRookie: young.length >= 11 ? selectTeam(young) : young.map(info),
	};
	addSimpleAndTeamAwardsToAwardsByPlayer(awards, awardsByPlayer);
	await idb.cache.awards.put(awards);
	await saveAwardsByPlayer(awardsByPlayer, conditions, awards.season);
};

export default doAwards;
