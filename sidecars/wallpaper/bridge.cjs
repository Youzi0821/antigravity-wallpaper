'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const WORLD = 'antigravity-wallpaper';
const BINDING = '__agyWallpaperCommand';
const localPort = n => Number.isInteger(n) && n > 0 && n < 65536;

async function hubOrigin(dataDirectory, address) {
    const match = /^(?:127\.0\.0\.1|localhost):([1-9]\d{0,4})$/.exec(address ?? '');
    if (!match || !localPort(Number(match[1]))) return null;
    const record = JSON.parse(await fs.readFile(path.join(dataDirectory, 'daemon', 'hub_' + match[1] + '.json'), 'utf8'));
    if (record.httpPort !== Number(match[1]) || !localPort(record.httpsPort)) return null;
    return 'https://127.0.0.1:' + record.httpsPort;
}

function matchesTarget(target, port, origin) {
    const page = URL.parse(target?.url ?? '');
    const socket = URL.parse(target?.webSocketDebuggerUrl ?? '');
    return target?.type === 'page' && page?.origin === origin && !!socket &&
        socket.origin === 'ws://127.0.0.1:' + port && typeof target.id === 'string' &&
        /^[a-zA-Z0-9-]+$/.test(target.id) && socket.pathname === '/devtools/page/' + target.id && !socket.search;
}

function connect(url, onEvent) {
    const ws = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();
    const fail = () => {
        for (const item of pending.values()) {
            clearTimeout(item.timer);
            item.reject(new Error('AGY window disconnected'));
        }
        pending.clear();
    };
    ws.addEventListener('close', fail);
    ws.addEventListener('message', event => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.method) { onEvent(data); return; }
        const item = pending.get(data.id);
        if (!item) return;
        clearTimeout(item.timer);
        pending.delete(data.id);
        if (data.error) item.reject(new Error('AGY rejected the wallpaper request'));
        else item.resolve(data.result);
    });
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { ws.close(); reject(new Error('AGY connection timed out')); }, 3000);
        ws.addEventListener('error', () => { clearTimeout(timeout); fail(); reject(new Error('AGY connection failed')); }, { once: true });
        ws.addEventListener('open', () => {
            clearTimeout(timeout);
            resolve({
                close: () => ws.close(),
                get connected() { return ws.readyState === WebSocket.OPEN; },
                call(method, params = {}) {
                    if (ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('AGY window disconnected'));
                    return new Promise((done, error) => {
                        const id = ++nextId;
                        const timer = setTimeout(() => { pending.delete(id); error(new Error(method + ' timed out')); }, 3000);
                        pending.set(id, { resolve: done, reject: error, timer });
                        ws.send(JSON.stringify({ id, method, params }));
                    });
                },
            });
        }, { once: true });
    });
}

function browserCode(mount, state) {
    globalThis.__agyWallpaper?.dispose();
    const callbacks = new Map();
    let nextId = 0;
    let timer;
    const mounted = mount({ invoke: (name, value) => new Promise(resolve => {
        const id = ++nextId;
        callbacks.set(id, resolve);
        globalThis.__agyWallpaperCommand(JSON.stringify({ id, name, value }));
    }) }, state);
    const renderer = {
        refresh() { clearTimeout(timer); timer = setTimeout(renderer.dispose, 5000); return true; },
        paint: mounted.paint,
        answer(id, result) { callbacks.get(id)?.(result); callbacks.delete(id); },
        dispose() {
            clearTimeout(timer);
            delete globalThis.__agyWallpaper;
            for (const callback of callbacks.values()) callback(null);
            callbacks.clear();
            mounted.dispose();
        },
    };
    globalThis.__agyWallpaper = renderer;
    return renderer.refresh();
}

