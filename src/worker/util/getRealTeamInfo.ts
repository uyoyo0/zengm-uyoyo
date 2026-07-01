import { idb } from "../db/index.ts";
import { RealTeamInfoSchema, type RealTeamInfo } from "../../common/types.ts";
import { isSport } from "../../common/sportFunctions.ts";
import defaultRealTeamInfoBasketball from "../../common/realTeamInfo.basketball.ts";

// The user's realTeamInfo from the meta DB, falling back to the bundled real NBA
// names (basketball) so Real Players / Legends / Cross-Era leagues get real team
// names without the user pasting anything into Settings → Real Data. A
// user-provided value always takes precedence. Used everywhere real team info is
// applied: league creation, each new preseason, and scheduled team-info events
// (so names stick as a cross-era league advances through history).
const getRealTeamInfo = async (): Promise<RealTeamInfo | undefined> => {
	const raw = await idb.meta.get("attributes", "realTeamInfo");
	if (raw !== undefined) {
		const result = RealTeamInfoSchema.safeParse(raw);
		if (result.success) {
			return result.data;
		}
		console.error(result.error);
	}

	if (isSport("basketball")) {
		return defaultRealTeamInfoBasketball;
	}

	return undefined;
};

export default getRealTeamInfo;
