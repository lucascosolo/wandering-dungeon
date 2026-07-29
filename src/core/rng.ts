import seedrandom from 'seedrandom';

export interface SerializedRNG {
  seed: string;
  callCount: number;
}

export class SeededRNG {
  private seed: string;
  private callCount: number;
  private prng: seedrandom.PRNG;

  constructor(seed: string, initialCallCount = 0) {
    this.seed = seed;
    this.callCount = initialCallCount;
    this.prng = seedrandom(seed);
    for (let i = 0; i < initialCallCount; i++) {
      this.prng();
    }
  }

  random(): number {
    this.callCount++;
    return this.prng();
  }

  randomRange(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  getSeed(): string {
    return this.seed;
  }

  getCallCount(): number {
    return this.callCount;
  }

  serialize(): SerializedRNG {
    return {
      seed: this.seed,
      callCount: this.callCount,
    };
  }

  static fromSerialized(data: SerializedRNG): SeededRNG {
    return new SeededRNG(data.seed, data.callCount);
  }
}
