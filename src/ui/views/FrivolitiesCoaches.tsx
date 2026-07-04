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

const fmtDelta = (delta: number) => {
	const rounded = delta.toFixed(1);
	return delta >= 0 ? `+${rounded}` : rounded;
};

const deltaCell = (delta: number) => ({
	value: (
		<span
			className={
				delta > 0 ? "text-success" : delta < 0 ? "text-danger" : undefined
			}
		>
			{fmtDelta(delta)}
		</span>
	),
	sortValue: delta,
});

const coachName = (c: {
	cid: number;
	firstName: string;
	lastName: string;
	hof?: 1;
}) => ({
	value: (
		<>
			<a href={helpers.leagueUrl(["coach", String(c.cid)])}>
				{c.firstName} {c.lastName}
			</a>
			{c.hof ? (
				<span
					className="badge text-bg-primary ms-1"
					title="Inducted into the Hall of Fame"
				>
					HOF
				</span>
			) : null}
		</>
	),
	sortValue: `${c.lastName} ${c.firstName}`,
	searchValue: `${c.firstName} ${c.lastName}`,
});

const FrivolitiesCoaches = (props: View<"frivolitiesCoaches">) => {
	const { description, title, type } = props;

	useTitleBar({
		title,
		customMenu: frivolitiesMenu,
	});

	let cols: Col[];
	let rows: DataTableRow[];

	if (props.mode === "season") {
		cols = [
			num("#"),
			{ title: "Name" },
			num("Season"),
			{ title: "Team" },
			num("W"),
			num("L"),
			num("Exp W", "Expected wins (talent-based, injury & trade aware)"),
			num("Δ", "Wins above expectation"),
			{ title: "Playoffs", sortSequence: [] },
		];
		rows = props.coaches.map((c, i) => ({
			key: `${c.cid}-${c.season}`,
			data: [
				i + 1,
				coachName(c),
				{
					value: (
						<a href={helpers.leagueUrl(["history", c.season])}>{c.season}</a>
					),
					sortValue: c.season,
				},
				{
					value: (
						<a
							href={helpers.leagueUrl([
								"roster",
								`${c.abbrev}_${c.tid}`,
								c.season,
							])}
						>
							{c.abbrev}
						</a>
					),
					sortValue: c.abbrev,
				},
				c.won,
				c.lost,
				c.expectedWins.toFixed(1),
				deltaCell(c.delta),
				c.champion
					? `🏆 ${c.playoffWon}-${c.playoffLost}`
					: c.madePlayoffs
						? `${c.playoffWon}-${c.playoffLost}`
						: "",
			],
			classNames: {
				"table-info": c.tid === props.userTid,
			},
		}));
	} else if (props.mode === "tenure") {
		cols = [
			num("#"),
			{ title: "Name" },
			{ title: "Team" },
			num("Seasons"),
			num("W"),
			num("L"),
			num("Win%"),
			num("Titles", "Championships won with this team"),
			num("Last Season"),
		];
		rows = props.coaches.map((c, i) => ({
			key: `${c.cid}-${c.tid}`,
			data: [
				i + 1,
				coachName(c),
				{
					value: (
						<a href={helpers.leagueUrl(["roster", `${c.abbrev}_${c.tid}`])}>
							{c.abbrev}
						</a>
					),
					sortValue: c.abbrev,
				},
				c.numSeasons,
				c.won,
				c.lost,
				helpers.roundWinp(c.winp),
				c.championships,
				c.lastSeason,
			],
			classNames: {
				"table-info": c.tid === props.userTid,
			},
		}));
	} else {
		const showNumTeams = type === "journeymen";
		const showPlayerLink = type === "ex_players";
		cols = [
			num("#"),
			{ title: "Name" },
			...(showNumTeams ? [num("# Teams", "Number of teams coached")] : []),
			num("Seasons"),
			num("W"),
			num("L"),
			num("Win%"),
			num("Δ", "Career wins above expectation"),
			num("Titles", "Championships won"),
			num("COY", "Coach of the Year awards"),
			num("Last Season"),
			...(showPlayerLink ? [{ title: "Playing Career", sortSequence: [] }] : []),
		];
		rows = props.coaches.map((c, i) => ({
			key: c.cid,
			data: [
				i + 1,
				coachName(c),
				...(showNumTeams ? [c.numTeams] : []),
				c.numSeasons,
				c.won,
				c.lost,
				helpers.roundWinp(c.winp),
				deltaCell(c.delta),
				c.championships,
				c.coy,
				c.lastSeason ?? "",
				...(showPlayerLink
					? [
							c.fromPid !== undefined ? (
								<a href={helpers.leagueUrl(["player", c.fromPid])}>
									View player
								</a>
							) : null,
						]
					: []),
			],
		}));
	}

	return (
		<>
			{description ? <p>{description}</p> : null}

			<DataTable
				cols={cols}
				defaultSort={[0, "asc"]}
				defaultStickyCols={window.mobile ? 0 : 2}
				name={`FrivolitiesCoaches_${type}`}
				nonfluid
				rows={rows}
			/>
		</>
	);
};

export default FrivolitiesCoaches;
