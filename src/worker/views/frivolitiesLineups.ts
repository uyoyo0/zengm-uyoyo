import { idb } from "../db/index.ts";
import { g, helpers } from "../util/index.ts";
import type { Lineup, UpdateEvents, ViewInput } from "../../common/types.ts";
import { deriveLineupStats } from "../../common/lineupStats.ts";
import { orderBy } from "../../common/utils.ts";

const MAX_ROWS = 100;

// Season-by-season batches keep memory bounded; the store index makes each
// season a single range read. Current season comes from the cache (it holds
// rows not yet flushed to the store).
const forEachSeasonLineups = async (cb: (rows: Lineup[]) => void) => {
	const currentSeason = g.get("season");
	for (
		let season = g.get("startingSeason");
		season < currentSeason;
		season++
	) {
		cb(
			await idb.league.getAllFromIndex(
				"lineups",
				"season, tid",
				IDBKeyRange.bound([season], [season, ""]),
			),
		);
	}
	cb(await idb.cache.lineups.getAll());
};

const resolveNames = async (pids: number[]) => {
	// getCopies.players walks a cursor over sorted pids and breaks on duplicates.
	const players = await idb.getCopies.players(
		{ pids: [...new Set(pids)] },
		"noCopyCache",
	);
	const byPid = new Map<number, string>();
	for (const p of players) {
		byPid.set(p.pid, `${p.firstName} ${p.lastName}`);
	}
	return (pid: number) => ({
		pid,
		name: byPid.get(pid) ?? "???",
	});
};

