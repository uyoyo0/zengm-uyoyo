# Soccer GM

This fork adds a local Soccer GM build alongside ZenGM's existing sports.

## Run locally

```sh
SPORT=soccer node --run dev
```

For a production build:

```sh
SPORT=soccer node --run build
```

The generated site is written to `build/`.

## Included world and rules

- The 20 clubs in the 2026/27 Premier League, with their club crests
- A 38-match double round-robin season, with the table leader crowned champion
- No tiers, promotion, relegation, playoffs, or cup competitions
- Soccer positions, ratings, player development, match stats, awards, and Hall of Fame logic
- Formation-based starting XIs and tactical instructions
- Transfer fees, club transfer/wage budgets, negotiation outcomes, and transfer windows
- Once-per-season club academy intake

The generated players are fictional. Existing ZenGM career, history, finance, roster, job, export, and customization systems remain available, with soccer-specific tactics and transfer pages in the league menu.
