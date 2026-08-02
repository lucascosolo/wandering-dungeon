import { BUILD_LABEL } from '../buildInfo';
import { RunLog, TurnRecord } from './runLog';

/**
 * How much of the run's tail the report carries. A twenty-floor run records
 * thousands of turns; a tester pasting into Discord (2000 characters) or a
 * GitHub issue wants the shape of the ending, not the whole trace. Two bounds
 * rather than one: the row count keeps the report readable, and the character
 * cap is the one that actually has to hold, because a turn with a long damage
 * source is several times wider than a plain move.
 */
export const REPORT_TAIL_TURNS = 24;
export const REPORT_MAX_CHARS = 1800;

function formatTurn(row: TurnRecord): string {
  const parts = [`t${row.t}`, `f${row.floor}`, `hp${row.hp}`];
  if (row.shield > 0) parts.push(`sh${row.shield}`);
  parts.push(row.act);
  if (row.dmgIn > 0) parts.push(`-${row.dmgIn}${row.from ? ` (${row.from})` : ''}`);
  if (row.dmgOut > 0) parts.push(`+${row.dmgOut}`);
  if (row.shift) parts.push(`SHIFT:${row.shift}${row.sealed ? '/sealed' : ''}`);
  return parts.join(' ');
}

function outcomeLine(log: RunLog): string {
  if (log.outcome === 'victory') return 'outcome: escaped';
  if (log.outcome === 'in_progress') return 'outcome: still running';
  return `outcome: died to ${log.causeOfDeath ?? 'unknown'}`;
}

/**
 * A compact, pasteable account of a run. Pure — it reads a `RunLog` and returns
 * text, so the death modal, a future feedback form, and the tests all get the
 * same blob.
 */
export function buildRunReport(log: RunLog, buildLabel: string = BUILD_LABEL): string {
  const header = [
    `The Wandering Dungeon ${buildLabel}`,
    outcomeLine(log),
    `seed: ${log.seed}`,
    `floor: ${log.floorReached} · turns: ${log.turns} · level: ${log.levelReached}`,
  ];

  const rows = log.history.slice(-REPORT_TAIL_TURNS).map(formatTurn);

  const assemble = (): string => {
    const omitted = log.history.length - rows.length;
    const note =
      omitted > 0
        ? `--- last ${rows.length} of ${log.history.length} turns (${omitted} earlier turns truncated) ---`
        : `--- all ${rows.length} turns ---`;
    return [...header, '', note, ...rows].join('\n');
  };

  // Drop from the oldest end until the character cap holds. The note is rebuilt
  // each time so the count it states is always the count actually printed.
  let text = assemble();
  while (text.length > REPORT_MAX_CHARS && rows.length > 0) {
    rows.shift();
    text = assemble();
  }
  return text;
}
