export const bySport = <T>(
	object:
		| {
				baseball: T;
				basketball: T;
				football: T;
				hockey: T;
				soccer?: T;
				default?: T;
		  }
		| {
				baseball?: T;
				basketball?: T;
				football?: T;
				hockey?: T;
				soccer?: T;
				default: T;
		  },
): T => {
	const sport = process.env.SPORT;
	if (Object.hasOwn(object, sport)) {
		// https://github.com/microsoft/TypeScript/issues/21732
		// @ts-expect-error
		return object[sport];
	}

	if (sport === "soccer" && Object.hasOwn(object, "hockey")) {
		// Soccer explicitly overrides sport-specific behavior. Falling back to
		// hockey keeps generic team-sport UI branches backwards compatible.
		return object.hockey as T;
	}

	if (Object.hasOwn(object, "default")) {
		// https://github.com/microsoft/TypeScript/issues/21732
		// @ts-expect-error
		return object.default;
	}

	throw new Error("No value for sport and no default");
};

export const isSport = (
	sport: "baseball" | "basketball" | "football" | "hockey" | "soccer",
) => {
	return sport === process.env.SPORT;
};
