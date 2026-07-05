import useTitleBar from "../hooks/useTitleBar.tsx";
import { DataTable } from "../components/DataTable/index.tsx";
import type { Col, DataTableRow } from "../components/DataTable/index.tsx";
import { helpers } from "../util/helpers.ts";
import type { View } from "../../common/types.ts";

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

// All-time coaching records, active and retired coaches alike.
const CoachRecords = ({ coaches, userTid }: View<"coachRecords">) => {
	useTitleBar({ title: "Coaching Records" });

	const cols: Col[] = [
		{ title: "Name" },
		{ title: "Team" },
		num("Seasons"),
		num("W"),
		num("L"),
		num("Win%"),
		num("Δ", "Career wins above expectation"),
		num("Playoff W"),
		num("Playoff L"),
		num("Titles", "Championships won"),
		num("COY", "Coach of the Year awards"),
		num("Last Season"),
	];

	const rows: DataTableRow[] = coaches.map((c) => {
		return {
			key: c.cid,
			data: [
				{
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
				},
				{
					value: c.abbrev ? (
						<a href={helpers.leagueUrl(["roster", `${c.abbrev}_${c.tid}`])}>
							{c.abbrev}
						</a>
					) : (
						<span className="text-body-secondary">
							{c.retiredYear !== undefined ? "Retired" : "FA"}
						</span>
					),
					sortValue: c.abbrev ?? "ZZZ",
				},
				c.numSeasons,
				c.won,
				c.lost,
				helpers.roundWinp(c.winp),
				{
					value: (
						<span
							className={
								c.winsAboveExpected > 0
									? "text-success"
									: c.winsAboveExpected < 0
										? "text-danger"
										: undefined
							}
						>
							{fmtDelta(c.winsAboveExpected)}
						</span>
					),
					sortValue: c.winsAboveExpected,
				},
				c.playoffWon,
				c.playoffLost,
				c.championships,
				c.coy,
				c.lastSeason,
			],
			classNames: {
				"table-info": c.active && c.tid === userTid,
			},
		};
	});

	return (
		<>
			<p>
				Career records for every head coach in league history, including active
				coaches. Your current coach is{" "}
				<span className="text-info">highlighted in blue</span>.
			</p>

			<DataTable
				cols={cols}
				defaultSort={[3, "desc"]}
				defaultStickyCols={window.mobile ? 0 : 1}
				name="CoachRecords"
				pagination
				rows={rows}
			/>
		</>
	);
};

export default CoachRecords;
