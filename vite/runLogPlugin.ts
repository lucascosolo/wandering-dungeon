import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Where run logs land, relative to the project root. */
const LOG_DIR = 'logs';

/** Refuse absurd payloads rather than filling the disk with one bad run. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export const RUN_LOG_ENDPOINT = '/__runlog';

/** Keep a client-supplied id from escaping the log directory. */
function safeName(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const cleaned = id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Dev-only endpoint that persists a run log to `logs/<run id>.json`.
 *
 * The game posts the same run repeatedly as it progresses (and once more when it
 * ends), so each write overwrites that run's file — a crashed or abandoned run
 * still leaves its most recent state on disk instead of nothing at all.
 */
export function runLogPlugin(): Plugin {
  return {
    name: 'wandering-dungeon-run-log',
    apply: 'serve',
    configureServer(server) {
      const dir = resolve(server.config.root, LOG_DIR);

      server.middlewares.use(RUN_LOG_ENDPOINT, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        let aborted = false;

        req.on('data', chunk => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            aborted = true;
            res.statusCode = 413;
            res.end('run log too large');
            req.destroy();
            return;
          }
          chunks.push(chunk as Buffer);
        });

        req.on('end', () => {
          if (aborted) return;
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const name = safeName(payload?.id);
            if (!name) {
              res.statusCode = 400;
              res.end('missing run id');
              return;
            }
            mkdirSync(dir, { recursive: true });
            writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(payload, null, 2));
            res.statusCode = 204;
            res.end();
          } catch (err) {
            server.config.logger.warn(`[run-log] rejected a payload: ${String(err)}`);
            res.statusCode = 400;
            res.end('invalid run log');
          }
        });
      });

      server.config.logger.info(`  ➜  run logs: ${dir}`);
    },
  };
}
