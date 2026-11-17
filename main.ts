import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const SPREAD_SCALE = 1.5;
const HOUR_MS = 60 * 60 * 1000;
const MAX_VIEWERS = 1_000_000_000;

interface HourlyPoint {
  from: string;
  viewers?: number | null;
}

interface Comparable {
  day_start: string;
  hourly: HourlyPoint[];
  platforms: string;
  unlock: string;
}

interface CaseFile {
  levels: number[];
  known: Array<{ hour: number; viewers: number }>;
  comparables: Comparable[];
}

function percentile(sortedValues: number[], level: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const position = (sortedValues.length - 1) * level;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];

  const fraction = position - lowerIndex;
  return sortedValues[lowerIndex] + fraction * (sortedValues[upperIndex] - sortedValues[lowerIndex]);
}

function roundViewers(viewers: number): number {
  const rounded = Math.round(viewers * 100) / 100;
  return Math.min(MAX_VIEWERS, Math.max(0.01, rounded));
}

function comparableRatios(comparable: Comparable): Array<number | undefined> | undefined {
  if (/pc/i.test(comparable.platforms) || !comparable.unlock.includes('Tier: comparable')) {
    return undefined;
  }

  const dayStart = Date.parse(comparable.day_start);
  if (!Number.isFinite(dayStart)) return undefined;

  const viewersByHour = new Map<number, number>();
  for (const point of comparable.hourly) {
    const timestamp = Date.parse(point.from);
    if (!Number.isFinite(timestamp) || timestamp < dayStart || timestamp >= dayStart + 24 * HOUR_MS) {
      continue;
    }

    const hourIndex = Math.floor((timestamp - dayStart) / HOUR_MS);
    const viewers = point.viewers;
    if (typeof viewers !== 'number' || !Number.isFinite(viewers) || viewers <= 0) continue;
    if (!viewersByHour.has(hourIndex)) viewersByHour.set(hourIndex, viewers);
  }

  const firstHourViewers = viewersByHour.get(0);
  if (firstHourViewers === undefined) return undefined;

  const ratios: Array<number | undefined> = [];
  for (let hour = 2; hour <= 24; hour += 1) {
    const viewers = viewersByHour.get(hour - 1);
    ratios.push(viewers === undefined ? undefined : Math.log(viewers / firstHourViewers));
  }
  return ratios;
}

function forecast(caseFile: CaseFile): number[][] {
  const knownFirstHour = caseFile.known.find((entry) => entry.hour === 1);
  if (knownFirstHour === undefined) throw new Error('Case has no hour-1 print');

  const firstHourPrint = Math.max(1, knownFirstHour.viewers);
  const ratiosByHour: number[][] = Array.from({ length: 23 }, () => []);

  for (const comparable of caseFile.comparables) {
    const ratios = comparableRatios(comparable);
    if (ratios === undefined) continue;
    ratios.forEach((ratio, index) => {
      if (ratio !== undefined) ratiosByHour[index].push(ratio);
    });
  }

  return Array.from({ length: 23 }, (_, index) => {
    const hour = index + 2;
    let ratios = ratiosByHour[index];

    if (ratios.length === 0) {
      const previousRatios = hour >= 3 ? ratiosByHour[hour - 3] : [];
      const nextRatios = hour <= 23 ? ratiosByHour[hour - 1] : [];
      ratios = [...previousRatios, ...nextRatios];
    }

    const sortedRatios = [...ratios].sort((left, right) => left - right);
    const median = percentile(sortedRatios, 0.5);
    const quantiles = LEVELS.map((level) => {
      const empiricalQuantile = percentile(sortedRatios, level);
      return firstHourPrint * Math.exp(median + (empiricalQuantile - median) * SPREAD_SCALE);
    });

    return quantiles.map(roundViewers).sort((left, right) => left - right);
  });
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const inputFiles = readdirSync(INPUT_DIR).filter((file) => file.endsWith('.in')).sort();

for (const inputFile of inputFiles) {
  const caseFile = JSON.parse(readFileSync(join(INPUT_DIR, inputFile), 'utf8')) as CaseFile;
  if (
    caseFile.levels.length !== LEVELS.length
    || caseFile.levels.some((level, index) => level !== LEVELS[index])
  ) {
    throw new Error(`${inputFile} does not use the required quantile levels`);
  }

  const hourlyQuantiles = forecast(caseFile);
  const output = {
    hours: hourlyQuantiles.map((quantiles, index) => ({ hour: index + 2, q: quantiles })),
  };
  const outputId = inputFile.slice(0, -'.in'.length);
  writeFileSync(join(OUTPUT_DIR, `${outputId}.out`), `${JSON.stringify(output)}\n`);
}
