import { AWARD_NAMES } from "../../../common/constants.ts";
import type { View } from "../../../common/types.ts";
import { MoreLinks } from "../../components/MoreLinks.tsx";
import { RetiredPlayers } from "../../components/RetiredPlayers.tsx";
import useTitleBar from "../../hooks/useTitleBar.tsx";
import { useLocal } from "../../util/local.ts";
import Team from "../History.hockey/Team.tsx";
import AwardsAndChamp from "./AwardsAndChamp.tsx";

export type ActualProps = Exclude<
	View<"history">,
	{ invalidSeason: true; season: number }
> & { userTid: number };

const History = (props: View<"history">) => {
	const { invalidSeason, season } = props;
	useTitleBar({
		title: "Season Summary",
		jumpTo: true,
		jumpToSeason: season,
		dropdownView: "history",
		dropdownFields: { seasonsHistory: season },
	});
	const { userTid } = useLocal(["userTid"]);

	if (invalidSeason) {
		return (
			<>
				<h2>Error</h2>
				<p>Invalid season.</p>
			</>
		);
	}

	const { awards, champ, retiredPlayers } = props;
	return (
		<>
			<MoreLinks type="awards" page="history" season={season} />
			<div className="row g-4">
				<div className="col-xl-4 col-md-5 col-12">
					<AwardsAndChamp
						awards={awards}
						champ={champ}
						season={season}
						userTid={userTid}
					/>
				</div>
				<div className="col-xl-4 col-md-7 col-12">
					<Team
						name={AWARD_NAMES.allLeague ?? "Team of the Season"}
						nested
						season={season}
						team={awards.allLeague}
						userTid={userTid}
					/>
					<Team
						className="mt-4 mb-3"
						name={AWARD_NAMES.allRookie ?? "Young Team of the Season"}
						season={season}
						team={awards.allRookie}
						userTid={userTid}
					/>
				</div>
				<div className="col-xl-4 col-12">
					<RetiredPlayers
						retiredPlayers={retiredPlayers}
						season={season}
						userTid={userTid}
					/>
				</div>
			</div>
		</>
	);
};

export default History;
