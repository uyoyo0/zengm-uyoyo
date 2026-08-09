import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_DIR = "data/soccer/source";
const OUTPUT_FILE = "src/common/soccer/premierLeaguePlayers.ts";

const teams = new Map([
	[1, { tid: 0, abbrev: "ARS" }],
	[2, { tid: 1, abbrev: "AVL" }],
	[127, { tid: 2, abbrev: "BOU" }],
	[130, { tid: 3, abbrev: "BRE" }],
	[131, { tid: 4, abbrev: "BHA" }],
	[4, { tid: 5, abbrev: "CHE" }],
	[5, { tid: 6, abbrev: "COV" }],
	[6, { tid: 7, abbrev: "CRY" }],
	[7, { tid: 8, abbrev: "EVE" }],
	[34, { tid: 9, abbrev: "FUL" }],
	[41, { tid: 10, abbrev: "HUL" }],
	[8, { tid: 11, abbrev: "IPS" }],
	[9, { tid: 12, abbrev: "LEE" }],
	[10, { tid: 13, abbrev: "LIV" }],
	[11, { tid: 14, abbrev: "MCI" }],
	[12, { tid: 15, abbrev: "MUN" }],
	[23, { tid: 16, abbrev: "NEW" }],
	[15, { tid: 17, abbrev: "NFO" }],
	[29, { tid: 18, abbrev: "SUN" }],
	[21, { tid: 19, abbrev: "TOT" }],
]);

