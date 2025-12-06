// =====================================================================
//                FANO ADDON  —  ULTIMATE INTEGRATION TEST
// =====================================================================
// Palaist ar:  node ultimate_test.js
// Nepieciešams: Node 18+ (global fetch) + npm install izpildīts
// =====================================================================

const fs = require("fs");
const path = require("path");

// Integration base URL — prefer environment variables so tests can target any deployment.
const BASE = process.env.BASE || process.env.TEST_BASE_URL || "https://fano-raitino90-new.onrender.com";

// Capture console output so we can persist a test-results.txt after the run
const _origConsoleLog = console.log.bind(console);
const _output = [];
console.log = (...args) => {
    try {
        _output.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    } catch (e) {
        _output.push(String(args));
    }
    _origConsoleLog(...args);
};

function persistResults() {
    try {
        const header = `Results for ${new Date().toISOString()} (BASE=${BASE})\n`;
        fs.writeFileSync('test-results.txt', header + _output.join('\n') + '\n');
        _origConsoleLog('Wrote test-results.txt');
    } catch (e) {
        _origConsoleLog('Failed to write test-results.txt:', e.message);
    }
}
// {"username":"TestUser","password":"NotReal"}
const CONFIG_VALID = "eyJ1c2VybmFtZSI6IlRlc3RVc2VyIiwicGFzc3dvcmQiOiJOb3RSZWFsIn0";
const CONFIG_INVALID = "INVALID";

// Helper funkcija testiem
async function test(name, fn) {
    const start = Date.now();
    try {
        await fn();
        const ms = Date.now() - start;
        console.log(`✔ OK — ${name} (${ms}ms)`);
    } catch (err) {
        console.log(`✖ FAIL — ${name}`);
        console.log("   →", err.message);
    }
}

function fileExists(file) {
    return fs.existsSync(path.join(process.cwd(), file));
}

