const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

// Addon pamatinformācija
const builder = new addonBuilder({
    id: "lv.raitino90.fano_personal_v2",
    version: "2.0.0",
    name: "Fano.in Personal (v2)",
    description: "Personalizēts Stremio papildinājums ar Fano.in atbalstu",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [],
    behaviorHints: {
        configurable: true,
        configurationRequired: true
    }
});

// Definējam konfigurācijas laukus (Lietotājvārds un parole)
builder.defineConfig(() => ({
    type: "object",
    properties: {
        username: { type: "string", title: "Fano.in lietotājvārds" },
        password: { type: "string", title: "Fano.in parole", format: "password" }
    },
    required: ["username", "password"]
}));

// Funkcija Fano.in pieteikšanās veikšanai un Cookie iegūšanai
async function getFanoCookie(username, password) {
    try {
        const loginData = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
        const login = await axios.post("https://fano.in/login.php", loginData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
            },
            maxRedirects: 0,
            validateStatus: () => true // Lai neuzskatītu 302 (pāradresācija) par kļūdu
        });

        const cookies = login.headers["set-cookie"];
        if (cookies) {
            // Savācam un apvienojam visus nepieciešamos cookies
            return cookies.map(c => c.split(";")[0]).join("; ");
        }
    } catch (e) {
        console.error("Login error:", e.message);
    }
    return null;
}

// Stream apstrādātājs
builder.defineStreamHandler(async (args) => {
    const { username, password } = args.config || {};
    const imdbId = args.id.split(":")[0];

    if (!username || !password) {
        console.log("Konfigurācija nav norādīta.");
        return { streams: [] };
    }

    const cookie = await getFanoCookie(username, password);

    if (!cookie) {
        console.log("Neizdevās iegūt Fano.in cookie. Pārbaudiet pieteikšanās datus.");
        return { streams: [] };
    }

    console.log(`Meklējam Fano.in: ${imdbId}`);
    
    try {
        // 1. Meklējam torrentu pēc IMDb ID
        const search = await axios.get(`https://fano.in/search.php?search=${imdbId}`, {
            headers: { cookie, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });

        const linkMatch = search.data.match(/href="(torrent\/[^"]*tt\d{7,8}[^"]*)"/i);
        if (!linkMatch) {
            console.log(`Torrenta lapa priekš ${imdbId} netika atrasta.`);
            return { streams: [] };
        }

        const torrentPageUrl = `https://fano.in/${linkMatch[1]}`;
        console.log(`Atrasta torrenta lapa: ${torrentPageUrl}`);

        // 2. Iegūstam torrenta lapu
        const torrentPage = await axios.get(torrentPageUrl, {
            headers: { cookie, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });

        // 3. Iegūstam magnet linku
        const magnetMatch = torrentPage.data.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/);
        
        if (magnetMatch) {
            const magnetLink = magnetMatch[1];
            console.log("Magnet links atrasts!");
            return { 
                streams: [{ 
                    url: magnetLink, 
                    title: `Fano.in 🇱🇻 | ${username}` 
                }] 
            };
        }
    } catch (e) {
        console.error("Stream apstrādes kļūda:", e.message);
    }

    return { streams: [] };
});

// Startējam HTTP serveri
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });
console.log(`Fano.in addon started on port ${port}!`);
