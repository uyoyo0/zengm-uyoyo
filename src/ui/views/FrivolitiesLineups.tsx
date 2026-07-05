import useTitleBar from "../hooks/useTitleBar.tsx";
import { DataTable } from "../components/DataTable/index.tsx";
import type { Col, DataTableRow } from "../components/DataTable/index.tsx";
import { helpers } from "../util/helpers.ts";
import type { View } from "../../common/types.ts";
import { frivolitiesMenu } from "./Frivolities.tsx";

const num = (title: string, desc?: string): Col => ({
	title,
	desc,
	sortSequence: ["desc", "asc"],
	sortType: "number",
});

const fmtNet = (net: number) => {
	const rounded = net.toFixed(1);
	return net >= 0 ? `+${rounded}` : rounded;
};

const netCell = (net: number) => ({
	value: (
		<span
			className={
				net > 0 ? "text-success" : net < 0 ? "text-danger" : undefined
			}
		>
			{fmtNet(net)}
		</span>
	),
	sortValue: net,
});

const playersCell = (players: { pid: number; name: string }[]) => ({
	value: (
		<>
			{players.map((p, i) => (
				<span key={p.pid}>
					{i > 0 ? ", " : null}
					<a href={helpers.leagueUrl(["player", p.pid])}>{p.name}</a>
				</span>
			))}
		</>
	),
	sortValue: players.map((p) => p.name).join(", "),
	searchValue: players.map((p) => p.name).join(" "),
});

const teamCell = (abbrev: string, tid: number, season?: number) => ({
	value: (
		<a
			href={helpers.leagueUrl(
				season !== undefined
					? ["roster", `${abbrev}_${tid}`, season]
					: ["roster", `${abbrev}_${tid}`],
			)}
		>
			{abbrev}
		</a>
	),
	sortValue: abbrev,
});

const FrivolitiesLineups = (props: View<"frivolitiesLineups">) => {
	const { description, title, type } = props;

	useTitleBar({
		title,
		customMenu: frivolitiesMenu,
	});

	let cols: Col[];
	let rows: DataTableRow[];

	if (props.mode === "lineup") {
		cols = [
			num("#"),
			{ title: "Lineup" },
			{ title: "Team" },
			num("Season"),
			num("MIN", "Minutes"),
			num("Pace", "Possessions per 48 minutes"),
			num("ORtg", "Points scored per 100 possessions"),
			num("DRtg", "Points allowed per 100 possessions"),
			num("Net", "Net points per 100 possessions"),
		];
		rows = props.rows.map((l, i) => ({
			key: i,
			data: [
				i + 1,
				playersCell(l.players),
				teamCell(l.abbrev, l.tid, l.season),
				{
					value: (
						<a href={helpers.leagueUrl(["history", l.season])}>{l.season}</a>
					),
					sortValue: l.season,
				},
				Math.round(l.min),
				l.pace.toFixed(1),
				l.ortg.toFixed(1),
				l.drtg.toFixed(1),
				netCell(l.net),
			],
			classNames: {
				"table-info": l.tid === props.userTid,
			},
		}));
	} else if (props.mode === "duo") {
		cols = [
			num("#"),
			{ title: "Duo" },
			{ title: "Team", desc: "Most recent team together" },
			num("Seasons"),
			num("Last Season"),
			num("MIN", "Minutes"),
			num("Net", "Net points per 100 possessions together"),
		];
		rows = props.rows.map((duo, i) => ({
			key: i,
			data: [
				i + 1,
				playersCell(duo.players),
				teamCell(duo.abbrev, duo.tid),
				duo.numSeasons,
				duo.lastSeason,
				Math.round(duo.min),
				netCell(duo.net),
			],
			classNames: {
				"table-info": duo.tid === props.userTid,
			},
		}));
	} else {
		cols = [
			num("#"),
			{ title: "Name" },
			{ title: "Team" },
			num("Season"),
			num("Min On", "Minutes on the floor"),
			num("Min Off", "Team minutes without them"),
			num("Net On", "Team net rating with them on the floor"),
			num("Net Off", "Team net rating with them off the floor"),
			num("Diff", "On minus off"),
		];
		rows = props.rows.map((row, i) => ({
			key: i,
			data: [
				i + 1,
				playersCell([row.player]),
				teamCell(row.abbrev, row.tid, row.season),
				{
					value: (
						<a href={helpers.leagueUrl(["history", row.season])}>
							{row.season}
						</a>
					),
					sortValue: row.season,
				},
				Math.round(row.minOn),
				Math.round(row.minOff),
				netCell(row.netOn),
				netCell(row.netOff),
				netCell(row.diff),
			],
			classNames: {
				"table-info": row.tid === props.userTid,
			},
		}));
	}

	return (
		<>
			{description ? <p>{description}</p> : null}
			<p className="text-body-secondary">
				Lineup data accumulates from when this feature was added, so older
				seasons may not appear.
			</p>

			<DataTable
				cols={cols}
				defaultSort={[0, "asc"]}
				defaultStickyCols={window.mobile ? 0 : 2}
				name={`FrivolitiesLineups_${type}`}
				nonfluid
				rows={rows}
			/>
		</>
	);
};

export default FrivolitiesLineups;
