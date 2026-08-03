# Deploying

The game is a static bundle served by nginx in a container. Host port **8420**.

Live now: **https://roguelike.lucascosolo.com/** (also reachable at
`http://162.35.172.112:8420/`, which is the same container without TLS).

## How the domain reaches it

`roguelike.lucascosolo.com` is a proxied CNAME to the account's Cloudflare Tunnel
(`36ce6a43-…​.cfargotunnel.com`), and that tunnel's ingress routes the hostname to
`http://127.0.0.1:8420` on this box. `cloudflared` already ran here for `ai-lab`, so
this added one ingress rule and one DNS record — no ports were opened and no reverse
proxy was installed. TLS terminates at Cloudflare, which is enough to make the origin
a secure context for the browser, so the PWA behaviour below now works.

The tunnel config is stored server-side at Cloudflare (`cloudflared` runs from a
token, so there is no ingress file on the box). Read or change it with:

```
CF=~/.claude/skills/cloudflare-control/scripts/cf.sh
A=46afde13730ab602c1832b2d31b8680b; T=36ce6a43-e9fe-47a4-bb52-5005d9213b78
$CF GET accounts/$A/cfd_tunnel/$T/configurations
```

A PUT replaces the whole ingress list, so read it first and append — `ai-lab` shares
this tunnel and dropping its rule would take that site down. Unlike `ai-lab`, this
hostname has **no** Cloudflare Access application in front of it: the game is public,
and adding one would put a login between testers and the title screen.

The sections below describe the alternative — running TLS on the box itself. Nothing
in them is in use; keep them for the case where the tunnel is retired.

## Why the domain is not optional

Over plain HTTP on a bare IP the browser refuses to register a service worker —
`navigator.serviceWorker` only exists in a *secure context* (HTTPS, or localhost).
So on `162.35.172.112:8420` the game plays correctly but:

- it is **not installable** (no Add to Home Screen prompt),
- it is **not offline-capable**,
- the update prompt never appears, because no worker ever takes over.

None of that is a bug in the worker. It is the origin. Point a domain with TLS at it
and all three start working with no code change. Until then, testers get a normal web
page — fine for gameplay feedback, useless for testing the PWA behaviour.

## Pointing a domain or subdomain

### 1. DNS

At your registrar, create an **A record** to the VPS:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `dungeon` (for `dungeon.example.com`) | `162.35.172.112` | 300 |

Use `@` as the Name to serve the apex domain instead. Keep TTL low (300) while you
are still moving things; raise it once settled.

Verify before going further — DNS is the usual reason the next step fails:

```
dig +short dungeon.example.com     # must print 162.35.172.112
```

### 2. TLS

Ports 80 and 443 are closed on the box and there is no reverse proxy yet — the game
container publishes 8420 directly. To get a certificate you need something on 443
that can answer the ACME challenge. Caddy is the least-effort option because it
obtains and renews certificates automatically.

Create `/srv/proxy/docker-compose.yml` on the server:

```yaml
services:
  caddy:
    image: caddy:alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
```

And `/srv/proxy/Caddyfile`:

```
dungeon.example.com {
    reverse_proxy wandering-dungeon:80
}
```

For `reverse_proxy wandering-dungeon:80` to resolve, put both on one Docker network:

```
docker network create web
docker network connect web wandering-dungeon
```

and add `networks: [web]` to the caddy service plus a top-level
`networks: { web: { external: true } }`. Alternatively skip the shared network and
use `reverse_proxy 172.17.0.1:8420`, which reaches the published port via the Docker
bridge gateway — simpler, but it leaves 8420 exposed to the internet as well.

Then:

```
cd /srv/proxy && docker compose up -d
```

Caddy will request a certificate on first request. Watch it with
`docker logs -f caddy`; a failure here is nearly always DNS not yet propagated or
port 80 unreachable.

### 3. Close the raw port

Once the domain serves, stop publishing 8420 to the world so there is one way in and
it is the encrypted one. In `docker-compose.yml` change the mapping to bind locally:

```yaml
    ports:
      - "127.0.0.1:8420:80"
```

(Only do this after the proxy reaches the container over the shared Docker network —
with the `172.17.0.1:8420` variant above, binding to localhost breaks it.)

Then `docker compose up -d` to recreate.

### 4. Tell the app its address

`README.md` carries a placeholder URL for testers. Update it once the domain is live.

## Redeploying

From the laptop:

```
cd /home/lucas/workspace/RealityBendingRoguelike
SHA=$(git rev-parse --short=7 HEAD)
tar czf /tmp/wd-src.tgz --exclude=.git --exclude=node_modules --exclude=dist --exclude=logs .
~/.claude/skills/deploy/scripts/vps.sh push /tmp/wd-src.tgz /srv/wandering-dungeon/src.tgz
~/.claude/skills/deploy/scripts/vps.sh run "cd /srv/wandering-dungeon && tar xzf src.tgz && rm -f src.tgz && BUILD_ID=$SHA docker compose up -d --build"
```

`BUILD_ID` matters: `.git` is excluded from the tarball, so without it the version
stamp falls back to a timestamp and a tester's bug report names a minute instead of a
commit.

The source is pushed as a tarball rather than pulled with git because this laptop has
no `rsync` and the server would need its own credentials for a private GitHub repo.
The server does have `git`, so switching to a pull later is a small change.

## Reboot behaviour

`wandering-dungeon.service` is enabled and runs `docker compose up -d`; the container
itself is `restart: unless-stopped` and the docker unit is enabled. Both layers are
deliberate — the compose restart policy covers a crash, the systemd unit covers a
reboot.

Check with:

```
systemctl is-enabled wandering-dungeon   # enabled
systemctl is-active wandering-dungeon    # active
docker ps
```

## Rollback

The image is rebuilt from source on the box, so rolling back means pushing an older
tree:

```
git checkout <older-sha>
# repeat the redeploy block above with SHA=<older-sha>
git checkout main
```
