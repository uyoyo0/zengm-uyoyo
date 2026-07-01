import { Fragment, useState } from "react";
import { getCols } from "../../common/getCols.ts";
import { helpers } from "../util/helpers.ts";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { DataTable } from "../components/DataTable/index.tsx";
import { MoreLinks } from "../components/MoreLinks.tsx";
import { PlusMinus } from "../components/PlusMinus.tsx";
import { gradientStyleFactory } from "../util/gradientStyleFactory.ts";
import type { View } from "../../common/types.ts";

// A lineup's 5 players, rendered as links with their position.
const LineupPlayers = ({
	players,
}: {
	players: { pid: number; name: string; pos: string }[];
}) => (
	<>
		{players.map((p, i) => (
			<Fragment key={p.pid}>
				{i > 0 ? ", " : null}
				<a href={helpers.leagueUrl(["player", p.pid])}>{p.name}</a>
				{p.pos ? <span className="text-body-secondary"> {p.pos}</span> : null}
			</Fragment>
		))}
	</>
);

const Lineups = ({
	abbrev,
	lineups,
	playoffs,
	season,
	tid,
}: View<"lineups">) => {
	// Minimum total minutes a unit must have shared the floor to be shown, so
	// tiny-sample (often injury-driven) lineups don't dominate the leaderboard.
	const [minMinutes, setMinMinutes] = useState(10);

	useTitleBar({
		title: "Lineups",
		dropdownView: "lineups",
		dropdownFields: {
			teams: abbrev,
			seasons: season,
			playoffsCombined: playoffs,
		},
	});

	const cols = getCols([
		"Lineup",
		"stat:min",
		"stat:poss",
		"stat:ortg",
		"stat:drtg",
		"stat:nrtg",
		"stat:efg",
		"stat:tsp",
		"stat:tovp",
		"stat:pace",
	]);

	const filtered = lineups.filter((l) => l.stats.min >= minMinutes);

	// Color Net by rank among the shown lineups (best = green, worst = red).
	const gradientStyle = gradientStyleFactory(
		1,
		Math.round(0.35 * filtered.length),
		Math.round(0.65 * filtered.length),
		filtered.length,
	);

	const rows = filtered.map((l, i) => ({
		key: l.pids.join("-"),
		data: [
			{
				value: <LineupPlayers players={l.players} />,
				sortValue: l.players.map((p) => p.name).join(", "),
			},
			l.stats.min.toFixed(1),
			Math.round(l.stats.poss),
			l.ortg.toFixed(1),
			l.drtg.toFixed(1),
			{
				value: <PlusMinus>{l.net}</PlusMinus>,
				sortValue: l.net,
				style: gradientStyle(filtered.length - i),
			},
			l.efg.toFixed(1),
			l.tsp.toFixed(1),
			l.tovp.toFixed(1),
			l.pace.toFixed(1),
		],
	}));

	return (
		<>
			<MoreLinks
				type="team"
				page="lineups"
				abbrev={abbrev}
				tid={tid}
				season={season}
			/>

			<div className="mb-3 d-flex align-items-center gap-2">
				<label className="mb-0" htmlFor="lineups-min-minutes">
					Minimum minutes
				</label>
				<input
					id="lineups-min-minutes"
					type="number"
					className="form-control"
					style={{ width: 90 }}
					min={0}
					value={minMinutes}
					onChange={(event) => {
						const value = Number.parseFloat(event.target.value);
						setMinMinutes(Number.isNaN(value) ? 0 : value);
					}}
				/>
				<span className="text-body-secondary">
					{filtered.length} of {lineups.length} lineups
				</span>
			</div>

			{lineups.length === 0 ? (
				<p>
					No lineup data yet. Lineup net ratings are recorded as games are
					played, so sim some games to populate this page.
				</p>
			) : (
				<DataTable
					cols={cols}
					defaultSort={[5, "desc"]}
					defaultStickyCols={1}
					name="Lineups"
					rows={rows}
				/>
			)}
		</>
	);
};

export default Lineups;
