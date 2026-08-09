import type { RatingKey } from "../../../common/types.soccer.ts";
import { ratingsGradientStyle } from "./ratingsGradientStyle.ts";

const labels: [RatingKey | "ovr" | "pot", string][] = [
	["ovr", "Ovr"],
	["pot", "Pot"],
	["spd", "Spd"],
	["acc", "Acc"],
	["stre", "Str"],
	["endu", "End"],
	["pas", "Pas"],
	["ftc", "Fst"],
	["drb", "Drb"],
	["crs", "Crs"],
	["fin", "Fin"],
	["sht", "Sht"],
	["hea", "Hea"],
	["tck", "Tck"],
	["oiq", "oIQ"],
	["diq", "dIQ"],
	["cmp", "Cmp"],
	["gkr", "GKR"],
	["gkh", "GKH"],
	["gkp", "GKP"],
];

const RatingsStats = ({ challengeNoRatings, ratings, stats, type }: any) => {
	const prefix =
		typeof type === "number" ? `${type} ` : type === "career" ? "Peak " : "";
	return (
		<>
			{!challengeNoRatings && ratings ? (
				<div className="mb-2">
					<b>{prefix}Ratings</b>
					<div className="row">
						{[0, 1, 2].map((column) => (
							<div className="col-4" key={column}>
								{labels
									.filter((_row, index) => index % 3 === column)
									.map(([key, label]) => {
										const value = ratings[key];
										const valid = Number.isFinite(value);
										return (
											<div
												key={key}
												style={valid ? ratingsGradientStyle(value) : undefined}
											>
												{label}: {valid ? Math.round(value) : "—"}
											</div>
										);
									})}
							</div>
						))}
					</div>
				</div>
			) : null}
			{stats?.keyStatsWithGoalieGP ? (
				<div>
					<b>{type === "career" ? "Career " : prefix}Stats</b>
					<br />
					{stats.keyStatsWithGoalieGP}
				</div>
			) : null}
		</>
	);
};

export default RatingsStats;
