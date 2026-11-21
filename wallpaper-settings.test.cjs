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
    const agyConfigDir = path.join(directory, '.gemini', 'config');
    const agyConfig = path.join(agyConfigDir, 'config.json');
    const manifest = path.join(agyConfigDir, 'plugins', 'antigravity-wallpaper', 'plugin.json');
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'plugin.json'), manifest);
    const file = path.join(directory, 'wallpaper.png');
    fs.writeFileSync(configPath, JSON.stringify({ enabled: true, brightness: 125, file }));
    const source = fs.readFileSync(path.join(__dirname, 'wallpaper-main.cjs'), 'utf8');
    const url = 'https://127.0.0.1:8000/';
    const frame = { url };
    const sender = { mainFrame: frame, once() {}, isDestroyed: () => false, getURL: () => url, send() {} };
    const event = { sender, senderFrame: frame };

    function load(win) {
        const module = { exports: {} };
        const listeners = new Map();
        let handler;
        const electron = {
            app: { getPath: () => directory },
            ipcMain: { handle: (_channel, callback) => { handler = callback; } },
        };
        vm.runInNewContext(source, {
            module, require: name => {
                if (name === 'electron') return electron;
                if (name === 'node:os') return { homedir: () => directory };
                if (name === 'node:fs') return { ...fs, watchFile: (file, _options, callback) => listeners.set(file, callback) };
                return require(name);
            },
            Response, URL, process: { pid: process.pid, platform: 'win32' },
        });
        module.exports.attach(sender, url, win, '#131313');
        return { invoke: (command, payload) => handler(event, command, payload), notify: file => listeners.get(file)?.(), ...module.exports };
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

    await t.test('the native plugin switch suspends wallpaper and preserves its settings', async () => {
        frame.url = url;
        const instance = load(window);
        const initial = await instance.invoke('state');
        const saved = fs.readFileSync(configPath, 'utf8');
        assert.equal(initial.pluginEnabled, true);

        fs.writeFileSync(agyConfig, '{"plugins":{"antigravity-wallpaper":{"enabled":false}}}');
        instance.notify(agyConfig);
        assert.equal(overlayColor, '#131313');
        const off = await instance.invoke('state');
        assert.equal(off.pluginEnabled, false);
        assert.equal(off.mediaUrl, undefined);
        assert.equal(await instance.invoke('settings', { enabled: false }), null);
        assert.equal(instance.respond({ method: 'GET', url: initial.mediaUrl }).status, 404);
        assert.equal(fs.readFileSync(configPath, 'utf8'), saved);

        fs.writeFileSync(agyConfig, '{"plugins":{"antigravity-wallpaper":{"enabled":true}}}');
        instance.notify(agyConfig);
        assert.equal(overlayColor, '#00000000');
        assert.ok((await instance.invoke('state')).mediaUrl);

        fs.unlinkSync(manifest);
        instance.notify(manifest);
        assert.equal((await instance.invoke('state')).pluginEnabled, false);
    });
});
