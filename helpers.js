const _ = undefined;

// Vienkārša IMDb ID validācija, lai nenāktu random garbage
function extractImdbId(id) {
    const imdbId = String(id || "").split(":")[0];
    if (!/^tt\d{5,10}$/.test(imdbId)) {
        return null;
    }
    return imdbId;
}

// Drošāks regex priekš torrent linka
function extractTorrentPath(html, imdbId) {
    if (!html || !imdbId) return null;
    const re = new RegExp(`href=["'](torrent\/[^"']*${imdbId}[^"']*)["']`, "i");
    const match = html.match(re);
    return match ? match[1] : null;
}

// Drošāks regex priekš magnet linka
function extractMagnet(html) {
    if (!html) return null;
    const re = /href=["'](magnet:\?xt=urn:btih:[^"']+)["']/i;
    const match = html.match(re);
    return match ? match[1] : null;
}

module.exports = {
    extractImdbId,
    extractTorrentPath,
    extractMagnet
};
