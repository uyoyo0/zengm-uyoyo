import { useState } from "react";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { DataTable } from "../components/DataTable/index.tsx";
import type { Col, DataTableRow } from "../components/DataTable/index.tsx";
import { Modal } from "../components/Modal.tsx";
import { helpers } from "../util/helpers.ts";
import { toWorker } from "../util/toWorker.ts";
import { confirm } from "../util/confirm.tsx";
import { logEvent } from "../util/logEvent.ts";
import type { View } from "../../common/types.ts";

const dialLabel = (value: number) => {
	if (value === 0) {
		return "0";
	}
	return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
};

const num = (title: string, desc?: string): Col => ({
	title,
	desc,
	sortSequence: ["desc", "asc"],
	sortType: "number",
});

type CoachRow = View<"coaches">["coaches"][number];

// Offer form for a free-agent coach (hire) or the user's own expiring coach
// (extension). The coach accepts any offer at or above their asking price.
const NegotiateModal = ({
	coach,
	onDone,
	season,
	userTid,
}: {
	coach: CoachRow;
	onDone: () => void;
	season: number;
	userTid: number;
}) => {
	const demand = coach.demand!;
	const [amount, setAmount] = useState(String(demand.amount / 1000));
	const [years, setYears] = useState(demand.exp - season);
	const [feedback, setFeedback] = useState<string | undefined>();
	const [submitting, setSubmitting] = useState(false);

	const extension = coach.tid === userTid;
	const minYears = coach.ratings.ovr >= 60 ? 2 : 1;

	const submit = async () => {
		setSubmitting(true);
		setFeedback(undefined);
		const amountThousands = Math.round(Number.parseFloat(amount) * 1000);
		const result = await toWorker("main", "negotiateCoachContract", {
			cid: coach.cid,
			tid: userTid,
			amount: amountThousands,
			exp: season + years,
		});
		setSubmitting(false);
		if (result.accepted) {
			logEvent({
				type: "success",
				text: `${coach.firstName} ${coach.lastName} ${
					extension ? "signed an extension" : "is your new head coach"
				}!`,
				saveToDb: false,
			});
			onDone();
		} else if (result.errorMessage) {
			setFeedback(result.errorMessage);
		} else if (result.demand) {
			setFeedback(
				`Rejected. ${coach.lastName} is asking for ${helpers.formatCurrency(
					result.demand.amount / 1000,
					"M",
				)}/year over ${result.demand.exp - season} years.`,
			);
		}
	};

	return (
		<Modal show onHide={onDone}>
			<Modal.Header closeButton>
				<Modal.Title>
					{extension ? "Extend" : "Negotiate with"} {coach.firstName}{" "}
					{coach.lastName}
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<p>
					{coach.ratings.ovr} ovr, age {coach.age}. Asking{" "}
					<b>{helpers.formatCurrency(demand.amount / 1000, "M")}</b>/year over{" "}
					<b>{demand.exp - season}</b> year
					{demand.exp - season === 1 ? "" : "s"}
					{coach.prevAbbrev === undefined || extension
						? ""
						: ` (last coached ${coach.prevAbbrev})`}
					.
				</p>
				<div className="d-flex gap-2">
					<div>
						<label className="form-label" htmlFor="coach-offer-amount">
							Salary ($M/year)
						</label>
						<input
							id="coach-offer-amount"
							type="number"
							className="form-control"
							min={0}
							step={0.1}
							value={amount}
							onChange={(event) => {
								setAmount(event.target.value);
							}}
						/>
					</div>
					<div>
						<label className="form-label" htmlFor="coach-offer-years">
							Years
						</label>
						<select
							id="coach-offer-years"
							className="form-select"
							value={years}
							onChange={(event) => {
								setYears(Number.parseInt(event.target.value, 10));
							}}
						>
							{[1, 2, 3, 4, 5].map((n) => (
								<option key={n} value={n} disabled={n < minYears}>
									{n}
									{n < minYears ? " (won't accept)" : ""}
								</option>
							))}
						</select>
					</div>
				</div>
				{feedback ? <p className="text-danger mt-3 mb-0">{feedback}</p> : null}
			</Modal.Body>
			<Modal.Footer>
				<button className="btn btn-secondary" onClick={onDone}>
					Cancel
				</button>
				<button
					className="btn btn-primary"
					disabled={submitting}
					onClick={submit}
				>
					{extension ? "Offer extension" : "Offer contract"}
				</button>
			</Modal.Footer>
		</Modal>
	);
};

