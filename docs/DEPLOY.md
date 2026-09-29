# Deploying Wisp

This guide takes Wisp from zero to live at `https://your-domain` on a single
Linux server. One command starts the whole stack:

| Service    | What it does                                                        |
|------------|---------------------------------------------------------------------|
| `app`      | The Wisp site and realtime WebSocket server                          |
| `postgres` | Database (users, reports, rooms…)                                   |
| `redis`    | Matchmaking queues, presence, rate limits                            |
| `caddy`    | HTTPS: gets and renews free Let's Encrypt certificates automatically |
| `coturn`   | TURN relay, so voice/video calls connect on mobile data and strict Wi‑Fi |
| `backup`   | Compressed database backup every 24h into `./backups`, kept 14 days  |

Time needed: about 30 minutes.

---

## 1. What you need

- **A domain name** (any registrar: Namecheap, Porkbun, Cloudflare…).
- **A Linux server** with a public IPv4 address. Ubuntu 24.04 is assumed below.
  - Minimum **2 GB RAM** (building the app needs it), 2 vCPU, 40 GB disk.
  - Good cheap options: Hetzner CX22, DigitalOcean 2 GB droplet.
- An email address for certificate notices.

## 2. Point the domain at the server

In your domain's DNS settings, create:

| Type | Name | Value              |
|------|------|--------------------|
| A    | `@` (or a subdomain like `chat`) | your server's IPv4 |

Remove any existing `AAAA` record for that name unless it points at this
same server — otherwise certificate issuance can fail.

Check it before continuing (can take a few minutes to propagate):

```bash
dig +short your-domain.com   # must print your server's IP
```

## 3. Prepare the server

SSH in as root (or a sudo user) and run:

```bash
# Docker + Compose
curl -fsSL https://get.docker.com | sh

# Firewall: SSH, web, and the TURN relay ports
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 49160:49660/udp
ufw --force enable

# Only if the server has less than 4 GB RAM: add swap so the build doesn't run out of memory
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

> **Cloud firewall:** if your provider also has a firewall in its web panel
> (Hetzner, DigitalOcean, AWS security groups…), open the same ports there.

## 4. Get the code and configure it

```bash
git clone https://github.com/distortedjew/distortedjew.git wisp
cd wisp
cp .env.production.example .env
```

Generate the secrets:

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "TURN_SECRET=$(openssl rand -hex 32)"
curl -4 -s ifconfig.me; echo   # your PUBLIC_IP
```

Edit `.env` (`nano .env`) and fill in:

- `DOMAIN`: e.g. `wisp.chat` (no `https://`)
- `PUBLIC_IP`: the IP printed above
- `ACME_EMAIL`: your email
- `AUTH_SECRET`, `POSTGRES_PASSWORD`, `TURN_SECRET`: the generated values

Everything else can stay as is for now.

> ⚠️ Keep `.env` safe and never commit it. If you lose `POSTGRES_PASSWORD`,
> you lose access to the database; if you change `AUTH_SECRET`, everyone is
> logged out.

## 5. Start it

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The first build takes 3–8 minutes. Then check:

```bash
docker compose -f docker-compose.prod.yml ps        # all services "Up", app "(healthy)"
curl -s https://your-domain.com/api/health          # {"ok":true,"db":true,"redis":true}
```

Open `https://your-domain.com`. 🎉

If something's wrong, look at the logs:

```bash
docker compose -f docker-compose.prod.yml logs app --tail 50
docker compose -f docker-compose.prod.yml logs caddy --tail 50   # certificate problems show here
```

## 6. Make yourself an admin

Create an account on the site (Sign up, not guest), then:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U wisp -d wisp -c "UPDATE \"User\" SET role='ADMIN' WHERE username='YOUR_USERNAME';"
```

Log out and back in. The **Admin** item appears in the account menu
(`/admin`): reports, users, sessions, moderation log and analytics.

## 7. Check calls work

Open the site on two phones **on mobile data** (not Wi‑Fi), pick **Video**,
and start matching. If the call connects, TURN is working.

---

## Everyday operations

All commands run from the `wisp` folder.

**Update to the latest version**

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Database migrations run automatically when the app starts.

**Restart / stop**

```bash
docker compose -f docker-compose.prod.yml restart app
docker compose -f docker-compose.prod.yml down      # stops everything; data is kept
```

Never add `-v` to `down` on a live server: it deletes the database.

**Backups**

A backup is written to `./backups/wisp-<date>.sql.gz` every 24h and kept 14
days. These live on the same server, so **copy them somewhere else
regularly**, for example to your computer:

```bash
scp -r root@your-server:~/wisp/backups ./wisp-backups
```

Or use your provider's automatic server snapshots as well.

**Restore a backup** (replaces the current database):

```bash
./deploy/restore.sh backups/wisp-20260101-030000.sql.gz
```

**Uptime monitoring**

Point a free monitor (UptimeRobot, Better Stack…) at
`https://your-domain.com/api/health`. It returns HTTP 200 when the app,
database and Redis are all up, 503 otherwise.

---

## Turning on the real services

The site works out of the box, but these stand-ins are only for testing.
Configure them in `.env`, then run the "update" command above.

| Feature | Set in `.env` | Where to get it |
|---|---|---|
| Emails (verify account, reset password) | `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, `EMAIL_FROM` | [resend.com](https://resend.com), free tier; verify your domain there |
| Captcha on sign-up | `CAPTCHA_PROVIDER=turnstile`, `CAPTCHA_SECRET`, `NEXT_PUBLIC_CAPTCHA_SITE_KEY` | Cloudflare dashboard → Turnstile (free) |
| AI moderation | `AI_PROVIDER`, `AI_API_KEY`, `AI_API_BASE_URL` | any compatible moderation API |
| Translation | `TRANSLATION_PROVIDER`, `TRANSLATION_API_BASE_URL`, `TRANSLATION_API_KEY` | any LibreTranslate-compatible API |
| Avatar storage in the cloud | `STORAGE_PROVIDER=s3` + `STORAGE_*` | Cloudflare R2 / AWS S3 (optional: avatars are already kept on the server by default) |

Until email is configured, verification and password-reset links are
printed in the app logs instead of being sent.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser says the certificate is invalid / site doesn't load | DNS isn't pointing at the server yet, or ports 80/443 are closed. Check `dig +short your-domain.com` and `logs caddy`. |
| `set DOMAIN in .env` (or similar) error on start | A required value in `.env` is empty. |
| Build killed / "JavaScript heap out of memory" | Server has too little RAM; add the swap file from step 3. |
| Text chat works but video calls never connect | TURN ports blocked: open 3478 tcp/udp and 49160–49660/udp in **both** `ufw` and the cloud panel firewall; check `PUBLIC_IP`. |
| App shows "unhealthy" | `logs app --tail 100`. Usually a wrong `POSTGRES_PASSWORD` after the database was first created with a different one. |
