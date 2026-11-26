(function mountWallpaper(bridge, initial) {
    'use strict';

    const MASCOT_URL = 'data:image/webp;base64,__AGY_WALLPAPER_MASCOT__';
    const BROWSER_HOLE = '[data-browser-hole]:not([data-browser-hole="false"])';
    const CONTROLS = [
        ['dim', '主题遮罩', 0, 95, '%'],
        ['brightness', '亮度', 25, 150, '%'],
        ['saturation', '饱和度', 0, 200, '%'],
        ['sharpness', '锐化', 0, 100, '%'],
        ['grayscale', '灰度', 0, 100, '%'],
        ['blur', '模糊', 0, 24, ' px'],
        ['speed', '播放速度', 50, 200, '%'],
    ];

    const PAGE_CSS = `
        body[data-agy-wallpaper] {
            isolation: isolate;
            background-color: transparent !important;
            --agy-glass-edge: color-mix(in srgb, var(--foreground, #15161a) 20%, transparent);
            --agy-glass-tint: color-mix(in srgb, var(--background, #101114) 62%, transparent);
        }
        body[data-agy-wallpaper] #root :is(
            .agy-shell, .agy-inset-shell,
            .browser-hole-opaque:has(.agy-home, [data-testid="conversation-view"]),
            .browser-hole-opaque > :has(.agy-home, [data-testid="conversation-view"],
                [data-testid="sidecars-view"], [data-testid="customizations-search"]),
            .bg-background:has(.agy-shell, [data-testid="conversation-view"], [data-testid="conversation-list-sidebar"]),
            .browser-hole-ancestor.bg-background:not(.aux-drawer-popup, .surface-opaque),
            .agy-shell > :has(> [data-testid="title-menu-bar"]),
            .browser-hole-opaque > :has(> [class~="@container/titlebar"]),
            .overflow-hidden:has(> [data-testid="side-panel-new-tab-view"]),
            [data-testid="conversation-list-sidebar"],
            [data-testid="conversation-list-sidebar"] .bg-sidebar:has(> [data-testid="section-header"]),
            [data-testid="conversation-list-sidebar"] [data-testid="section-header"] > .bg-sidebar,
            [data-testid="title-menu-bar"],
            [data-testid="pane-titlebar-toolbar"] [class~="bg-[var(--shell-canvas)]"],
            div:has(> [data-testid="toggle-aux-sidebar"]),
            [data-testid="agent-input-box"] .surface-composer-card,
            [data-testid="sidecars-view"],
            :is(.bg-background.overflow-hidden, .sticky.bg-background):has([data-testid="customizations-search"]),
            [data-testid="featured-carousel"] .agy-spotlight-card
        ) {
            background-color: transparent !important;
        }
        body[data-agy-wallpaper] #root :is(
            .agy-home, [data-testid="conversation-view"],
            .bg-sidebar:has([data-testid="conversation-list-sidebar"])
        ) {
            background-color: color-mix(in srgb, var(--background, #101114) 20%, transparent) !important;
        }
        body[data-agy-wallpaper]:has(
            [data-testid="sidecars-view"], [data-testid="customizations-search"]
        ) #root .bg-sidebar:has([data-testid="conversation-list-sidebar"]) {
            background-color: transparent !important;
        }
        body[data-agy-wallpaper] #root
        [data-testid="featured-carousel-stage"] > .absolute.inset-0[style] {
            background: none !important;
        }
        body[data-agy-wallpaper] #root
        [data-testid="conversation-view"] .pointer-events-none.bottom-0[style*="linear-gradient"] {
            background-image: none !important;
        }
        body[data-agy-wallpaper] #root :is(
            [data-testid="new-conversation-button"], [data-testid="user-message-bubble"]
        ) {
            background-color: color-mix(in srgb, var(--background, #101114) 58%, transparent) !important;
        }
        body[data-agy-wallpaper] #root
        [data-testid="new-conversation-button"]:hover {
            background-color: color-mix(in srgb, var(--background, #101114) 72%, transparent) !important;
        }
        body[data-agy-wallpaper] #root
        [data-testid="conversation-row-sidebar"].bg-sidebar-secondary {
            --row-bg: color-mix(in srgb, var(--sidebar-secondary, #26282d) 56%, transparent) !important;
            background-color: var(--row-bg) !important;
        }
        body[data-agy-wallpaper] #root
        [data-testid="agent-input-box"] .surface-composer {
            background: linear-gradient(155deg,
                color-mix(in srgb, var(--background, #101114) 64%, transparent),
                color-mix(in srgb, var(--background, #101114) 43%, transparent) 46%,
                color-mix(in srgb, var(--background, #101114) 54%, transparent)) !important;
            backdrop-filter: blur(16px) saturate(150%);
            box-shadow: inset 0 1px 0 rgb(255 255 255 / 55%),
                inset 0 -1px 0 rgb(255 255 255 / 24%),
                inset 0 0 0 1px var(--agy-glass-edge), 0 8px 26px rgb(0 0 0 / 18%);
        }
        body[data-agy-wallpaper] #root
        [data-testid="agent-input-box"] .surface-composer:focus-within {
            outline: 1px solid var(--agy-glass-edge);
            outline-offset: 1px;
        }
        body[data-agy-wallpaper] #root [data-testid="aux-pane-split"] :is(
            div:has(> [data-testid="side-panel-new-tab-button"]),
            [data-testid="side-panel-new-tab-view"],
            [data-testid="builtin-browser-pane"] > :has(form)
        ) {
            background-color: var(--agy-glass-tint) !important;
            backdrop-filter: blur(20px) saturate(140%);
            border-color: var(--agy-glass-edge);
        }
        body[data-agy-wallpaper]:has([data-testid="side-panel-new-tab-button"]) #root
        .bg-sidebar:has([data-testid="conversation-list-sidebar"]) {
            background-color: var(--agy-glass-tint) !important;
            backdrop-filter: blur(16px) saturate(135%);
        }
        #agy-wallpaper-layer { display: none; }
        body[data-agy-wallpaper] > #agy-wallpaper-layer {
            display: block; position: fixed; inset: 0; overflow: hidden;
            z-index: -1; pointer-events: none;
        }
    `;

    const PANEL_CSS = `
        :host { position: fixed; right: 16px; bottom: 14px; z-index: 90;
            color: var(--foreground, #eceef0); font: 13px/1.5 system-ui, sans-serif; }
        button, input { font: inherit; }
        button { color: inherit; padding: 6px 11px; border: 1px solid var(--border, #45464a);
            border-radius: 6px; cursor: pointer; background: var(--card, #23252a); }
        button:enabled:hover { background: var(--secondary, #3b4047); }
        :focus-visible { outline: 2px solid var(--primary, #93c5fd); outline-offset: 2px; }
        button:disabled { opacity: .55; cursor: default; }
        button#open { display: grid; place-items: center; width: 64px; height: 68px; padding: 2px;
            border: 0; border-radius: 16px; background: transparent; font-weight: 600;
            cursor: grab; touch-action: none; user-select: none; }
        button#open[data-dragging] { cursor: grabbing; }
        #open img { display: block; width: 100%; height: 62px; object-fit: contain;
            pointer-events: none; filter: drop-shadow(0 2px 4px rgb(0 0 0 / 55%)); }
        #open:is(:hover, :focus-visible) img {
            filter: drop-shadow(0 0 6px rgb(178 157 255 / 85%)) drop-shadow(0 2px 4px rgb(0 0 0 / 50%)); }
        @media (prefers-reduced-motion: no-preference) {
            #open img { transition: transform 140ms ease-out; }
            #open:hover:not([data-dragging]) img { transform: translateY(-3px) scale(1.06); }
        }
        dialog { position: fixed; inset: auto 16px 88px auto; margin: 0; color: inherit;
            background: var(--background, #17191d); border: 1px solid var(--border, #45464a);
            border-radius: 10px; padding: 16px; width: min(390px, calc(100vw - 32px));
            box-sizing: border-box; max-height: calc(100dvh - 24px); overflow: auto;
            box-shadow: 0 12px 38px #0005; }
        dialog::backdrop { background: #0003; }
        h2 { margin: 0; font-size: 16px; }
        header, .row { display: flex; align-items: center; gap: 8px; }
        header, .check { justify-content: space-between; }
        header button { padding: 2px 9px; }
        .current { min-height: 20px; margin: 10px 0 8px; overflow-wrap: anywhere; }
        .row { flex-wrap: wrap; }
        .controls { display: grid; gap: 8px; margin-block: 14px; }
        .check { display: flex; align-items: center; gap: 12px; }
        .slider { display: grid; grid-template-columns: 5.3em 1fr 4.3em; align-items: center; gap: 8px; }
        .slider output { text-align: end; font-variant-numeric: tabular-nums; }
        input[type="range"] { width: 100%; min-width: 0; margin: 0; accent-color: var(--primary, #7db8ff); }
        input[type="search"] { box-sizing: border-box; width: 100%; margin-block: 8px;
            padding: 7px 9px; color: inherit; background: var(--card, #23252a);
            border: 1px solid var(--border, #45464a); border-radius: 6px; }
        ul { list-style: none; margin: 0; padding: 0; max-height: 172px; overflow: auto; }
        li + li { margin-top: 4px; }
        li button { width: 100%; text-align: start; overflow-wrap: anywhere; }
        #status { margin: 8px 0 0; color: var(--muted-foreground, #bdc4cb); }
        #status:empty { display: none; }
    `;

    const LAYER_CSS = `
        iframe, div { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; pointer-events: none; }
        iframe { filter: brightness(var(--agy-brightness)) saturate(var(--agy-saturation))
                grayscale(var(--agy-grayscale)) blur(var(--agy-blur));
            transform: scale(var(--agy-scale)) scaleX(var(--agy-flip)); }
        div { background: color-mix(in srgb, var(--background, #101114) var(--agy-dim), transparent); }
    `;

    function sheet(css) {
        const style = new CSSStyleSheet();
        style.replaceSync(css);
        return style;
    }

    function preserveBrowserHoles(layer, signal) {
        let holes = [];
        function clipWallpaper() {
            // Antigravity draws the native browser underneath the Hub renderer.
            // Cut out only its page bounds so the surrounding chrome can show the wallpaper.
            const cutouts = holes
                .map(hole => hole.getBoundingClientRect())
                .filter(rect => rect.width > 0 && rect.height > 0)
                .map(({ left, top, right, bottom }) => `M${left} ${top}H${right}V${bottom}H${left}Z`);
            layer.style.clipPath = cutouts.length
                ? `path(evenodd, "M0 0H${window.innerWidth}V${window.innerHeight}H0Z ${cutouts.join(' ')}")`
                : '';
        }

        const resize = new ResizeObserver(clipWallpaper);
        function trackHoles() {
            const next = [...document.querySelectorAll(BROWSER_HOLE)];
            if (next.length === holes.length && next.every((hole, index) => hole === holes[index])) return;
            resize.disconnect();
            holes = next;
            for (const hole of holes) resize.observe(hole);
            clipWallpaper();
        }

        const mutations = new MutationObserver(trackHoles);
        mutations.observe(document.body, {
            subtree: true, childList: true, attributes: true, attributeFilter: ['data-browser-hole'],
        });
        window.addEventListener('resize', clipWallpaper, { signal });
        signal.addEventListener('abort', () => { mutations.disconnect(); resize.disconnect(); }, { once: true });
        trackHoles();
    }

    function boot(initial) {
        const lifetime = new AbortController();
        const { signal } = lifetime;
        let current = initial;
        let loadedUrl;
        let results = [];
        let pendingSettings = {};
        let saveTimer;
        let ready = false;
        let drag;
        let suppressClick = false;
        const layer = document.createElement('div');
        layer.id = 'agy-wallpaper-layer';
        layer.setAttribute('aria-hidden', 'true');
        const background = layer.attachShadow({ mode: 'closed' });
        background.adoptedStyleSheets = [sheet(LAYER_CSS)];
        const frame = document.createElement('iframe');
        frame.title = '壁纸';
        frame.tabIndex = -1;
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        const shade = document.createElement('div');
        background.append(frame, shade);
        document.body.prepend(layer);
        const pageStyles = sheet(PAGE_CSS);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, pageStyles];
        preserveBrowserHoles(layer, signal);

        const panel = document.createElement('div');
        panel.id = 'agy-wallpaper-panel';
        const shadow = panel.attachShadow({ mode: 'closed' });
        shadow.adoptedStyleSheets = [sheet(PANEL_CSS)];
        shadow.innerHTML = `
            <button type="button" id="open" aria-label="壁纸" title="点击设置壁纸，拖动猫猫可移动" aria-haspopup="dialog"><img id="mascot" alt="" draggable="false"></button>
            <dialog aria-labelledby="title">
                <header><h2 id="title">聊天壁纸</h2><button type="button" id="close" aria-label="关闭">×</button></header>
                <p class="current" id="current">尚未选择壁纸</p>
                <div class="row"><button type="button" id="pick">选择文件</button>
                <button type="button" id="scan">Steam 壁纸库</button>
                <button type="button" id="folder">选择库文件夹</button></div>
                <div class="controls">
                    <label class="check">启用壁纸<input type="checkbox" id="enabled"></label>
                    ${CONTROLS.map(([key, label, min, max]) => `<label class="slider"><span>${label}</span><input id="${key}" type="range" min="${min}" max="${max}"><output id="${key}-value" aria-hidden="true"></output></label>`).join('')}
                    <label class="check">水平翻转<input type="checkbox" id="flip"></label>
                </div>
                <section id="library" hidden><label for="search">搜索 Steam 壁纸</label>
                    <input type="search" id="search" placeholder="壁纸名称"><ul id="results" aria-label="搜索结果"></ul></section>
                <p id="status" role="status"></p>
            </dialog>`;
        const get = id => shadow.getElementById(id);
        const opener = get('open');
        const mascot = get('mascot');
        mascot.addEventListener('error', () => mascot.replaceWith(document.createTextNode('壁纸')), { once: true });
        mascot.src = MASCOT_URL;
        const dialog = shadow.querySelector('dialog');
        const status = text => { get('status').textContent = text; };
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const syncMedia = () => {
            if (!loadedUrl) return;
            frame.contentWindow?.postMessage({
                wallpaperSettings: {
                    speed: current.speed / 100, sharpness: current.sharpness / 100,
                    playing: !document.hidden && !reducedMotion.matches,
                },
            }, '*');
        };

        const clamp = (value, max) => Math.max(0, Math.min(value, max));
        const travel = () => ({
            x: Math.max(0, window.innerWidth - opener.offsetWidth),
            y: Math.max(0, window.innerHeight - opener.offsetHeight),
        });
        function positionFromPixels(x, y) {
            const room = travel();
            return { x: room.x ? clamp(x, room.x) / room.x : 0, y: room.y ? clamp(y, room.y) / room.y : 0 };
        }
        function placeMascot(position) {
            const room = travel();
            if (position) panel.style.inset = `${position.y * room.y}px auto auto ${position.x * room.x}px`;
            else panel.style.removeProperty('inset');
        }
        function placeDialog() {
            if (!dialog.open) return;
            const anchor = opener.getBoundingClientRect();
            const { width, height } = dialog.getBoundingClientRect();
            const gap = 8;
            const margin = 12;
            const above = anchor.top - height - gap;
            const below = anchor.bottom + gap;
            const top = above >= margin || below + height > window.innerHeight - margin ? above : below;
            const x = margin + clamp(anchor.right - width - margin, window.innerWidth - width - 2 * margin);
            const y = margin + clamp(top - margin, window.innerHeight - height - 2 * margin);
            dialog.style.inset = `${y}px auto auto ${x}px`;
        }

        function paint(next) {
            if (signal.aborted) return;
            current = { ...next, ...pendingSettings };
            panel.hidden = !current.pluginEnabled;
            if (panel.hidden && dialog.open) dialog.close();
            placeMascot(drag?.position ?? current.position);
            placeDialog();
            for (const [key, , , , unit] of CONTROLS) {
                get(key).value = current[key];
                get(key + '-value').textContent = current[key] + unit;
            }
            get('current').textContent = current.title || '尚未选择壁纸';
            get('enabled').disabled = !current.picked;
            get('enabled').checked = current.enabled;
            get('flip').checked = current.flip;
            layer.style.setProperty('--agy-dim', current.dim + '%');
            layer.style.setProperty('--agy-brightness', String(current.brightness / 100));
            layer.style.setProperty('--agy-saturation', String(current.saturation / 100));
            layer.style.setProperty('--agy-grayscale', String(current.grayscale / 100));
            layer.style.setProperty('--agy-blur', current.blur + 'px');
            layer.style.setProperty('--agy-scale', current.blur ? '1.08' : '1');
            layer.style.setProperty('--agy-flip', current.flip ? '-1' : '1');
            const nextUrl = current.enabled ? current.mediaUrl : undefined;
            if (loadedUrl !== nextUrl) {
                ready = false;
                loadedUrl = nextUrl;
                if (nextUrl) frame.src = nextUrl;
                else frame.removeAttribute('src');
            }
            document.body.toggleAttribute('data-agy-wallpaper', ready && Boolean(loadedUrl));
            syncMedia();
        }

        async function run(command, value) {
            try { return await bridge.invoke(command, value); }
            catch { status('壁纸操作失败，请检查文件或文件夹访问权限。'); return null; }
        }

        function change(key, value) {
            pendingSettings[key] = value;
            paint(current);
            clearTimeout(saveTimer);
            saveTimer = setTimeout(async () => {
                const saving = pendingSettings;
                pendingSettings = {};
                const saved = await run('settings', saving);
                if (saved) paint(saved);
            }, 90);
        }

        function showResults() {
            const query = get('search').value.trim().toLocaleLowerCase();
            const matches = results.filter(item => item.title.toLocaleLowerCase().includes(query));
            const rows = matches.map(item => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = item.title + (item.preview ? '（静态预览）' : '');
                button.addEventListener('click', async event => {
                    if (!event.isTrusted) return;
                    status('');
                    const selected = await run('select', item.id);
                    if (selected) paint(selected);
                });
                li.append(button);
                return li;
            });
            get('results').replaceChildren(...rows);
            status(matches.length ? `找到 ${matches.length} 张壁纸` : '没有找到可用的壁纸。可以选择本地文件。');
        }

        for (const [key] of CONTROLS) {
            get(key).addEventListener('input', event => {
                if (event.isTrusted) change(key, event.currentTarget.valueAsNumber);
            });
        }
        for (const key of ['enabled', 'flip']) {
            get(key).addEventListener('change', event => {
                if (event.isTrusted) change(key, event.currentTarget.checked);
            });
        }
        window.addEventListener('pointerdown', event => {
            if (!event.isTrusted || !event.isPrimary || event.button !== 0 || event.target !== panel || dialog.open) return;
            const box = opener.getBoundingClientRect();
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top };
            suppressClick = false;
        }, { capture: true, signal });
        window.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            if (event.buttons === 0) return finishDrag(event);
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (!drag.position) {
                if (Math.hypot(dx, dy) < 5) return;
                panel.setPointerCapture(event.pointerId);
                opener.setAttribute('data-dragging', '');
            }
            event.preventDefault();
            drag.position = positionFromPixels(drag.left + dx, drag.top + dy);
            placeMascot(drag.position);
        }, { capture: true, signal });
        function finishDrag(event) {
            if (!drag || event.pointerId !== drag.id) return;
            const position = drag.position;
            drag = undefined;
            opener.removeAttribute('data-dragging');
            suppressClick = Boolean(position);
            if (position && event.type === 'pointerup') change('position', position);
            else placeMascot(current.position);
        }
        for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, finishDrag, { capture: true, signal });
        const arrowSteps = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
        opener.addEventListener('keydown', event => {
            if (!event.isTrusted || !Object.hasOwn(arrowSteps, event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
            event.preventDefault();
            const [dx, dy] = arrowSteps[event.key];
            const box = opener.getBoundingClientRect();
            change('position', positionFromPixels(box.left + dx, box.top + dy));
        });
        opener.addEventListener('click', event => {
            if (!event.isTrusted) return;
            if (suppressClick && event.detail !== 0) {
                suppressClick = false;
                return;
            }
            dialog.showModal();
            placeDialog();
        });
        window.addEventListener('resize', () => {
            placeMascot(drag?.position ?? current.position);
            placeDialog();
        }, { signal });
        const dialogSize = new ResizeObserver(placeDialog);
        dialogSize.observe(dialog);
        get('close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => opener.focus());
        get('pick').addEventListener('click', async event => {
            if (!event.isTrusted) return;
            status('');
            const chosen = await run('pick');
            if (chosen) paint(chosen);
        });
        for (const key of ['scan', 'folder']) {
            get(key).addEventListener('click', async event => {
                if (!event.isTrusted) return;
                get('scan').disabled = get('folder').disabled = true;
                status('正在查找壁纸…');
                const found = await run('scan', key === 'folder');
                get('scan').disabled = get('folder').disabled = false;
                if (!found) {
                    if (get('status').textContent === '正在查找壁纸…') status('');
                    return;
                }
                results = found;
                get('search').value = '';
                get('library').hidden = false;
                showResults();
            });
        }
        get('search').addEventListener('input', showResults);
        document.addEventListener('visibilitychange', syncMedia, { signal });
        reducedMotion.addEventListener('change', syncMedia, { signal });
        window.addEventListener('message', event => {
            if (!loadedUrl || event.source !== frame.contentWindow) return;
            if (event.data?.wallpaperStatus === 'ready') {
                ready = true;
                paint(current);
            } else if (event.data?.wallpaperStatus === 'error') {
                ready = false;
                paint(current);
                status('无法播放这张壁纸，请选择其他文件。');
            }
        }, { signal });
        frame.addEventListener('load', syncMedia);
        document.body.append(panel);
        paint(initial);
        return {
            paint,
            dispose() {
                lifetime.abort();
                clearTimeout(saveTimer);
                dialogSize.disconnect();
                panel.remove();
                layer.remove();
                document.adoptedStyleSheets = document.adoptedStyleSheets.filter(style => style !== pageStyles);
                document.body?.removeAttribute('data-agy-wallpaper');
            },
        };
    }

    return boot(initial);
});
