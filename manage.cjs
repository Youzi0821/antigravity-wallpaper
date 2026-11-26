'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { openAsar, sha256 } = require('./asar.cjs');
const plugin = require('./plugin.json');

const files = [
    'plugin.json', 'gemini-cat.webp', 'wallpaper-ui.js', 'wallpaper-main.cjs', 'wallpaper-library.cjs',
    'sidecars/wallpaper/sidecar.json', 'sidecars/wallpaper/run.cjs', 'sidecars/wallpaper/bridge.cjs',
];

function replaceFile(file, bytes) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
        fs.writeFileSync(temporary, bytes, { flag: 'wx' });
        fs.renameSync(temporary, file);
    } finally {
        fs.rmSync(temporary, { force: true });
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

function legacyPatch(app) {
    const resources = path.join(app, 'resources');
    const installedHash = path.join(resources, 'agy-wallpaper-installed.sha256');
    if (!fs.existsSync(installedHash)) return null;
    const file = path.join(resources, 'app.asar');
    if (!fs.existsSync(file)) return null;
    const patched = fs.readFileSync(file);
    let wallpaper;
    try { wallpaper = openAsar(patched).read('dist/wallpaper-main.cjs'); }
    catch { return null; }
    if (fs.readFileSync(installedHash, 'utf8').trim() !== sha256(patched)) {
        throw new Error('旧壁纸补丁安装后又有其他修改，无法自动覆盖应用包。');
    }
    const original = fs.readFileSync(path.join(resources, 'agy-wallpaper-original.asar'));
    if (wallpaper.split('\n', 1)[0] !== '// original-sha256: ' + sha256(original)) {
        throw new Error('旧壁纸补丁的备份校验失败。');
    }
    return { file, original, patched };
}

function updatePlugin(directory, installing) {
    const config = path.dirname(path.dirname(directory));
    const manifest = path.join(directory, 'plugin.json');
    const exists = fs.existsSync(directory);
    if (exists) {
        if (fs.realpathSync(directory) !== directory) throw new Error('插件目录链接到其他位置。');
        const existing = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : null;
        if (existing ? (existing.name !== plugin.name || existing.homepage !== plugin.homepage) : fs.readdirSync(directory).length) {
            throw new Error('全局插件目录已有其他清单。');
        }
    } else if (!installing) {
        return;
    }
    fs.mkdirSync(path.dirname(directory), { recursive: true });
    if (fs.realpathSync(path.dirname(directory)) !== path.dirname(directory)) throw new Error('插件目录链接到其他位置。');
    const staging = fs.mkdtempSync(path.join(config, '.wallpaper-install-'));
    const next = path.join(staging, 'new');
    const previous = path.join(staging, 'previous');
    let clean = false;
    try {
        if (installing) {
            for (const file of files) {
                const destination = path.join(next, file);
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.copyFileSync(path.join(__dirname, file), destination);
            }
        }
        if (exists) fs.renameSync(directory, previous);
        try { if (installing) fs.renameSync(next, directory); }
        catch (error) {
            if (exists) fs.renameSync(previous, directory);
            throw error;
        }
        clean = true;
    } finally {
        const resolved = fs.realpathSync(staging);
        if ((clean || !fs.existsSync(previous)) && path.dirname(resolved) === config && path.basename(resolved).startsWith('.wallpaper-install-')) {
            try { fs.rmSync(resolved, { force: true, recursive: true }); }
            catch { console.warn('请手动清理旧插件文件：' + resolved); }
        }
    }
}

if (require.main === module) {
    try {
        const [, , command = 'check', flag, supplied] = process.argv;
        if (process.platform !== 'win32' || !['check', 'install', 'uninstall'].includes(command) ||
            (flag && (flag !== '--app-dir' || !supplied))) throw new Error('用法: node manage.cjs install|uninstall|check [--app-dir 路径]');
        if (command === 'install' && (typeof WebSocket !== 'function' || typeof URL.parse !== 'function')) {
            throw new Error('安装壁纸需要 Node.js 22.1 或更新版本。');
        }
        const app = fs.realpathSync(supplied || path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity'));
        if (!fs.existsSync(path.join(app, 'Antigravity.exe'))) throw new Error('找不到 Antigravity.exe。');
        const directory = path.join(os.homedir(), '.gemini', 'config', 'plugins', plugin.name);
        if (command === 'check') {
            const sidecar = fs.existsSync(path.join(directory, 'sidecars', 'wallpaper', 'run.cjs'));
            console.log(sidecar ? '壁纸 sidecar 已安装。' : '可安装壁纸 sidecar。');
        } else {
            ensureClosed(app);
            const legacy = legacyPatch(app);
            if (legacy) replaceFile(legacy.file, legacy.original);
            try { updatePlugin(directory, command === 'install'); }
            catch (error) {
                if (legacy) replaceFile(legacy.file, legacy.patched);
                throw error;
            }
            console.log(command === 'install' ? '已安装壁纸 ' + plugin.version + '。从原快捷方式打开 Antigravity。' : '已卸载壁纸插件。');
        }
    } catch (error) {
        console.error('壁纸扩展: ' + error.message);
        process.exitCode = 1;
    }
}
