const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const axios = require("axios");
const { /* wrapper removed */ } = require('axios-cookiejar-support');
const { /* CookieJar not used to avoid extra dependency */ } = require('tough-cookie');
const crypto = require("crypto");
const express = require("express");
const app = express();
const Redis = require('ioredis');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const { extractImdbId, extractTorrentPath, extractMagnet } = require('./helpers');

// Note: cookie-jar support removed to avoid extra dependency in this environment.

// ========== MANIFEST ==========
const manifest = {
    id: "lv.raitino90.fano_personal",
    version: "1.0.0",
    name: "Fano.in Personal",
    description: "Privāts Fano.in addons ar lietotāja autorizāciju.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [],
    behaviorHints: { configurable: true }
};

const builder = new addonBuilder(manifest);

// ========== LOGGER ==========
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] - ${message}`)
    ),
    transports: [new winston.transports.Console()]
});

function log(...args) {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    logger.info(msg);
}

// ========== COOKIE CACHE (Redis optional, fallback in-memory) ==========
const COOKIE_TTL_MS = 10 * 60 * 1000; // 10 min
const cookieCache = new Map(); // fallback in-memory cache

let redisClient = null;
if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL);
    redisClient.on('error', (e) => logger.warn('Redis error: ' + e.message));
    logger.info('Redis client initialized');
}

function getCacheKey(username, password) {
    const h = crypto.createHash("sha256");
    h.update(`${username}|${password}`);
    return h.digest("hex");
}

async function getCachedCookie(username, password) {
    const key = getCacheKey(username, password);
    if (redisClient) {
        try {
            const val = await redisClient.get(key);
            if (!val) return null;
            const parsed = JSON.parse(val);
            return parsed.cookie || null;
        } catch (e) {
            logger.warn('Redis get failed: ' + e.message);
        }
    }
    const entry = cookieCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cookieCache.delete(key);
        return null;
    }
    return entry.cookie;
}

async function setCachedCookie(username, password, cookie) {
    const key = getCacheKey(username, password);
    if (redisClient) {
        try {
            await redisClient.set(key, JSON.stringify({ cookie }), 'PX', COOKIE_TTL_MS);
            return;
        } catch (e) {
            logger.warn('Redis set failed: ' + e.message);
        }
    }
    cookieCache.set(key, {
        cookie,
        expiresAt: Date.now() + COOKIE_TTL_MS
    });
}

// ========== AXIOS INSTANCE ==========
const http = axios.create({
    timeout: 15000,
    headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FanoStremioAddon/1.0; +https://stremio.com)"
    },
    // mēs paši kontrolējam validateStatus vajadzīgajās vietās
});

// ========== LOGIN COOKIE ==========
async function getFanoCookie(username, password) {
    // try cache first
    const cached = await getCachedCookie(username, password);
    if (cached) {
        log(`Using cached cookie for user ${username}`);
        return cached;
    }

    log(`Logging in to Fano for user ${username}...`);

    try {
        const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

        const res = await http.post("https://fano.in/login.php", body, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            maxRedirects: 0,
            validateStatus: () => true
        });

        const setCookieHeader = res.headers["set-cookie"];
        if (!setCookieHeader) {
            log("Login failed: no set-cookie header returned");
            return null;
        }

        const cookiesArr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        const cookie = cookiesArr
            .map(c => {
                const m = String(c).match(/^[^;]+/);
                return m ? m[0] : null;
            })
            .filter(Boolean)
            .join("; ");

        if (!cookie) {
            log("Login failed: could not parse cookies from header");
            return null;
        }

        await setCachedCookie(username, password, cookie);
        log(`Login success for user ${username}, cookie cached`);
        return cookie;
    } catch (err) {
        log('Login error: ' + err.message);
        return null;
    }
}

// helpers moved to ./helpers.js

// ========== STREAM HANDLER ==========
builder.defineStreamHandler(async ({ id, config }) => {
    try {
        if (!config || !config.username || !config.password) {
            log("Stream request without config, returning empty streams");
            return { streams: [] };
        }

        const username = String(config.username).trim();
        const password = String(config.password).trim();

        if (!username || !password) {
            log("Stream request with empty username/password");
            return { streams: [] };
        }

        const cookie = await getFanoCookie(username, password);
        if (!cookie) {
            log(`No cookie for user ${username}, returning empty streams`);
            return { streams: [] };
        }

        const imdbId = extractImdbId(id);
        if (!imdbId) {
            log("Invalid IMDB id from Stremio:", id);
            return { streams: [] };
        }

        log(`Searching Fano for IMDb ${imdbId} (user ${username})`);

        const search = await http.get(`https://fano.in/search.php?search=${encodeURIComponent(imdbId)}`, {
            headers: { cookie }
        });

        const torrentPath = extractTorrentPath(search.data, imdbId);
        if (!torrentPath) {
            log(`No torrent link found on search page for ${imdbId}`);
            return { streams: [] };
        }

        const torrentUrl = `https://fano.in/${torrentPath.replace(/^\/+/, "")}`;
        log(`Found torrent page: ${torrentUrl}`);

        const torrentPage = await http.get(torrentUrl, {
            headers: { cookie }
        });

        const magnet = extractMagnet(torrentPage.data);
        if (!magnet) {
            log(`No magnet link found on torrent page for ${imdbId}`);
            return { streams: [] };
        }

        log(`Magnet found for ${imdbId}, sending stream back to Stremio`);

        return {
            streams: [
                {
                    title: `Fano.in — ${username}`,
                    url: magnet
                }
            ]
        };
    } catch (err) {
        log("Stream handler error:", err.message);
        return { streams: [] };
    }
});

