// index.js – strādā 100% uz Render 2025-11-30
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const { URLSearchParams } = require("url");

const builder = new addonBuilder({
  id: "lv.raitino90.fano",
  version: "3.0.0",
  name: "Fano.in Personal by Raitino90",
  description: "Drošs un ātrs – katram savs fano.in konts",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: {
    configurable: true,
    configurationRequired: true
  }
});

// Config ekrāns (vecais, bet 100% stabilais veids)
builder.defineConfig(() => ({
  type: "object",
  properties: {
    username: { type: "string", title: "Fano.in lietotājvārds" },
    password: { type: "string", title: "Fano.in parole", format: "password" }
  },
  required: ["username", "password"]
}));

// Stream funkcija
builder.defineStreamHandler(async (args) => {
  if (!args.config?.username || !args.config?.password) return { streams: [] };

  const { username, password } = args.config;
  const imdb = args.id.split(":")[0];

  let cookie = "";
  try {
    const login = await axios.post("https://fano.in/login.php",
      new URLSearchParams({ username, password }),
      { maxRedirects: 0, validateStatus: () => true }
    );
    if (login.headers["set-cookie"]) {
      cookie = login.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
    }
  } catch (e) { return { streams: [] }; }

  if (!cookie) return { streams: [] };

  try {
    const search = await axios.get(`https://fano.in/search.php?search=${imdb}`, {
      headers: { cookie, "User-Agent": "Mozilla/5.0" }
    });

    const link = search.data.match(/href="(torrent\/[^"]+tt\d{7,8}[^"]*)"/i);
    if (!link) return { streams: [] };

    const page = await axios.get("https://fano.in/" + link[1], {
      headers: { cookie, "User-Agent": "Mozilla/5.0" }
    });

    const magnet = page.data.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/);
    if (magnet) {
      return { streams: [{ url: magnet[1], title: `Fano.in – ${username}` }] };
    }
  } catch (e) {
    console.log("Error:", e.message);
  }

  return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
