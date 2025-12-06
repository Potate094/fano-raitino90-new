const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

// ===== MANIFEST =====
const manifest = {
    id: "lv.raitino90.fano_personal",
    version: "1.0.0",
    name: "Fano.in Personal",
    description: "Fano.in straumēšana ar personalizētu login autorizāciju.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [],
    behaviorHints: {
        configurable: true,
        configurationRequired: true
    }
};

const builder = new addonBuilder(manifest);

// ===== HELPERS =====
async function getFanoCookie(username, password) {
    try {
        const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const login = await axios.post("https://fano.in/login.php", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0"
            },
            maxRedirects: 0,
            validateStatus: () => true
        });

        const cookies = login.headers["set-cookie"];
        if (!cookies) return null;

        return cookies.map(c => c.split(";")[0]).join("; ");
    } catch (e) {
        console.log("Login error:", e.message);
        return null;
    }
}

// ===== STREAM HANDLER =====
builder.defineStreamHandler(async ({ id, config }) => {

    if (!config || !config.username || !config.password) {
        return {
            streams: []
        };
    }

    const imdbId = id.split(":")[0];
    const cookie = await getFanoCookie(config.username, config.password);

    if (!cookie) {
        return { streams: [] };
    }

    try {
        const search = await axios.get(`https://fano.in/search.php?search=${imdbId}`, {
            headers: { cookie, "User-Agent": "Mozilla/5.0" }
        });

        const linkMatch = search.data.match(/href="(torrent\/[^"]*tt\d+)/i);
        if (!linkMatch) return { streams: [] };

        const torrentPage = await axios.get(`https://fano.in/${linkMatch[1]}`, {
            headers: { cookie, "User-Agent": "Mozilla/5.0" }
        });

        const magnet = torrentPage.data.match(/href="(magnet:\?xt=urn:btih:[^"]+)/);
        if (!magnet) return { streams: [] };

        return {
            streams: [
                {
                    title: `Fano.in — ${config.username}`,
                    url: magnet[1],
                    behaviorHints: { bingeGroup: "Fano" }
                }
            ]
        };
    } catch (e) {
        console.log("Fano search error:", e.message);
        return { streams: [] };
    }
});

// ===== CONFIG PAGE (HTML) =====
const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Fano.in Addon</title>
<style>
body { font-family: Arial; background: #0f0f14; color: #fff; display:flex; justify-content:center; align-items:center; height:100vh; }
.box { background:#1c1c22; padding:28px; border-radius:12px; width:350px; text-align:center; }
input, button {
 width:100%; padding:12px; margin-top:10px; border-radius:6px; border:0; box-sizing:border-box;
}
input { background:#2a2a33; color:white; }
button { background:#6b4bff; color:white; cursor:pointer; font-weight:bold; }
button:hover { opacity:0.9; }
</style>
</head>
<body>
<div class="box">
<h2>Fano.in Addon</h2>
<p>Ievadiet login datus, lai ģenerētu Stremio instalācijas saiti.</p>

<input id="u" placeholder="Lietotājvārds">
<input id="p" type="password" placeholder="Parole">

<button onclick="go()">Ģenerēt saiti</button>

<p id="out" style="word-break:break-all; margin-top:14px;"></p>
</div>

<script>
function go() {
    const u = document.getElementById('u').value.trim();
    const p = document.getElementById('p').value.trim();
    if (!u || !p) { alert("Ievadiet abus laukus!"); return; }

    const cfg = btoa(JSON.stringify({username: u, password: p}))
      .replace(/\\+/g, '-')
      .replace(/\\//g, '_')
      .replace(/=+$/, '');

    const url = window.location.origin + "/" + cfg + "/manifest.json";

    document.getElementById("out").innerHTML = 
      'Instalācijas saite:<br><br><a href="' + url + '" target="_blank">' + url + '</a>';
}
</script>
</body>
</html>
`;


// ===== START SERVER (OFFICIAL WAY) =====
serveHTTP(builder.getInterface(), {
    port: process.env.PORT || 7000,
    static: html
});

console.log("Fano.in addon running on port", process.env.PORT || 7000);
