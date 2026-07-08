import { helpers } from "../../util/index.ts";
import { realGauss } from "../../../common/random.ts";
import ovr from "./ovr.ts";
import type { Coach, CoachRatings } from "../../../common/types.ts";

const RATING_KEYS: (keyof Omit<CoachRatings, "ovr">)[] = [
	"development",
	"tactics",
	"adaptability",
	"motivation",
];

// Mean annual rating drift by age: young coaches grow into the job, veterans
// plateau, old coaches decline.
const baseDelta = (age: number) => {
	if (age <= 45) {
		return 1.2;
	}
	if (age <= 53) {
		return 0.4;
	}
	if (age <= 60) {
		return -0.3;
	}
	if (age <= 67) {
		return -1.2;
	}
	return -2.5;
};

// Annual drift to the in-game coaching ratings (tactics, adaptability) from
// recent playoff experience: deep runs are reps against playoff-level
// adjustments, so sustained playoff coaches sharpen faster, while coaches
// whose teams keep missing the postseason slip slightly. Modest by design -
// well inside the annual noise (sigma 1.8): three straight misses = -0.2/yr,
// a first-round exit per year = neutral, sustained finals runs = +0.6/yr.
export const playoffExperienceNudge = (
	coach: { seasons?: Coach["seasons"] },
	season: number,
) => {
	const recent = (coach.seasons ?? []).filter(
		(s) =>
			s.season >= season - 3 &&
			s.season < season &&
			s.playoffRoundsWon !== undefined,
	);
	if (recent.length === 0) {
		return 0;
	}

	let score = 0;
	for (const s of recent) {
		if (s.playoffRoundsWon! >= 0) {
			score += 1 + s.playoffRoundsWon!;
		}
	}
	const avgPerSeason = score / recent.length;

	return helpers.bound(0.2 * (avgPerSeason - 1), -0.2, 0.6);
};

// One preseason of development for a coach: each rating drifts by an age-based
// amount plus noise, ovr is recomputed, and a snapshot is appended to
// ratingsHistory (once per season - safe to call twice).
export const developCoach = (coach: Coach, season: number) => {
	if (coach.ratingsHistory?.some((row) => row.season === season)) {
		return;
	}

	const age = season - coach.born.year;
	const playoffNudge = playoffExperienceNudge(coach, season);

	for (const key of RATING_KEYS) {
		let base = baseDelta(age);
		// Young coaches with weak ratings have the most room to grow into
		// themselves; a 30-rated 40-something can become a solid coach.
		if (age <= 48) {
			base += Math.max(0, 60 - coach.ratings[key]) * 0.02;
		}
		// Playoff reps sharpen the in-game ratings specifically.
		if (key === "tactics" || key === "adaptability") {
			base += playoffNudge;
		}
		const delta = helpers.bound(realGauss(base, 1.8), -5, 5);
		coach.ratings[key] = helpers.bound(
			Math.round(coach.ratings[key] + delta),
			0,
			100,
		);
	}
	coach.ratings.ovr = ovr(coach.ratings);

	if (!coach.ratingsHistory) {
		coach.ratingsHistory = [];
	}
	coach.ratingsHistory.push({ season, ...coach.ratings });
};

// Retirement probability for a coach who is between contracts (expired deal or
// free agent). Never retires mid-contract.
export const shouldRetire = (age: number) => {
	if (age >= 75) {
		return true;
	}
	if (age < 66) {
		return false;
	}
	return Math.random() < Math.min(1, 0.12 * (age - 65));
};

export default developCoach;
