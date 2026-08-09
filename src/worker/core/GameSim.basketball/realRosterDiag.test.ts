import { test } from "vitest";
// @ts-expect-error
import fs from "node:fs";
import GameSim from "./index.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import { g, helpers } from "../../util/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { deriveTendenciesPerSeason } from "../realRosters/deriveTendencies.basketball.ts";

// Calibration diagnostic (opt-in, not part of the normal test run): sim real
// 2025 rosters and compare each player's sim per-game line to his real 2025
// line. Run with:
//   REAL_ROSTER_DIAG=1 npx vitest --run src/worker/core/GameSim.basketball/realRosterDiag.test.ts
// Output goes to realRosterDiag.txt in the repo root (gitignored-ish; delete).

// The opt-in env vars below aren't part of the app's narrow process.env type.
const diagEnv = process.env as unknown as Record<string, string | undefined>;

const SEASON = 2025;

const RATING_KEYS = [
	"hgt",
	"stre",
	"spd",
	"jmp",
	"endu",
	"ins",
	"dnk",
	"ft",
	"fg",
	"tp",
	"diq",
	"oiq",
	"drb",
	"pss",
	"reb",
] as const;

type Agg = {
	slug: string;
	games: number;
	min: number;
	fg: number;
	fga: number;
	tp: number;
	tpa: number;
	ft: number;
	fta: number;
	pts: number;
};

const runMatchup = async (
	abbrev0: string,
	abbrev1: string,
	n: number,
	statsRows: any[],
	ratingsRows: any[],
	statsBySlug: Map<string, any[]>,
	allRatingsBySlug: Map<string, any[]>,
) => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);

	const buildTeam = (abbrev: string, tid: number) => {
		const minBySlug = new Map<string, number>();
		for (const s of statsRows) {
			if (s.season === SEASON && !s.playoffs && s.abbrev === abbrev) {
				minBySlug.set(s.slug, (minBySlug.get(s.slug) ?? 0) + (s.min ?? 0));
			}
		}
		const slugs = [...minBySlug.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 13)
			.map((e) => e[0]);
		return slugs.map((slug, i) => {
			const p: any = player.generate(tid, 25, 2010, true, DEFAULT_LEVEL);
			const r = p.ratings.at(-1)!;
			const real =
				ratingsRows.find((x) => x.slug === slug && x.season === SEASON) ??
				allRatingsBySlug.get(slug)?.at(-1);
			for (const key of RATING_KEYS) {
				r[key] = real?.[key] ?? 50;
			}
			const tendencies = deriveTendenciesPerSeason(
				statsBySlug.get(slug) ?? [],
				(allRatingsBySlug.get(slug) as any) ?? [],
				1,
				0,
			).get(SEASON);
			if (tendencies) {
				Object.assign(r, tendencies);
			}
			r.ovr = player.ovr(r, "F");
			r.pot = r.ovr;
			p.firstName = slug;
			p.lastName = "";
			p.rosterOrder = i;
			return p;
		});
	};

	const players0 = buildTeam(abbrev0, 0);
	const players1 = buildTeam(abbrev1, 1);

	const teamsDefault = helpers.getTeamsDefault().slice(0, 2);
	await resetCache({
		players: [...players0, ...players1],
		teams: teamsDefault.map(team.generate),
		teamSeasons: teamsDefault.map((t) => team.genSeasonRow(t)),
		teamStats: teamsDefault.map((t) => team.genStatsRow(t.tid)),
	});
	const { idb } = await import("../../db/index.ts");
	for (const p of await idb.cache.players.getAll()) {
		await player.updateValues(p);
		await idb.cache.players.put(p);
	}

	const agg = new Map<number, Agg>();
	let teamPts = 0;
	for (let i = 0; i < n; i++) {
		const teams = await loadTeams([0, 1], {});
		const game = new GameSim({
			gid: 0,
			teams: [teams[0]!, teams[1]!] as any,
			baseInjuryRate: 0,
			doPlayByPlay: false,
			homeCourtFactor: 1,
			allStarGame: false,
			neutralSite: true,
		});
		const res: any = game.run();
		for (const t of [0, 1] as const) {
			teamPts += res.team[t].stat.pts;
			for (const p of res.team[t].player) {
				let a = agg.get(p.id + t * 10000);
				if (!a) {
					a = {
						slug: p.name.trim(),
						games: 0,
						min: 0,
						fg: 0,
						fga: 0,
						tp: 0,
						tpa: 0,
						ft: 0,
						fta: 0,
						pts: 0,
					};
					agg.set(p.id + t * 10000, a);
				}
				a.games += 1;
				a.min += p.stat.min ?? 0;
				a.fg += p.stat.fg ?? 0;
				a.fga += p.stat.fga ?? 0;
				a.tp += p.stat.tp ?? 0;
				a.tpa += p.stat.tpa ?? 0;
				a.ft += p.stat.ft ?? 0;
				a.fta += p.stat.fta ?? 0;
				a.pts += p.stat.pts ?? 0;
			}
		}
	}
	return { agg, ptsPerTeamGame: teamPts / (2 * n) };
};

