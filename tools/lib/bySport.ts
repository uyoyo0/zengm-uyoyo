import { type Sport } from "./getSport.ts";

export const bySport = <T>(
	sport: Sport,
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
	if (Object.hasOwn(object, sport)) {
		return (object as any)[sport];
	}

	// Soccer was added after the other ZenGM sports. Hockey is the closest
	// existing default for shared low-scoring/team-sport behavior. Soccer code
	// supplies an explicit branch anywhere the behavior is actually different.
	if (sport === "soccer" && Object.hasOwn(object, "hockey")) {
		return (object as any).hockey;
	}

	if (Object.hasOwn(object, "default")) {
		return (object as any).default;
	}

	throw new Error("No value for sport and no default");
};
