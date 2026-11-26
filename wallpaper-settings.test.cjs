'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { createWallpaper } = require('./wallpaper-main.cjs');
const { hubOrigin, matchesTarget } = require('./sidecars/wallpaper/bridge.cjs');

test('the sidecar preserves old settings and revokes the old media URL when switched off', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-wallpaper-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const settingsFile = path.join(dir, 'wallpaper-settings.json');
    const media = path.join(dir, 'wallpaper.mp4');
    fs.writeFileSync(media, '123456789');
    fs.writeFileSync(settingsFile, JSON.stringify({ file: media, enabled: true, brightness: 125 }));
    const stateChanges = [];
    let selected = null;
    const options = {
        settingsFile, mediaOrigin: 'http://127.0.0.1:8010', hubOrigin: 'https://127.0.0.1:8020',
        pick: async () => selected, publish: next => stateChanges.push(next),
    };
    const wallpaper = createWallpaper(options);
    const first = wallpaper.state();
    assert.equal(first.brightness, 125);
    assert.equal(first.saturation, 100);
    assert.equal(first.position, null);
    assert.ok(first.mediaUrl && !first.file);
    const frame = await wallpaper.respond(new Request(first.mediaUrl));
    assert.match(frame.headers.get('Content-Security-Policy'), /frame-ancestors https:\/\/127\.0\.0\.1:8020/);
    const script = (await frame.text()).match(/<script>([\s\S]+)<\/script>/)[1];
    const parent = { postMessage() {} };
    const kernel = { setAttribute: (name, value) => { kernel[name] = value; } };
    const img = { tagName: 'IMG', addEventListener() {}, style: {} };
    let onMessage;
    vm.runInNewContext(script, {
        parent,
        document: { querySelector: name => name === 'feConvolveMatrix' ? kernel : img },
        window: { addEventListener: (_event, callback) => { onMessage = callback; } },
    });
    onMessage({ source: parent, data: { wallpaperSettings: { sharpness: 0.75 } } });
    assert.equal(kernel.kernelMatrix, '0 -0.75 0 -0.75 4 -0.75 0 -0.75 0');
    const segment = await wallpaper.respond(new Request(first.mediaUrl + '/media', { headers: { range: 'bytes=2-4' } }));
    assert.equal(segment.status, 206);
    assert.equal(await segment.text(), '345');
    await wallpaper.command('pick'); // The chooser was cancelled.
    assert.equal(stateChanges.length, 0);
    const update = await wallpaper.command('settings', { enabled: false, saturation: 220, grayscale: 45, position: { x: -1, y: 0.6 } });
    assert.equal(update.mediaUrl, undefined);
    assert.equal((await wallpaper.respond(new Request(first.mediaUrl))).status, 404);
    assert.deepEqual(stateChanges, [update]);
    const reopened = createWallpaper(options);
    assert.equal(reopened.state().saturation, 200);
    assert.equal(reopened.state().grayscale, 45);
    assert.deepEqual(reopened.state().position, { x: 0, y: 0.6 });
    assert.equal(await reopened.command('settings', { file: 'unselected.mp4' }).then(s => s.title), '');
    selected = media;
    assert.ok((await reopened.command('pick')).mediaUrl);
});

test('discovery accepts only the AGY session origin and a matching debugger target', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hub-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'daemon'));
    fs.writeFileSync(path.join(dir, 'daemon', 'hub_9000.json'), JSON.stringify({ httpPort: 9000, httpsPort: 8443 }));
    const origin = await hubOrigin(dir, '127.0.0.1:9000');
    assert.equal(origin, 'https://127.0.0.1:8443');
    assert.equal(await hubOrigin(dir, 'example.com:9000'), null);
    const target = { type: 'page', id: 'HUB', url: origin + '/customizations', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/page/HUB' };
    assert.equal(matchesTarget(target, 9333, origin), true);
    assert.equal(matchesTarget({ ...target, type: 'iframe' }, 9333, origin), false);
    assert.equal(matchesTarget({ ...target, url: 'https://127.0.0.1:8444/' }, 9333, origin), false);
    assert.equal(matchesTarget({ ...target, webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/page/OTHER' }, 9333, origin), false);
    assert.equal(matchesTarget({ ...target, webSocketDebuggerUrl: 'ws://example.com:9333/devtools/page/HUB' }, 9333, origin), false);
});
