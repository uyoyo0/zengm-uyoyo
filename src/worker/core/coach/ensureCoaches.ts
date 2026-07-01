import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { PLAYER, DEFAULT_COACHING } from "../../../common/constants.ts";
import generate from "./generate.ts";
import updateTeamCoaching from "./updateTeamCoaching.ts";
import { rosterOptimalStyle } from "./style.ts";
import type { TeamCoaching } from "../../../common/types.ts";

const FREE_AGENT_POOL_MIN = 12;

const isNeutral = (coaching: TeamCoaching | undefined) =>
	!coaching ||
	(Object.keys(DEFAULT_COACHING) as (keyof TeamCoaching)[]).every(
		(key) => coaching[key] === 0,
	);

// Idempotent: make sure every active team has exactly one head coach, and keep a
// pool of free-agent coaches available to hire. Safe to call on league load and
// each offseason.
const ensureCoaches = async () => {
	const [teams, coaches] = await Promise.all([
		idb.cache.teams.getAll(),
		idb.cache.coaches.getAll(),
	]);

	const tidsWithCoach = new Set(coaches.map((c) => c.tid));

	// Initial seeding of a brand-new league (no coaches exist yet): give each team
	// a coach whose philosophy fits its roster, so real/legends/cross-era teams get
	// historically appropriate coaches (a shooting team gets a 3PT coach, a big
	// team gets a paint-protecting coach, etc.) instead of random ones. Mid-league
	// replacements and the free-agent pool stay random, preserving coach variety.
	const initialSeed = coaches.length === 0;

	for (const t of teams) {
		if (t.disabled || tidsWithCoach.has(t.tid)) {
			continue;
		}

		const coach = await generate(t.tid);
		coach.hiredYear = g.get("season");

		// Preserve a user's previously-set style: if the team already had non-neutral
		// coaching dials, make them this coach's philosophy.
		if (!isNeutral(t.coaching)) {
			coach.philosophy = { ...t.coaching! };
		} else if (initialSeed) {
			const players = await idb.cache.players.indexGetAll(
				"playersByTid",
				t.tid,
			);
			coach.philosophy = rosterOptimalStyle(players);
		}

		await idb.cache.coaches.add(coach);
	}

	const numFreeAgents = coaches.filter(
		(c) => c.tid === PLAYER.FREE_AGENT,
	).length;
	for (let i = numFreeAgents; i < FREE_AGENT_POOL_MIN; i++) {
		await idb.cache.coaches.add(await generate(PLAYER.FREE_AGENT));
	}

	// Make sure each team's stored effective style reflects its coach + roster, so
	// the identity shows up immediately (including right after an upgrade).
	await updateTeamCoaching();
};

export default ensureCoaches;
