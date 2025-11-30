const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const builder = new addonBuilder({
  id: "lv.raitino90.fano",
  version: "1.0.0",
  name: "Fano.in Personal by Raitino90",
  description: "Katram savs fano.in konts – 24/7 droši",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: {
    configurable: true,
    configurationRequired: true
  }
});

builder.defineConfig(() => ({
  type: "object",
  properties: {
    username: { type: "string", title: "Fano.in lietotājvārds" },
    password: { type: "string", title: "Fano.in parole", format: "password" }
  },
  required: ["username", "password"]
}));

builder.defineStreamHandler(async (args) => {
  if (!args.config?.username || !args.config?.password) return { streams: [] };

  const username = args.config.username;
  const password = args.config.password;
  const imdbId = args.id.split(":")[0];

  let cookie = "";

  // Login ar string body (drošāk nekā URLSearchParams)
  try {
    const loginData = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const login = await axios.post("https://fano.in/login.php", loginData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      maxRedirects: 0,
      validateStatus: () => true
    });
    const cookies = login.headers["set-cookie"];
    if (cookies) cookie = cookies.map(c => c.split(";")[0]).join("; ");
  } catch (e) {
    console.log("Login error:", e.message);
    return { streams: [] };
  }

  if (!cookie) return { streams: [] };

  // Meklē torrentu
  try {
    const search = await axios.get(`https://fano.in/search.php?search=${imdbId}`, {
      headers: { cookie, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    const linkMatch = search.data.match(/href="(torrent\/[^"]*tt\d{7,8}[^"]*)"/i);
    if (!linkMatch) return { streams: [] };

    const torrentPage = await axios.get(`https://fano.in/${linkMatch[1]}`, {
      headers: { cookie, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    const magnetMatch = torrentPage.data.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/);
    if (magnetMatch) {
      return { streams: [{ url: magnetMatch[1], title: `Fano.in – ${username}` }] };
    }
  } catch (e) {
    console.log("Stream error:", e.message);
  }

  return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Fano.in addon started on port 7000!");
