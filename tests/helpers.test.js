const { extractImdbId, extractTorrentPath, extractMagnet } = require('../helpers');

test('extractImdbId valid and invalid', () => {
    expect(extractImdbId('tt1234567')).toBe('tt1234567');
    expect(extractImdbId('tt1234567:1:2')).toBe('tt1234567');
    expect(extractImdbId('invalid')).toBeNull();
});

test('extractTorrentPath finds path', () => {
    const html = `<a href="torrent/download_tt1234567.torrent">dl</a>`;
    expect(extractTorrentPath(html, 'tt1234567')).toContain('torrent/');
});

test('extractMagnet finds magnet', () => {
    const html = `<a href='magnet:?xt=urn:btih:ABC123&dn=Name'>mag</a>`;
    expect(extractMagnet(html)).toContain('magnet:?xt=urn:btih:ABC123');
});
