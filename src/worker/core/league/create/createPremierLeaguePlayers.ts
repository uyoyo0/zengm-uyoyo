import { POSITIONS, RATINGS } from "../../../../common/constants.soccer.ts";
import { PREMIER_LEAGUE_PLAYERS } from "../../../../common/soccer/premierLeaguePlayers.ts";
import type { PlayerWithoutKey, Team } from "../../../../common/types.ts";
import type {
	PlayerRatings,
	Position,
	RatingKey,
} from "../../../../common/types.soccer.ts";
import { player } from "../../index.ts";
import { g } from "../../../util/index.ts";

export const PREMIER_LEAGUE_ABBREVS = [
	"ARS",
	"AVL",
	"BOU",
	"BRE",
	"BHA",
	"CHE",
	"COV",
	"CRY",
	"EVE",
	"FUL",
	"HUL",
	"IPS",
	"LEE",
	"LIV",
	"MCI",
	"MUN",
	"NEW",
	"NFO",
	"SUN",
	"TOT",
] as const;

const teamBaseline = [
	83, 78, 74, 74, 75, 81, 69, 76, 74, 74, 68, 70, 73, 83, 85, 79, 79, 75, 73,
	78,
];

const fallbackRatings = (
	pos: Position,
	tid: number,
	age: number,
	jerseyNumber: number | undefined,
): Record<RatingKey, number> => {
	const firstTeamBonus =
		jerseyNumber !== undefined && jerseyNumber <= 30 ? 1 : -4;
	const ageAdjustment = age < 18 ? -7 : age < 21 ? -3 : age > 34 ? -3 : 0;
	const base = teamBaseline[tid]! - 5 + firstTeamBonus + ageAdjustment;
	const ratings = Object.fromEntries(
		RATINGS.map((key) => [key, base - 15]),
	) as Record<RatingKey, number>;
	Object.assign(ratings, {
		hgt: ["GK", "CB", "ST"].includes(pos) ? 60 : 42,
		gkr: 5,
		gkh: 5,
		gkp: 5,
	});

	const apply = (values: Partial<Record<RatingKey, number>>) =>
		Object.assign(ratings, values);
	if (pos === "GK") {
		apply({
			gkr: base + 3,
			gkh: base + 1,
			gkp: base,
			cmp: base - 3,
			pas: base - 8,
			stre: base - 5,
		});
	} else if (pos === "CB") {
		apply({
			tck: base + 3,
			diq: base + 3,
			hea: base + 1,
			stre: base + 1,
			cmp: base - 1,
			pas: base - 4,
			spd: base - 5,
			acc: base - 6,
		});
	} else if (pos === "LB" || pos === "RB") {
		apply({
			spd: base + 3,
			acc: base + 3,
			endu: base + 2,
			tck: base,
			diq: base - 1,
			crs: base,
			pas: base - 2,
		});
	} else if (pos === "DM") {
		apply({
			tck: base + 1,
			diq: base + 2,
			pas: base,
			cmp: base,
			endu: base,
			stre: base - 1,
			ftc: base - 1,
		});
	} else if (pos === "CM") {
		apply({
			pas: base + 2,
			ftc: base,
			oiq: base,
			cmp: base,
			endu: base + 1,
			drb: base - 1,
			tck: base - 2,
		});
	} else if (pos === "AM") {
		apply({
			pas: base + 2,
			oiq: base + 2,
			ftc: base + 1,
			drb: base + 1,
			cmp: base,
			fin: base - 1,
		});
	} else if (pos === "LW" || pos === "RW") {
		apply({
			spd: base + 4,
			acc: base + 4,
			drb: base + 2,
			crs: base,
			oiq: base,
			fin: base - 1,
			ftc: base + 1,
		});
	} else {
		apply({
			fin: base + 3,
			oiq: base + 2,
			cmp: base,
			ftc: base - 1,
			hea: base,
			spd: base - 1,
			acc: base - 1,
			stre: base - 1,
		});
	}

	for (const key of RATINGS) {
		ratings[key] = Math.max(0, Math.min(100, Math.round(ratings[key])));
	}
	return ratings;
};

