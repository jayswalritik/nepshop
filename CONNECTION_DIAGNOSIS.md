# MongoDB Connection Diagnosis

Read-only investigation + narrowly-scoped code fixes. No secrets appear
anywhere in this document or in any script written this phase.
`backend/diagnoseDb.js` (temporary, read-only) was deleted after its output
was captured below. `backend/clearOrders.js` was **never run** — not in dry
run, not with `--confirm`.

---

## Verdict up front

**PRIMARY blocker (confirmed, 100% reproducible): DNS.** This machine's
system/OS-default DNS resolver refuses SRV and TXT lookups for
`_mongodb._tcp.cluster0.dabdkpb.mongodb.net`. Every standalone script that
connects to MongoDB without applying a DNS-resolver override (`clearOrders.js`
before this fix, and the seed/migration scripts) fails with exactly the
reported `querySrv ECONNREFUSED` error. `server.js` does not suffer from this
because it already sets `dns.setServers(['8.8.8.8','1.1.1.1'])` unconditionally
at startup (a fix already in place, predating this investigation).

**SECONDARY (observed once, NOT reproducible right now): "bad auth."** Using
the exact DNS workaround `server.js` already applies, a single controlled
connection attempt with the current `.env` credentials **succeeded** just
now — Atlas accepted them, 9 collections listed, `orders` count 13 (consistent
with `WIPE_PLAN.md`'s earlier findings — same live data, nothing has changed).
The credentials in `.env` are valid at this moment. The earlier "bad auth" was
real (Atlas evaluated and rejected something), but is not explained by
anything in this repo and could not be reproduced — see section (d) for what
that does and doesn't rule out.

---

## (a) `.env` findings (password masked)

- Exactly **one** active `MONGO_URI` line (line 10). A second `MONGO_URI` line
  (line 12) exists but is commented out with `#` — dotenv ignores commented
  lines, so there is no duplicate-key override risk. That commented line is a
  pre-built **non-SRV** direct-connection-string fallback (same credentials,
  `mongodb://...shard-00-00,...shard-00-01,...shard-00-02.../?...`) — useful
  to know about, see the manual action list.
- No leading/trailing whitespace, no CR, no surrounding quotes on the active
  line. File is not CRLF.
- Masked shape: `mongodb+srv://jayswalritik2058_db_user:****@cluster0.dabdkpb.mongodb.net/nepshop?retryWrites=true&w=majority&appName=Cluster0`
- Username: 24 chars, `[A-Za-z0-9_]` only — no encoding concerns.
- Password: 16 chars, **alphanumeric only** (`[A-Za-z0-9]`) — contains none of
  `@ : / ? # [ ] % &amp; =`, so **no percent-encoding is missing or needed**.
  This is not a contributing factor to either observed error.
- `backend/server.js` calls `dotenv.config()` (no path) at line 16, before
  `connectDB()` is invoked at line 19 — correct ordering. Since `npm start`/
  `npm run dev` are always run with cwd = `backend/` (npm sets cwd to the
  directory containing the invoked `package.json`), this resolves to
  `backend/.env` correctly. **Not a bug for the server** — only for
  standalone scripts invoked with `node <script>.js` from an arbitrary cwd.
- No shadow file: `frontend/.env` has zero `MONGO_URI` references; no `.env`
  exists at the repo root; `backend/.env.example` has one (expected — it's a
  template, never loaded by dotenv).
- `.env` is properly git-ignored: both `.gitignore` (root) and
  `backend/.gitignore` list it; `git check-ignore -v backend/.env` confirms
  it resolves as ignored via `backend/.gitignore:2:.env`. `git ls-files` shows
  it was never tracked. **No leak risk found.**

---

## (b) DNS results

| Resolver | SRV lookup | TXT lookup |
|---|---|---|
| System (OS default) | ❌ `ECONNREFUSED: querySrv ECONNREFUSED _mongodb._tcp.cluster0.dabdkpb.mongodb.net` | ❌ `ECONNREFUSED: queryTxt ECONNREFUSED cluster0.dabdkpb.mongodb.net` |
| 8.8.8.8 (Google) | ✅ 3 records (the three `ac-hjexilq-shard-00-0{0,1,2}` hosts, port 27017) | ✅ 1 record set |
| 1.1.1.1 (Cloudflare) | ✅ 3 records (same three hosts) | ✅ 1 record set |

This exactly reproduces the reported `querySrv ECONNREFUSED` error and
exactly explains why it happens: Node's own resolver (via whatever DNS server
Windows/the ISP hands it) actively refuses the SRV/TXT query type, while
public resolvers answer correctly. `nslookup` succeeding from Windows is not
a contradiction — the OS-level stub resolver `nslookup` uses does not
necessarily take the same path (or query the same upstream server, or use
the same query mechanism) as Node's own DNS client.

## (c) TCP reachability (port 27017, no credentials involved)

Using the hosts returned by the successful SRV lookups above:

| Host | Port 27017 |
|---|---|
| `ac-hjexilq-shard-00-00.dabdkpb.mongodb.net` | ✅ OPEN |
| `ac-hjexilq-shard-00-01.dabdkpb.mongodb.net` | ✅ OPEN |
| `ac-hjexilq-shard-00-02.dabdkpb.mongodb.net` | ✅ OPEN |

The network path to Atlas is fully open. No firewall/router is blocking this
machine from reaching Atlas at the TCP level.

## (d) Auth verdict

Single controlled connection attempt (`serverSelectionTimeoutMS: 8000`),
using the DNS workaround (`dns.setServers(['8.8.8.8','1.1.1.1'])`) so the
result reflects auth/network reality rather than the already-known DNS
flakiness:

```
✅ CONNECTED successfully.
   Database: "nepshop"
   Collections found: 9
   orders count: 13
   Disconnected cleanly.
```

