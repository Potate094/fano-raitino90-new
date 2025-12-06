// ==========================
// Fano Stremio Addon Tester
// ==========================
//
//  Requirements:
//  - Node 18+ (native fetch support)
//  - Addon must be deployed on Render or locally
//
//  Usage:
//      node test.js
//
// ==========================

const BASE = "https://fano-raitino90-new.onrender.com";

// Test config (base64url): {"username":"TEST","password":"TEST"}
const SAMPLE_CONFIG = "eyJ1c2VybmFtZSI6IlRFU1QiLCJwYXNzd29yZCI6IlRFU1QifQ";

async function test(name, fn) {
    try {
        await fn();
        console.log(`✔ OK — ${name}`);
    } catch (err) {
        console.error(`✖ FAIL — ${name}`);
        console.error("  →", err.message);
    }
}

(async () => {
    console.log("\n=== FANO STREMIO ADDON TEST START ===\n");

    // === 1) HEALTH CHECK ===
    await test("Health endpoint responds", async () => {
        const res = await fetch(`${BASE}/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.status !== "ok") throw new Error("Status not OK");
    });

    // === 2) PUBLIC MANIFEST CHECK ===
    await test("Public manifest.json is valid", async () => {
        const res = await fetch(`${BASE}/manifest.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();

        if (!json.id || !json.resources) {
            throw new Error("Manifest lacks required fields");
        }
    });

    // === 3) CONFIG MANIFEST CHECK ===
    await test("Config manifest resolves correctly", async () => {
        const url = `${BASE}/${SAMPLE_CONFIG}/manifest.json`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (!json.id || !json.resources) {
            throw new Error("Invalid config manifest");
        }
    });

    // === 4) STREAM HANDLER SANITY TEST ===
    await test("Stream handler does not crash on random IMDb ID", async () => {
        const imdb = "tt0000001"; // old silent movie (safe test)

        const url = `${BASE}/${SAMPLE_CONFIG}/stream/${imdb}.json`;
        const res = await fetch(url);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (!json.streams) throw new Error("No streams array in response");
    });

    console.log("\n=== TEST FINISHED ===\n");
})();
