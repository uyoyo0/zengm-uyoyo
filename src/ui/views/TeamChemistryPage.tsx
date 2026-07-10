import useTitleBar from "../hooks/useTitleBar.tsx";
import { DataTable } from "../components/DataTable/index.tsx";
import type { Col, DataTableRow } from "../components/DataTable/index.tsx";
import CoachDials from "../components/CoachDials.tsx";
import { MoreLinks } from "../components/MoreLinks.tsx";
import { helpers } from "../util/helpers.ts";
import type { View } from "../../common/types.ts";
import { fitClass, fitGrade } from "../util/fitGrade.ts";
import {
	playerFitMessage,
	playerGoodFitMessage,
	playerRoleFitMessage,
	ROLE_NEED_LABELS,
	teamFitMessage,
} from "../util/fitMessages.ts";
import { PlusMinus } from "../components/PlusMinus.tsx";

const num = (title: string, desc?: string): Col => ({
	title,
	desc,
	sortSequence: ["desc", "asc"],
	sortType: "number",
});

// Supply-vs-demand bar for one role need.
const CoverageBar = ({
	need,
}: {
	need: { need: string; demand: number; supply: number; coverage: number };
}) => {
	const pct = Math.round(100 * need.coverage);
	const color =
		need.coverage >= 0.9
			? "bg-success"
			: need.coverage >= 0.65
				? "bg-warning"
				: "bg-danger";
	return (
		<div className="mb-2">
			<div className="d-flex justify-content-between small">
				<span>{ROLE_NEED_LABELS[need.need as never] ?? need.need}</span>
				<span className="text-body-secondary">
					{need.supply.toFixed(1)} of {need.demand.toFixed(1)} needed
				</span>
			</div>
			<div className="progress" style={{ height: 8 }}>
				<div
					className={`progress-bar ${color}`}
					style={{ width: `${pct}%` }}
					role="progressbar"
					aria-valuenow={pct}
					aria-valuemin={0}
					aria-valuemax={100}
				/>
			</div>
		</div>
	);
};

