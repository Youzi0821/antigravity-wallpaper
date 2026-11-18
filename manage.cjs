'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { openAsar, sha256 } = require('./asar.cjs');

const VERSION = '0.1.7';
const SUPPORTED = '2.33.0';
const MARKER = '/* agy-wallpaper-local */';

function replaceOne(text, anchor, insert) {
    if (text.split(anchor).length !== 2) throw new Error('找不到唯一的扩展接入点。');
    return text.replace(anchor, () => insert + '\n' + anchor);
}

function buildArchive(original) {
    const archive = openAsar(original);
    const info = JSON.parse(archive.read('package.json'));
    if (info.name !== 'antigravity' || info.version !== SUPPORTED) {
        throw new Error('此扩展适配 Antigravity ' + SUPPORTED + '，当前版本为 ' + info.version + '。');
    }
    const utils = 'dist/utils.js';
    const preload = 'dist/preload.js';
    const scheme = 'dist/customScheme.js';
    const handlers = 'dist/ipcHandlers.js';
    const source = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
    const mascot = fs.readFileSync(path.join(__dirname, 'gemini-cat.webp'));
    if (mascot.toString('ascii', 0, 4) !== 'RIFF' || mascot.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error('猫猫图标文件损坏。');
    }
    const wallpaperUi = source('wallpaper-ui.js').replace('__AGY_WALLPAPER_MASCOT__', mascot.toString('base64'));
    const launchAnchor = '    void win.loadURL(url);';
    const schemeAnchor = '        const originalHost = exports.extensionAuthorities.get(authority);';
    const overlayAnchor = '                color: options.color,';
    const handlersSource = archive.read(handlers);
    if (handlersSource.split(overlayAnchor).length !== 2) throw new Error('找不到唯一的标题栏配色接入点。');
    const changes = {
        [utils]: replaceOne(archive.read(utils), launchAnchor,
            `    ${MARKER} try { require('./wallpaper-main.cjs').attach(win.webContents, url, options?.partition ? undefined : win, backgroundColor); }
    catch (error) { console.warn('[Wallpaper]', error.message); }`),
        [preload]: archive.read(preload) + '\n' + wallpaperUi,
        [scheme]: replaceOne(archive.read(scheme), schemeAnchor,
            "        if (authority === 'agy-wallpaper') return require('./wallpaper-main.cjs').respond(request);"),
        [handlers]: handlersSource.replace(overlayAnchor,
            "                color: require('./wallpaper-main.cjs').titlebarColor(win, options.color),"),
        'dist/wallpaper-main.cjs': '// original-sha256: ' + sha256(original) + '\n' + source('wallpaper-main.cjs'),
        'dist/wallpaper-library.cjs': source('wallpaper-library.cjs'),
    };
    for (const [file, sourceCode] of Object.entries(changes)) new vm.Script(sourceCode, { filename: file });
    const patched = archive.patch(changes);
    const check = openAsar(patched);
    for (const [file, sourceCode] of Object.entries(changes)) {
        if (check.read(file) !== sourceCode) throw new Error('生成的补丁校验失败。');
    }
    return patched;
}

function replaceFile(file, bytes) {
    const temp = path.join(path.dirname(file), '.agy-wallpaper-' + randomUUID() + '.tmp');
    try {
        fs.writeFileSync(temp, bytes, { flag: 'wx' });
        fs.renameSync(temp, file);
    } finally {
        fs.rmSync(temp, { force: true });
    }
}

function ensureClosed(directory) {
    const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const output = execFileSync(shell, ['-NoProfile', '-NonInteractive', '-Command',
        '$target = Join-Path $env:AGY_WALLPAPER_INSTALL_DIR "Antigravity.exe"; ' +
        'Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $target } | ForEach-Object Id; exit 0',
    ], { encoding: 'utf8', windowsHide: true, env: { ...process.env, AGY_WALLPAPER_INSTALL_DIR: directory } });
    if (output.trim()) throw new Error('请先通过 Antigravity 菜单退出应用，再运行此命令。');
}

function manage(command, directory) {
    const app = fs.realpathSync(directory);
    if (!fs.existsSync(path.join(app, 'Antigravity.exe'))) throw new Error('找不到 Antigravity.exe。');
    const target = path.join(app, 'resources', 'app.asar');
    const backup = path.join(path.dirname(target), 'agy-wallpaper-original.asar');
    const installedHash = path.join(path.dirname(target), 'agy-wallpaper-installed.sha256');
    const lock = path.join(path.dirname(target), 'agy-wallpaper.lock');
    if (command === 'check') {
        const bytes = fs.readFileSync(target);
        if (openAsar(bytes).read('dist/utils.js').includes(MARKER)) return console.log('壁纸扩展已安装。');
        buildArchive(bytes);
        return console.log('兼容性检查通过，可安装到 Antigravity ' + SUPPORTED + '。');
    }
    if (!['install', 'uninstall'].includes(command)) throw new Error('使用 install、uninstall 或 check。');
    ensureClosed(app);
    const fd = fs.openSync(lock, 'wx');
    try {
        const original = fs.readFileSync(target);
        const hash = sha256(original);
        const patched = openAsar(original).read('dist/utils.js').includes(MARKER);
        if (command === 'uninstall') {
            if (!patched) return console.log('当前应用未加载壁纸扩展。');
            if (fs.readFileSync(installedHash, 'utf8') !== hash) throw new Error('当前应用文件在安装壁纸后又被修改，无法自动覆盖。');
            const saved = fs.readFileSync(backup);
            const firstLine = openAsar(original).read('dist/wallpaper-main.cjs').split('\n', 1)[0];
            if (firstLine !== '// original-sha256: ' + sha256(saved)) throw new Error('备份与当前补丁不匹配，无法自动恢复。');
            replaceFile(target, saved);
            return console.log('已恢复安装壁纸前的应用文件。');
        }
        if (patched) return console.log('壁纸扩展已安装。');
        const next = buildArchive(original);
        replaceFile(backup, original);
        replaceFile(installedHash, sha256(next));
        replaceFile(target, next);
        console.log('已安装聊天壁纸 ' + VERSION + '。重新打开 Antigravity，点击右下角的 Gemini 猫猫。');
    } finally {
        fs.closeSync(fd);
        fs.unlinkSync(lock);
    }
}

module.exports = { buildArchive };

if (require.main === module) {
    try {
        const [, , command = 'check', flag, directory] = process.argv;
        if (process.platform !== 'win32' || (flag && (flag !== '--app-dir' || !directory))) throw new Error('用法: node manage.cjs install|uninstall|check [--app-dir 路径]');
        manage(command, flag ? directory : path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity'));
    } catch (error) {
        console.error('壁纸扩展: ' + error.message);
        process.exitCode = 1;
    }
}
