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

  it('clamps past the last region rather than falling off the table', () => {
    // Descending past finalFloor ends the run, so this is a guard on the table
    // itself: no floor number may resolve to an undefined region.
    expect(regionForFloor(99)).toBe(REGIONS[REGIONS.length - 1]);
  });
});