const updateFrivolitiesLineups = async (
	{ type }: ViewInput<"frivolitiesLineups">,
	updateEvents: UpdateEvents,
	state: { type?: string },
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("newPhase") ||
		type !== state.type
	) {
		const teamInfoCache = g.get("teamInfoCache");
		const abbrev = (tid: number) => teamInfoCache[tid]?.abbrev ?? "???";
		const scale = helpers.gameAndSeasonLengthScaleFactor();
		const userTid = g.get("userTid");

		if (type === "best" || type === "worst" || type === "most_used") {
			// Single-season 5-man units, regular season only.
			const minMinutes = (type === "most_used" ? 0 : 200) * scale;
			let title;
			let description;
			if (type === "best") {
				title = "Best Lineups";
				description = `The 5-man units with the highest single-season net rating (min ${Math.round(minMinutes)} minutes together).`;
			} else if (type === "worst") {
				title = "Worst Lineups";
				description = `The 5-man units with the worst single-season net rating (min ${Math.round(minMinutes)} minutes together).`;
			} else {
				title = "Most Used Lineups";
				description =
					"The 5-man units that played the most minutes together in a single season.";
			}

			let rows: (Lineup & { value: number })[] = [];
			await forEachSeasonLineups((seasonRows) => {
				for (const l of seasonRows) {
					if (l.playoffs || l.stats.min < minMinutes) {
						continue;
					}
					const value =
						type === "most_used"
							? l.stats.min
							: deriveLineupStats(l.stats).net * (type === "worst" ? -1 : 1);
					rows.push({ ...l, value });
				}
				rows.sort((a, b) => b.value - a.value);
				rows = rows.slice(0, MAX_ROWS);
			});

			const getPlayer = await resolveNames(rows.flatMap((l) => l.pids));

			return {
				type,
				title,
				description,
				mode: "lineup" as const,
				userTid,
				rows: rows.map((l) => ({
					players: l.pids.map(getPlayer),
					tid: l.tid,
					abbrev: abbrev(l.tid),
					season: l.season,
					min: l.stats.min,
					...deriveLineupStats(l.stats),
				})),
			};
		}

		if (type === "duos" || type === "duos_minutes") {
			const byNet = type === "duos";
			const minMinutes = 1500 * scale;

			// Career totals for every pair of teammates, from the 10 pairs in each
			// 5-man row. Regular season only.
			const pairs = new Map<
				string,
				{
					pids: [number, number];
					min: number;
					poss: number;
					oppPoss: number;
					pts: number;
					oppPts: number;
					seasons: Set<number>;
					lastTid: number;
					lastSeason: number;
				}
			>();
			await forEachSeasonLineups((seasonRows) => {
				for (const l of seasonRows) {
					if (l.playoffs) {
						continue;
					}
					for (let i = 0; i < l.pids.length; i++) {
						for (let j = i + 1; j < l.pids.length; j++) {
							const key = `${l.pids[i]}-${l.pids[j]}`;
							let pair = pairs.get(key);
							if (!pair) {
								pair = {
									pids: [l.pids[i]!, l.pids[j]!],
									min: 0,
									poss: 0,
									oppPoss: 0,
									pts: 0,
									oppPts: 0,
									seasons: new Set(),
									lastTid: l.tid,
									lastSeason: l.season,
								};
								pairs.set(key, pair);
							}
							pair.min += l.stats.min;
							pair.poss += l.stats.poss;
							pair.oppPoss += l.stats.oppPoss;
							pair.pts += l.stats.pts;
							pair.oppPts += l.stats.oppPts;
							pair.seasons.add(l.season);
							if (l.season >= pair.lastSeason) {
								pair.lastSeason = l.season;
								pair.lastTid = l.tid;
							}
						}
					}
				}
			});

			const qualified = [...pairs.values()].filter(
				(pair) => pair.min >= minMinutes,
			);
			const net = (pair: (typeof qualified)[number]) =>
				(pair.poss > 0 ? (100 * pair.pts) / pair.poss : 0) -
				(pair.oppPoss > 0 ? (100 * pair.oppPts) / pair.oppPoss : 0);
			const top = orderBy(
				qualified,
				byNet ? [net, (pair) => pair.min] : [(pair) => pair.min, net],
				["desc", "desc"],
			).slice(0, MAX_ROWS);

			const getPlayer = await resolveNames(top.flatMap((pair) => pair.pids));

			return {
				type,
				title: byNet ? "Best Duos" : "Most Minutes Together",
				description: byNet
					? `The two-man combos with the highest career net rating on the floor together (min ${Math.round(minMinutes)} minutes).`
					: `The two-man combos who spent the most career minutes on the floor together (min ${Math.round(minMinutes)} minutes).`,
				mode: "duo" as const,
				userTid,
				rows: top.map((pair) => ({
					players: pair.pids.map(getPlayer),
					tid: pair.lastTid,
					abbrev: abbrev(pair.lastTid),
					numSeasons: pair.seasons.size,
					lastSeason: pair.lastSeason,
					min: pair.min,
					net: net(pair),
				})),
			};
		}

		if (type === "on_off") {
			const minMinutes = 500 * scale;

			// Per (team, season): full team totals plus each player's on-floor
			// totals; off-floor is the difference. Lineup rows partition all team
			// minutes, so on + off reconciles exactly. Regular season only.
			type Totals = {
				min: number;
				poss: number;
				oppPoss: number;
				pts: number;
				oppPts: number;
			};
			const emptyTotals = (): Totals => ({
				min: 0,
				poss: 0,
				oppPoss: 0,
				pts: 0,
				oppPts: 0,
			});
			const add = (target: Totals, l: Lineup) => {
				target.min += l.stats.min;
				target.poss += l.stats.poss;
				target.oppPoss += l.stats.oppPoss;
				target.pts += l.stats.pts;
				target.oppPts += l.stats.oppPts;
			};
			const netOf = (t: Totals) =>
				(t.poss > 0 ? (100 * t.pts) / t.poss : 0) -
				(t.oppPoss > 0 ? (100 * t.oppPts) / t.oppPoss : 0);

			let results: {
				pid: number;
				tid: number;
				season: number;
				minOn: number;
				minOff: number;
				netOn: number;
				netOff: number;
				diff: number;
			}[] = [];

			await forEachSeasonLineups((seasonRows) => {
				const byTeam = new Map<
					number,
					{
						season: number;
						team: Totals;
						on: Map<number, Totals>;
					}
				>();
				for (const l of seasonRows) {
					if (l.playoffs) {
						continue;
					}
					let entry = byTeam.get(l.tid);
					if (!entry || entry.season !== l.season) {
						entry = { season: l.season, team: emptyTotals(), on: new Map() };
						byTeam.set(l.tid, entry);
					}
					add(entry.team, l);
					for (const pid of l.pids) {
						let on = entry.on.get(pid);
						if (!on) {
							on = emptyTotals();
							entry.on.set(pid, on);
						}
						add(on, l);
					}
				}

				for (const [tid, entry] of byTeam) {
					for (const [pid, on] of entry.on) {
						const off: Totals = {
							min: entry.team.min - on.min,
							poss: entry.team.poss - on.poss,
							oppPoss: entry.team.oppPoss - on.oppPoss,
							pts: entry.team.pts - on.pts,
							oppPts: entry.team.oppPts - on.oppPts,
						};
						if (on.min < minMinutes || off.min < minMinutes) {
							continue;
						}
						const netOn = netOf(on);
						const netOff = netOf(off);
						results.push({
							pid,
							tid,
							season: entry.season,
							minOn: on.min,
							minOff: off.min,
							netOn,
							netOff,
							diff: netOn - netOff,
						});
					}
				}

				results.sort((a, b) => b.diff - a.diff);
				results = results.slice(0, MAX_ROWS);
			});

			const getPlayer = await resolveNames(results.map((row) => row.pid));

			return {
				type,
				title: "On/Off Kings",
				description: `The biggest single-season gaps between a team's net rating with a player on the floor vs off it (min ${Math.round(minMinutes)} minutes each).`,
				mode: "onoff" as const,
				userTid,
				rows: results.map((row) => ({
					player: getPlayer(row.pid),
					tid: row.tid,
					abbrev: abbrev(row.tid),
					season: row.season,
					minOn: row.minOn,
					minOff: row.minOff,
					netOn: row.netOn,
					netOff: row.netOff,
					diff: row.diff,
				})),
			};
		}

		throw new Error(`Unknown type "${type}"`);
	}
};

export default updateFrivolitiesLineups;