const normalizeName = (value: string) =>
	value
		.normalize("NFD")
		.replaceAll(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replaceAll(/[^\da-z]/g, "");

const getPosition = (description: string, id: string) => {
	if (description.includes("Goalkeeper")) {return "GK";}
	if (
		description.includes("Left Full") ||
		description.includes("Left Wing Back")
	) {
		return "LB";
	}
	if (
		description.includes("Right Full") ||
		description.includes("Right Wing Back")
	) {
		return "RB";
	}
	if (description.includes("Defensive Midfielder")) {return "DM";}
	if (description.includes("Attacking Midfielder")) {return "AM";}
	if (
		description.includes("Central Midfielder") ||
		description === "Midfielder"
	) {
		return "CM";
	}
	if (description.includes("Defender")) {
		if (description.startsWith("Left")) {return "LB";}
		if (description.startsWith("Right")) {return "RB";}
		return "CB";
	}
	if (description.includes("Winger")) {
		if (description.startsWith("Right")) {return "RW";}
		if (description.startsWith("Left")) {return "LW";}
		return Number(id.replace(/\D/g, "")) % 2 === 0 ? "LW" : "RW";
	}
	return "ST";
};

const value = (stats: any, key: string, fallback: number) =>
	stats?.[key]?.value ?? fallback;

const convertRatings = (player: any) => {
	const stats = player.stats;
	const gk = player.position?.shortLabel === "GK";
	return {
		hgt: Math.max(
			0,
			Math.min(100, Math.round((player.height / 2.54 - 64) * 6.25)),
		),
		stre: value(stats, "strength", value(stats, "phy", 50)),
		spd: value(stats, "sprintSpeed", value(stats, "pac", 50)),
		acc: value(stats, "acceleration", value(stats, "pac", 50)),
		endu: value(stats, "stamina", 50),
		pas: Math.round(
			value(stats, "shortPassing", value(stats, "pas", 50)) * 0.65 +
				value(stats, "longPassing", value(stats, "pas", 50)) * 0.35,
		),
		ftc: value(stats, "ballControl", value(stats, "dri", 50)),
		drb: value(stats, "dribbling", value(stats, "dri", 50)),
		crs: value(stats, "crossing", value(stats, "pas", 45)),
		fin: value(stats, "finishing", value(stats, "sho", 35)),
		sht: Math.round(
			value(stats, "shotPower", value(stats, "sho", 40)) * 0.55 +
				value(stats, "longShots", value(stats, "sho", 40)) * 0.45,
		),
		hea: Math.round(
			value(stats, "headingAccuracy", 45) * 0.7 +
				value(stats, "jumping", 50) * 0.3,
		),
		tck: Math.round(
			value(stats, "standingTackle", value(stats, "def", 35)) * 0.65 +
				value(stats, "slidingTackle", value(stats, "def", 35)) * 0.35,
		),
		oiq: Math.round(
			value(stats, "positioning", 50) * 0.55 +
				value(stats, "vision", 50) * 0.25 +
				value(stats, "reactions", 50) * 0.2,
		),
		diq: Math.round(
			value(stats, "defensiveAwareness", value(stats, "def", 35)) * 0.65 +
				value(stats, "interceptions", value(stats, "def", 35)) * 0.35,
		),
		cmp: value(stats, "composure", player.overallRating),
		gkr: gk
			? Math.round(
					value(stats, "gkReflexes", player.overallRating) * 0.55 +
						value(stats, "gkDiving", player.overallRating) * 0.45,
				)
			: 5,
		gkh: gk ? value(stats, "gkHandling", player.overallRating) : 5,
		gkp: gk
			? Math.round(
					value(stats, "gkPositioning", player.overallRating) * 0.65 +
						value(stats, "gkKicking", player.overallRating) * 0.35,
				)
			: 5,
	};
};

const htmlFiles = (await fs.readdir(SOURCE_DIR)).filter(
	(filename) => filename.startsWith("ea-fc26-") && filename.endsWith(".html"),
);
const eaPlayers = new Map<string, any>();
for (const filename of htmlFiles) {
	const html = await fs.readFile(path.join(SOURCE_DIR, filename), "utf8");
	const match = html.match(
		/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
	);
	if (!match) {continue;}
	const nextData = JSON.parse(match[1]!);
	for (const player of nextData.props.pageProps.ratingsEntries?.items ?? []) {
		const names = [
			`${player.firstName ?? ""} ${player.lastName ?? ""}`,
			player.commonName,
		].filter(Boolean);
		for (const name of names) {
			eaPlayers.set(normalizeName(name), player);
		}
	}
}

const rosterFiles = await fs.readdir(path.join(SOURCE_DIR, "players"));
const officialPlayers = [];
for (const filename of rosterFiles.toSorted()) {
	const page = JSON.parse(
		await fs.readFile(path.join(SOURCE_DIR, "players", filename), "utf8"),
	);
	officialPlayers.push(...page.content);
}

const seen = new Set<string>();
const players = officialPlayers
	.map((player) => {
		const team = teams.get(player.currentTeam?.id);
		const sourceId = player.altIds?.opta;
		if (
			!team ||
			!sourceId ||
			!player.info?.positionInfo ||
			seen.has(sourceId)
		) {
			return;
		}
		seen.add(sourceId);
		const displayName = player.name.display;
		const displayNameParts = displayName.split(" ");
		const eaPlayer = eaPlayers.get(normalizeName(displayName));
		const bornYear = Number(player.birth?.date?.label?.match(/\d{4}$/)?.[0]);
		return {
			sourceId,
			tid: team.tid,
			firstName:
				displayNameParts.length > 1
					? displayNameParts.slice(0, -1).join(" ")
					: "",
			lastName: displayNameParts.at(-1)!,
			bornYear: Number.isFinite(bornYear) ? bornYear : 2000,
			country:
				player.nationalTeam?.country ??
				player.birth?.country?.country ??
				"England",
			pos: getPosition(player.info.positionInfo, sourceId),
			jerseyNumber: player.info.shirtNum,
			loan: player.info.loan === true,
			height: eaPlayer?.height,
			weight: eaPlayer?.weight,
			eaOverall: eaPlayer?.overallRating,
			ratings: eaPlayer ? convertRatings(eaPlayer) : undefined,
		};
	})
	.filter(
		(player): player is NonNullable<typeof player> => player !== undefined,
	)
	.toSorted(
		(a, b) =>
			a.tid - b.tid || (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999),
	);

const matched = players.filter((player) => player.ratings).length;
const output = `// Generated by tools/soccer/buildRealPlayers.ts from the official Premier League\n// 2026/27 squad feed and public EA SPORTS FC 26 ratings.\nimport type { Position, RatingKey } from "../types.soccer.ts";\n\nexport type PremierLeaguePlayer = {\n\tsourceId: string;\n\ttid: number;\n\tfirstName: string;\n\tlastName: string;\n\tbornYear: number;\n\tcountry: string;\n\tpos: Position;\n\tjerseyNumber?: number;\n\tloan: boolean;\n\theight?: number;\n\tweight?: number;\n\teaOverall?: number;\n\tratings?: Record<RatingKey, number>;\n};\n\nexport const PREMIER_LEAGUE_PLAYERS: PremierLeaguePlayer[] = ${JSON.stringify(players)};\n`;

await fs.writeFile(OUTPUT_FILE, output);
console.log(
	`Wrote ${players.length} players (${matched} with detailed ratings) to ${OUTPUT_FILE}`,
);
