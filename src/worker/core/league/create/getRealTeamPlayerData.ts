import {
	RealPlayerPhotosSchema,
	type Conditions,
} from "../../../../common/types.ts";
import { idb } from "../../../db/index.ts";
import logEvent from "../../../util/logEvent.ts";
import getRealTeamInfo from "../../../util/getRealTeamInfo.ts";

const getRealTeamPlayerData = async (
	{
		fileHasPlayers,
	}: {
		fileHasPlayers: boolean;
		fileHasTeams: boolean;
	},
	conditions: Conditions | undefined,
) => {
	let realPlayerPhotos;
	if (fileHasPlayers) {
		const attributesStore = (await idb.meta.transaction("attributes")).store;
		const raw = await attributesStore.get("realPlayerPhotos");
		if (raw !== undefined) {
			const result = RealPlayerPhotosSchema.safeParse(raw);
			if (result.success) {
				realPlayerPhotos = result.data;
			} else {
				console.error(result.error);
				logEvent(
					{
						type: "error",
						text: "Invalid real player photos data ignored.",
						saveToDb: false,
					},
					conditions,
				);
			}
		}
	}

	// Real team info (the user's, or the bundled real NBA names as a fallback).
	// Applied to every team, but only affects teams with a matching srID — so it's
	// a no-op for random leagues and gives real names to real-players / cross-era
	// / legends leagues without the user pasting anything.
	const realTeamInfo = await getRealTeamInfo();

	return {
		realPlayerPhotos,
		realTeamInfo,
	};
};

export default getRealTeamPlayerData;
