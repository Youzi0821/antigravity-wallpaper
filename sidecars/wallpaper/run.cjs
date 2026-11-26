'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const { createServer } = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { promisify } = require('node:util');
const { createWallpaper } = require('../../wallpaper-main.cjs');
const { followHub, hubOrigin } = require('./bridge.cjs');

const shutdown = new AbortController();
let picking;
function pick(folder, filter = '') {
    if (picking) return Promise.resolve(null);
    const script = `
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object Windows.Forms.Form
$owner.TopMost = $true
try {
    if ($env:AGY_WALLPAPER_PICK_FOLDER -eq '1') {
        $dialog = New-Object Windows.Forms.FolderBrowserDialog
        $dialog.Description = '选择 Steam 库或 Wallpaper Engine 创意工坊文件夹'
    } else {
        $dialog = New-Object Windows.Forms.OpenFileDialog
        $dialog.Title = '选择壁纸'
        $dialog.Filter = '图片和视频|' + $env:AGY_WALLPAPER_PICK_FILTER
    }
    if ($dialog.ShowDialog($owner) -eq 'OK') {
        if ($env:AGY_WALLPAPER_PICK_FOLDER -eq '1') { $dialog.SelectedPath | ConvertTo-Json -Compress }
        else { $dialog.FileName | ConvertTo-Json -Compress }
    }
} finally {
    if ($dialog) { $dialog.Dispose() }
    $owner.Dispose()
}`;
    const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    picking = promisify(execFile)(shell, ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
        windowsHide: true, signal: shutdown.signal,
        env: { ...process.env, AGY_WALLPAPER_PICK_FOLDER: folder ? '1' : '0', AGY_WALLPAPER_PICK_FILTER: filter },
    }).then(({ stdout }) => JSON.parse(stdout.trim() || 'null')).finally(() => { picking = undefined; });
    return picking;
}

async function start() {
    const root = path.join(__dirname, '..', '..');
    const profile = path.join(process.env.APPDATA, 'Antigravity');
    const gemini = process.env.ANTIGRAVITY_GEMINI_DIR || path.join(os.homedir(), '.gemini');
    const data = path.resolve(gemini, process.env.ANTIGRAVITY_APP_DATA_DIR || 'antigravity');
    const origin = await hubOrigin(data, process.env.ANTIGRAVITY_LS_ADDRESS);
    if (!origin) throw new Error('AGY did not provide a local Hub session');
    const [ui, mascot] = await Promise.all([
        fs.readFile(path.join(root, 'wallpaper-ui.js'), 'utf8'),
        fs.readFile(path.join(root, 'gemini-cat.webp')),
    ]);
    const source = ui.trim().replace(/;$/, '').replace('__AGY_WALLPAPER_MASCOT__', mascot.toString('base64'));
    let wallpaper;
    let mediaOrigin;
    const server = createServer(async (request, response) => {
        try {
            const result = await wallpaper.respond(new Request(mediaOrigin + request.url, {
                method: request.method, headers: { range: request.headers.range ?? '' },
            }));
            response.writeHead(result.status, Object.fromEntries(result.headers));
            if (result.body) {
                const body = Readable.fromWeb(result.body);
                response.once('close', () => body.destroy());
                body.once('error', () => response.destroy());
                if (response.destroyed) body.destroy();
                else body.pipe(response);
            } else response.end();
        } catch {
            if (!response.headersSent) response.writeHead(404).end();
            else response.destroy();
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    mediaOrigin = 'http://127.0.0.1:' + server.address().port;
    wallpaper = createWallpaper({
        settingsFile: path.join(profile, 'wallpaper-settings.json'),
        mediaOrigin, hubOrigin: origin, pick, publish: state => bridge.publish(state),
    });
    const bridge = followHub({ origin, profile, source, wallpaper: () => wallpaper });
    console.log('[Wallpaper] Sidecar started.');
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, async () => {
            shutdown.abort();
            await bridge.stop();
            server.close();
            server.closeAllConnections();
        });
    }
}

start().catch(error => {
    console.error('[Wallpaper]', error.code ?? error.message);
    process.exitCode = 1;
});
