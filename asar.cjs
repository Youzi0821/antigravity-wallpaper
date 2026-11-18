'use strict';

const { createHash } = require('node:crypto');

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function openAsar(bytes) {
    const length = bytes.readUInt32LE(4);
    const jsonLength = bytes.readUInt32LE(12);
    const dataStart = 8 + length;
    if (bytes.readUInt32LE(0) !== 4 || jsonLength > length - 8 || dataStart > bytes.length) {
        throw new Error('Invalid Electron archive header');
    }
    const header = JSON.parse(bytes.toString('utf8', 16, 16 + jsonLength));
    const data = bytes.subarray(dataStart);

    function parent(file) {
        const folders = file.split('/');
        const name = folders.pop();
        const directory = folders.reduce((entry, folder) => entry.files[folder], header);
        return [directory.files, name];
    }

    function read(file) {
        const [files, name] = parent(file);
        const entry = files[name];
        if (!entry || entry.unpacked || entry.offset === undefined) {
            throw new Error('Missing packed file: ' + file);
        }
        const start = Number(entry.offset);
        return data.toString('utf8', start, start + entry.size);
    }

    function patch(changes) {
        const chunks = [data];
        let offset = data.length;
        for (const [file, contents] of Object.entries(changes)) {
            const [files, name] = parent(file);
            const content = Buffer.from(contents);
            const blockSize = 4 * 1024 * 1024;
            const blocks = [];
            for (let start = 0; start < content.length; start += blockSize) {
                blocks.push(sha256(content.subarray(start, start + blockSize)));
            }
            files[name] = {
                size: content.length,
                offset: String(offset),
                integrity: { algorithm: 'SHA256', hash: sha256(content), blockSize, blocks },
            };
            chunks.push(content);
            offset += content.length;
        }
        const json = Buffer.from(JSON.stringify(header));
        const size = Math.ceil(json.length / 4) * 4;
        const prefix = Buffer.alloc(16 + size);
        prefix.writeUInt32LE(4, 0);
        prefix.writeUInt32LE(8 + size, 4);
        prefix.writeUInt32LE(4 + size, 8);
        prefix.writeUInt32LE(json.length, 12);
        json.copy(prefix, 16);
        return Buffer.concat([prefix, ...chunks]);
    }

    return { read, patch };
}

module.exports = { openAsar, sha256 };
