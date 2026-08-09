import { getPlayers, getTopPlayers } from "./awards.ts";
import { defenderScore, goalkeeperScore, mvpScore, youngFilter } from "./doAwards.soccer.ts";

const getAwardCandidates = async (season: number) => {
	const players = await getPlayers(season);
	return [
		{ name: "Player of the Year", players: getTopPlayers({ amount: 10, score: mvpScore }, players), stats: ["gp", "g", "a", "xg", "xa", "matchRating"] },
		{ name: "Defender of the Year", players: getTopPlayers({ amount: 10, score: defenderScore, filter: (p) => ["CB", "LB", "RB", "DM"].includes(p.pos) }, players), stats: ["gp", "tkl", "int", "clr", "matchRating"] },
		{ name: "Goalkeeper of the Year", players: getTopPlayers({ amount: 10, score: goalkeeperScore, filter: (p) => p.pos === "GK" }, players), stats: ["gp", "ga", "sv", "svPct", "cs", "matchRating"] },
		{ name: "Young Player of the Year", players: getTopPlayers({ amount: 10, score: mvpScore, filter: youngFilter }, players), stats: ["gp", "g", "a", "matchRating"] },
	];
};

export default getAwardCandidates;
