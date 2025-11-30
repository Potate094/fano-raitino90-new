const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const axios = require("axios");
const express = require("express");
const app = express();

const port = process.env.PORT || 7000;

// 1. Addon definīcija (Manifest)
const manifest = {
    id: "lv.raitino90.fano_personal",
    version: "1.0.0", 
    name: "Fano.in Personal",
    description: "Fano.in straumēšana, nepieciešams lietotājvārds un parole.",
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
    
    // Nolasām konfigurāciju, ko Stremio padod caur URL
    if (args.config) {
        config = args.config;
    }

    if (!config.username || !config.password) {
        return { streams: [{ title: "Lūdzu konfigurējiet addon sākumlapā!", url: "" }] };
    }

    console.log(`Pieprasījums no: ${config.username} priekš ${args.id}`);
    
    const cookie = await getFanoCookie(config.username, config.password);
    if (!cookie) return { streams: [{ title: "Pieteikšanās neizdevās (nepareiza parole vai Fano kļūda)", url: "" }] };

    const imdbId = args.id.split(":")[0];

    try {
        const search = await axios.get(`https://fano.in/search.php?search=${imdbId}`, {
            headers: { cookie, "User-Agent": "Mozilla/5.0" }
        });

        // Meklējam torrenta lapas saiti ar IMDb ID URL
        const linkMatch = search.data.match(/href="(torrent\/[^"]*tt\d{7,8}[^"]*)"/i);
        if (!linkMatch) return { streams: [] };

        const torrentPage = await axios.get(`https://fano.in/${linkMatch[1]}`, {
            headers: { cookie, "User-Agent": "Mozilla/5.0" }
        });

        // Meklējam magnet linku
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
        <title>Fano.in Stremio Konfigurācija</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: sans-serif; background: #111; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .box { background: #222; padding: 30px; border-radius: 8px; text-align: center; max-width: 400px; width: 90%; }
            input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 4px; border: none; box-sizing: border-box; }
            button { background: #8855ff; color: white; border: none; padding: 12px; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; }
            button:hover { background: #6633cc; }
        </style>
    </head>
    <body>
        <div class="box">
            <h2>Fano.in Personal Addon</h2>
            <p>Ievadiet savu Fano.in lietotājvārdu un paroli, lai ģenerētu instalācijas saiti.</p>
            <input type="text" id="user" placeholder="Lietotājvārds">
            <input type="password" id="pass" placeholder="Parole">
            <button onclick="install()">Instalēt Stremio</button>
        </div>
        <script>
            function install() {
                const user = document.getElementById('user').value;
                const pass = document.getElementById('pass').value;
                if(!user || !pass) return alert('Ievadiet abus laukus!');
                
                const config = { username: user, password: pass };
                
                // 1. Standarta Base64 kodēšana
                let encoded = btoa(JSON.stringify(config));
                
                // 2. URL-Safe Labojums: Aizstājam '/' un '+' ar '_' un '-', un noņemam "="
                encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); 
                
                // Ģenerējam Stremio instalācijas saiti (host/base64/manifest.json)
                window.location.href = "stremio://" + window.location.host + "/" + encoded + "/manifest.json";
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// 5. Startējam serveri un Maršrutēšanas Labojums
const addonInterface = builder.getInterface();

// Šī rinda ir vitāli svarīga, lai Stremio SDK apstrādātu konfigurācijas ceļu
app.use('/', getRouter(addonInterface)); 

app.listen(port, () => {
    console.log(`Fano.in Addon startēts uz porta ${port}`);
});
