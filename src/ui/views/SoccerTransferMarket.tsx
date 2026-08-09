import { useMemo, useState } from "react";
import useTitleBar from "../hooks/useTitleBar.tsx";
import { helpers } from "../util/helpers.ts";
import { realtimeUpdate } from "../util/realtimeUpdate.ts";
import { toWorker } from "../util/toWorker.ts";

const feeText = (amount: number) => helpers.formatCurrency(amount, "M");
const wageText = (amount: number) => helpers.formatCurrency(amount / 1000, "M");

const statusInfo: Record<string, { label: string; className: string }> = {
	playerAccepted: { label: "Ready to complete", className: "text-bg-success" },
	clubAccepted: { label: "Contract counter", className: "text-bg-warning" },
	countered: { label: "Club countered", className: "text-bg-warning" },
	rejected: { label: "Rejected", className: "text-bg-danger" },
	withdrawn: { label: "Withdrawn", className: "text-bg-secondary" },
	completed: { label: "Completed", className: "text-bg-success" },
	submitted: { label: "Submitted", className: "text-bg-info" },
};

const SoccerTransferMarket = ({
	currentPayroll,
	maxRosterSize,
	minRosterSize,
	offers,
	players,
	roster,
	season,
	transferBudget,
	wageBudget,
	tid,
	windowOpen,
}: any) => {
	useTitleBar({ title: "Transfers" });
	const [message, setMessage] = useState<{
		type: "success" | "warning" | "danger";
		text: string;
	}>();
	const [search, setSearch] = useState("");
	const [position, setPosition] = useState("all");
	const [club, setClub] = useState("all");
	const [selected, setSelected] = useState<any>();
	const [fee, setFee] = useState(0);
	const [wage, setWage] = useState(0);
	const [years, setYears] = useState(4);
	const [busy, setBusy] = useState(false);

	const clubs = useMemo<string[]>(
		() =>
			Array.from(
				new Set<string>(players.map((p: any) => String(p.club))),
			).toSorted(),
		[players],
	);
	const filteredPlayers = useMemo(() => {
		const needle = search.trim().toLowerCase();
		return players.filter(
			(player: any) =>
				(!needle ||
					player.name.toLowerCase().includes(needle) ||
					player.club.toLowerCase().includes(needle)) &&
				(position === "all" || player.pos === position) &&
				(club === "all" || player.club === club),
		);
	}, [club, players, position, search]);

	const choosePlayer = (player: any, counter?: any) => {
		setSelected(player);
		setFee(counter?.fee ?? player.askingPrice);
		setWage(
			(counter?.requestedContractAmount ?? player.recommendedContract) / 1000,
		);
		setYears(
			counter?.contractExp ? Math.max(2, counter.contractExp - season) : 4,
		);
		setMessage(undefined);
	};

	const refresh = async () => {
		await realtimeUpdate(["playerMovement", "teamFinances"]);
	};

	const submitOffer = async () => {
		if (!selected) {return;}
		setBusy(true);
		try {
			const offer = await toWorker("main", "submitTransferOffer", {
				pid: selected.pid,
				buyingTid: tid,
				fee: selected.tid < 0 ? 0 : Number(fee),
				contractAmount: Math.round(Number(wage) * 1000),
				contractExp: season + Number(years),
			});
			if (offer.status === "playerAccepted") {
				await toWorker("main", "completeTransfer", offer.offerId!);
				setMessage({
					type: "success",
					text: `${selected.name} has signed for your club.`,
				});
				setSelected(undefined);
				await refresh();
			} else if (offer.status === "countered") {
				setFee(offer.fee);
				setMessage({
					type: "warning",
					text: `${selected.club} want ${feeText(offer.fee)}. The counteroffer is loaded below.`,
				});
				await refresh();
			} else if (offer.status === "clubAccepted") {
				setWage(
					(offer.requestedContractAmount ?? offer.contractAmount ?? 0) / 1000,
				);
				setMessage({
					type: "warning",
					text: `The club accepted, but the player wants ${wageText(offer.requestedContractAmount ?? offer.contractAmount ?? 0)} per year.`,
				});
				await refresh();
			} else {
				setMessage({
					type: "danger",
					text: `${selected.club} rejected the offer.`,
				});
				await refresh();
			}
		} catch (error) {
			setMessage({
				type: "danger",
				text: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(false);
		}
	};

	const findBuyer = async (player: any) => {
		setBusy(true);
		try {
			const offer = await toWorker("main", "requestTransferOffers", player.pid);
			setMessage({
				type: "success",
				text: `An offer of ${feeText(offer.fee)} has arrived. Review it under Negotiations.`,
			});
			await refresh();
		} catch (error) {
			setMessage({
				type: "danger",
				text: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(false);
		}
	};

	const completeOutgoing = async (offer: any) => {
		setBusy(true);
		try {
			await toWorker("main", "completeTransfer", offer.offerId);
			setMessage({
				type: "success",
				text: `${offer.playerName} has joined ${offer.buyingClub} for ${feeText(offer.fee)}.`,
			});
			await refresh();
		} catch (error) {
			setMessage({
				type: "danger",
				text: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
				<div>
					<div className="text-uppercase text-secondary fw-semibold small mb-1">
						Recruitment
					</div>
					<h1 className="mb-1">Transfer Hub</h1>
					<div className="text-secondary">
						Scout players, negotiate contracts, and manage outgoing sales.
					</div>
				</div>
				<span
					className={`badge fs-6 ${windowOpen ? "text-bg-success" : "text-bg-secondary"}`}
				>
					Window {windowOpen ? "open" : "closed"}
				</span>
			</div>

			<div className="row g-2 mb-4">
				{[
					["Transfer budget", feeText(transferBudget)],
					["Annual payroll", wageText(currentPayroll)],
					["Wage budget", wageText(wageBudget)],
					["Squad", `${roster.length} / ${maxRosterSize}`],
				].map(([label, value]) => (
					<div className="col-6 col-lg-3" key={label}>
						<div className="border rounded-3 p-3 h-100 bg-body-tertiary">
							<div className="small text-secondary text-uppercase">{label}</div>
							<div className="fs-4 fw-bold">{value}</div>
						</div>
					</div>
				))}
			</div>

			{message ? (
				<div className={`alert alert-${message.type}`}>{message.text}</div>
			) : null}
			{!windowOpen ? (
				<div className="alert alert-secondary">
					You can scout the market, but deals cannot be submitted until the
					transfer window opens.
				</div>
			) : null}

			{selected ? (
				<div className="card mb-4 border-primary">
					<div className="card-body">
						<div className="d-flex justify-content-between gap-3 mb-3">
							<div>
								<div className="small text-secondary text-uppercase">
									Negotiation
								</div>
								<h2 className="h4 mb-0">{selected.name}</h2>
								<div className="text-secondary">
									{selected.pos} · {selected.age} · {selected.club} · Ovr{" "}
									{selected.ovr}
								</div>
							</div>
							<button
								className="btn-close"
								onClick={() => setSelected(undefined)}
							/>
						</div>
						<div className="row g-3 align-items-end">
							<div className="col-6 col-lg-3">
								<label className="form-label">Transfer fee</label>
								<div className="input-group">
									<span className="input-group-text">€m</span>
									<input
										className="form-control"
										disabled={selected.tid < 0}
										min={0}
										onChange={(event) => setFee(Number(event.target.value))}
										step={0.5}
										type="number"
										value={selected.tid < 0 ? 0 : fee}
									/>
								</div>
								<div className="form-text">
									Asking: {feeText(selected.askingPrice)}
								</div>
							</div>
							<div className="col-6 col-lg-3">
								<label className="form-label">Annual salary</label>
								<div className="input-group">
									<span className="input-group-text">€m</span>
									<input
										className="form-control"
										min={0.05}
										onChange={(event) => setWage(Number(event.target.value))}
										step={0.1}
										type="number"
										value={wage}
									/>
								</div>
							</div>
							<div className="col-6 col-lg-2">
								<label className="form-label">Contract</label>
								<select
									className="form-select"
									onChange={(event) => setYears(Number(event.target.value))}
									value={years}
								>
									{[2, 3, 4, 5].map((value) => (
										<option
											value={value}
											key={value}
										>{`${value} years`}</option>
									))}
								</select>
							</div>
							<div className="col-6 col-lg-4">
								<button
									className="btn btn-primary w-100"
									disabled={busy || !windowOpen}
									onClick={submitOffer}
								>
									{busy
										? "Negotiating…"
										: selected.tid < 0
											? "Offer contract"
											: "Submit offer"}
								</button>
							</div>
						</div>
					</div>
				</div>
			) : null}

			<h2 className="h3">Player market</h2>
			<div className="row g-2 mb-3">
				<div className="col-12 col-md-5">
					<input
						className="form-control"
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search player or club"
						value={search}
					/>
				</div>
				<div className="col-6 col-md-2">
					<select
						className="form-select"
						onChange={(e) => setPosition(e.target.value)}
						value={position}
					>
						<option value="all">All positions</option>
						{["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"].map(
							(pos) => (
								<option key={pos}>{pos}</option>
							),
						)}
					</select>
				</div>
				<div className="col-6 col-md-5">
					<select
						className="form-select"
						onChange={(e) => setClub(e.target.value)}
						value={club}
					>
						<option value="all">All clubs</option>
						{clubs.map((name) => (
							<option key={name}>{name}</option>
						))}
					</select>
				</div>
			</div>
			<div className="table-responsive mb-5">
				<table className="table table-hover align-middle">
					<thead>
						<tr>
							<th>Player</th>
							<th>Pos</th>
							<th>Age</th>
							<th>Club</th>
							<th>Ovr</th>
							<th>Value</th>
							<th>Asking</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{filteredPlayers.slice(0, 250).map((player: any) => (
							<tr key={player.pid}>
								<td>
									<a
										className="fw-semibold"
										href={helpers.leagueUrl(["player", player.pid])}
									>
										{player.name}
									</a>
								</td>
								<td>{player.pos}</td>
								<td>{player.age}</td>
								<td>{player.club}</td>
								<td>{player.ovr}</td>
								<td>{feeText(player.marketValue)}</td>
								<td>{player.tid < 0 ? "Free" : feeText(player.askingPrice)}</td>
								<td>
									<button
										className="btn btn-sm btn-outline-primary"
										disabled={!player.available}
										onClick={() => choosePlayer(player)}
									>
										{!player.available
											? "Unavailable"
											: player.tid < 0
												? "Approach"
												: "Negotiate"}
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="row g-4">
				<div className="col-12 col-xl-7">
					<h2 className="h3">Negotiations</h2>
					<div className="table-responsive">
						<table className="table align-middle">
							<thead>
								<tr>
									<th>Player</th>
									<th>Direction</th>
									<th>Club</th>
									<th>Fee</th>
									<th>Status</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{offers.length === 0 ? (
									<tr>
										<td colSpan={6} className="text-secondary">
											No offers yet.
										</td>
									</tr>
								) : (
									offers.map((offer: any) => {
										const info = statusInfo[offer.status] ?? {
											label: offer.status,
											className: "text-bg-secondary",
										};
										const marketPlayer = players.find(
											(p: any) => p.pid === offer.pid,
										);
										return (
											<tr key={offer.offerId}>
												<td>
													<a href={helpers.leagueUrl(["player", offer.pid])}>
														{offer.playerName}
													</a>
												</td>
												<td>
													{offer.direction === "in" ? "Incoming" : "Outgoing"}
												</td>
												<td>
													{offer.direction === "in"
														? offer.sellingClub
														: offer.buyingClub}
												</td>
												<td>{offer.fee === 0 ? "Free" : feeText(offer.fee)}</td>
												<td>
													<span className={`badge ${info.className}`}>
														{info.label}
													</span>
												</td>
												<td>
													{offer.direction === "out" &&
													offer.status === "playerAccepted" ? (
														<button
															className="btn btn-sm btn-success"
															disabled={busy}
															onClick={() => completeOutgoing(offer)}
														>
															Accept
														</button>
													) : offer.direction === "in" &&
													  ["countered", "clubAccepted"].includes(
															offer.status,
													  ) &&
													  marketPlayer ? (
														<button
															className="btn btn-sm btn-outline-primary"
															onClick={() => choosePlayer(marketPlayer, offer)}
														>
															Continue
														</button>
													) : null}
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</div>
				<div className="col-12 col-xl-5">
					<h2 className="h3">Sell players</h2>
					<p className="text-secondary small">
						Your squad must retain at least {minRosterSize} players.
					</p>
					<div className="list-group">
						{roster
							.toSorted((a: any, b: any) => b.marketValue - a.marketValue)
							.map((player: any) => (
								<div
									className="list-group-item d-flex align-items-center justify-content-between gap-3"
									key={player.pid}
								>
									<div>
										<a
											className="fw-semibold"
											href={helpers.leagueUrl(["player", player.pid])}
										>
											{player.name}
										</a>
										<div className="small text-secondary">
											{player.pos} · Ovr {player.ovr} ·{" "}
											{feeText(player.marketValue)}
										</div>
									</div>
									<button
										className="btn btn-sm btn-outline-danger"
										disabled={
											busy || !windowOpen || roster.length <= minRosterSize
										}
										onClick={() => findBuyer(player)}
									>
										Find buyer
									</button>
								</div>
							))}
					</div>
				</div>
			</div>
		</>
	);
};

export default SoccerTransferMarket;
