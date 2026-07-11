import { fitClass, fitGrade } from "../../util/fitGrade.ts";
import {
	playerFitMessage,
	playerRoleFitMessage,
	teamFitMessage,
} from "../../util/fitMessages.ts";
import { helpers } from "../../util/helpers.ts";
import type { RoleNeed } from "../../../common/roleNeeds.basketball.ts";

// Compact chemistry card on the Roster page: cohesion grade, the roster-level
// scouting line, and the worst-fitting rotation players. Links to the full
// Team Chemistry page.
const TeamChemistry = ({
	abbrev,
	players,
	season,
	teamChemistry,
	tid,
}: {
	abbrev: string;
	players: any[];
	season: number;
	teamChemistry: {
		cohesion: number;
		shortages: { need: RoleNeed; severity: number }[];
		surpluses: { kind: "spacing" | "creation"; severity: number }[];
	};
	tid: number;
}) => {
	const grade = fitGrade(teamChemistry.cohesion);

	// Worst fits among the rotation (top 9 by value), D grade or worse.
	const worstFits = players
		.filter((p) => p.systemFit !== undefined)
		.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
		.slice(0, 9)
		.filter((p) => p.systemFit < 0.74)
		.sort((a, b) => a.systemFit - b.systemFit)
		.slice(0, 3);

	return (
		<div style={{ maxWidth: 400 }}>
			<div className="d-flex align-items-center">
				<b>Team Chemistry</b>
				<span className={`ms-2 fs-5 fw-bold ${fitClass(grade) ?? ""}`}>
					{grade}
				</span>
				<a
					className="ms-auto small"
					href={helpers.leagueUrl(["team_chemistry", `${abbrev}_${tid}`])}
				>
					Full report
				</a>
			</div>
			<div className="text-body-secondary">
				{teamFitMessage(teamChemistry, tid + season * 31)}
			</div>
			{worstFits.length > 0 ? (
				<ul className="list-unstyled mb-0 mt-2 small">
					{worstFits.map((p) => (
						<li key={p.pid} className="mb-1">
							<a href={helpers.leagueUrl(["player", p.pid])}>
								{p.firstName} {p.lastName}
							</a>{" "}
							<span
								className={fitClass(fitGrade(p.systemFit))}
								title="System fit"
							>
								{fitGrade(p.systemFit)}
							</span>
							<div className="text-body-secondary">
								{playerFitMessage(p.fitDetails, p.pid + season * 7919) ??
									playerRoleFitMessage(p.fitRole, p.pid + season * 7919) ??
									"Miscast in this system"}
							</div>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
};

export default TeamChemistry;
