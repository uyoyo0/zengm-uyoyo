import { DataTable } from "../../components/DataTable/index.tsx";
import type { Col, DataTableRow } from "../../components/DataTable/index.tsx";
import { helpers } from "../../util/helpers.ts";
import type { View } from "../../../common/types.ts";

const num = (title: string, desc?: string): Col => ({
	title,
	desc,
	sortSequence: ["desc", "asc"],
	sortType: "number",
});

// Every head coach in franchise history, with their record for this team only.
const Coaches = ({ coaches }: Pick<View<"teamHistory">, "coaches">) => {
	const cols: Col[] = [
		{ title: "Name" },
		num("Seasons"),
		num("W"),
		num("L"),
		num("Win%"),
		num("Playoff W"),
		num("Playoff L"),
		num("Titles", "Championships won with this team"),
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
							{c.active ? (
								<span className="text-body-secondary"> (current)</span>
							) : null}
						</>
					),
					sortValue: `${c.lastName} ${c.firstName}`,
					searchValue: `${c.firstName} ${c.lastName}`,
				},
				c.numSeasons,
				c.won,
				c.lost,
				helpers.roundWinp(c.winp),
				c.playoffWon,
				c.playoffLost,
				c.championships,
				c.lastSeason,
			],
		};
	});

	return (
		<DataTable
			cols={cols}
			defaultSort={[2, "desc"]}
			defaultStickyCols={window.mobile ? 0 : 1}
			name="TeamHistory:Coaches"
			rows={rows}
		/>
	);
};

export default Coaches;
