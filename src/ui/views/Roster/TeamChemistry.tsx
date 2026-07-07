import { fitClass, fitGrade } from "../../util/fitGrade.ts";
import {
	playerFitMessage,
	teamFitMessage,
} from "../../util/fitMessages.ts";
import { helpers } from "../../util/helpers.ts";

// How cohesively the roster fits the coach's system: a value-weighted grade,
// a roster-level story, and the worst-fitting rotation players with why.
const TeamChemistry = ({
	players,
	season,
	teamChemistry,
	tid,
}: {
	players: any[];
	season: number;
	teamChemistry: {
		cohesion: number;
		topMismatches: { dial: string; playerWants: 1 | -1; magnitude: number }[];
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
			</div>
			<div className="text-body-secondary">
				{teamFitMessage(teamChemistry.topMismatches, tid + season * 31)}
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
									"Doesn't fit the system"}
							</div>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
};

export default TeamChemistry;
