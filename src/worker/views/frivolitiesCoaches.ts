import { g } from "../util/index.ts";
import type { UpdateEvents, ViewInput } from "../../common/types.ts";
import { orderBy } from "../../common/utils.ts";
import { coachCareerTotals, getAllCoaches } from "./coachCareer.ts";

const MAX_ROWS = 100;
const MIN_SEASONS = 3;

// Career-mode and tenure-mode rankings share row shapes; season mode has one
// row per coach-season. Each branch returns its own object so the view props
// form a discriminated union on `mode`.
const updateFrivolitiesCoaches = async (
	{ type }: ViewInput<"frivolitiesCoaches">,
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
		const userTid = g.get("userTid");

		const coachesAll = (await getAllCoaches()).filter(
			(c) => (c.seasons?.length ?? 0) > 0,
		);

		const careerRows = coachesAll.map((c) => {
			const totals = coachCareerTotals(c);
			return {
				cid: c.cid,
				firstName: c.firstName,
				lastName: c.lastName,
				hof: c.hof,
				fromPid: c.fromPid,
				active: c.tid >= 0,
				numTeams: new Set(c.seasons!.map((s) => s.tid)).size,
				delta: totals.won - totals.expectedWins,
				...totals,
			};
		});

		const career = (
			title: string,
			description: string,
			coaches: typeof careerRows,
		) => ({
			type,
			title,
			description,
			mode: "career" as const,
			coaches: coaches.slice(0, MAX_ROWS),
			userTid,
		});

		if (type === "overachievers" || type === "underachievers") {
			const over = type === "overachievers";
			return career(
				over ? "Miracle Workers" : "Underachievers",
				over
					? `Coaches whose teams won the most games above their talent-based expectation (min ${MIN_SEASONS} seasons).`
					: `Coaches whose teams fell furthest short of their talent-based expectation (min ${MIN_SEASONS} seasons).`,
				orderBy(
					careerRows.filter((c) => c.numSeasons >= MIN_SEASONS),
					"delta",
					over ? "desc" : "asc",
				),
			);
		}

		if (type === "journeymen") {
			return career(
				"Journeymen",
				"Coaches who worked the sidelines for the most teams.",
				orderBy(
					careerRows.filter((c) => c.numTeams >= 2),
					["numTeams", "won"],
					["desc", "desc"],
				),
			);
		}

		if (type === "no_ring") {
			return career(
				"Best Coaches Without a Ring",
				"The winningest coaches who never won a championship.",
				orderBy(
					careerRows.filter((c) => c.championships === 0),
					"won",
					"desc",
				),
			);
		}

		if (type === "ex_players") {
			return career(
				"Ex-Player Coaches",
				"Former players who went on to the best coaching careers.",
				orderBy(
					careerRows.filter((c) => c.fromPid !== undefined),
					"won",
					"desc",
				),
			);
		}

		if (type === "best_seasons" || type === "worst_seasons") {
			const best = type === "best_seasons";
			const seasonRows = coachesAll.flatMap((c) =>
				c.seasons!.map((s) => ({
					cid: c.cid,
					firstName: c.firstName,
					lastName: c.lastName,
					hof: c.hof,
					season: s.season,
					tid: s.tid,
					abbrev: abbrev(s.tid),
					won: s.won,
					lost: s.lost,
					expectedWins: s.expectedWins,
					delta: s.won - s.expectedWins,
					playoffWon: s.playoffWon,
					playoffLost: s.playoffLost,
					madePlayoffs: (s.playoffRoundsWon ?? -1) >= 0,
					champion: s.champion ?? false,
				})),
			);
			return {
				type,
				title: best ? "Best Coaching Seasons" : "Worst Coaching Seasons",
				description: best
					? "The single seasons where a coach most outperformed the roster's expected wins."
					: "The single seasons where a coach most underperformed the roster's expected wins.",
				mode: "season" as const,
				coaches: orderBy(seasonRows, "delta", best ? "desc" : "asc").slice(
					0,
					MAX_ROWS,
				),
				userTid,
			};
		}

		if (type === "lifers") {
			const tenures = coachesAll.flatMap((c) => {
				const byTid = new Map<number, NonNullable<typeof c.seasons>>();
				for (const s of c.seasons!) {
					const arr = byTid.get(s.tid) ?? [];
					arr.push(s);
					byTid.set(s.tid, arr);
				}
				return [...byTid.entries()].map(([tid, seasons]) => {
					let won = 0;
					let lost = 0;
					let championships = 0;
					let lastSeason = -Infinity;
					for (const s of seasons) {
						won += s.won;
						lost += s.lost;
						if (s.champion) {
							championships += 1;
						}
						if (s.season > lastSeason) {
							lastSeason = s.season;
						}
					}
					const gp = won + lost;
					return {
						cid: c.cid,
						firstName: c.firstName,
						lastName: c.lastName,
						hof: c.hof,
						tid,
						abbrev: abbrev(tid),
						numSeasons: seasons.length,
						won,
						lost,
						winp: gp > 0 ? won / gp : 0,
						championships,
						lastSeason,
					};
				});
			});
			return {
				type,
				title: "Lifers",
				description: "Coaches with the most seasons coaching a single team.",
				mode: "tenure" as const,
				coaches: orderBy(
					tenures,
					["numSeasons", "won"],
					["desc", "desc"],
				).slice(0, MAX_ROWS),
				userTid,
			};
		}

		throw new Error(`Unknown type "${type}"`);
	}
};

export default updateFrivolitiesCoaches;