function followHub({ origin, profile, source, wallpaper }) {
    const sessions = new Map();
    let stopped = false;
    let busy = false;
    let timer;
    const evaluate = (session, expression) => session.client.call('Runtime.evaluate', {
        expression, uniqueContextId: session.world, returnByValue: true,
    });

    async function command(session, payload) {
        let message;
        try { message = JSON.parse(payload); } catch { return; }
        if (!Number.isSafeInteger(message?.id) || !['pick', 'scan', 'select', 'settings'].includes(message.name)) return;
        const world = session.world;
        let result;
        try { result = await wallpaper().command(message.name, message.value); } catch { result = null; }
        if (!stopped && world && world === session.world) {
            await evaluate(session, 'globalThis.__agyWallpaper?.answer(' + message.id + ',' + JSON.stringify(result ?? null) + ')').catch(() => {});
        }
    }

    async function open(target) {
        const session = { contexts: new Map() };
        session.client = await connect(target.webSocketDebuggerUrl, ({ method, params }) => {
            if (method === 'Runtime.executionContextCreated') {
                session.contexts.set(params.context.id, params.context.uniqueId);
            } else if (method === 'Runtime.executionContextDestroyed') {
                session.contexts.delete(params.executionContextId);
            } else if (method === 'Runtime.executionContextsCleared') {
                session.contexts.clear();
            } else if (!stopped && method === 'Runtime.bindingCalled' && params.name === BINDING &&
                session.world && session.contexts.get(params.executionContextId) === session.world &&
                typeof params.payload === 'string' && params.payload.length <= 16384) {
                void command(session, params.payload);
            }
        });
        try {
            const { frameTree } = await session.client.call('Page.getFrameTree');
            if (URL.parse(frameTree?.frame?.url ?? '')?.origin !== origin) throw new Error('Unexpected window origin');
            const ready = await session.client.call('Runtime.evaluate', {
                expression: '!!(document.body && window.__APP_CONFIG__ && document.querySelector(\'script[src="/main.js"]\'))',
                returnByValue: true,
            });
            if (ready.result?.value !== true) throw new Error('AGY window is not ready');
            await session.client.call('Runtime.enable');
            await session.client.call('Runtime.addBinding', { name: BINDING, executionContextName: WORLD });
            const { executionContextId } = await session.client.call('Page.createIsolatedWorld', {
                frameId: frameTree.frame.id, worldName: WORLD, grantUniveralAccess: false,
            });
            session.world = session.contexts.get(executionContextId);
            if (!session.world) throw new Error('Wallpaper isolated world unavailable');
            const mounted = await evaluate(session, 'location.origin === ' + JSON.stringify(origin) + ' && document.body && (' +
                browserCode + ')(' + source + ',' + JSON.stringify(wallpaper().state()) + ')');
            if (mounted.result?.value !== true || stopped) throw new Error('Wallpaper did not mount');
            return session;
        } catch (error) {
            session.client.close();
            throw error;
        }
    }

    async function tick() {
        if (busy || stopped) return;
        busy = true;
        try {
            const port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/, 1)[0]);
            if (!localPort(port)) return;
            const response = await fetch('http://127.0.0.1:' + port + '/json/list', { redirect: 'error', signal: AbortSignal.timeout(2000) });
            if (!response.ok) return;
            const list = (await response.json()).filter(target => matchesTarget(target, port, origin));
            const active = new Set(list.map(target => target.webSocketDebuggerUrl));
            for (const [url, session] of sessions) {
                const alive = active.has(url) && session.client.connected &&
                    await evaluate(session, 'globalThis.__agyWallpaper?.refresh()').then(result => result.result?.value === true, () => false);
                if (!alive) { session.client.close(); sessions.delete(url); }
            }
            for (const target of list) {
                if (stopped || sessions.has(target.webSocketDebuggerUrl)) continue;
                try { sessions.set(target.webSocketDebuggerUrl, await open(target)); } catch { /* The window may still be loading. */ }
            }
        } catch { /* The launcher or a window can be restarting. Try again on the next tick. */ }
        finally { busy = false; }
    }

    void tick();
    timer = setInterval(tick, 1500);
    return {
        publish(state) {
            for (const session of sessions.values()) {
                void evaluate(session, 'globalThis.__agyWallpaper?.paint(' + JSON.stringify(state) + ')').catch(() => {});
            }
        },
        async stop() {
            stopped = true;
            clearInterval(timer);
            await Promise.allSettled([...sessions.values()].map(async session => {
                try { await evaluate(session, 'globalThis.__agyWallpaper?.dispose()'); }
                finally { session.client.close(); }
            }));
            sessions.clear();
        },
    };
}

module.exports = { followHub, hubOrigin, matchesTarget };
