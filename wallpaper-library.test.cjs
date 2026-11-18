'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { libraryFolders, projectDirectories, scanLibrary } = require('./wallpaper-library.cjs');

test('Steam library discovery keeps playable media and safe previews', async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'agy-wallpaper-test-'));
    try {
        const [workshop] = projectDirectories(temporary);
        const escaped = JSON.stringify(temporary);
        assert.deepEqual(libraryFolders('"libraryfolders" { "0" { "path" ' + escaped + ' } }'), [temporary]);

        async function project(id, manifest, items = []) {
            const directory = path.join(workshop, id);
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(path.join(directory, 'project.json'), JSON.stringify(manifest));
            await Promise.all(items.map(name => fs.writeFile(path.join(directory, name), 'fixture')));
        }

        await project('1', { title: 'A Video', file: '循环.MP4', preview: 'cover.jpg' }, ['循环.MP4', 'cover.jpg']);
        await project('2', { title: 'B Scene', file: 'scene.pkg', preview: 'cover.webp' }, ['scene.pkg', 'cover.webp']);
        await project('3', { title: 'C Web', file: 'index.html' }, ['index.html']);
        await project('4', { title: 'D Escape', file: '../1/循环.MP4' });
        await project('5', { title: 'E Absolute', file: path.join(workshop, '1', '循环.MP4') });

        const library = await scanLibrary(projectDirectories(temporary));
        assert.deepEqual(library.map(({ file, title, preview }) => [path.basename(file), title, preview]), [
            ['循环.MP4', 'A Video', false],
            ['cover.webp', 'B Scene', true],
        ]);
    } finally {
        await fs.rm(temporary, { recursive: true, force: true });
    }
});
