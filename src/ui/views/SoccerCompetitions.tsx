import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";

const SoccerCompetitions = ({ competitions, season, teamInfo }: any) => {
	useTitleBar({ title: "League Table" });
	const league = competitions.find(
		(competition: any) => competition.type === "league",
	);
	if (!league) {
		return <p>The league has not been initialized yet.</p>;
	}
	return (
		<>
			<h1>
				{season} {league.name}
			</h1>
			<div className="table-responsive">
				<table className="table table-striped table-sm">
					<thead>
						<tr>
							<th>#</th>
							<th>Club</th>
							<th>GP</th>
							<th>W</th>
							<th>D</th>
							<th>L</th>
							<th>GF</th>
							<th>GA</th>
							<th>GD</th>
							<th>Pts</th>
						</tr>
					</thead>
					<tbody>
						{league.table.map((row: any, index: number) => {
							const team = teamInfo[row.tid];
							return (
								<tr
									key={row.tid}
									className={index === 0 ? "table-success" : undefined}
								>
									<td>{index + 1}</td>
									<td>
										<a
											href={helpers.leagueUrl([
												"roster",
												`${team.abbrev}_${team.tid}`,
											])}
										>
											{team.region} {team.name}
										</a>
									</td>
									<td>{row.gp}</td>
									<td>{row.won}</td>
									<td>{row.drawn}</td>
									<td>{row.lost}</td>
									<td>{row.gf}</td>
									<td>{row.ga}</td>
									<td>{row.gf - row.ga}</td>
									<td>
										<b>{row.pts}</b>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</>
	);
};

export default SoccerCompetitions;
