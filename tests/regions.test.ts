import { describe, expect, it } from 'vitest';
import { RUN_LENGTHS } from '../src/core/runConfig';
import {
  depthWithinRegion,
  FLOORS_PER_REGION,
  isRegionEnd,
  REGIONS,
  regionCount,
  regionForFloor,
  regionIndexForFloor,
  runProgress,
} from '../src/core/regions';

describe('Regions', () => {
  it('puts each five-floor block in its own region', () => {
    expect(regionIndexForFloor(1)).toBe(0);
    expect(regionIndexForFloor(5)).toBe(0);
    expect(regionIndexForFloor(6)).toBe(1);
    expect(regionIndexForFloor(10)).toBe(1);
    expect(regionIndexForFloor(11)).toBe(2);
    expect(regionIndexForFloor(25)).toBe(4);
  });

  it('changes region exactly on the boundary, never inside one', () => {
    for (let floor = 2; floor <= 25; floor++) {
      const stepped = regionIndexForFloor(floor) !== regionIndexForFloor(floor - 1);
      expect(stepped).toBe(isRegionEnd(floor - 1));
    }
  });

  it('reports depth from the top of the region', () => {
    expect(depthWithinRegion(1)).toBe(1);
    expect(depthWithinRegion(5)).toBe(5);
    expect(depthWithinRegion(6)).toBe(1);
    expect(depthWithinRegion(23)).toBe(3);
  });

  it('marks every fifth floor as the region end', () => {
    const ends = [];
    for (let floor = 1; floor <= 25; floor++) if (isRegionEnd(floor)) ends.push(floor);
    expect(ends).toEqual([5, 10, 15, 20, 25]);
  });

  it('names a region for every floor of every run length', () => {
    for (const { floors } of Object.values(RUN_LENGTHS)) {
      for (let floor = 1; floor <= floors; floor++) {
        expect(regionForFloor(floor).name).toBeTruthy();
      }
      expect(regionCount(floors)).toBe(floors / FLOORS_PER_REGION);
    }
  });

  it('has a region for the longest run and no more', () => {
    expect(REGIONS.length).toBe(regionCount(RUN_LENGTHS.extreme.floors));
    REGIONS.forEach((region, i) => expect(region.index).toBe(i));
  });

  it('holds enemy stats flat within a region and steps between them', () => {
    for (let floor = 2; floor <= 25; floor++) {
      const prev = regionForFloor(floor - 1);
      const here = regionForFloor(floor);
      const changed =
        here.enemyCount !== prev.enemyCount ||
        here.hpMultiplier !== prev.hpMultiplier ||
        here.attackBonus !== prev.attackBonus;

      expect(changed, `floor ${floor} changed stats mid-region`).toBe(
        here.index !== prev.index
      );
    }
  });

  it('never lets a stat run away with the floor number', () => {
    // The old curves were linear in level with no ceiling: a 114 HP Crawler and
    // 28 enemies on floor 25, against a player whose power is flat all run.
    const last = REGIONS[REGIONS.length - 1];
    expect(last.enemyCount).toBeLessThanOrEqual(8);
    expect(last.hpMultiplier).toBeLessThanOrEqual(2);
    expect(last.attackBonus).toBeLessThanOrEqual(4);

    REGIONS.forEach((region, i) => {
      if (i === 0) return;
      const prev = REGIONS[i - 1];
      expect(region.enemyCount).toBeGreaterThanOrEqual(prev.enemyCount);
      expect(region.hpMultiplier).toBeGreaterThanOrEqual(prev.hpMultiplier);
      expect(region.attackBonus).toBeGreaterThanOrEqual(prev.attackBonus);
    });
  });

  it('gives the first region an exclusive pool and keeps later pools explicit', () => {
    expect(regionForFloor(1).enemyPool).toEqual(['hinge_warden', 'seam_skitter']);
    expect(regionForFloor(6).enemyPool).toEqual(['fracture_leech', 'riftbound']);
    expect(regionForFloor(11).enemyPool).toEqual(['ashlock', 'stasis_scorcher']);
    expect(regionForFloor(16).enemyPool).toEqual(['facet_reaver', 'glass_moth']);
    expect(regionForFloor(21).enemyPool).toEqual(['unmaking_hound', 'null_scribe']);
  });

  it('gives every region a distinct terrain palette and accent', () => {
    const palettes = REGIONS.map(region => region.palette);

    palettes.forEach(palette => {
      expect(palette.wall).toMatch(/^#/);
      expect(palette.floor).toMatch(/^#/);
      expect(palette.door).toMatch(/^#/);
      expect(palette.stairs).toMatch(/^#/);
      expect(palette.chasm).toMatch(/^#/);
      expect(palette.accent).toMatch(/^#/);
    });
    expect(new Set(palettes.map(palette => palette.floor)).size).toBe(REGIONS.length);
    expect(new Set(palettes.map(palette => palette.accent)).size).toBe(REGIONS.length);
  });

  it('paces the roster from 0 in the first region to 1 in the last, any length', () => {
    for (const { floors } of Object.values(RUN_LENGTHS)) {
      expect(runProgress(1, floors)).toBe(0);
      expect(runProgress(floors, floors)).toBe(1);

      // Monotonic, so nothing already unlocked can vanish later in the run.
      let previous = -1;
      for (let floor = 1; floor <= floors; floor++) {
        const progress = runProgress(floor, floors);
        expect(progress).toBeGreaterThanOrEqual(previous);
        previous = progress;
      }
    }
  });

  it('paces species progression across floors, even in a short run', () => {
    expect(runProgress(1, 10)).toBe(0);
    expect(runProgress(5, 10)).toBe(4 / 9);
    expect(runProgress(6, 10)).toBe(5 / 9);
    expect(runProgress(10, 10)).toBe(1);
    expect(runProgress(6, 10)).toBeLessThan(0.8);
  });

  it('clamps past the last region rather than falling off the table', () => {
    // Descending past finalFloor ends the run, so this is a guard on the table
    // itself: no floor number may resolve to an undefined region.
    expect(regionForFloor(99)).toBe(REGIONS[REGIONS.length - 1]);
  });
});
