export type RunLength = 'short' | 'medium' | 'long' | 'extreme';
export type Difficulty = 'gentle' | 'standard' | 'brutal';

export interface RunConfig {
  length: RunLength;
  /** Descending onto this floor wins the run. */
  finalFloor: number;
  difficulty: Difficulty;
}

/**
 * Five floors per region, so a length is really a region count: 2, 3, 4, or 5.
 * Every boss floor is a multiple of five and the run always ends on one.
 */
export const RUN_LENGTHS: Record<RunLength, { label: string; floors: number }> = {
  short: { label: 'Short', floors: 10 },
  medium: { label: 'Medium', floors: 15 },
  long: { label: 'Long', floors: 20 },
  extreme: { label: 'EXTREME', floors: 25 },
};

/**
 * `standard` is the balance the game already shipped with, so an existing run
 * plays identically — the tiers spread around it rather than rebasing it.
 */
export const DIFFICULTIES: Record<Difficulty, { label: string; damageTaken: number }> = {
  gentle: { label: 'Gentle', damageTaken: 0.7 },
  standard: { label: 'Standard', damageTaken: 1 },
  brutal: { label: 'Brutal', damageTaken: 1.3 },
};

/** The longest run is a brutal-only badge, so the choice is not offered there. */
export const FORCED_BRUTAL_LENGTH: RunLength = 'extreme';

export function createRunConfig(length: RunLength, difficulty: Difficulty): RunConfig {
  return {
    length,
    finalFloor: RUN_LENGTHS[length].floors,
    difficulty: length === FORCED_BRUTAL_LENGTH ? 'brutal' : difficulty,
  };
}
