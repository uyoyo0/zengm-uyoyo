// Derive a descriptive role/archetype from a player's skills + tendencies.
// Pure & heuristic; used for display (and, later, AI lineup hints).
//
// Order matters: offensive hubs are identified first (a high-usage star is a
// "Go-To Scorer" even if he also defends or spots up), then bigs, then
// lower-usage perimeter archetypes, with "Role Player" as the true fallback.
// Usage tendency 58 ~ 24.4 usg% (clear first/second option); see
// tendencyShares.basketball.ts for the tendency-share mappings.
const getRole = (r: any): string => {
	const t = (key: string) => r[key] ?? 50;

	const three = t("tendencyThree");
	const post = t("tendencyPost");
	const rim = t("tendencyAtRim");
	const passT = t("tendencyPass");
	const usage = t("tendencyUsage");

	const big = r.hgt >= 62;
	const shooter = r.tp >= 55;
	const highUsage = usage >= 58; // ~24+ usg%

	// True volume snipers (Curry-like): elite shooting skill AND a 3PA share
	// north of ~52% of all shots.
	if (r.tp >= 65 && three >= 72) {
		return "Elite Shooter";
	}

	// High-usage creators who also run the offense (Luka/Jokic/LeBron-like).
	if (highUsage && passT >= 55 && r.pss >= 60) {
		return "Offensive Engine";
	}

	// High-usage scorers, split by how they actually score.
	if (highUsage) {
		if (big && post >= 60) {
			return "Post Scorer";
		}
		if (rim >= 58) {
			return "Slasher";
		}
		return "Go-To Scorer";
	}

	if (big) {
		if (shooter && three >= 52) {
			return "Stretch Big";
		}
		if (r.diq >= 62 && r.hgt >= 68) {
			return "Rim Protector";
		}
		if (r.ins >= 58 || post >= 58) {
			return "Post Scorer";
		}
		if (r.reb >= 62) {
			return "Glass Cleaner";
		}
		return "Interior Big";
	}

	if (r.pss >= 62 && passT >= 52) {
		return "Floor General";
	}
	if (shooter && three >= 58 && usage <= 52) {
		return "3-Point Specialist";
	}
	if (r.tp >= 50 && r.diq >= 58 && three >= 46) {
		return "3&D Wing";
	}
	if (rim >= 56 && usage >= 50) {
		return "Slasher";
	}
	if (usage >= 54) {
		return "Shot Creator";
	}
	if (r.diq >= 62) {
		return "Perimeter Defender";
	}
	// High-skill scorers with neutral tendencies (e.g. older save files where
	// tendency derivation hasn't run) must never fall to Role Player.
	if (r.tp >= 65 || r.ins >= 65) {
		return "Shot Creator";
	}
	return "Role Player";
};

export default getRole;
