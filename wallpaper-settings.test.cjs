'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

test('older preferences gain neutral effects and new settings survive a reload', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-wallpaper-settings-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const configPath = path.join(directory, 'wallpaper-settings.json');
    const file = path.join(directory, 'wallpaper.png');
    fs.writeFileSync(configPath, JSON.stringify({ enabled: true, brightness: 125, file }));
    const source = fs.readFileSync(path.join(__dirname, 'wallpaper-main.cjs'), 'utf8');
    const url = 'https://127.0.0.1:8000/';
    const frame = { url };
    const sender = { mainFrame: frame, once() {}, isDestroyed: () => false, getURL: () => url, send() {} };
    const event = { sender, senderFrame: frame };

    function load(win) {
        const module = { exports: {} };
        let handler;
        const electron = {
            app: { getPath: () => directory },
            ipcMain: { handle: (_channel, callback) => { handler = callback; } },
        };
        vm.runInNewContext(source, {
            module, require: name => name === 'electron' ? electron : require(name),
            Response, URL, process: { pid: process.pid, platform: 'win32' },
        });
        module.exports.attach(sender, url, win, '#131313');
        return { invoke: (command, payload) => handler(event, command, payload), ...module.exports };
    }

    const first = load();
    const initial = await first.invoke('state');
    assert.equal(initial.brightness, 125);
    assert.equal(initial.saturation, 100);
    assert.equal(initial.grayscale, 0);
    assert.equal(initial.sharpness, 0);
    assert.equal(initial.position, null);

    const updated = await first.invoke('settings', {
        saturation: 220, grayscale: 45, sharpness: 75, position: { x: -0.2, y: 0.6 },
    });
    assert.equal(updated.mediaUrl, initial.mediaUrl);
    const reopened = load();
    const persisted = await reopened.invoke('state');
    assert.equal(persisted.saturation, 200);
    assert.equal(persisted.grayscale, 45);
    assert.equal(persisted.sharpness, 75);
    assert.equal(persisted.position.x, 0);
    assert.equal(persisted.position.y, 0.6);

    const frameHtml = await reopened.respond({ url: persisted.mediaUrl, method: 'GET' }).text();
    const script = frameHtml.match(/<script>([\s\S]+)<\/script>/)[1];
    const parent = { postMessage() {} };
    const kernel = { setAttribute: (name, value) => { kernel[name] = value; } };
    const media = { tagName: 'IMG', addEventListener() {}, style: {} };
    let message;
    vm.runInNewContext(script, {
        parent,
        document: { querySelector: name => name === 'feConvolveMatrix' ? kernel : media },
        window: { addEventListener: (_event, callback) => { message = callback; } },
    });
    message({ source: parent, data: { wallpaperSettings: { sharpness: 0.75 } } });
    assert.equal(media.style.filter, 'url(#agy-media-sharpen)');
    assert.equal(kernel.kernelMatrix, '0 -0.75 0 -0.75 4 -0.75 0 -0.75 0');
    message({ source: parent, data: { wallpaperSettings: { sharpness: 0 } } });
    assert.equal(media.style.filter, '');

    let overlayColor;
    const window = {
        isDestroyed: () => false,
        setTitleBarOverlay: ({ color }) => { overlayColor = color; },
    };
    const menuSource = load(window);
    assert.equal(overlayColor, '#00000000');
    assert.equal(menuSource.titlebarColor(window, '#fafafa'), '#00000000');
    assert.equal(menuSource.titlebarColor({}, '#222222'), '#222222');
    await menuSource.invoke('settings', { enabled: false });
    assert.equal(overlayColor, '#fafafa');
    await menuSource.invoke('settings', { enabled: true });
    assert.equal(overlayColor, '#00000000');

    await t.test('the existing Hub window follows a restarted language server', async () => {
        const newUrl = 'https://127.0.0.1:8001/';
        menuSource.updateOrigin(sender, newUrl);
        assert.equal(await menuSource.invoke('state'), null);
        frame.url = newUrl;
        assert.equal((await menuSource.invoke('state'))?.enabled, true);

        const outside = 'https://example.com:8002/';
        menuSource.updateOrigin(sender, outside);
        frame.url = outside;
        assert.equal(await menuSource.invoke('state'), null);
    });
});
