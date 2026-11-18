'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const open = fs.promises;
const IMAGE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.bmp': 'image/bmp' };
const VIDEO = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm' };
const TYPES = { ...IMAGE, ...VIDEO };
const STEAM_GAME_ID = '431960';

function mediaType(file) {
    return typeof file === 'string' ? TYPES[path.extname(file).toLowerCase()] : undefined;
}

async function approvedFile(file, folder) {
    if (!mediaType(file)) return null;
    try {
        const resolved = await open.realpath(file);
        if (folder) {
            const relative = path.relative(folder, resolved);
            if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
        }
        return mediaType(file) === mediaType(resolved) && (await open.stat(resolved)).isFile() ? resolved : null;
    } catch {
        return null;
    }
}

function libraryFolders(vdf) {
    return [...vdf.matchAll(/"path"\s+"((?:\\.|[^"\\])+)"/gi)]
        .map(([, value]) => value.replace(/\\(["\\])/g, '$1'))
        .filter(folder => path.isAbsolute(folder));
}

async function steamRoots() {
    const locations = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
        .filter(Boolean).map(folder => path.join(folder, 'Steam'));
    try {
        const { stdout } = await promisify(execFile)('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 3000 });
        const installed = stdout.match(/SteamPath\s+REG_SZ\s+([^\r\n]+)/i)?.[1].trim();
        if (installed && path.isAbsolute(installed)) locations.unshift(installed);
    } catch {
        // Steam may be installed in a custom folder.
    }
    const libraryLists = await Promise.all(locations.map(folder => open.readFile(path.join(folder, 'steamapps', 'libraryfolders.vdf'), 'utf8').catch(() => '')));
    return [...new Set([...locations, ...libraryLists.flatMap(libraryFolders)])];
}

function projectDirectories(root) {
    const steamapps = path.join(root, 'steamapps');
    const projects = path.join(steamapps, 'common', 'wallpaper_engine', 'projects');
    return [path.join(steamapps, 'workshop', 'content', STEAM_GAME_ID),
        path.join(projects, 'myprojects'), path.join(projects, 'defaultprojects')];
}

async function readProject(folder) {
    try {
        const base = await open.realpath(folder);
        const manifest = path.join(base, 'project.json');
        if ((await open.lstat(manifest)).size > 512 * 1024 || (await open.realpath(manifest)) !== manifest) return null;
        const project = JSON.parse((await open.readFile(manifest, 'utf8')).replace(/^\uFEFF/, ''));
        for (const candidate of [project.file, project.preview]) {
            if (typeof candidate !== 'string' || path.isAbsolute(candidate)) continue;
            const file = await approvedFile(path.resolve(base, candidate), base);
            if (file) {
                const title = typeof project.title === 'string' ? project.title.trim().slice(0, 180) : '';
                return { file, title: title || path.basename(base), preview: candidate !== project.file };
            }
        }
    } catch {
        return null;
    }
    return null;
}

async function scanLibrary(folders) {
    const entries = new Map();
    const candidates = folders ?? (await steamRoots()).flatMap(projectDirectories);
    for (const directory of new Set(candidates)) {
        const children = await open.readdir(directory, { withFileTypes: true }).catch(() => []);
        for (const folder of [directory, ...children.filter(child => child.isDirectory()).map(child => path.join(directory, child.name))]) {
            const item = await readProject(folder);
            if (item) entries.set(item.file, item);
        }
    }
    return [...entries.values()].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}

module.exports = { TYPES, approvedFile, libraryFolders, mediaType, projectDirectories, scanLibrary };
