# GTA VI Twitch CCU Forecast

This entry forecasts hourly Grand Theft Auto VI Twitch category viewers for hours 2 through 24 of release day. It is a Node 22 TypeScript program using only the standard library.

The model normalizes each eligible launch's hourly viewers by its own hour-1 print, then models the resulting log ratios. A launch is eligible only when its platforms contain no `PC` and its unlock notes include `Tier: comparable`. For each target hour, interpolated empirical quantiles are centered on the median and their spread is multiplied by 1.5 before being scaled by the target case's hour-1 print. Missing hours use neighboring hours' ratios, and unavailable data falls back to a flat forecast.

Run locally with:

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

The entry reads all launch data at runtime, uses no randomness or network access, and produces deterministic output files.
