'use strict';

const { app, ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const { TYPES, approvedFile, mediaType, projectDirectories, scanLibrary } = require('./wallpaper-library.cjs');

const CHANNEL = 'agy-wallpaper:control';
const SOURCE = 'plugin://agy-wallpaper';
const titlebarColors = new WeakMap();
const DEFAULTS = {
    enabled: false, dim: 45, brightness: 100, saturation: 100, sharpness: 0, grayscale: 0,
    blur: 0, speed: 100, flip: false, position: null, file: '', title: '',
};
const LIMITS = {
    dim: [0, 95], brightness: [25, 150], saturation: [0, 200], sharpness: [0, 100],
    grayscale: [0, 100], blur: [0, 24], speed: [50, 200],
};
const windows = new Map();
const library = new Map();
let config;
let mediaUrl;

function normalize(input) {
    const next = { ...DEFAULTS, ...input };
    for (const [key, [min, max]] of Object.entries(LIMITS)) {
        next[key] = Number.isFinite(next[key]) ? Math.max(min, Math.min(max, Math.round(next[key]))) : DEFAULTS[key];
    }
    next.enabled = next.enabled === true;
    next.flip = next.flip === true;
    const { x, y } = next.position ?? {};
    next.position = Number.isFinite(x) && Number.isFinite(y) ?
        { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } : null;
    next.file = typeof next.file === 'string' && path.isAbsolute(next.file) && mediaType(next.file) ? next.file : '';
    next.title = typeof next.title === 'string' ? next.title.slice(0, 180) : '';
    return next;
}

function configPath() {
    return path.join(app.getPath('userData'), 'wallpaper-settings.json');
}

function state() {
    const { file, ...settings } = config;
    return { ...settings, picked: Boolean(file), mediaUrl };
}

function setConfig(next) {
    const normalized = normalize(next);
    const target = configPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = target + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(normalized), { mode: 0o600 });
    fs.renameSync(temp, target);
    const mediaChanged = normalized.file !== config.file || normalized.enabled !== config.enabled;
    if (mediaChanged) {
        mediaUrl = normalized.file && normalized.enabled ? SOURCE + '/' + randomBytes(24).toString('hex') : undefined;
    }
    config = normalized;
    for (const [contents, { origin, titlebar }] of windows) {
        if (contents.isDestroyed()) continue;
        if (mediaChanged && titlebar && !titlebar.isDestroyed()) updateTitlebar(titlebar);
        if (matchingOrigin(contents.getURL(), origin)) contents.send(CHANNEL, state());
    }
    return state();
}

function matchingOrigin(value, origin) {
    try { return new URL(value).origin === origin; } catch { return false; }
}

async function chooseFile() {
    const result = await dialog.showOpenDialog({
        title: '选择壁纸',
        properties: ['openFile'],
        filters: [{ name: '图片和视频', extensions: Object.keys(TYPES).map(ext => ext.slice(1)) }],
    });
    if (result.canceled) return state();
    const file = await approvedFile(result.filePaths[0]);
    if (!file) throw new Error('无法读取壁纸文件');
    return setConfig({ ...config, file, title: path.basename(file), enabled: true });
}

async function getLibrary(chooseFolder) {
    let roots;
    if (chooseFolder) {
        const result = await dialog.showOpenDialog({ title: '选择 Steam 库或 Wallpaper Engine 创意工坊文件夹', properties: ['openDirectory'] });
        if (result.canceled) return null;
        const folder = result.filePaths[0];
        roots = [folder, ...projectDirectories(folder)];
    }
    const items = await scanLibrary(roots);
    return items.map(({ file, title, preview }) => {
        const id = createHash('sha256').update(file).digest('hex');
        library.set(id, { file, title });
        return { id, title, preview };
    });
}

function titlebarColor(win, color) {
    if (!titlebarColors.has(win)) return color;
    titlebarColors.set(win, color);
    return mediaUrl ? '#00000000' : color;
}

function updateTitlebar(win) {
    win.setTitleBarOverlay({ color: mediaUrl ? '#00000000' : titlebarColors.get(win) });
}

function localOrigin(targetUrl) {
    const target = new URL(targetUrl);
    if (target.protocol === 'https:' && target.hostname === '127.0.0.1' && target.port) return target.origin;
}

function updateOrigin(contents, targetUrl) {
    const entry = windows.get(contents);
    if (entry) entry.origin = localOrigin(targetUrl);
}

