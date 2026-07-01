import { Fragment, useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { getCols } from "../../common/getCols.ts";
import {
	aggregateOnOff,
	addLineupStats,
	deriveLineupStats,
	emptyLineupStats,
} from "../../common/lineupStats.ts";
import { helpers } from "../util/helpers.ts";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { DataTable } from "../components/DataTable/index.tsx";
import { MoreLinks } from "../components/MoreLinks.tsx";
import { PlusMinus } from "../components/PlusMinus.tsx";
import { ResponsiveTableWrapper } from "../components/ResponsiveTableWrapper.tsx";
import { gradientStyleFactory } from "../util/gradientStyleFactory.ts";
import type { LineupStat as LineupStatBasketball } from "../../common/types.basketball.ts";
import type { View } from "../../common/types.ts";

// Cap on how many players can be picked for the on/off breakdown. Beyond this
// the 2^N state grid is unreadable and per-state samples are tiny.
const MAX_ON_OFF_PLAYERS = 4;

type LineupPlayer = { pid: number; name: string; pos: string };

// A lineup's 5 players, rendered as links with their position.
const LineupPlayers = ({ players }: { players: LineupPlayer[] }) => (
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

const labelForState = (
	onPids: number[],
	selectedPlayers: LineupPlayer[],
): string => {
	const n = selectedPlayers.length;
	if (onPids.length === n) {
		return n === 2 ? "Both ON" : `All ${n} ON`;
	}
	if (onPids.length === 0) {
		return n === 2 ? "Both OFF" : "All OFF";
	}
	const names = selectedPlayers
		.filter((p) => onPids.includes(p.pid))
		.map((p) => p.name);
	return `Only ${names.join(" + ")}`;
};

// On/off summary for the selected players: every combination state of who is
// on the floor, aggregated from raw lineup totals (rates derived from the
// sums, never averaged). Uses the unfiltered lineups so the states always
// partition all team minutes, regardless of the table's minutes filter.
const OnOffSummary = ({
	lineups,
	selectedPlayers,
}: {
	lineups: View<"lineups">["lineups"];
	selectedPlayers: LineupPlayer[];
}) => {
	const rows = useMemo(() => {
		const selectedPids = selectedPlayers.map((p) => p.pid);
		const states = aggregateOnOff(lineups, selectedPids);

		if (selectedPids.length <= 3) {
			// Full 2^N grid. States come out of aggregateOnOff in mask order
			// (selection order within each count), so a stable sort by countOn
			// keeps partial states in a natural order.
			return [...states.values()]
				.sort((a, b) => b.countOn - a.countOn)
				.map((state) => ({
					label: labelForState(state.onPids, selectedPlayers),
					stats: state.stats,
				}));
		}

		// Too many explicit states - collapse to how many of the selection are on.
		const byCount = new Map<number, LineupStatBasketball>();
		for (let count = selectedPids.length; count >= 0; count--) {
			byCount.set(count, emptyLineupStats());
		}
		for (const state of states.values()) {
			addLineupStats(byCount.get(state.countOn)!, state.stats);
		}
		const n = selectedPids.length;
		return [...byCount.entries()].map(([count, stats]) => ({
			label:
				count === n
					? `All ${n} ON`
					: count === 0
						? "All OFF"
						: `${count} of ${n} ON`,
			stats,
		}));
	}, [lineups, selectedPlayers]);

	const allOn = rows[0]!.stats;
	const allOff = rows.at(-1)!.stats;
	const onVsOff =
		allOn.min > 0 && allOff.min > 0
			? deriveLineupStats(allOn).net - deriveLineupStats(allOff).net
			: undefined;

	const cols = getCols([
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

	return (
		<div className="mb-3">
			<ResponsiveTableWrapper nonfluid>
				<table className="table table-striped table-borderless table-sm mb-1">
					<thead>
						<tr>
							<th />
							{cols.map((col) => (
								<th key={col.title} title={col.desc} className="text-end">
									{col.title}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map(({ label, stats }) => {
							const empty = stats.min === 0;
							const derived = deriveLineupStats(stats);
							return (
								<tr
									key={label}
									className={empty ? "text-body-secondary" : undefined}
								>
									<th className="text-nowrap fw-normal">{label}</th>
									<td className="text-end">{stats.min.toFixed(1)}</td>
									{empty ? (
										<td className="text-center" colSpan={8}>
											This combination never happened
										</td>
									) : (
										<>
											<td className="text-end">{Math.round(stats.poss)}</td>
											<td className="text-end">{derived.ortg.toFixed(1)}</td>
											<td className="text-end">{derived.drtg.toFixed(1)}</td>
											<td className="text-end">
												<PlusMinus>{derived.net}</PlusMinus>
											</td>
											<td className="text-end">{derived.efg.toFixed(1)}</td>
											<td className="text-end">{derived.tsp.toFixed(1)}</td>
											<td className="text-end">{derived.tovp.toFixed(1)}</td>
											<td className="text-end">{derived.pace.toFixed(1)}</td>
										</>
									)}
								</tr>
							);
						})}
					</tbody>
				</table>
			</ResponsiveTableWrapper>
			<div className="fw-bold">
				ON vs OFF net rating:{" "}
				{onVsOff === undefined ? "—" : <PlusMinus>{onVsOff}</PlusMinus>}
			</div>
		</div>
	);
};

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

	const [selectedPids, setSelectedPids] = useState<number[]>([]);

	// New team/season/phase means a different player pool - drop the selection.
	useEffect(() => {
		setSelectedPids([]);
	}, [tid, season, playoffs]);

	useTitleBar({
		title: "Lineups",
		dropdownView: "lineups",
		dropdownFields: {
			teams: abbrev,
			seasons: season,
			playoffsCombined: playoffs,
		},
	});

	// Every player who appears in any lineup this season, including ones no
	// longer on the roster (trades, releases).
	const playerOptions = useMemo(() => {
		const byPid = new Map<number, LineupPlayer>();
		for (const l of lineups) {
			for (const p of l.players) {
				byPid.set(p.pid, p);
			}
		}
		return [...byPid.values()].sort((a, b) => a.name.localeCompare(b.name));
	}, [lineups]);

	const selectedPlayers = selectedPids
		.map((pid) => playerOptions.find((p) => p.pid === pid))
		.filter((p) => p !== undefined);

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

	const filtered = lineups.filter(
		(l) =>
			l.stats.min >= minMinutes &&
			selectedPids.every((pid) => l.pids.includes(pid)),
	);

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

			<div className="mb-3" style={{ maxWidth: 600 }}>
				<label className="form-label" htmlFor="lineups-players">
					Player on/off breakdown
				</label>
				<Select
					classNamePrefix="dark-select"
					inputId="lineups-players"
					isMulti
					options={
						selectedPids.length >= MAX_ON_OFF_PLAYERS ? [] : playerOptions
					}
					value={selectedPlayers}
					getOptionLabel={(p) => (p.pos ? `${p.name} (${p.pos})` : p.name)}
					getOptionValue={(p) => String(p.pid)}
					noOptionsMessage={() =>
						selectedPids.length >= MAX_ON_OFF_PLAYERS
							? `Maximum ${MAX_ON_OFF_PLAYERS} players`
							: "No matching players"
					}
					placeholder={`Select 2-${MAX_ON_OFF_PLAYERS} players...`}
					// Render the menu in a portal above the sticky DataTable cells,
					// which otherwise paint over it and swallow clicks on options.
					menuPortalTarget={document.body}
					styles={{
						menuPortal: (base) => ({ ...base, zIndex: 1050 }),
					}}
					onChange={(newValue) => {
						setSelectedPids(newValue.map((p) => p.pid));
					}}
				/>
				<div className="form-text">
					See the net rating with all selected players on the floor together,
					every on/off split, and only the lineups containing all of them.
				</div>
			</div>

			{selectedPlayers.length >= 2 ? (
				<OnOffSummary lineups={lineups} selectedPlayers={selectedPlayers} />
			) : null}

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
			) : filtered.length === 0 ? (
				<p>
					{selectedPids.length > 0
						? "No lineups with all selected players meet the minimum minutes. Try lowering it to 0."
						: "No lineups meet the minimum minutes."}
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