const TeamChemistryPage = ({
	abbrev,
	challengeNoRatings,
	coach,
	coaching,
	cohesion,
	lineups,
	needs,
	players,
	season,
	teamMessageData,
	tid,
}: View<"teamChemistryPage">) => {
	useTitleBar({
		title: "Team Chemistry",
		dropdownView: "team_chemistry",
		dropdownFields: { teams: abbrev },
	});

	if (challengeNoRatings) {
		return (
			<p>
				Chemistry information is hidden in the "no visible ratings" challenge
				mode.
			</p>
		);
	}

	if (!coach || !coaching) {
		return (
			<p>
				No head coach — chemistry is measured against the coach's system. Hire
				one on the <a href={helpers.leagueUrl(["coaches"])}>Coaches</a> page.
			</p>
		);
	}

	const grade = cohesion !== undefined ? fitGrade(cohesion) : undefined;

	const playerCols: Col[] = [
		{ title: "Name" },
		{ title: "Pos" },
		{ title: "Archetype" },
		num("Fit", "How well the player fits the coach's system"),
		{ title: "Role in System", desc: "The job this system has for him" },
		{ title: "Scouting Note" },
		num("Mood", "System-fit contribution to mood"),
		num("Dev", "Development boost from fit, percentage points"),
	];

	const playerRows: DataTableRow[] = players.map((p) => {
		const seed = p.pid + season * 7919;
		const message =
			(p.systemFit >= 0.82 ? playerRoleFitMessage(p.fitRole, seed) : undefined) ??
			playerFitMessage(p.fitDetails, seed) ??
			(p.systemFit >= 0.82 ? playerGoodFitMessage(seed) : undefined) ??
			"";
		const pGrade = fitGrade(p.systemFit);

		return {
			key: p.pid,
			data: [
				{
					value: (
						<>
							<a href={helpers.leagueUrl(["player", p.pid])}>
								{p.firstName} {p.lastName}
							</a>
							{p.minutesFactor < 1 ? (
								<span
									className="badge text-bg-warning ms-1"
									title="This coach reduces his minutes - his game fights the system"
								>
									Reduced role
								</span>
							) : null}
						</>
					),
					sortValue: `${p.lastName} ${p.firstName}`,
					searchValue: `${p.firstName} ${p.lastName}`,
				},
				p.pos,
				p.role,
				{
					value: <span className={fitClass(pGrade)}>{pGrade}</span>,
					sortValue: p.systemFit,
					searchValue: pGrade,
				},
				p.fitRole ? (ROLE_NEED_LABELS[p.fitRole.need] ?? "") : "",
				message,
				{
					value: <PlusMinus>{p.moodEffect}</PlusMinus>,
					sortValue: p.moodEffect,
				},
				{
					value: <PlusMinus>{100 * p.devEffect}</PlusMinus>,
					sortValue: p.devEffect,
				},
			],
		};
	});

	const lineupCols: Col[] = [
		{ title: "Lineup" },
		num("MIN", "Minutes together"),
		num("Chemistry", "Role coverage of this unit vs the system"),
		num("Net", "Net points per 100 possessions"),
		{ title: "Weakness" },
	];

	const lineupRows: DataTableRow[] = lineups.map((l, i) => ({
		key: i,
		data: [
			{
				value: (
					<>
						{l.players.map((p, j) => (
							<span key={p.pid}>
								{j > 0 ? ", " : null}
								<a href={helpers.leagueUrl(["player", p.pid])}>{p.name}</a>
							</span>
						))}
					</>
				),
				sortValue: l.players.map((p) => p.name).join(", "),
				searchValue: l.players.map((p) => p.name).join(" "),
			},
			Math.round(l.min),
			l.chemistry !== undefined
				? {
						value: (
							<span className={fitClass(fitGrade(l.chemistry))}>
								{fitGrade(l.chemistry)}
							</span>
						),
						sortValue: l.chemistry,
					}
				: null,
			{
				value: <PlusMinus>{l.net}</PlusMinus>,
				sortValue: l.net,
			},
			l.topShortage ? (ROLE_NEED_LABELS[l.topShortage] ?? "") : "",
		],
	}));

	return (
		<>
			<MoreLinks type="team" page="team_chemistry" abbrev={abbrev} tid={tid} />

			<div className="row">
				<div className="col-md-5">
					<h2 className="d-flex align-items-center gap-2">
						Cohesion
						{grade ? (
							<span className={`fs-3 fw-bold ${fitClass(grade) ?? ""}`}>
								{grade}
							</span>
						) : null}
					</h2>
					{teamMessageData ? (
						<p className="text-body-secondary">
							{teamFitMessage(teamMessageData, tid + season * 31)}
						</p>
					) : null}
					<p>
						Coach:{" "}
						<a href={helpers.leagueUrl(["coach", String(coach.cid)])}>
							{coach.firstName} {coach.lastName}
						</a>{" "}
						<span className="text-body-secondary">
							(Tactics {coach.tactics}, Adaptability {coach.adaptability})
						</span>
					</p>
					<h3>System</h3>
					<CoachDials values={coaching} />
				</div>
				<div className="col-md-7">
					<h2>Role Coverage</h2>
					<p className="text-body-secondary">
						What this system demands from a rotation, and how much of it the
						roster supplies.
					</p>
					<div style={{ maxWidth: 480 }}>
						{needs.map((need) => (
							<CoverageBar key={need.need} need={need} />
						))}
					</div>
				</div>
			</div>

			<h2 className="mt-4">Players</h2>
			<DataTable
				cols={playerCols}
				defaultSort={[3, "desc"]}
				defaultStickyCols={window.mobile ? 0 : 1}
				name="TeamChemistry:Players"
				rows={playerRows}
			/>

			<h2 className="mt-4">Lineup Chemistry</h2>
			<p className="text-body-secondary">
				Your actual 5-man units this season (min 10 minutes together), scored
				for how well each covers the system's roles, next to how they really
				performed.
			</p>
			{lineupRows.length > 0 ? (
				<DataTable
					cols={lineupCols}
					defaultSort={[2, "desc"]}
					name="TeamChemistry:Lineups"
					nonfluid
					rows={lineupRows}
				/>
			) : (
				<p>No lineup data yet this season.</p>
			)}
		</>
	);
};

export default TeamChemistryPage;