const Coaches = ({
	coaches,
	deadCoachMoney,
	freeAgent,
	season,
	spectator,
	userTid,
}: View<"coaches">) => {
	useTitleBar({ title: "Coaches" });

	const [negotiatingCid, setNegotiatingCid] = useState<number | undefined>();

	const canEdit = !spectator;
	const userCoach = coaches.find((c) => c.tid === userTid);
	const userCoachExpiring =
		userCoach !== undefined && userCoach.contract.exp <= season;
	const totalDeadMoney = deadCoachMoney.reduce(
		(sum, d) => sum + d.amountPerYear * (d.exp - season + 1),
		0,
	);

	const negotiatingCoach =
		negotiatingCid !== undefined
			? coaches.find((c) => c.cid === negotiatingCid)
			: undefined;

	const fireWithConfirm = async () => {
		if (!userCoach) {
			return;
		}
		const yearsOwed = userCoach.contract.exp - season + 1;
		const owed =
			yearsOwed > 0
				? ` You will still owe them ${helpers.formatCurrency(
						(userCoach.contract.amount * yearsOwed) / 1000,
						"M",
					)} through ${userCoach.contract.exp}.`
				: "";
		const proceed = await confirm(
			`Fire ${userCoach.firstName} ${userCoach.lastName}?${owed}`,
			{ okText: "Fire coach", cancelText: "Cancel" },
		);
		if (proceed) {
			await toWorker("main", "fireCoach", { tid: userTid });
		}
	};

	const cols: Col[] = [
		{ title: "Coach" },
		{ title: "Team" },
		num("Age"),
		num("Ovr", "Overall"),
		num("Dev", "Development"),
		num("Tac", "Tactics"),
		num("Adp", "Adaptability"),
		num("Mot", "Motivation"),
		num("Salary", "Current salary, or asking price for free agents"),
		num("Until", "Contract expiration"),
		num("W", "Wins this season"),
		num(
			"Exp W",
			"Expected wins this season (talent-based, injury & trade aware)",
		),
		num("Δ", "Wins above expectation this season"),
		num("COY", "Coach of the Year awards"),
		{ title: "Philosophy", desc: "3s / pace / glass / paint D / aggression" },
		{ title: "", noSearch: true, sortSequence: [] },
	];

	const rows: DataTableRow[] = coaches.map((c) => {
		const isUserCoach = c.tid === userTid;
		const isFreeAgent = c.tid === freeAgent;
		const coyCount = c.awards.filter(
			(a) => a.type === "Coach of the Year",
		).length;
		const delta =
			c.won !== undefined && c.expectedWins !== undefined
				? c.won - c.expectedWins
				: undefined;
		const salary =
			isFreeAgent && c.demand ? c.demand.amount : c.contract.amount;

		return {
			key: c.cid,
			data: [
				{
					value: (
						<>
							<a href={helpers.leagueUrl(["coach", String(c.cid)])}>
								{c.firstName} {c.lastName}
							</a>
							{c.fromPid !== undefined ? (
								<span className="text-body-secondary"> (ex-player)</span>
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
							FA{c.prevAbbrev ? ` (${c.prevAbbrev})` : ""}
						</span>
					),
					// Free agents sort to the end.
					sortValue: c.abbrev ?? "ZZZ",
				},
				c.age,
				c.ratings.ovr,
				c.ratings.development,
				c.ratings.tactics,
				c.ratings.adaptability,
				c.ratings.motivation,
				{
					value: (
						<>
							{helpers.formatCurrency(salary / 1000, "M")}
							{isFreeAgent ? (
								<span className="text-body-secondary" title="Asking price">
									{" "}
									ask
								</span>
							) : null}
						</>
					),
					sortValue: salary,
				},
				{
					value: isFreeAgent ? "" : c.contract.exp,
					sortValue: isFreeAgent ? -1 : c.contract.exp,
				},
				{ value: c.won ?? "", sortValue: c.won ?? -1 },
				{
					value: c.expectedWins !== undefined ? c.expectedWins.toFixed(1) : "",
					sortValue: c.expectedWins ?? -1,
				},
				{
					value:
						delta !== undefined
							? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`
							: "",
					sortValue: delta ?? -999,
					classNames:
						delta !== undefined
							? delta > 0
								? "text-success"
								: delta < 0
									? "text-danger"
									: undefined
							: undefined,
				},
				{ value: coyCount > 0 ? coyCount : "", sortValue: coyCount },
				{
					value: (
						<span className="text-body-secondary">
							{dialLabel(c.philosophy.threePointTendency)} /{" "}
							{dialLabel(c.philosophy.pace)} /{" "}
							{dialLabel(c.philosophy.crashOffensiveGlass)} /{" "}
							{dialLabel(c.philosophy.paintDefense)} /{" "}
							{dialLabel(c.philosophy.defensiveAggression)}
						</span>
					),
					sortValue: c.philosophy.threePointTendency,
				},
				{
					value: (
						<div className="d-flex gap-1">
							{canEdit && isFreeAgent ? (
								<button
									className="btn btn-xs btn-primary"
									onClick={() => {
										setNegotiatingCid(c.cid);
									}}
								>
									Negotiate
								</button>
							) : null}
							{canEdit && isUserCoach && c.demand ? (
								<button
									className="btn btn-xs btn-primary"
									onClick={() => {
										setNegotiatingCid(c.cid);
									}}
								>
									Extend
								</button>
							) : null}
							{canEdit && isUserCoach ? (
								<button
									className="btn btn-xs btn-danger"
									onClick={fireWithConfirm}
								>
									Fire
								</button>
							) : null}
						</div>
					),
					noSearch: true,
				},
			],
			classNames: isUserCoach ? "table-info" : undefined,
		};
	});

	return (
		<>
			<p>
				Every team has a head coach who sets its playing style and develops its
				players. <b>Dev</b> drives player progression, <b>Tac</b> in-game
				adjustments, <b>Adp</b> how much they tailor their style to the roster,
				and <b>Mot</b> how fresh the team stays late in games. <b>Δ</b> is wins
				above expectation this season. Coaches develop with experience, decline
				with age, and eventually retire. Negotiate with free agents below —
				expiring contracts hit the open market, and firing a coach leaves their
				remaining salary on your books.
			</p>

			{canEdit && !userCoach ? (
				<p className="text-warning">
					Your team has no head coach! Hire one below, or one will be assigned
					at the start of next season.
				</p>
			) : null}

			{canEdit && userCoachExpiring ? (
				<p className="text-warning">
					{userCoach.firstName} {userCoach.lastName}'s contract expires this
					offseason. Extend them now or they will hit the open market at the
					start of next season.
				</p>
			) : null}

			{totalDeadMoney > 0 ? (
				<p className="text-body-secondary">
					Dead money owed to fired coaches:{" "}
					{helpers.formatCurrency(totalDeadMoney / 1000, "M")} (
					{deadCoachMoney.map((d) => `${d.name} through ${d.exp}`).join(", ")})
				</p>
			) : null}

			<DataTable
				cols={cols}
				defaultSort={[3, "desc"]}
				name="Coaches"
				pagination
				rows={rows}
			/>

			{negotiatingCoach?.demand ? (
				<NegotiateModal
					coach={negotiatingCoach}
					season={season}
					userTid={userTid}
					onDone={() => {
						setNegotiatingCid(undefined);
					}}
				/>
			) : null}
		</>
	);
};

export default Coaches;
