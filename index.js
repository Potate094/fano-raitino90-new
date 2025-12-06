const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const axios = require("axios");
const express = require("express");
const app = express();

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

// ========== SIMPLE LOGGER ==========
function log(...args) {
    console.log(new Date().toISOString(), "-", ...args);
}

// ========== COOKIE CACHE (IN-MEMORY) ==========
// Cache per user+password (hash varētu, bet šeit pietiek raw kombinācija atmiņā)
const COOKIE_TTL_MS = 10 * 60 * 1000; // 10 min
const cookieCache = new Map(); // key: username|password, value: { cookie, expiresAt }

function getCacheKey(username, password) {
    return `${username}|${password}`;
}

function getCachedCookie(username, password) {
    const key = getCacheKey(username, password);
    const entry = cookieCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cookieCache.delete(key);
        return null;
    }
    return entry.cookie;
}

function setCachedCookie(username, password, cookie) {
    const key = getCacheKey(username, password);
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
    // 1) mēģinām no cache
    const cached = getCachedCookie(username, password);
    if (cached) {
        log(`Using cached cookie for user ${username}`);
        return cached;
    }

    log(`Logging in to Fano for user ${username}...`);

    try {
        const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

        const res = await http.post("https://fano.in/login.php", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            maxRedirects: 0,
            validateStatus: () => true
        });

        const cookies = res.headers["set-cookie"];
        if (!cookies || !cookies.length) {
            log("Login failed: no cookies set");
            return null;
        }

        const cookie = cookies
            .map(c => c.split(";")[0])
            .join("; ");

        setCachedCookie(username, password, cookie);
        log(`Login success for user ${username}, cookie cached`);
        return cookie;
    } catch (err) {
        log("Login error:", err.message);
        return null;
    }
}

// ========== HELPERS ==========

// Vienkārša IMDb ID validācija, lai nenāktu random garbage
function extractImdbId(id) {
    // Stremio sērijām bieži ir formāts: tt1234567:1:2
    const imdbId = id.split(":")[0];
    if (!/^tt\d{5,10}$/.test(imdbId)) {
        return null;
    }
    return imdbId;
}

// Drošāks regex priekš torrent linka
function extractTorrentPath(html, imdbId) {
    // meklējam "torrent/...ttxxxxxx" ar ' vai " un ignorē case
    const re = new RegExp(`href=["'](torrent\\/[^"']*${imdbId}[^"']*)["']`, "i");
    const match = html.match(re);
    return match ? match[1] : null;
}

// Drošāks regex priekš magnet linka
function extractMagnet(html) {
    // Atļaujam gan single, gan double quotes, un papildus parametri
    const re = /href=["'](magnet:\?xt=urn:btih:[^"']+)["']/i;
    const match = html.match(re);
    return match ? match[1] : null;
}

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

// HTML konfigurators
app.get("/", (req, res) => res.send(htmlPage));

// Manifest BEZ config (piemēram testiem vai default view)
// Svarīgi: pirms "/:config" route!
app.get("/manifest.json", (req, res) => res.json(manifest));

// Stremio router ar config parametru
// Piezīme: getRouter pats dekodē :config kā base64url → config objektu handleriem
app.use("/:config", getRouter(builder.getInterface()));

// ========== START SERVER ==========
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => log("Fano addon running on port", PORT));