test.skipIf(!diagEnv.REAL_ROSTER_DIAG)(
	"real roster sim diagnostic",
	{ timeout: 600_000 },
	async () => {
		const statsRows = JSON.parse(
			fs.readFileSync("data/real-player-stats.basketball.json", "utf8"),
		).stats;
		const ratingsRows = JSON.parse(
			fs.readFileSync("data/real-player-data.basketball.json", "utf8"),
		).ratings;

		const statsBySlug = new Map<string, any[]>();
		for (const s of statsRows) {
			if (!statsBySlug.has(s.slug)) {
				statsBySlug.set(s.slug, []);
			}
			statsBySlug.get(s.slug)!.push(s);
		}
		const allRatingsBySlug = new Map<string, any[]>();
		for (const r of ratingsRows) {
			if (!allRatingsBySlug.has(r.slug)) {
				allRatingsBySlug.set(r.slug, []);
			}
			allRatingsBySlug.get(r.slug)!.push(r);
		}

		// Real 2025 per-game lines for comparison
		const realLine = (slug: string) => {
			let gp = 0,
				min = 0,
				fg = 0,
				fga = 0,
				tp = 0,
				tpa = 0,
				ft = 0,
				fta = 0,
				pts = 0;
			for (const s of statsBySlug.get(slug) ?? []) {
				if (s.season !== SEASON || s.playoffs) {
					continue;
				}
				gp += s.gp ?? 0;
				min += s.min ?? 0;
				fg += s.fg ?? 0;
				fga += s.fga ?? 0;
				tp += s.tp ?? 0;
				tpa += s.tpa ?? 0;
				ft += s.ft ?? 0;
				fta += s.fta ?? 0;
				pts += s.pts ?? 0;
			}
			return { gp, min, fg, fga, tp, tpa, ft, fta, pts };
		};

		const pct = (a: number, b: number) =>
			b > 0 ? ((100 * a) / b).toFixed(1) : "-";
		const ts = (pts: number, fga: number, fta: number) =>
			fga + 0.44 * fta > 0
				? ((100 * pts) / (2 * (fga + 0.44 * fta))).toFixed(1)
				: "-";

		const lines: string[] = [];
		const matchups: [string, string][] = [
			["OKC", "DEN"],
			["BOS", "LAL"],
		];
		for (const [a0, a1] of matchups) {
			const { agg, ptsPerTeamGame } = await runMatchup(
				a0,
				a1,
				50,
				statsRows,
				ratingsRows,
				statsBySlug,
				allRatingsBySlug,
			);
			lines.push(
				`=== ${a0} vs ${a1}, 50 games | pts/team/g=${ptsPerTeamGame.toFixed(1)} ===`,
				"player            | SIM  mpg  ppg  fg%  3p%  ts%  ftaPG | REAL mpg  ppg  fg%  3p%  ts%  ftaPG",
			);
			const sorted = [...agg.values()].sort(
				(x, y) => y.pts / y.games - x.pts / x.games,
			);
			for (const p of sorted) {
				const r = realLine(p.slug);
				const simN = p.games;
				lines.push(
					`${p.slug.padEnd(17)} | ${(p.min / simN).toFixed(0).padStart(4)} ${(
						p.pts / simN
					)
						.toFixed(1)
						.padStart(
							5,
						)} ${pct(p.fg, p.fga).padStart(4)} ${pct(p.tp, p.tpa).padStart(4)} ${ts(
						p.pts,
						p.fga,
						p.fta,
					).padStart(4)} ${(p.fta / simN).toFixed(1).padStart(5)} | ${(r.gp
						? r.min / r.gp
						: 0
					)
						.toFixed(0)
						.padStart(
							8,
						)} ${(r.gp ? r.pts / r.gp : 0).toFixed(1).padStart(5)} ${pct(
						r.fg,
						r.fga,
					).padStart(
						4,
					)} ${pct(r.tp, r.tpa).padStart(4)} ${ts(r.pts, r.fga, r.fta).padStart(4)} ${(r.gp
						? r.fta / r.gp
						: 0
					)
						.toFixed(1)
						.padStart(5)}`,
				);
			}
		}

		fs.writeFileSync(
			diagEnv.REAL_ROSTER_DIAG_OUT ?? "realRosterDiag.txt",
			lines.join("\n"),
		);
	},
);
