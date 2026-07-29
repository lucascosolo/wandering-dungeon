import { FloorMap, Position, TileType } from '../state';

function isWalkable(type: TileType): boolean {
  return type === 'floor' || type === 'door' || type === 'stairs_down';
}

function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function findPath(
  map: FloorMap,
  start: Position,
  end: Position,
  _ignoreEntities = false
): Position[] | null {
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

  if (start.x === end.x && start.y === end.y) {
    return [{ x: start.x, y: start.y }];
  }

  const gScore = Array.from({ length: height }, () => Array(width).fill(Infinity));
  const fScore = Array.from({ length: height }, () => Array(width).fill(Infinity));
  const cameFrom: (Position | null)[][] = Array.from({ length: height }, () =>
    Array(width).fill(null)
  );

  gScore[start.y][start.x] = 0;
  fScore[start.y][start.x] = heuristic(start, end);

  const openSet: Position[] = [{ x: start.x, y: start.y }];
  const openSetKeys = new Set<string>([`${start.x},${start.y}`]);

  const neighbors = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

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
    if (current.x === end.x && current.y === end.y) {
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

    for (const offset of neighbors) {
      const nx = current.x + offset.x;
      const ny = current.y + offset.y;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (isWalkable(tiles[ny][nx].type)) {
          const tentativeG = currentG + 1;
          if (tentativeG < gScore[ny][nx]) {
            cameFrom[ny][nx] = { x: current.x, y: current.y };
            gScore[ny][nx] = tentativeG;
            fScore[ny][nx] = tentativeG + heuristic({ x: nx, y: ny }, end);

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

export function hasValidPath(
  map: FloorMap,
  start: Position,
  end: Position
): boolean {
  return findPath(map, start, end) !== null;
}
