import { helpers } from "../../util/index.ts";
import { last } from "../../../common/utils.ts";
import type { Player } from "../../../common/types.ts";

// Award bonuses toward the popularity target, for awards won last season.
const AWARD_BONUSES: Record<string, number> = {
	"Most Valuable Player": 22,
	"Finals MVP": 14,
	"Won Championship": 10,
	"Rookie of the Year": 10,
	"All-Star": 8,
	"First Team All-League": 8,
	"Second Team All-League": 8,
	"Third Team All-League": 8,
	"Defensive Player of the Year": 6,
	"Sixth Man of the Year": 6,
	"Most Improved Player": 6,
	"Clutch Player of the Year": 6,
};
const AWARD_BONUS_CAP = 30;

export type PopularityContext = {
	lastSeason: number;
	numGames: number;
	// playoffRoundsWon per tid for last season, and how many rounds there were.
	playoffRoundsWonByTid: Map<number, number>;
	numPlayoffRounds: number;
};

// Update the current ratings row's popularity from last season. Popularity is
// sticky: newPop = 0.6 * prev + 0.4 * target, so fading legends decay over a
// few seasons and one big year jumps but doesn't teleport. The target is
// mostly performance (scoring volume sells tickets), plus style, hardware,
// playoff runs, tenure, and the innate charisma baseline.
const updatePopularity = (p: Player, context: PopularityContext) => {
	const ratings = last(p.ratings) as any;
	if (!ratings) {
		return;
	}

	// Number.isFinite rather than ?? so a NaN from bad data can't propagate.
	const prev = Number.isFinite(ratings.popularity) ? ratings.popularity : 50;
	const charisma = Number.isFinite(ratings.charisma) ? ratings.charisma : 50;
	const { lastSeason, numGames, playoffRoundsWonByTid, numPlayoffRounds } =
		context;

	// Baseline: anonymity, tilted by charisma.
	let target = 15 + 0.7 * (charisma - 50);

	// Last regular season, merged across teams if traded.
	let gp = 0;
	let pts = 0;
	let ewa = 0;
	let clutchPts = 0;
	let lastTid: number | undefined;
	for (const row of p.stats) {
		if (row.season === lastSeason && !row.playoffs) {
			gp += row.gp;
			pts += row.pts;
			ewa += row.ewa ?? 0;
			clutchPts += (row as any).clutchPts ?? 0;
			lastTid = row.tid;
		}
	}

	if (gp > 0) {
		const ppg = pts / gp;
		// Scoring sells: 25 ppg maxes this out. Partial seasons count less.
		target +=
			Math.min(40, 1.6 * ppg) * Math.min(1, gp / (0.7 * numGames));
		target += helpers.bound(1.5 * ewa, 0, 15);

		// Style: high-usage stars, dunkers, bombers, and clutch shotmakers are
		// more beloved than equally valuable role players.
		target += (5 * ((ratings.tendencyUsage ?? 50) - 50)) / 50;
		target += (3 * Math.max(0, ratings.dnk - 70)) / 30;
		target += (3 * Math.max(0, (ratings.tendencyThree ?? 50) - 70)) / 30;
		target += Math.min(5, (2 * clutchPts) / gp);
	}

	// Hardware from last season.
	let awardBonus = 0;
	for (const award of p.awards) {
		if (award.season === lastSeason) {
			awardBonus += AWARD_BONUSES[award.type] ?? 0;
		}
	}
	target += Math.min(AWARD_BONUS_CAP, awardBonus);

	// Deep playoff runs make household names.
	if (lastTid !== undefined && numPlayoffRounds > 0) {
		const roundsWon = playoffRoundsWonByTid.get(lastTid) ?? -1;
		if (roundsWon >= numPlayoffRounds - 1) {
			target += 6;
		} else if (roundsWon >= numPlayoffRounds - 2 && numPlayoffRounds >= 2) {
			target += 3;
		}
	}

	// Tenure: hometown-hero credit for staying put, beyond the second season.
	if (lastTid !== undefined) {
		let consecutive = 0;
		const seasonsSeen = new Set<number>();
		for (let i = p.stats.length - 1; i >= 0; i--) {
			const row = p.stats[i]!;
			if (row.playoffs || seasonsSeen.has(row.season)) {
				continue;
			}
			if (row.tid !== lastTid || row.season !== lastSeason - consecutive) {
				break;
			}
			seasonsSeen.add(row.season);
			consecutive += 1;
		}
		target += helpers.bound(consecutive - 2, 0, 5);
	}

	// Rookies arrive with draft hype instead of a stat line.
	if (gp === 0 && p.draft.year === lastSeason && p.draft.round >= 1) {
		if (p.draft.round === 1) {
			// Pick 1 -> +30, linear down to +4 at pick 14, +4 after.
			target += Math.max(4, 32 - 2 * p.draft.pick);
		} else {
			target += 2;
		}
	}

	ratings.popularity = helpers.bound(
		Math.round(0.6 * prev + 0.4 * helpers.bound(target, 0, 100)),
		0,
		100,
	);
};

export default updatePopularity;