export const isDefaultPremierLeague = (
	activeTids: number[],
	teams: (Pick<Team, "tid"> & Partial<Pick<Team, "abbrev">>)[],
) => {
	if (activeTids.length !== PREMIER_LEAGUE_ABBREVS.length) {
		return false;
	}
	const teamsByTid = new Map(teams.map((team) => [team.tid, team]));
	return PREMIER_LEAGUE_ABBREVS.every(
		(abbrev, tid) =>
			activeTids.includes(tid) && teamsByTid.get(tid)?.abbrev === abbrev,
	);
};

const createPremierLeaguePlayers = async (
	scoutingLevel: number,
): Promise<PlayerWithoutKey[]> => {
	const season = g.get("season");
	const players: PlayerWithoutKey[] = [];
	const jerseyNumbersByTid = new Map<number, Set<string>>();

	for (const source of PREMIER_LEAGUE_PLAYERS) {
		const age = Math.max(15, season - source.bornYear);
		const p = player.generate(
			source.tid,
			age,
			source.bornYear + 17,
			true,
			scoutingLevel,
			{
				college: "",
				country: source.country,
				firstName: source.firstName,
				lastName: source.lastName,
				race: "brown",
			},
			true,
		);
		p.real = true;
		p.srID = source.sourceId;
		p.pos = source.pos;
		p.born.year = source.bornYear;
		p.hgt = Math.round(
			(source.height ?? (source.pos === "GK" ? 190 : 181)) / 2.54,
		);
		p.weight =
			source.weight ?? (source.pos === "GK" || source.pos === "CB" ? 82 : 75);

		const ratings = p.ratings[0] as PlayerRatings;
		const sourcedRatings =
			source.ratings ??
			fallbackRatings(source.pos, source.tid, age, source.jerseyNumber);
		for (const key of RATINGS) {
			ratings[key] = sourcedRatings[key];
		}
		ratings.fuzz = 0;
		ratings.pos = source.pos;
		ratings.season = season;
		ratings.ovrs = Object.fromEntries(
			POSITIONS.map((position) => [position, 0]),
		) as Record<Position, number>;
		ratings.pots = { ...ratings.ovrs };
		await player.develop(p, 0);

		const usedNumbers = jerseyNumbersByTid.get(source.tid) ?? new Set<string>();
		jerseyNumbersByTid.set(source.tid, usedNumbers);
		const requestedNumber = source.jerseyNumber?.toString();
		if (requestedNumber && !usedNumbers.has(requestedNumber)) {
			p.jerseyNumber = requestedNumber;
			usedNumbers.add(requestedNumber);
		} else {
			player.setJerseyNumber(
				p,
				await player.genJerseyNumber(p, [...usedNumbers], []),
			);
			if (p.jerseyNumber) {usedNumbers.add(p.jerseyNumber);}
		}

		const contractAmount = Math.round(
			g.get("minContract") + (ratings.ovr / 100) ** 4 * 28000,
		);
		player.setContract(
			p,
			{
				amount: contractAmount,
				exp: season + 1 + (Number(source.sourceId.replace(/\D/g, "")) % 4),
			},
			false,
		);
		p.contract.temp = true;
		p.draft = {
			round: 0,
			pick: 0,
			tid: -1,
			originalTid: -1,
			year: source.bornYear + 17,
			ovr: ratings.ovr,
			pot: ratings.pot,
			skills: ratings.skills,
		};
		players.push(p);
	}

	for (const tid of PREMIER_LEAGUE_ABBREVS.keys()) {
		const roster = players
			.filter((p) => p.tid === tid)
			.toSorted((a, b) => b.ratings[0].ovr - a.ratings[0].ovr);
		for (const [index, p] of roster.entries()) {
			p.rosterOrder = index;
		}
	}

	return players;
};

export default createPremierLeaguePlayers;