function readJSON(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function decodeBase64Url(str) {
    let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    return Buffer.from(b64, "base64").toString("utf8");
}

function randomString(len) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
    let out = "";
    for (let i = 0; i < len; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
}

(async () => {
    console.log("\n========== FANO ADDON — ULTIMATE TEST ==========\n");

    // -----------------------------------------------------------------
    // 1) NODE & FAILU PAMATCHECKS
    // -----------------------------------------------------------------
    await test("Node versija ir >= 18", () => {
        const [major] = process.versions.node.split(".").map(Number);
        if (major < 18) throw new Error("Node par vecu: " + process.versions.node);
    });

    await test("index.js / manifest.json / package.json eksistē", () => {
        if (!fileExists("index.js")) throw new Error("index.js nav");
        if (!fileExists("manifest.json")) throw new Error("manifest.json nav");
        if (!fileExists("package.json")) throw new Error("package.json nav");
    });

    await test(`BASE ${BASE} reachable`, async () => {
        const res = await fetch(BASE);
        if (!res.ok) throw new Error(`BASE not reachable: HTTP ${res.status}`);
    });

    await test("index.js izskatās pēc Stremio addona", () => {
        const size = fs.statSync("index.js").size;
        if (size < 500) throw new Error("index.js par mazu: " + size + " baiti");
        const content = fs.readFileSync("index.js", "utf8");
        if (!content.includes("addonBuilder")) throw new Error("index.js: nav addonBuilder");
        if (!content.includes("defineStreamHandler")) throw new Error("index.js: nav defineStreamHandler");
    });

    await test('index.js require and helpers available', () => {
        const idx = require('./index.js');
        if (!idx) throw new Error('require index.js returned falsy');
        if (typeof idx.getCacheKey !== 'function') throw new Error('getCacheKey not exported');
        const k = idx.getCacheKey('a','b');
        if (!/^[0-9a-f]{64}$/.test(k)) throw new Error('getCacheKey did not return sha256 hex');
    });

    // -----------------------------------------------------------------
    // 2) PACKAGE.JSON VALIDĀCIJA
    // -----------------------------------------------------------------
    let pkg;
    await test("package.json ir derīgs un satur core laukus", () => {
        pkg = readJSON("package.json");
        if (!pkg.name) throw new Error("trūkst name");
        if (!pkg.version) throw new Error("trūkst version");
        if (!pkg.main || pkg.main !== "index.js") throw new Error("main nav 'index.js'");
        if (!pkg.scripts || !pkg.scripts.start) throw new Error("trūkst scripts.start");
        if (!pkg.dependencies) throw new Error("trūkst dependencies");
        if (!pkg.dependencies["stremio-addon-sdk"]) throw new Error("trūkst stremio-addon-sdk");
        if (!pkg.dependencies["axios"]) throw new Error("trūkst axios");
        if (!pkg.dependencies["express"]) throw new Error("trūkst express");
        if (!pkg.engines || !pkg.engines.node) throw new Error("trūkst engines.node");
    });

    await test("package.json engines.node ir >= 18", () => {
        if (!pkg || !pkg.engines || !pkg.engines.node) {
            throw new Error("engines.node nav definēts");
        }
        const eng = pkg.engines.node.replace(">=", "").trim();
        const [maj] = eng.split(".").map(Number);
        if (maj < 18) throw new Error("engines.node < 18: " + pkg.engines.node);
    });

    // -----------------------------------------------------------------
    // 3) MANIFEST.JSON VALIDĀCIJA (FILES + API SALĪDZINĀJUMS)
    // -----------------------------------------------------------------
    let localManifest;
    await test("manifest.json satur visus nepieciešamos laukus", () => {
        localManifest = readJSON("manifest.json");
        if (!localManifest.id) throw new Error("id trūkst");
        if (!localManifest.name) throw new Error("name trūkst");
        if (!Array.isArray(localManifest.resources)) throw new Error("resources nav masīvs");
        if (!Array.isArray(localManifest.types)) throw new Error("types nav masīvs");
        if (!Array.isArray(localManifest.idPrefixes)) throw new Error("idPrefixes nav masīvs");
        if (!localManifest.behaviorHints || localManifest.behaviorHints.configurable !== true) {
            throw new Error("behaviorHints.configurable nav true");
        }
    });

    let apiManifest;
    await test("API /manifest.json atgriež korektu Stremio manifestu", async () => {
        const res = await fetch(`${BASE}/manifest.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        apiManifest = await res.json();
        ["id", "version", "name", "resources", "types"].forEach(k => {
            if (!(k in apiManifest)) throw new Error("API manifestā trūkst: " + k);
        });
    });

    await test("Lokālais un API manifests (id/name) sakrīt", () => {
        if (apiManifest.id !== localManifest.id) {
            throw new Error(`ID nesakrīt: file='${localManifest.id}', api='${apiManifest.id}'`);
        }
        if (apiManifest.name !== localManifest.name) {
            throw new Error(`Name nesakrīt: file='${localManifest.name}', api='${apiManifest.name}'`);
        }
    });

    // -----------------------------------------------------------------
    // 4) CONFIG BASE64 DECODE
    // -----------------------------------------------------------------
    await test("CONFIG_VALID ir derīgs base64-url ar username/password", () => {
        const jsonStr = decodeBase64Url(CONFIG_VALID);
        let cfg;
        try {
            cfg = JSON.parse(jsonStr);
        } catch (e) {
            throw new Error("CONFIG_VALID nav derīgs JSON: " + e.message);
        }
        if (!cfg.username) throw new Error("CONFIG_VALID: trūkst username");
        if (!cfg.password) throw new Error("CONFIG_VALID: trūkst password");
    });

    await test("CONFIG_INVALID manifest pieprasījums neizraisa crash", async () => {
        const res = await fetch(`${BASE}/${CONFIG_INVALID}/manifest.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (!j.id) throw new Error("CONFIG_INVALID manifest: trūkst id");
    });

    // -----------------------------------------------------------------
    // 5) INDEX.JS REQUIRE TESTS
    // -----------------------------------------------------------------
    await test("index.js var require bez crash (ja npm install izpildīts)", () => {
        require("./index.js");
    });

    // -----------------------------------------------------------------
    // 6) API ENDPOINTI
    // -----------------------------------------------------------------
    await test("GET /health darbojas un atgriež status=ok", async () => {
        const res = await fetch(`${BASE}/health`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (j.status !== "ok") throw new Error("health JSON status nav 'ok'");
    });

    await test("GET /manifest.json darbojas ar korektu Content-Type", async () => {
        const res = await fetch(`${BASE}/manifest.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new Error("Content-Type nav JSON: " + ct);
        const j = await res.json();
        if (!Array.isArray(j.resources)) throw new Error("API manifest: resources nav masīvs");
    });

    await test("GET /<config>/manifest.json (valid) darbojas", async () => {
        const res = await fetch(`${BASE}/${CONFIG_VALID}/manifest.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (!j.id) throw new Error("Config manifest: trūkst id");
    });

    await test("HTML konfigurācijas lapa satur formu un base64 loģiku", async () => {
        const res = await fetch(`${BASE}/`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const html = await res.text();
        if (!html.includes("Fano.in Addon")) throw new Error("HTML: nav virsraksta");
        if (!html.includes("id=\"u\"")) throw new Error("HTML: nav username input");
        if (!html.includes("id=\"p\"")) throw new Error("HTML: nav parole input");
        if (!html.includes("btoa(")) throw new Error("HTML: nav base64 loģika");
    });

    // -----------------------------------------------------------------
    // 7) STREAM ENDPOINTI (MOVIE / SERIES)
    // -----------------------------------------------------------------
    const imdbSamples = [
        "tt0000001",
        "tt0133093",
        "tt0944947"
    ];

    function validateStreamsPayload(j) {
        if (!("streams" in j)) throw new Error("Trūkst 'streams' property");
        if (!Array.isArray(j.streams)) throw new Error("'streams' nav masīvs");
        if (j.streams.length > 0) {
            const s = j.streams[0];
            if (!s.url) throw new Error("Pirmajam stream nav url");
            if (typeof s.url !== "string") throw new Error("stream.url nav string");
            if (!s.url.startsWith("magnet:") && !s.url.startsWith("http")) {
                throw new Error("stream.url neizskatās pēc magnet/http linka: " + s.url);
            }
        }
    }

    for (const id of imdbSamples) {
        await test(`Stream movie/${id}.json struktūra derīga`, async () => {
            const res = await fetch(`${BASE}/${CONFIG_VALID}/stream/movie/${id}.json`);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const j = await res.json();
            validateStreamsPayload(j);
        });
    }

    await test("Stream series endpoint struktūra derīga", async () => {
        const res = await fetch(`${BASE}/${CONFIG_VALID}/stream/series/tt0000001.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        validateStreamsPayload(j);
    });

    await test("Stream ar invalid IMDb ID neatgriež crash", async () => {
        const res = await fetch(`${BASE}/${CONFIG_VALID}/stream/movie/INVALID_ID_123.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        validateStreamsPayload(j);
    });

    // -----------------------------------------------------------------
    // 8) PERFORMANCE & CONCURRENCY
    // -----------------------------------------------------------------
    await test("Performance: otrs stream pieprasījums nav daudz lēnāks par pirmo", async () => {
        const imdb = "tt0133093";
        const url = `${BASE}/${CONFIG_VALID}/stream/movie/${imdb}.json`;

        const t1Start = Date.now();
        let res = await fetch(url);
        if (!res.ok) throw new Error("Pirmais HTTP " + res.status);
        await res.json();
        const t1 = Date.now() - t1Start;

        const t2Start = Date.now();
        res = await fetch(url);
        if (!res.ok) throw new Error("Otrais HTTP " + res.status);
        await res.json();
        const t2 = Date.now() - t2Start;

        console.log(`   i) Pirmais: ${t1}ms, otrais: ${t2}ms`);
        if (t2 > t1 * 5) {
            throw new Error("Otrais pieprasījums aizdomīgi lēns (cache varētu nestrādāt)");
        }
    });

    await test("Concurrency: 5 stream pieprasījumi paralēli strādā bez crash", async () => {
        const imdb = "tt0133093";
        const url = `${BASE}/${CONFIG_VALID}/stream/movie/${imdb}.json`;

        const promises = Array.from({ length: 5 }).map(async (_, i) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} (request #${i})`);
            const j = await res.json();
            validateStreamsPayload(j);
        });

        await Promise.all(promises);
    });

    // -----------------------------------------------------------------
    // 9) CONFIG INSTALL LINK TESTS (valid + invalid)
    // -----------------------------------------------------------------
    await test("Stremio install link (valid config) ir sasniedzams", async () => {
        const installUrl = `${BASE}/${CONFIG_VALID}/manifest.json`;
        const res = await fetch(installUrl);
        if (!res.ok) throw new Error("Install URL nav OK: HTTP " + res.status);
        const json = await res.json();
        if (!json.id) throw new Error("Install manifest: trūkst id");
    });

    await test("Stremio install link (invalid config) neatkrīt un atgriež manifest.json", async () => {
        const installUrl = `${BASE}/${CONFIG_INVALID}/manifest.json`;
        const res = await fetch(installUrl);
        if (!res.ok) throw new Error("Install URL nav OK: HTTP " + res.status);
        const json = await res.json();
        if (!json.id) throw new Error("Install manifest INVALID config: trūkst id");
    });

    // -----------------------------------------------------------------
    // 10) LOGIN SIMULATION — VALID/INVALID CONFIG
    // -----------------------------------------------------------------
    await test("Pareiza config → stream atgriež korektu struktūru", async () => {
        const imdb = "tt0133093";
        const res = await fetch(`${BASE}/${CONFIG_VALID}/stream/movie/${imdb}.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        if (!("streams" in json)) throw new Error("'streams' nav definēts");
        if (!Array.isArray(json.streams)) throw new Error("'streams' nav masīvs");
    });

    await test("Nepareiza parole/username (invalid config) → streams ir tukšs", async () => {
        const imdb = "tt0133093";
        const res = await fetch(`${BASE}/${CONFIG_INVALID}/stream/movie/${imdb}.json`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        if (!("streams" in json)) throw new Error("Trūkst 'streams'");
        if (json.streams.length !== 0) throw new Error("INVALID config nedrīkst atgriezt streamus!");
    });

    // -----------------------------------------------------------------
    // 11) HTML → GENERATED CONFIG LINK SIMULATION
    // -----------------------------------------------------------------
    await test("HTML lapa ģenerē derīgu base64 config linku (simulācija)", async () => {
        const res = await fetch(`${BASE}/`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const html = await res.text();
        if (!html.includes("btoa(")) throw new Error("HTML: nav base64 ģenerēšanas JS");

        const cfg = {
            username: "TestUser",
            password: "PASS123"
        };

        const b64 = Buffer.from(JSON.stringify(cfg))
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        const simulatedUrl = `${BASE}/${b64}/manifest.json`;

        const r2 = await fetch(simulatedUrl);
        if (!r2.ok) throw new Error("Simulētais instalācijas links nav sasniedzams! HTTP " + r2.status);

        const json = await r2.json();
        if (!json.id) throw new Error("Simulation: manifest nav id");
    });

    // -----------------------------------------------------------------
    // 12) REGRESSION MATRIX — daudz IMDb ID
    // -----------------------------------------------------------------
    const regressionImdb = [
        "tt0468569", // The Dark Knight
        "tt1375666", // Inception
        "tt0120737", // LOTR: Fellowship
        "tt4154796", // Avengers: Endgame
        "tt0903747"  // Breaking Bad
    ];

    for (const id of regressionImdb) {
        await test(`Regression matrix: movie/${id}.json struktūra derīga`, async () => {
            const res = await fetch(`${BASE}/${CONFIG_VALID}/stream/movie/${id}.json`);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const j = await res.json();
            validateStreamsPayload(j);
        });
    }

    // -----------------------------------------------------------------
    // 13) FUZZ TESTI — random config
    // -----------------------------------------------------------------
    await test("Fuzz: random config vērtības neizraisa 5xx pie manifest", async () => {
        for (let i = 0; i < 5; i++) {
            const fuzz = randomString(8 + i);
            const url = `${BASE}/${fuzz}/manifest.json`;
            const res = await fetch(url);
            if (res.status >= 500) throw new Error(`Server 5xx at fuzz manifest request: ${res.status}`);
        }
    });

    await test("Fuzz: random config vērtības neizraisa 5xx pie stream", async () => {
        for (let i = 0; i < 5; i++) {
            const fuzz = randomString(10 + i);
            const url = `${BASE}/${fuzz}/stream/movie/tt0133093.json`;
            const res = await fetch(url);
            if (res.status >= 500) throw new Error(`Server 5xx at fuzz stream request: ${res.status}`);
        }
    });

    // -----------------------------------------------------------------
    // 14) CHAOS PATH TESTI — random ceļi
    // -----------------------------------------------------------------
    await test("Chaos: nejaušs ceļš /random/... neatgriež 5xx", async () => {
        const weirdPath = `${BASE}/random-${randomString(6)}/${randomString(4)}.json`;
        const res = await fetch(weirdPath);
        if (res.status >= 500) throw new Error("Server 5xx pie random path: " + res.status);
    });

    await test("Chaos: stream ar ļoti garu ID neatgriež 5xx", async () => {
        const longId = "tt" + "9".repeat(40);
        const url = `${BASE}/${CONFIG_VALID}/stream/movie/${longId}.json`;
        const res = await fetch(url);
        if (res.status >= 500) throw new Error("Server 5xx pie garā ID: " + res.status);
    });

    // -----------------------------------------------------------------
    // 15) PAPILDU LOAD TEST: vairāk paralēlo pieprasījumu
    // -----------------------------------------------------------------
    await test("Extra load: 10 paralēli stream pieprasījumi", async () => {
        const imdb = "tt0133093";
        const url = `${BASE}/${CONFIG_VALID}/stream/movie/${imdb}.json`;

        const promises = Array.from({ length: 10 }).map(async (_, i) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} (#${i})`);
            const j = await res.json();
            validateStreamsPayload(j);
        });

        await Promise.all(promises);
    });

    // -----------------------------------------------------------------
    // 16) STABILITĀTE: vairāki /health pieprasījumi
    // -----------------------------------------------------------------
    await test("Stabilitāte: 10 secīgi /health pieprasījumi", async () => {
        for (let i = 0; i < 10; i++) {
            const res = await fetch(`${BASE}/health`);
            if (!res.ok) throw new Error("HTTP " + res.status + " (#" + i + ")");
            const j = await res.json();
            if (j.status !== "ok") throw new Error("health status nav ok (#" + i + ")");
        }
    });

    console.log("\n========== ULTIMATE TEST PABEIGTS ==========\n");
})();