// ========== CONFIG HTML PAGE ==========
const htmlPage = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Fano.in Addon</title>
<style>
body { font-family:sans-serif; background:#111; color:#fff; height:100vh; margin:0; display:flex; justify-content:center; align-items:center; }
.box { background:#1c1c1c; padding:25px; border-radius:10px; width:350px; box-shadow:0 0 25px rgba(0,0,0,0.5); }
input, button { width:100%; padding:12px; margin-top:10px; border-radius:6px; border:0; box-sizing:border-box; }
input { background:#2b2b2b; color:white; }
button { background:#6b4bff; color:white; font-weight:bold; cursor:pointer; transition:0.2s transform, 0.2s opacity; }
button:hover { transform:translateY(-1px); opacity:0.9; }
#out a { color:#7f9dff; text-decoration:none; }
#out a:hover { text-decoration:underline; }
</style>
</head>
<body>
<div class="box">
<h2>Fano.in Addon</h2>
<p>Ievadiet datus, lai ģenerētu Stremio instalācijas saiti.</p>

<input id="u" placeholder="Lietotājvārds">
<input id="p" placeholder="Parole" type="password">

<button onclick="go()">Ģenerēt saiti</button>

<p id="out" style="word-break:break-all; margin-top:15px;"></p>
</div>

<script>
function go() {
    const u = document.getElementById('u').value.trim();
    const p = document.getElementById('p').value.trim();
    if (!u || !p) return alert("Ievadiet abus laukus!");

    const payload = { username: u, password: p };

    let cfg = btoa(JSON.stringify(payload))
               .replace(/\\+/g,'-')
               .replace(/\\//g,'_')
               .replace(/=+$/,'');

    const url = window.location.origin + "/" + cfg + "/manifest.json";

    document.getElementById("out").innerHTML =
      'Instalācijas saite:<br><br><a href="'+url+'" target="_blank">'+url+'</a>';
}
</script>
</body>
</html>
`;

// ========== ROUTES ==========

// Healthcheck priekš Render / uptime monitoriem
app.get("/health", (req, res) => {
    res.json({ status: "ok", ts: Date.now() });
});

// Basic rate limiter for all requests
const apiLimiter = rateLimit({ windowMs: 10 * 1000, max: 100 });
app.use(apiLimiter);

// HTML konfigurators
app.get("/", (req, res) => res.send(htmlPage));

// Manifest BEZ config (piemēram testiem vai default view)
// Svarīgi: pirms "/:config" route!
app.get("/manifest.json", (req, res) => res.json(manifest));

// Stremio router ar config parametru
// Piezīme: getRouter pats dekodē :config kā base64url → config objektu handleriem
app.use("/:config", getRouter(builder.getInterface()));

// ==== START SERVER ====
// Serveris startējas tikai tad, ja index.js palaists tieši, nevis require-ots.
if (require.main === module) {
    const PORT = process.env.PORT || 7000;
    app.listen(PORT, () => console.log("Fano addon running on port", PORT));
}