function attach(contents, targetUrl, win, backgroundColor) {
    const origin = localOrigin(targetUrl);
    if (!origin) return;
    if (!config) {
        let saved;
        try { saved = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch {}
        config = normalize(saved);
        if (config.enabled && config.file) mediaUrl = SOURCE + '/' + randomBytes(24).toString('hex');
        ipcMain.handle(CHANNEL, async (event, command, payload) => {
            const { origin } = windows.get(event.sender) ?? {};
            if (!origin || !event.senderFrame || event.senderFrame !== event.sender.mainFrame ||
                !matchingOrigin(event.senderFrame.url, origin)) return null;
            if (command === 'state') return state();
            if (command === 'pick') return chooseFile();
            if (command === 'scan') return getLibrary(payload === true);
            if (command === 'select' && library.has(payload)) return setConfig({ ...config, ...library.get(payload), enabled: true });
            if (command === 'settings' && payload && typeof payload === 'object') {
                const next = { ...config };
                for (const key of [...Object.keys(LIMITS), 'enabled', 'flip', 'position']) {
                    if (Object.hasOwn(payload, key)) next[key] = payload[key];
                }
                return setConfig(next);
            }
            return null;
        });
    }
    const titlebar = process.platform === 'win32' && typeof win?.setTitleBarOverlay === 'function' ? win : undefined;
    windows.set(contents, { origin, titlebar });
    if (titlebar) {
        titlebarColors.set(titlebar, backgroundColor);
        if (mediaUrl) updateTitlebar(titlebar);
    }
    contents.once('destroyed', () => windows.delete(contents));
}

const FRAME_SCRIPT = `
const media = document.querySelector('video, img');
const video = media.tagName === 'VIDEO';
const kernel = document.querySelector('feConvolveMatrix');
let appliedSharpness = 0;
for (const [event, status] of [[video ? 'loadeddata' : 'load', 'ready'], ['error', 'error']]) {
    media.addEventListener(event, () => parent.postMessage({ wallpaperStatus: status }, '*'));
}
window.addEventListener('message', event => {
    if (event.source !== parent || !event.data?.wallpaperSettings) return;
    const { speed, playing, sharpness } = event.data.wallpaperSettings;
    if (Number.isFinite(sharpness) && sharpness >= 0 && sharpness <= 1 && sharpness !== appliedSharpness) {
        if (sharpness) kernel.setAttribute('kernelMatrix', [0,-sharpness,0,-sharpness,1+4*sharpness,-sharpness,0,-sharpness,0].join(' '));
        media.style.filter = sharpness ? 'url(#agy-media-sharpen)' : '';
        appliedSharpness = sharpness;
    }
    if (!video) return;
    if (Number.isFinite(speed) && speed >= 0.5 && speed <= 2) media.playbackRate = speed;
    if (playing) media.play().catch(() => {});
    else media.pause();
});
if (video && media.readyState >= 2) parent.postMessage({ wallpaperStatus: 'ready' }, '*');
if (!video && media.complete) parent.postMessage({ wallpaperStatus: media.naturalWidth ? 'ready' : 'error' }, '*');
`;
const FRAME_HASH = createHash('sha256').update(FRAME_SCRIPT).digest('base64');
const SHARPEN_FILTER = '<svg width="0" height="0" aria-hidden="true" style="position:absolute"><filter id="agy-media-sharpen" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feConvolveMatrix order="3" kernelMatrix="0 0 0 0 1 0 0 0 0" divisor="1" preserveAlpha="true" edgeMode="duplicate"/></filter></svg>';

function serveFrame(url, mime) {
    const video = mime.startsWith('video/');
    const media = video ? '<video muted loop playsinline preload="auto" disablepictureinpicture' : '<img alt=""';
    return new Response(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}img,video{width:100%;height:100%;object-fit:cover;display:block}</style>${SHARPEN_FILTER}${media} src="${url}/media">${video ? '</video>' : ''}<script>${FRAME_SCRIPT}</script>`, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': `default-src 'none'; img-src ${SOURCE}; media-src ${SOURCE}; style-src 'unsafe-inline'; script-src 'sha256-${FRAME_HASH}'; base-uri 'none'; form-action 'none'`,
            'Cache-Control': 'no-store',
        },
    });
}

function byteRange(value, size) {
    if (!value) return { start: 0, end: size - 1 };
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (!match || (!match[1] && !match[2])) return null;
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end ? { start, end } : null;
}

async function serveMedia(request, file, mime) {
    let handle;
    try {
        if (await approvedFile(file) !== file) return new Response(null, { status: 404 });
        handle = await fs.promises.open(file, 'r');
        const { size } = await handle.stat();
        const requested = request.headers.get('range');
        const range = byteRange(requested, size);
        if (!range || size === 0) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
        const { start, end } = range;
        const headers = {
            'Content-Type': mime,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'Cache-Control': 'no-store',
        };
        if (requested) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        const stream = handle.createReadStream({ start, end });
        handle = undefined; // The stream closes the handle after EOF or cancellation.
        return new Response(Readable.toWeb(stream), { status: requested ? 206 : 200, headers });
    } catch {
        return new Response(null, { status: 404 });
    } finally {
        if (handle) await handle.close().catch(() => {});
    }
}

function respond(request) {
    const { url } = request;
    if (request.method !== 'GET' || !mediaUrl || (url !== mediaUrl && url !== mediaUrl + '/media')) return new Response(null, { status: 404 });
    const file = config.file;
    const mime = mediaType(file);
    return url === mediaUrl ? serveFrame(mediaUrl, mime) : serveMedia(request, file, mime);
}

module.exports = { attach, respond, titlebarColor, updateOrigin };
