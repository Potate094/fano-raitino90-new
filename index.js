// index.js — Rediģēta, stabīlas versija
const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const axios = require("axios");
const express = require("express");
const app = express();

const port = process.env.PORT || 7000;

// Manifest
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

// Helper: login + cookie
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

// Stream handler
builder.defineStreamHandler(async (args) => {
  // args.config comes from the decoded path (handled by SDK router)
  const cfg = args.config || {};

  // If no creds — return empty streams (so Stremio won't choke on invalid URL)
  if (!cfg.username || !cfg.password) {
    console.log("No credentials provided in config for", args.id);
    return { streams: [] };
  }

  const username = cfg.username;
  const password = cfg.password;
  const imdbId = (args.id || "").split(":")[0];

  if (!imdbId) return { streams: [] };

  let cookie = await getFanoCookie(username, password);
  if (!cookie) {
    console.log("Failed to get cookie for", username);
    return { streams: [] };
  }

  try {
    // Search
    const search = await axios.get(`https://fano.in/search.php?search=${imdbId}`, {
      headers: { cookie, "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });

    const linkMatch = search.data.match(/href="(torrent\/[^"]*tt\d{6,9}[^"]*)"/i);
    if (!linkMatch) return { streams: [] };

    const torrentPage = await axios.get(`https://fano.in/${linkMatch[1]}`, {
      headers: { cookie, "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });

    const magnetMatch = torrentPage.data.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/);
    if (magnetMatch) {
      return {
        streams: [
          {
            url: magnetMatch[1],
            title: `Fano.in — ${username}`,
            behaviorHints: { bingieGroup: "Fano" }
          }
        ]
      };
    }
  } catch (e) {
    console.error("Stream handler error:", e.message);
  }

  return { streams: [] };
});

// Serve static config page at root
app.get("/", (req, res) => {
  const html = `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Fano.in Stremio Konfigurācija</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body{font-family:sans-serif;background:#0f0f14;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
      .box{background:#15151b;padding:28px;border-radius:10px;width:100%;max-width:420px;box-sizing:border-box}
      input{width:100%;padding:12px;margin:8px 0;border-radius:6px;border:1px solid #2b2b34;background:#0c0c10;color:#fff;box-sizing:border-box}
      button{width:100%;padding:12px;border-radius:6px;border:0;background:#6b4bff;color:#fff;font-weight:700;cursor:pointer}
      button:hover{opacity:.95}
      p{margin:8px 0 16px 0;color:#bfc2d6}
    </style>
  </head>
  <body>
    <div class="box">
      <h2>Fano.in Personal Addon</h2>
      <p>Ievadiet Fano.in lietotājvārdu un paroli. Pēc tam nokopējiet vai atveriet instalācijas saiti Stremio.</p>
      <input id="user" placeholder="Lietotājvārds" />
      <input id="pass" placeholder="Parole" type="password" />
      <button onclick="install()">Ģenerēt instalācijas saiti</button>
      <p id="out" style="word-break:break-all;margin-top:12px"></p>
    </div>

    <script>
      function install() {
        const u = document.getElementById('user').value.trim();
        const p = document.getElementById('pass').value.trim();
        const out = document.getElementById('out');
        out.textContent = '';
        if (!u || !p) { alert('Ievadiet abus laukus!'); return; }

        const cfg = { username: u, password: p };
        let encoded = btoa(JSON.stringify(cfg));
        encoded = encoded.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');

        // Build full origin-based URL — works locally and on HTTPS hosts.
        // For local testing use: http://localhost:7000/<encoded>/manifest.json
        const installUrl = window.location.origin + '/' + encoded + '/manifest.json';

        // Show the URL and also attempt to open it (Stremio Desktop accepts paste of URL in Addons->Install from URL)
        out.innerHTML = 'Instalācijas saite:<br><a href="' + installUrl + '" target="_blank">' + installUrl + '</a>';

        // Attempt to open with stremio:// protocol may work on some systems, but not reliable — we present the HTTP(S) link above.
        try {
          window.location.href = installUrl;
        } catch(e) {
          // ignore
        }
      }
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

// Mount SDK router under '/:config' so config path works (encoded config is the first segment)
const addonInterface = builder.getInterface();
app.use('/:config', getRouter(addonInterface));

// Also allow manifest at root without config if someone wants default (optional)
app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

// Start server
app.listen(port, () => {
  console.log(`Fano.in addon started on port ${port}`);
  console.log(`Root config page: http://localhost:${port}/`);
  console.log(`Example install URL (local): http://localhost:${port}/<base64-config>/manifest.json`);
});
