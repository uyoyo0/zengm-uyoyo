/**
 * Import real shot-location data from basketball-reference into the local
 * data/real-player-stats.basketball.json.
 *
 * Basketball-reference publishes per-player shooting-by-distance tables for
 * every season since 1996-97 (one league-wide page per season). The upstream
 * BBGM stats file doesn't carry this data, so real-player shot-mix tendencies
 * are otherwise estimated from box stats (see deriveTendencies.basketball.ts).
 * This script fills in the real thing where it exists; earlier seasons keep
 * using the estimator.
 *
 * Adds to each regular-season stats row (season >= 1997) when available:
 *   fgaDist03 / fgDist03   - attempts / makes from 0-3 ft (at the rim)
 *   fgaDist310 / fgDist310 - attempts / makes from 3-10 ft (floater/short zone)
 * The 10+ ft 2P remainder is recoverable from the row's other stats, so
 * nothing else needs storing.
 *
 * Usage:
 *   node tools/import-shot-locations.ts [--start 1997] [--end 2026]
 *     [--delay-ms 4000] [--dry-run]
 *
 * Sports Reference rate-limits scrapers; the default 4s delay stays well
 * under their 20 requests/minute limit. The whole run is ~30 requests.
 */

import fs from "node:fs/promises";

const STATS_PATH = "data/real-player-stats.basketball.json";
const FIRST_SEASON_WITH_DATA = 1997;

const args = process.argv.slice(2);
const argValue = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const delayMs = Number(argValue("--delay-ms") ?? 4000);

type SeasonShooting = {
	// Shares of ALL FGA (bbref convention), and FG% within each bin.
	pctFga03?: number;
	fgPct03?: number;
	pctFga310?: number;
	fgPct310?: number;
	mp: number;
	isTotal: boolean;
};

const parseNum = (s: string | undefined) => {
	if (s === undefined || s === "") {
		return undefined;
	}
	const x = Number(s);
	return Number.isNaN(x) ? undefined : x;
};

// Parse every player row of a bbref shooting page into slug -> best row
// (multi-team players have one row per stint plus a 2TM/3TM total row; prefer
// the total row since we only use league-wide shares).
const parseShootingPage = (html: string) => {
	const bySlug = new Map<string, SeasonShooting>();
	for (const trMatch of html.matchAll(/<tr[^>]*>([\S\s]*?)<\/tr>/g)) {
		const tr = trMatch[1]!;
		const slug = /data-append-csv="([^"]+)"/.exec(tr)?.[1];
		if (!slug) {
			continue;
		}
		const cells: Record<string, string> = {};
		for (const c of tr.matchAll(
			/data-stat="([^"]+)"[^>]*>([\S\s]*?)<\/t[dh]>/g,
		)) {
			cells[c[1]!] = c[2]!.replace(/<[^>]*>/g, "").trim();
		}
		const team = cells.team_name_abbr ?? "";
		const row: SeasonShooting = {
			pctFga03: parseNum(cells.pct_fga_00_03),
			fgPct03: parseNum(cells.fg_pct_00_03),
			pctFga310: parseNum(cells.pct_fga_03_10),
			fgPct310: parseNum(cells.fg_pct_03_10),
			mp: parseNum(cells.mp) ?? 0,
			isTotal: /^\dTM$|^TOT$/.test(team),
		};
		if (row.pctFga03 === undefined && row.pctFga310 === undefined) {
			continue;
		}
		const existing = bySlug.get(slug);
		if (
			!existing ||
			row.isTotal ||
			(!existing.isTotal && row.mp > existing.mp)
		) {
			bySlug.set(slug, row);
		}
	}
	return bySlug;
};

const fetchSeason = async (season: number) => {
	const url = `https://www.basketball-reference.com/leagues/NBA_${season}_shooting.html`;
	const response = await fetch(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
		},
	});
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} for ${url}`);
	}
	return parseShootingPage(await response.text());
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
	const data = JSON.parse(await fs.readFile(STATS_PATH, "utf8"));
	const rows: any[] = data.stats;

	const maxSeason = rows.reduce(
		(max, row) => Math.max(max, row.season),
		FIRST_SEASON_WITH_DATA,
	);
	const start = Math.max(
		Number(argValue("--start") ?? FIRST_SEASON_WITH_DATA),
		FIRST_SEASON_WITH_DATA,
	);
	const end = Math.min(Number(argValue("--end") ?? maxSeason), maxSeason);

	console.log(
		`Importing shot locations for ${start}-${end}${dryRun ? " (dry run)" : ""}`,
	);

	let rowsUpdated = 0;
	let rowsMissing = 0;
	const missingSlugs = new Set<string>();

	for (let season = start; season <= end; season++) {
		const shooting = await fetchSeason(season);
		let seasonUpdated = 0;
		let seasonMissing = 0;
		for (const row of rows) {
			if (row.season !== season || row.playoffs || !row.fga) {
				continue;
			}
			const s = shooting.get(row.slug);
			if (!s) {
				seasonMissing += 1;
				missingSlugs.add(`${row.slug} ${season}`);
				continue;
			}
			// bbref shares are of ALL FGA; convert to this row's attempt counts.
			// (For traded players the league-wide shares are applied to each
			// per-team row, which is exact enough - shares barely move by stint.)
			const fga03 = Math.round((s.pctFga03 ?? 0) * row.fga);
			const fga310 = Math.round((s.pctFga310 ?? 0) * row.fga);
			row.fgaDist03 = fga03;
			row.fgDist03 = Math.min(fga03, Math.round((s.fgPct03 ?? 0) * fga03));
			row.fgaDist310 = fga310;
			row.fgDist310 = Math.min(fga310, Math.round((s.fgPct310 ?? 0) * fga310));
			seasonUpdated += 1;
		}
		rowsUpdated += seasonUpdated;
		rowsMissing += seasonMissing;
		console.log(
			`  ${season}: ${shooting.size} players on bbref, ${seasonUpdated} rows updated, ${seasonMissing} rows unmatched`,
		);
		if (season < end) {
			await sleep(delayMs);
		}
	}

	console.log(
		`Done: ${rowsUpdated} rows updated, ${rowsMissing} rows without bbref data (estimator fallback will be used for those).`,
	);
	if (missingSlugs.size > 0 && missingSlugs.size <= 40) {
		console.log(`Unmatched: ${[...missingSlugs].join(", ")}`);
	}

	if (!dryRun) {
		await fs.writeFile(STATS_PATH, JSON.stringify(data, null, 2));
		console.log(`Wrote ${STATS_PATH}`);
	}
};

await main();
