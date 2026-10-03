# caddy

`site.caddy` routes `{$SUPERTEAM_DOMAIN}` to the project's services over the external `caddy` docker network. It works standalone and inside a shared Caddy that fronts several projects.

Standalone:

```sh
docker network create caddy
cp Caddyfile.example Caddyfile
cp .env.example .env
docker compose up -d
```

Shared Caddy: mount this directory as `/etc/caddy/projects.d/superteam:ro`, keep `import /etc/caddy/projects.d/*/site.caddy` in its Caddyfile and put `SUPERTEAM_DOMAIN` in its environment.

Rules that keep `site.caddy` portable:

- the domain comes only from the environment variable
- no `tls` block, certificates are configured by the host Caddy (`acme_dns cloudflare {env.CLOUDFLARE_API_TOKEN}` in the global block)
- snippets are prefixed with the project slug because Caddy snippets are global
- mount the directory, not the file: a single-file bind mount goes stale when git replaces the inode
- keep `admin localhost:2019`, `admin off` makes `caddy reload` impossible
