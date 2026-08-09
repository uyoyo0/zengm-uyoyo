import { PLAYER_GAME_STATS } from "../../common/constants.soccer.ts";
import { getCols } from "../../common/getCols.ts";
import { processPlayerStats } from "../util/processPlayerStats.ts";
import { helpers } from "../util/helpers.ts";
import { ResponsiveTableWrapper } from "./ResponsiveTableWrapper.tsx";

const ScoringPlayer = ({
	exhibition,
	name,
	pid,
}: {
	exhibition?: boolean;
	name: string;
	pid?: number;
}) =>
	exhibition || pid === undefined ? (
		<>{name}</>
	) : (
		<a href={helpers.leagueUrl(["player", pid])}>{name}</a>
	);

const StatsTable = ({ Row, info, season, team }: any) => {
	const stats = info.stats as readonly string[];
	const players = team.players
		.filter(
			(p: any) =>
				p.stat?.min > 0 &&
				(info.name === "Goalkeeper" ? p.pos === "GK" : p.pos !== "GK"),
		)
		.map((p: any) => ({ ...p, processed: processPlayerStats(p, [...stats]) }));
	return (
		<div className="mb-3">
			<h3>{info.name}</h3>
			<ResponsiveTableWrapper>
				<table className="table table-striped table-sm">
					<thead>
						<tr>
							<th>Pos</th>
							<th>Player</th>
							{getCols(stats.map((stat) => `stat:${stat}`)).map((col) => (
								<th key={String(col.title)}>{col.title}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{players.map((p: any) => (
							<Row key={p.pid} p={p} stats={stats} season={season} />
						))}
					</tbody>
				</table>
			</ResponsiveTableWrapper>
		</div>
	);
};

const BoxScore = ({ boxScore, Row }: any) => (
	<div className="mb-3">
		<h2>Goals</h2>
		{boxScore.scoringSummary?.length ? (
			<ul>
				{boxScore.scoringSummary.map((event: any, i: number) => (
					<li key={i}>
						{90 - event.clock}&prime; —{" "}
						<ScoringPlayer
							exhibition={boxScore.exhibition}
							name={event.names[0]}
							pid={event.pids?.[0]}
						/>
						{event.names[1] ? (
							<>
								{" ("}
								<ScoringPlayer
									exhibition={boxScore.exhibition}
									name={event.names[1]}
									pid={event.pids?.[1]}
								/>
								)
							</>
						) : null}
					</li>
				))}
			</ul>
		) : (
			<p>None</p>
		)}
		{boxScore.teams.map((team: any, index: number) => (
			<section
				key={team.tid}
				id={index === 0 ? "scroll-team-1" : "scroll-team-2"}
			>
				<h2>
					{team.region} {team.name}
				</h2>
				{Object.values(PLAYER_GAME_STATS).map((info) => (
					<StatsTable
						key={info.name}
						Row={Row}
						info={info}
						season={boxScore.season}
						team={team}
					/>
				))}
			</section>
		))}
	</div>
);

export default BoxScore;
