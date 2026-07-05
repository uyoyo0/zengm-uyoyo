import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { getCols } from "../../common/getCols.ts";
import { DataTable } from "../components/DataTable/index.tsx";
import type { View } from "../../common/types.ts";
import { wrappedPlayerNameLabels } from "../components/PlayerNameLabels.tsx";
import type { DataTableRow } from "../components/DataTable/index.tsx";
import { useLocal } from "../util/local.ts";

const numCol = (title: string, desc?: string) => ({
	title,
	desc,
	sortSequence: ["desc", "asc"] as ("desc" | "asc")[],
	sortType: "number" as const,
});

const HallOfFame = ({ coaches, players, stats }: View<"hallOfFame">) => {
	useTitleBar({ title: "Hall of Fame" });
	const { userTid } = useLocal(["userTid"]);

	const superCols = [
		{
			title: "",
			colspan: 6,
		},
		{
			title: "Best Season",
			colspan: 2 + stats.length,
		},
		{
			title: "Career Stats",
			colspan: stats.length,
		},
	];

	const cols = getCols([
		"Name",
		"Pos",
		"Drafted",
		"Retired",
		"Pick",
		"Peak Ovr",
		"Year",
		"Team",
		...stats.map((stat) => `stat:${stat}`),
		...stats.map((stat) => `stat:${stat}`),
	]);

	const rows: DataTableRow[] = players.map((p) => {
		return {
			key: p.pid,
			metadata: {
				type: "player",
				pid: p.pid,
				season: "career",
				playoffs: "regularSeason",
			},
			data: [
				wrappedPlayerNameLabels({
					pid: p.pid,
					firstName: p.firstName,
					firstNameShort: p.firstNameShort,
					lastName: p.lastName,
				}),
				p.bestPos,
				p.draft.year,
				p.retiredYear,
				p.draft.round > 0 ? `${p.draft.round}-${p.draft.pick}` : "",
				p.peakOvr,
				p.bestStats.season,
				<a
					href={helpers.leagueUrl([
						"roster",
						`${p.bestStats.abbrev}_${p.bestStats.tid}`,
						p.bestStats.season,
					])}
				>
					{p.bestStats.abbrev}
				</a>,
				...stats.map((stat) => helpers.roundStat(p.bestStats[stat], stat)),
				...stats.map((stat) => helpers.roundStat(p.careerStats[stat], stat)),
			],
			classNames: {
				"table-danger": p.legacyTid === userTid,
				"table-info":
					p.statsTids.slice(0, p.statsTids.length - 1).includes(userTid) &&
					p.legacyTid !== userTid,
				"table-success":
					p.statsTids.at(-1) === userTid && p.legacyTid !== userTid,
			},
		};
	});

	return (
		<>
			<p>
				Players are eligible to be inducted into the Hall of Fame after they
				retire. The formula for inclusion is very similar to{" "}
				<a href="http://espn.go.com/nba/story/_/id/8736873/nba-experts-rebuild-springfield-hall-fame-espn-magazine">
					the method described in this article
				</a>
				. Hall of Famers who played for your team are{" "}
				<span className="text-info">highlighted in blue</span>. Hall of Famers
				who retired with your team are{" "}
				<span className="text-success">highlighted in green</span>. Hall of
				Famers who played most of their career with your team are{" "}
				<span className="text-danger">highlighted in red</span>.
			</p>

			<DataTable
				cols={cols}
				defaultSort={[cols.length - 2, "desc"]}
				defaultStickyCols={window.mobile ? 0 : 1}
				name="HallOfFame"
				pagination
				rows={rows}
				superCols={superCols}
			/>

			<h2 className="mt-4">Coaches</h2>

			{coaches.length > 0 ? (
				<>
					<p>
						Coaches are eligible after they retire. Career wins, sustained
						overachievement, playoff success, championships, and Coach of the
						Year awards all count toward induction. Hall of Fame coaches who
						coached your team are{" "}
						<span className="text-info">highlighted in blue</span>.
					</p>
					<DataTable
						cols={[
							{ title: "Name" },
							numCol("Seasons"),
							numCol("W"),
							numCol("L"),
							numCol("Win%"),
							numCol("Playoff W"),
							numCol("Playoff L"),
							numCol("Titles", "Championships won"),
							numCol("COY", "Coach of the Year awards"),
							numCol("Retired"),
						]}
						defaultSort={[2, "desc"]}
						defaultStickyCols={window.mobile ? 0 : 1}
						name="HallOfFame:Coaches"
						pagination
						rows={coaches.map((c) => ({
							key: c.cid,
							data: [
								{
									value: (
										<a href={helpers.leagueUrl(["coach", String(c.cid)])}>
											{c.firstName} {c.lastName}
										</a>
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
								c.coy,
								c.retiredYear ?? "",
							],
							classNames: {
								"table-info": c.userTeam,
							},
						}))}
					/>
				</>
			) : (
				<p>No coaches have been inducted into the Hall of Fame yet.</p>
			)}
		</>
	);
};

export default HallOfFame;