**Classification: SUCCESS.** Not reproducible as a failure right now. This
rules out: wrong current credentials, Atlas Network Access IP block (that
manifests as a timeout, not "bad auth" — see below), and any code-side
misconfiguration in how the URI is built or loaded.

For completeness, here is how a failure would have been classified if one had
occurred (built into `diagnoseDb.js` and worth keeping in mind if this
recurs):

| Error signature | Classification | What it rules out |
|---|---|---|
| `bad auth` / `authentication failed` | **AUTH FAILURE** | DNS/network fine — Atlas evaluated and rejected the credentials |
| `querySrv` / `ENOTFOUND` / `ECONNREFUSED` | **DNS/NETWORK FAILURE** | Credentials never evaluated |
| `ETIMEDOUT` / timeout | **Possible IP Access List block** | Atlas silently drops connections from non-allow-listed IPs as a timeout, not an auth error — credentials never evaluated |

Because the previous "bad auth" report happened while the dev server was
running (which — per `server.js` — was already applying the identical DNS
workaround my test just used successfully), DNS is not a plausible
explanation for that specific prior event. The most likely explanations,
in order of plausibility, are: a transient Atlas-side auth-service hiccup, a
brief replica-set failover moment, or the credentials being intermittently
different at that moment for a reason outside this repo (e.g. a manual edit
to `.env` that was later reverted, or Render's environment variable not
having redeployed yet after a change). None of these are things a code
change in this repo can fix — see the manual action list.

---

## (e) Files fixed

| File | Fix |
|---|---|
| `backend/clearOrders.js` | dotenv now loads via `path.join(__dirname, '.env')` (cwd-independent); added an explicit `MONGO_URI not found — expected in <path>` error instead of the raw mongoose crash; **added** `dns.setDefaultResultOrder('ipv4first')` + `dns.setServers(['8.8.8.8','1.1.1.1'])`, mirroring `server.js`'s existing, proven fix for the exact `querySrv ECONNREFUSED` error this script was reported to have. This last change goes one line beyond the literal ask (dotenv path + error message) — flagging it clearly: it's the actual, evidence-backed fix for this script's reported connection failure, using the same mechanism already live in `server.js`, applied only to this named file. |
| `backend/seedAdmin.js` | Same dotenv cwd-independence fix only (shares the exact same bug — confirmed via `dotenv.config()` with no path). DNS override NOT added — no failure was reported for this script, and the fix list item 2 scoped this check to the dotenv pattern only. |
| `backend/seedProducts.js` | Same dotenv fix only. |
| `backend/seedSellers.js` | Same dotenv fix only. |
| `backend/migrateEmailVerified.js` | Same dotenv fix only. |
| `backend/migrateRoles.js` | Same dotenv fix only. |
| `backend/server.js`, `backend/config/db.js` | **Not touched**, as instructed — the server already resolves `.env` correctly via npm's cwd handling and already carries the DNS workaround. |

**Worth knowing, not acted on:** all five scripts above share the same
latent DNS-resolver gap `clearOrders.js` had (none of them call
`dns.setServers`). None have been reported as failing for that reason, so
per the fix scope only the dotenv-path bug was corrected in them. If any of
them ever throws `querySrv ECONNREFUSED` when run standalone, the fix is the
same two lines already added to `clearOrders.js`.

---

## (f) Manual action list (nothing here was or can be done by editing this repo)

### If the DNS SRV refusal recurs for the dev server itself
It currently doesn't (server.js's built-in override handles it), so no action
is needed for `npm run dev`. If you ever remove that override, or run into
the same `querySrv ECONNREFUSED` from a tool outside this repo (e.g. `mongosh`,
Compass, a different script):
1. Windows Settings → Network & Internet → your active adapter → **Edit DNS
   settings** → switch from "Automatic (DHCP)" to **Manual** → enable IPv4 →
   set Preferred DNS `8.8.8.8`, Alternate DNS `1.1.1.1`.
2. Run `ipconfig /flushdns` in an elevated Command Prompt afterward.
3. Alternative that needs no OS change: use the commented-out non-SRV
   connection string already sitting in `backend/.env` (line 12) — it lists
   the three shard hosts directly and never performs an SRV/TXT lookup at
   all. If you want to switch to it, uncomment line 12 and comment out line
   10 yourself (not something to script, since it's a one-character edit to
   a file holding a live credential).

### If "bad auth" recurs
Since the current credentials just authenticated successfully, there's
nothing to fix in `.env` right now. If it happens again:
1. Atlas → **Database Access** → confirm user `jayswalritik2058_db_user`
   still exists, is still `Active`, and still has the expected role
   (readWrite on `nepshop` or equivalent). A paused/deleted/regenerated user
   is the most common cause of a real, persistent "bad auth."
2. If the password needs to be reset: Atlas → Database Access → edit the
   user → **Edit Password** → generate one using **letters and numbers
   only** (avoids ever needing percent-encoding — this repo's current
   password already follows that rule, keep it that way).
3. Update `backend/.env` locally with the new password.
4. Update the same variable in **Render's dashboard** (Environment tab) for
   the deployed backend — Render does not read your local `.env`. Note:
   saving a Render env var triggers an automatic redeploy; expect a brief
   downtime window.
5. While in Atlas, also check **Network Access** → IP Access List. This
   project only ever showed "bad auth" (never a timeout), so this likely
   isn't the culprit, but for an academic project `0.0.0.0/0` (allow from
   anywhere) is a reasonable, simple entry to have in place so laptop IP
   changes never cause a (different-looking) timeout failure later.

### Nothing else needs manual action
`.env` structure, git-ignore coverage, and the credential's character set are
all already correct — no manual `.env` edit is needed on the diagnosis side.
