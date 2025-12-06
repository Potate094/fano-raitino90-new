const axios = require('axios');

// Prepare mocks for axios.create before requiring the module under test
let postMock = jest.fn();
let getMock = jest.fn();

axios.create = jest.fn(() => ({
  post: (...args) => postMock(...args),
  get: (...args) => getMock(...args)
}));

const { getFanoCookie, getCacheKey } = require('../index');

describe('getFanoCookie integration (mocked HTTP)', () => {
  beforeEach(() => {
    postMock = jest.fn();
    getMock = jest.fn();
    // Replace the implementation on the axios.create return
    axios.create = jest.fn(() => ({ post: (...args) => postMock(...args), get: (...args) => getMock(...args) }));
  });

  test('returns null when login response has no set-cookie', async () => {
    postMock.mockResolvedValue({ headers: {} });
    const cookie = await getFanoCookie('invaliduser', 'invalidpass');
    expect(cookie).toBeNull();
  });

  test('parses and returns cookie when set-cookie present', async () => {
    postMock.mockResolvedValue({ headers: { 'set-cookie': ['sess=abc; Path=/; HttpOnly'] } });
    const cookie = await getFanoCookie('user', 'pass');
    expect(cookie).toBe('sess=abc');
  });

  test('getFanoCookie uses in-process cache on subsequent calls', async () => {
    // First call returns a set-cookie header
    postMock.mockResolvedValueOnce({ headers: { 'set-cookie': ['sess=first; Path=/; HttpOnly'] } });
    const c1 = await getFanoCookie('cacheUser', 'cachePass');
    expect(c1).toBe('sess=first');

    // Set postMock to throw if called again (should not be called due to cache)
    postMock.mockImplementation(() => { throw new Error('HTTP post should not be called when cached'); });

    const c2 = await getFanoCookie('cacheUser', 'cachePass');
    expect(c2).toBe('sess=first');
  });

  test('getCacheKey yields deterministic sha256', () => {
    const k1 = getCacheKey('u','p');
    const k2 = getCacheKey('u','p');
    expect(k1).toBe(k2);
    expect(typeof k1).toBe('string');
    expect(k1.length).toBeGreaterThan(10);
  });
});
