const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const axios = require("axios");
const express = require("express");
const app = express();

const port = process.env.PORT || 7000;

// 1. Addon definīcija
const manifest = {
    id: "lv.raitino90.fano_personal",
    version: "1.0.1",
    name: "Fano.in Personal",
    description: "Fano.in straumēšana. Ievadi savus datus, lai sāktu.",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [],
    behaviorHints: {
        configurable: true
    }
};

const builder = new addonBuilder(manifest);

// 2. Fano.in Cookie funkcija
async function getFanoCookie(username, password) {
    if (!username || !password) return null;
    try {
        const loginData = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const login = await axios.post("https://fano.in/login.php", loginData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            maxRedirects: 0,
            validateStatus: () => true
        });
        const cookies = login.headers["set-cookie"];
        if (cookies) return cookies.map(c => c.split(";")[0]).join("; ");
    } catch (e) {
        console.error("Login failed:", e.message);
    }
    return null;
}

// 3. Stream Handler (Meklēšana)
builder.defineStreamHandler(async (args) => {
    let config = {};
    
    // Mēģinām nolasīt konfigurāciju no URL (vecais stils)
    if (args.config) {
        config = args.config;
    } else if (args.extra) {
        // Dažreiz vecās versijas padod datus caur extra
        config = args.extra;
    }

    if (!config.username || !config.password) {
        return { streams: [{ title: "Lūdzu konfigurējiet addon!", url: "" }] };
    }

    console.log(`Pieprasījums no: ${config.username} priekš ${args.id}`);
    
    const cookie = await getFanoCookie(config.username, config.password);
    if (!cookie) return { streams: [{ title: "Nepareiza parole vai Fano kļūda", url: "" }] };

    const imdbId = args.id.split(":")[0];

    try {
        const search = await axios.get(`https://fano.in/search.php?search=${imdbId}`, {
            headers: { cookie, "User-Agent": "Mozilla/5.0" }
        });

        const linkMatch = search.data.match(/href="(torrent\/[^"]*tt\d{7,8}[^"]*)"/i);
        if (!linkMatch) return { streams: [] };

        const torrentPage = await axios.get(`https://fano.in/${linkMatch[1]}`, {
            headers: { cookie, "User-Agent": "Mozilla/5.0" }
        });

        const magnetMatch = torrentPage.data.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/);
        if (magnetMatch) {
            return { 
                streams: [{ 
                    url: magnetMatch[1], 
                    title: `Fano.in 🇱🇻\n${config.username}`,
                    behaviorHints: { bingieGroup: "Fano" }
                }] 
            };
        }
    } catch (e) {
        console.error("Meklēšanas kļūda:", e.message);
    }

    return { streams: [] };
});

// 4. Konfigurācijas lapa (HTML)
app.get("/", (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Konfigurēt Fano.in Addon</title>
        <style>
            body { font-family: sans-serif; background: #111; color: #fff; padding: 20px; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { background: #222; padding: 40px; border-radius: 8px; text-align: center; max-width: 400px; width: 100%; }
            input { width: 100%; padding: 10px; margin: 10px 0; border-radius: 4px; border: none; box-sizing: border-box; }
            button { background: #8855ff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
            button:hover { background: #6633cc; }
            h2 { color: #8855ff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Fano.in Konfigurācija</h2>
            <p>Ievadi savus datus, lai ģenerētu saiti.</p>
            <input type="text" id="user" placeholder="Lietotājvārds">
            <input type="password" id="pass" placeholder="Parole">
            <button onclick="install()">Instalēt Stremio</button>
        </div>
        <script>
            function install() {
                const user = document.getElementById('user').value;
                const pass = document.getElementById('pass').value;
                if(!user || !pass) return alert('Ievadi abus laukus!');
                
                // Izveidojam JSON konfigurāciju
                const config = { username: user, password: pass };
                const configStr = JSON.stringify(config);
                // Kodējam uz base64
                const encoded = btoa(configStr); // base64
                
                // Stremio installs prasa šādu formātu: /<base64_config>/manifest.json
                const loc = window.location;
                const streamUrl = "stremio://" + loc.host + "/" + encoded + "/manifest.json";
                window.location.href = streamUrl;
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// 5. Startējam serveri
const addonInterface = builder.getInterface();
// Pievienojam maršrutētāju. Svarīgi: SDK v1 ņem konfigurāciju no URL ceļa
app.use((req, res, next) => {
    getRouter(addonInterface)(req, res, next);
});

app.listen(port, () => {
    console.log(`Addon aktīvs uz porta ${port}`);
});
