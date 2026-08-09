import { AWARD_NAMES } from "../../../common/constants.ts";
import type { AwardPlayer } from "../../../common/types.soccer.ts";
import { helpers } from "../../util/helpers.ts";
import type { ActualProps } from "./index.tsx";

type AwardType = "attack" | "defense" | "goalkeeper";

const integer = (value: number | undefined) =>
	Number.isFinite(value)
		? Math.round(value!).toLocaleString("en-US")
		: undefined;

const decimal = (value: number | undefined) =>
	Number.isFinite(value) ? value!.toFixed(1) : undefined;

export const formatAwardStats = (
	award: Partial<AwardPlayer>,
	type: AwardType,
) => {
	const stats: string[] = [];
	const gp = integer(award.gp);
	if (gp !== undefined) {
		stats.push(`${gp} apps`);
	}

	if (type === "goalkeeper") {
		const cleanSheets = integer(award.cs);
		const savePercentage = decimal(award.svPct);
		if (cleanSheets !== undefined) {
			stats.push(`${cleanSheets} clean sheets`);
		}
		if (savePercentage !== undefined) {
			stats.push(`${savePercentage}% saves`);
		}
	} else if (type === "defense") {
		for (const [value, label] of [
			[award.tkl, "tackles"],
			[award.int, "interceptions"],
		] as const) {
			const formatted = integer(value);
			if (formatted !== undefined) {
				stats.push(`${formatted} ${label}`);
			}
		}
	} else {
		stats.push(
			`${integer(award.g) ?? 0} goals`,
			`${integer(award.a) ?? 0} assists`,
		);
		const expectedGoals = decimal(award.xg);
		if (expectedGoals !== undefined) {
			stats.push(`${expectedGoals} xG`);
		}
	}

	const rating = decimal(award.matchRating);
	if (rating !== undefined) {
		stats.push(`${rating} rating`);
	}
	return stats.join(" · ");
};

const Winner = ({
	award,
	season,
	type,
	userTid,
}: {
	award?: AwardPlayer;
	season: number;
	type: AwardType;
	userTid: number;
}) => {
	if (!award) {
		return <p className="text-body-secondary">Not awarded</p>;
	}
	const abbrev = award.abbrev ?? "???";

	return (
		<p>
			<span className={award.tid === userTid ? "table-info" : undefined}>
				{award.pos}{" "}
				<b>
					<a href={helpers.leagueUrl(["player", award.pid])}>{award.name}</a>
				</b>{" "}
				(
				<a
					href={helpers.leagueUrl(["roster", `${abbrev}_${award.tid}`, season])}
				>
					{abbrev}
				</a>
				)
			</span>
			<br />
			<span className="text-body-secondary">
				{formatAwardStats(award, type)}
			</span>
		</p>
	);
};

const AwardsAndChamp = ({
	awards,
	champ,
	season,
	userTid,
}: Pick<ActualProps, "awards" | "champ" | "season" | "userTid">) => (
	<>
		<h2>Cup Winners</h2>
		{champ ? (
			<>
				<p>
					<span className={champ.tid === userTid ? "table-info" : undefined}>
						<b>
							<a
								href={helpers.leagueUrl([
									"roster",
									`${champ.seasonAttrs.abbrev}_${champ.tid}`,
									season,
								])}
							>
								{champ.seasonAttrs.region} {champ.seasonAttrs.name}
							</a>
						</b>
					</span>
					<br />
					<a href={helpers.leagueUrl(["playoffs", season])}>Cup bracket</a>
				</p>
				<h2>{AWARD_NAMES.finalsMvp}</h2>
				<Winner
					award={awards.finalsMvp}
					season={season}
					type="attack"
					userTid={userTid}
				/>
			</>
		) : (
			<p className="text-body-secondary">Cup not completed</p>
		)}

		<h2>Premier League Champions</h2>
		{awards.bestRecordConfs.filter(Boolean).map((team: any) => (
			<p key={team.tid}>
				<span className={team.tid === userTid ? "table-info" : undefined}>
					<a
						href={helpers.leagueUrl([
							"roster",
							`${team.abbrev}_${team.tid}`,
							season,
						])}
					>
						{team.region} {team.name}
					</a>{" "}
					({helpers.formatRecord(team)})
				</span>
			</p>
		))}

		<h2>{AWARD_NAMES.mvp}</h2>
		<Winner
			award={awards.mvp}
			season={season}
			type="attack"
			userTid={userTid}
		/>
		<h2>{AWARD_NAMES.dpoy}</h2>
		<Winner
			award={awards.dpoy}
			season={season}
			type="defense"
			userTid={userTid}
		/>
		<h2>{AWARD_NAMES.goy}</h2>
		<Winner
			award={awards.goy}
			season={season}
			type="goalkeeper"
			userTid={userTid}
		/>
		<h2>{AWARD_NAMES.roy}</h2>
		<Winner
			award={awards.roy}
			season={season}
			type="attack"
			userTid={userTid}
		/>
	</>
);

export default AwardsAndChamp;
