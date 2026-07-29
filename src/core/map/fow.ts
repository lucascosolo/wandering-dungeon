import { FloorMap, Position } from '../state';

export function computeFOV(map: FloorMap, origin: Position, radius = 7): void {
  const { width, height, tiles, visible, explored } = map;

  // Reset visibility array
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      visible[y][x] = false;
    }
  }

  // Ensure origin is valid
  if (origin.x < 0 || origin.x >= width || origin.y < 0 || origin.y >= height) {
    return;
  }

  const radiusSq = radius * radius;

  // Cast rays to every point in the bounding box around origin
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) {
        continue;
      }

      const tx = origin.x + dx;
      const ty = origin.y + dy;

      if (tx < 0 || tx >= width || ty < 0 || ty >= height) {
        continue;
      }

      // Bresenham line algorithm from origin to target (tx, ty)
      let x = origin.x;
      let y = origin.y;

      const adx = Math.abs(tx - origin.x);
      const ady = Math.abs(ty - origin.y);
      const sx = origin.x < tx ? 1 : -1;
      const sy = origin.y < ty ? 1 : -1;
      let err = adx - ady;

      while (true) {
        if (x < 0 || x >= width || y < 0 || y >= height) {
          break;
        }

        const stepDistSq = (x - origin.x) * (x - origin.x) + (y - origin.y) * (y - origin.y);
        if (stepDistSq > radiusSq) {
          break;
        }

        visible[y][x] = true;
        explored[y][x] = true;

        // Wall blocks line of sight beyond itself
        if (tiles[y][x].type === 'wall') {
          break;
        }

        if (x === tx && y === ty) {
          break;
        }

        const e2 = 2 * err;
        if (e2 > -ady) {
          err -= ady;
          x += sx;
        }
        if (e2 < adx) {
          err += adx;
          y += sy;
        }
      }
    }
  }
}
