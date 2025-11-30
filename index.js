const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");

const manifest = {
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
};

const builder = new addonBuilder(manifest);

// CONFIG – vecā 1.4.3 sintakse
builder.defineConfig({
  itemShape: {
    username: {
      type: "text",
      title: "Fano.in lietotājvārds"
    },
    password: {
      type: "text",
      title: "Fano.in parole",
      format: "password"
    }
  }
});

// STREAM HANDLER
builder.defineStreamHandler(async (args) => {
  const cfg = args.config;

  if (!cfg?.username || !cfg?.password) {
    return Promise.resolve({ streams: [] });
  }

  const username = cfg.username;
  const password = cfg.password;
  const imdbId = args.id.split(":")[0];

  let cookie = "";

  // LOGIN
  try {
    const loginData =
      `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    const login = await axios.post("https://fano.in/login.php", loginData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      maxRedirects: 0,
      validateStatus: () => true
    });

    const cookies = login.headers["set-cookie"];
    if (cookies) cookie = cookies.map(x => x.split(";")[0]).join("; ");

  } catch (err) {
    console.log("LOGIN ERROR:", err.message);
    return { streams: [] };
  }

  if (!cookie) return { streams: [] };

  // SEARCH TORRENT
  try {
    const search = await axios.get(
      `https://fano.in/search.php?search=${imdbId}`,
      { headers: { cookie } }
    );

    const linkMatch =
      search.data.match(/href="(torrent\/[^"]*tt\d{7,8}[^"]*)"/i);
    if (!linkMatch) return { streams: [] };

    const torrentPage = await axios.get(`https://fano.in/${linkMatch[1]}`, {
      headers: { cookie }
    });

    const magnetMatch =
      torrentPage.data.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/);

    if (magnetMatch) {
      return {
        streams: [
          {
            url: magnetMatch[1],
            title: `Fano.in – ${username}`
          }
        ]
      };
    }

  } catch (e) {
    console.log("STREAM ERROR:", e.message);
  }

  return { streams: [] };
});

// EXPORT (1.4.3 format)
module.exports = builder.getInterface();
