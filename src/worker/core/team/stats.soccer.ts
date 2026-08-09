import helpers from "../../util/helpers.ts";

const raw = [
	"pts",
	"g",
	"a",
	"sh",
	"sot",
	"xg",
	"pos",
	"pas",
	"pasCmp",
	"drbAtt",
	"drbCmp",
	"prgP",
	"prgC",
	"crs",
	"crsCmp",
	"recov",
	"possLost",
	"prs",
	"prsWon",
	"tkl",
	"int",
	"clr",
	"blk",
	"fouled",
	"off",
	"penG",
	"penA",
	"penM",
	"penWon",
	"penCon",
	"psxg",
	"gkClaims",
	"cor",
	"fl",
	"yc",
	"rc",
	"sv",
] as const;

const stats = {
	derived: [] as const,
	raw: [
		"gp",
		"min",
		...raw,
		...raw.map((stat) => `opp${helpers.upperCaseFirstLetter(stat)}` as const),
	] as const,
};

export default stats;
