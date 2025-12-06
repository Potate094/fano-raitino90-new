const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const axios = require("axios");
const express = require("express");
const app = express();

// ==== MANIFEST ====
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

// ==== LOGIN COOKIE ====
async function getFanoCookie(username, password) {
    try {
        const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const res = await axios.post("https://fano.in/login.php", body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0"
            },
            maxRedirects: 0,
            validateStatus: () => true
        });

        const cookies = res.headers["set-cookie"];
        if (!cookies) return null;

        return cookies.map(c => c.split(";")[0]).join("; ");
    } catch (err) {
        console.log("Login error:", err.message);
        return null;
    }
}

// ==== STREAM HANDLER ====
builder.defineStreamHandler(async ({ id, config }) => {
    if (!config || !config.username || !config.password)
        return { streams: [] };

    const cookie = await getFanoCookie(config.username, config.password);
    if (!cookie) return { streams: [] };

    const imdbId = id.split(":")[0];

    try {
        const search = await axios.get(`https://fano.in/search.php?search=${imdbId}`, {
            headers: { cookie, "User-Agent": "Mozilla/5.0" }
        });

        const match = search.data.match(/href="(torrent\/[^"]*tt\d+)/i);
        if (!match) return { streams: [] };

        const torrentPage = await axios.get(`https://fano.in/${match[1]}`, {
            headers: { cookie, "User-Agent": "Mozilla/5.0" }
        });

        const magnet = torrentPage.data.match(/href="(magnet:\?xt=urn:btih:[^"]+)/);
        if (!magnet) return { streams: [] };

        return {
            streams: [{
                title: `Fano.in — ${config.username}`,
                url: magnet[1]
            }]
        };
    } catch (err) {
        console.log("Stream error:", err.message);
        return { streams: [] };
    }
});

// ==== CONFIG HTML PAGE ====
const htmlPage = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Fano.in Addon</title>
<style>
body { font-family:sans-serif; background:#111; color:#fff; height:100vh; margin:0; display:flex; justify-content:center; align-items:center; }
.box { background:#1c1c1c; padding:25px; border-radius:10px; width:350px; }
input, button { width:100%; padding:12px; margin-top:10px; border-radius:6px; border:0; box-sizing:border-box; }
input { background:#2b2b2b; color:white; }
button { background:#6b4bff; color:white; font-weight:bold; cursor:pointer; }
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

    let cfg = btoa(JSON.stringify({username:u, password:p}))
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

// ==== SERVE HTML ====
app.get("/", (req, res) => res.send(htmlPage));

// ==== STREMIO ROUTER ====
app.use("/:config", getRouter(builder.getInterface()));

// ==== MANIFEST WITHOUT CONFIG ====
app.get("/manifest.json", (req, res) => res.json(manifest));

// ==== START SERVER ====
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log("Fano addon running on port", PORT));
