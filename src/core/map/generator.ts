import { SeededRNG } from '../rng';
import { FloorMap, GridTile, Position, ShiftGroup } from '../state';

interface Room {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export function generateFloor(
  rng: SeededRNG,
  level: number,
  width = 32,
  height = 32
): FloorMap {
  const maxAttempts = 100;
  const minRooms = 4;
  const targetRooms = 8;
  const minRoomSize = 4;
  const maxRoomSize = 7;

  let rooms: Room[] = [];
  let tiles: GridTile[][] = [];
  let explored: boolean[][] = [];
  let visible: boolean[][] = [];
  let shiftGroups: Record<string, ShiftGroup> = {};

  for (let attempt = 0; attempt < 10; attempt++) {
    rooms = [];
    shiftGroups = {};
    tiles = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => ({
        x,
        y,
        type: 'wall',
        shiftGroupId: null,
      }))
    );
    explored = Array.from({ length: height }, () => Array(width).fill(false));
    visible = Array.from({ length: height }, () => Array(width).fill(false));

    let roomCount = 0;
    for (let i = 0; i < maxAttempts && roomCount < targetRooms; i++) {
      const w = rng.randomInt(minRoomSize, maxRoomSize);
      const h = rng.randomInt(minRoomSize, maxRoomSize);
      const x = rng.randomInt(1, width - w - 1);
      const y = rng.randomInt(1, height - h - 1);

      let overlaps = false;
      for (const r of rooms) {
        if (
          x <= r.x + r.width &&
          x + w >= r.x &&
          y <= r.y + r.height &&
          y + h >= r.y
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        const roomId = `room_${roomCount + 1}`;
        const newRoom: Room = {
          id: roomId,
          x,
          y,
          width: w,
          height: h,
          centerX: Math.floor(x + w / 2),
          centerY: Math.floor(y + h / 2),
        };
        rooms.push(newRoom);

        for (let ry = y; ry < y + h; ry++) {
          for (let rx = x; rx < x + w; rx++) {
            tiles[ry][rx] = {
              x: rx,
              y: ry,
              type: 'floor',
              shiftGroupId: roomId,
            };
          }
        }

        shiftGroups[roomId] = {
          id: roomId,
          type: 'room',
          bounds: { x, y, width: w, height: h },
          currentOffset: { x: 0, y: 0 },
        };

        roomCount++;
      }
    }

    if (rooms.length >= minRooms) {
      break;
    }
  }

  // Connect rooms with corridors
  for (let i = 0; i < rooms.length - 1; i++) {
    const r1 = rooms[i];
    const r2 = rooms[i + 1];
    const corridorId = `corridor_${i + 1}`;

    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    const trackCorridorTile = (cx: number, cy: number) => {
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
    };

    const carveCorridorTile = (cx: number, cy: number) => {
      trackCorridorTile(cx, cy);
      if (tiles[cy][cx].type === 'wall') {
        tiles[cy][cx] = {
          x: cx,
          y: cy,
          type: 'floor',
          shiftGroupId: corridorId,
        };
      }
    };

    let x1 = r1.centerX;
    let y1 = r1.centerY;
    let x2 = r2.centerX;
    let y2 = r2.centerY;

    if (rng.random() < 0.5) {
      const stepX = x1 <= x2 ? 1 : -1;
      for (let x = x1; x !== x2 + stepX; x += stepX) {
        carveCorridorTile(x, y1);
      }
      const stepY = y1 <= y2 ? 1 : -1;
      for (let y = y1; y !== y2 + stepY; y += stepY) {
        carveCorridorTile(x2, y);
      }
    } else {
      const stepY = y1 <= y2 ? 1 : -1;
      for (let y = y1; y !== y2 + stepY; y += stepY) {
        carveCorridorTile(x1, y);
      }
      const stepX = x1 <= x2 ? 1 : -1;
      for (let x = x1; x !== x2 + stepX; x += stepX) {
        carveCorridorTile(x, y2);
      }
    }

    shiftGroups[corridorId] = {
      id: corridorId,
      type: 'corridor',
      bounds: {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX + 1),
        height: Math.max(1, maxY - minY + 1),
      },
      currentOffset: { x: 0, y: 0 },
    };
  }

  // Place doors at room-corridor junctions
  for (const r of rooms) {
    for (let ry = r.y; ry < r.y + r.height; ry++) {
      for (let rx = r.x; rx < r.x + r.width; rx++) {
        const isBorder =
          rx === r.x ||
          rx === r.x + r.width - 1 ||
          ry === r.y ||
          ry === r.y + r.height - 1;

        if (isBorder && tiles[ry][rx].type === 'floor') {
          const neighbors = [
            { x: rx + 1, y: ry },
            { x: rx - 1, y: ry },
            { x: rx, y: ry + 1 },
            { x: rx, y: ry - 1 },
          ];

          const adjacentToCorridor = neighbors.some((n) => {
            if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
              const tile = tiles[n.y][n.x];
              return (
                tile.shiftGroupId !== null &&
                tile.shiftGroupId.startsWith('corridor_')
              );
            }
            return false;
          });

          if (adjacentToCorridor) {
            tiles[ry][rx].type = 'door';
          }
        }
      }
    }
  }

  // Set entrance at center of room 0
  const entrance: Position = { x: rooms[0].centerX, y: rooms[0].centerY };
  tiles[entrance.y][entrance.x].type = 'floor';

  // Find furthest room from room 0
  let maxDistance = -1;
  let furthestRoom = rooms[rooms.length - 1];

  for (let i = 1; i < rooms.length; i++) {
    const dist =
      Math.abs(rooms[i].centerX - entrance.x) +
      Math.abs(rooms[i].centerY - entrance.y);
    if (dist > maxDistance) {
      maxDistance = dist;
      furthestRoom = rooms[i];
    }
  }

  const exit: Position = {
    x: furthestRoom.centerX,
    y: furthestRoom.centerY,
  };
  tiles[exit.y][exit.x].type = 'stairs_down';

  return {
    level,
    width,
    height,
    tiles,
    shiftGroups,
    entrance,
    exit,
    explored,
    visible,
  };
}
