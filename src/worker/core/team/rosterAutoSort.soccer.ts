import { FORMATIONS } from "../../../common/constants.soccer.ts";
import { last } from "../../../common/utils.ts";
import { idb } from "../../db/index.ts";
import genDepth from "./genDepth.soccer.ts";
import {
	DEFAULT_SOCCER_TACTICS,
	getDefaultSoccerDuty,
	normalizeSoccerTactics,
	SOCCER_TACTICAL_PRESETS,
} from "../../../common/soccer/tactics.ts";
import { g } from "../../util/index.ts";
import { optimizeSoccerLineup } from "../../../common/soccer/lineup.ts";

export const getAiSoccerPreset = (players: any[]) => {
	const ratings = players.slice(0, 16).map((p) => last(p.ratings) as any);
	const average = (...keys: string[]) =>
		ratings.reduce(
			(sum, row) =>
				sum +
				keys.reduce((total, key) => total + (row[key] ?? 50), 0) / keys.length,
			0,
		) / Math.max(1, ratings.length);
	const scores = {
		possession: average("pas", "ftc", "cmp") + average("oiq") * 0.12,
		gegenpress: average("endu", "spd", "tck") + average("acc", "diq") * 0.1,
		counter: average("spd", "acc", "fin") + average("oiq") * 0.1,
		lowBlock:
			average("tck", "diq", "stre") +
			average("gkr", "gkh", "gkp") * 0.08 +
			Math.max(0, 73 - average("ovr")) * 0.8,
		attacking: average("fin", "oiq", "drb") + average("sht") * 0.1,
	};
	return Object.entries(scores).toSorted((a, b) => b[1] - a[1])[0]![0] as
		| "possession"
		| "gegenpress"
		| "counter"
		| "lowBlock"
		| "attacking";
};

const rosterAutoSort = async (tid: number, onlyNewPlayers = false) => {
	const team = await idb.cache.teams.get(tid);
	if (!team) {
		throw new Error("Invalid tid");
	}
	const players = await idb.cache.players.indexGetAll("playersByTid", tid);
	players.sort(
		(a, b) => last(b.ratings).ovr - last(a.ratings).ovr || b.pid - a.pid,
	);
	for (let i = 0; i < players.length; i++) {
		if (players[i]!.rosterOrder !== i) {
			players[i]!.rosterOrder = i;
			await idb.cache.players.put(players[i]!);
		}
	}
	team.depth = await genDepth(players, team.depth);
	team.soccerTactics = normalizeSoccerTactics(team.soccerTactics);
	if (!g.get("userTids").includes(tid)) {
		const preset = SOCCER_TACTICAL_PRESETS[getAiSoccerPreset(players)];
		Object.assign(team.soccerTactics, {
			mentality: DEFAULT_SOCCER_TACTICS.mentality,
			tempo: DEFAULT_SOCCER_TACTICS.tempo,
			pressing: DEFAULT_SOCCER_TACTICS.pressing,
			defensiveLine: DEFAULT_SOCCER_TACTICS.defensiveLine,
			width: DEFAULT_SOCCER_TACTICS.width,
			directness: DEFAULT_SOCCER_TACTICS.directness,
			transition: DEFAULT_SOCCER_TACTICS.transition,
			marking: DEFAULT_SOCCER_TACTICS.marking,
			substitutionTiming: DEFAULT_SOCCER_TACTICS.substitutionTiming,
		});
		Object.assign(team.soccerTactics, preset.values);
	}
	const slots = FORMATIONS[team.soccerTactics.formation];
	const preserveManualLineup =
		onlyNewPlayers && g.get("userTids").includes(tid);
	team.soccerTactics.starting = optimizeSoccerLineup({
		candidates: players.map((player) => {
			const ratings = last(player.ratings);
			return {
				id: player.pid,
				naturalPosition: ratings.pos,
				overall: ratings.ovr,
				positionRatings: ratings.ovrs ?? {},
			};
		}),
		locked: preserveManualLineup ? team.soccerTactics.starting : undefined,
		slots,
	});
	const used = new Set(team.soccerTactics.starting.filter((pid) => pid >= 0));
	for (const pid of used) {
		const selectedPlayer = players.find((player) => player.pid === pid);
		if (selectedPlayer) {
			team.soccerTactics.duties[pid] ??= getDefaultSoccerDuty(
				last(selectedPlayer.ratings).pos,
			);
		}
	}
	const validBench = preserveManualLineup
		? team.soccerTactics.bench.filter(
				(pid) => players.some((player) => player.pid === pid) && !used.has(pid),
			)
		: [];
	const benchUsed = new Set(validBench);
	team.soccerTactics.bench = [
		...validBench,
		...players
			.filter((player) => !used.has(player.pid) && !benchUsed.has(player.pid))
			.map((player) => player.pid),
	].slice(0, 9);
	await idb.cache.teams.put(team);
};

export default rosterAutoSort;
