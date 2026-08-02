import { FloorMap, manhattan, Position, samePosition, TileType } from '../state';

function isWalkable(type: TileType): boolean {
  return type === 'floor' || type === 'door' || type === 'stairs_down';
}

const CARDINAL_STEPS: [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

export function findPath(map: FloorMap, start: Position, end: Position): Position[] | null {
  const { width, height, tiles } = map;

  if (
    start.x < 0 ||
    start.x >= width ||
    start.y < 0 ||
    start.y >= height ||
    end.x < 0 ||
    end.x >= width ||
    end.y < 0 ||
    end.y >= height
  ) {
    return null;
  }

  if (!isWalkable(tiles[start.y][start.x].type) || !isWalkable(tiles[end.y][end.x].type)) {
    return null;
  }

  if (samePosition(start, end)) {
    return [{ x: start.x, y: start.y }];
  }

  const gScore = Array.from({ length: height }, () => Array(width).fill(Infinity));
  const fScore = Array.from({ length: height }, () => Array(width).fill(Infinity));
  const cameFrom: (Position | null)[][] = Array.from({ length: height }, () =>
    Array(width).fill(null)
  );

  gScore[start.y][start.x] = 0;
  fScore[start.y][start.x] = manhattan(start, end);

  const openSet: Position[] = [{ x: start.x, y: start.y }];
  const openSetKeys = new Set<string>([`${start.x},${start.y}`]);

  while (openSet.length > 0) {
    // Find node in openSet with lowest fScore
    let currentIdx = 0;
    let lowestF = fScore[openSet[0].y][openSet[0].x];

    for (let i = 1; i < openSet.length; i++) {
      const pos = openSet[i];
      const f = fScore[pos.y][pos.x];
      if (f < lowestF) {
        lowestF = f;
        currentIdx = i;
      }
    }

    const current = openSet[currentIdx];
    if (samePosition(current, end)) {
      // Reconstruct path
      const path: Position[] = [];
      let curr: Position | null = current;
      while (curr !== null) {
        path.push(curr);
        curr = cameFrom[curr.y][curr.x];
      }
      path.reverse();
      return path;
    }

    // Remove current from openSet
    openSet.splice(currentIdx, 1);
    openSetKeys.delete(`${current.x},${current.y}`);

    const currentG = gScore[current.y][current.x];

    for (const [dx, dy] of CARDINAL_STEPS) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (isWalkable(tiles[ny][nx].type)) {
          const tentativeG = currentG + 1;
          if (tentativeG < gScore[ny][nx]) {
            cameFrom[ny][nx] = { x: current.x, y: current.y };
            gScore[ny][nx] = tentativeG;
            fScore[ny][nx] = tentativeG + manhattan({ x: nx, y: ny }, end);

            const key = `${nx},${ny}`;
            if (!openSetKeys.has(key)) {
              openSet.push({ x: nx, y: ny });
              openSetKeys.add(key);
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Reachability only. This is a flood fill rather than `findPath(...) !== null`
 * because the shift planner asks it several times per shift, and reconstructing
 * a route needs three full-map score grids that the answer then throws away.
 */
export function hasValidPath(map: FloorMap, start: Position, end: Position): boolean {
  const { width, height, tiles } = map;

  const inside = (p: Position): boolean =>
    p.x >= 0 && p.x < width && p.y >= 0 && p.y < height;
  if (!inside(start) || !inside(end)) return false;
  if (!isWalkable(tiles[start.y][start.x].type)) return false;
  if (!isWalkable(tiles[end.y][end.x].type)) return false;

  const seen = new Uint8Array(width * height);
  const queue = [start.y * width + start.x];
  const goal = end.y * width + end.x;
  seen[queue[0]] = 1;

  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    if (index === goal) return true;

    const x = index % width;
    const y = (index - x) / width;

    for (const [dx, dy] of CARDINAL_STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const next = ny * width + nx;
      if (seen[next] || !isWalkable(tiles[ny][nx].type)) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }

  return false;
}
