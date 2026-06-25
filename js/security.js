    (function () {
        'use strict';

        /* ════════════════════════════════════════════════════════════
           1. KEYBOARD SHORTCUT BLOCKING
           Ctrl/Cmd + U C P V I S A  |  F12  |  Ctrl+Shift+I/J/C/K
        ════════════════════════════════════════════════════════════ */
        const CTRL_BLOCKED = new Set(['u','c','p','v','i','s','a','j','k']);

        document.addEventListener('keydown', function (e) {
            const ctrl = e.ctrlKey || e.metaKey;

            // Ctrl+<key>
            if (ctrl && !e.shiftKey && !e.altKey && CTRL_BLOCKED.has(e.key.toLowerCase())) {
                e.preventDefault(); e.stopImmediatePropagation(); return false;
            }

            // F12
            if (e.key === 'F12') {
                e.preventDefault(); e.stopImmediatePropagation(); return false;
            }

            // Ctrl+Shift+I / J / C / K  (DevTools panels)
            if (ctrl && e.shiftKey && ['i','j','c','k'].includes(e.key.toLowerCase())) {
                e.preventDefault(); e.stopImmediatePropagation(); return false;
            }

            // Alt+F4 - optional: leave enabled for window close; kept here for reference
            // Ctrl+W (close tab) — leave enabled intentionally
        }, true);

        /* ════════════════════════════════════════════════════════════
           2. RIGHT-CLICK CONTEXT MENU
        ════════════════════════════════════════════════════════════ */
        document.addEventListener('contextmenu', function (e) {
            e.preventDefault(); e.stopImmediatePropagation(); return false;
        }, true);

        /* ════════════════════════════════════════════════════════════
           3. CLIPBOARD — block copy / cut / paste events
        ════════════════════════════════════════════════════════════ */
        ['copy', 'cut', 'paste'].forEach(function (type) {
            document.addEventListener(type, function (e) {
                e.preventDefault(); e.stopImmediatePropagation(); return false;
            }, true);
        });

        /* ════════════════════════════════════════════════════════════
           4. DRAG-TO-COPY BLOCK
        ════════════════════════════════════════════════════════════ */
        document.addEventListener('dragstart', function (e) {
            e.preventDefault(); return false;
        }, true);

        /* ════════════════════════════════════════════════════════════
           5. PRINT BLOCKING — both keyboard and window.print()
        ════════════════════════════════════════════════════════════ */
        window.print = function () { return false; };

        // beforeprint fires even from browser menu
        window.addEventListener('beforeprint', function (e) {
            e.preventDefault();
            // Immediately open cancel by redirecting focus
            window.stop && window.stop();
        });

        /* ════════════════════════════════════════════════════════════
           6. CONSOLE WIPE — clear console every 2 seconds
              Makes it harder to inspect via console pasting
        ════════════════════════════════════════════════════════════ */
        setInterval(function () {
            try { console.clear(); } catch (_) {}
        }, 2000);

        // Override console methods to suppress output
        (function () {
            const noop = function () {};
            ['log','warn','info','debug','table','dir','dirxml','group','groupCollapsed','groupEnd','time','timeEnd','count','assert','profile','profileEnd'].forEach(function (m) {
                try { console[m] = noop; } catch (_) {}
            });
        })();

        /* ════════════════════════════════════════════════════════════
           7. DEBUGGER TRAP — continuous debugger statement
              Freezes execution in DevTools "Sources" panel
        ════════════════════════════════════════════════════════════ */
        setInterval(function () {
            (function () { /* jshint ignore:start */ debugger; /* jshint ignore:end */ })();
        }, 100);

        /* ════════════════════════════════════════════════════════════
           8. DEVTOOLS DETECTION — window size differential
              Shows overlay + blurs body when DevTools is open
        ════════════════════════════════════════════════════════════ */
        var _devOpen = false;
        var _overlay = document.getElementById('__sec-overlay');
        var THRESHOLD = 160;

        function checkDevTools() {
            var wDiff = window.outerWidth  - window.innerWidth;
            var hDiff = window.outerHeight - window.innerHeight;
            var open  = wDiff > THRESHOLD || hDiff > THRESHOLD;

            if (open && !_devOpen) {
                _devOpen = true;
                document.body.style.filter = 'blur(10px)';
                document.body.style.pointerEvents = 'none';
                if (_overlay) _overlay.classList.add('active');
            } else if (!open && _devOpen) {
                _devOpen = false;
                document.body.style.filter = '';
                document.body.style.pointerEvents = '';
                if (_overlay) _overlay.classList.remove('active');
            }
        }
        setInterval(checkDevTools, 800);

        /* ════════════════════════════════════════════════════════════
           9. DEVTOOLS DETECTION — toString timing trick
              Object with custom toString fires continuously in console;
              if DevTools formats it, timing spikes → detected
        ════════════════════════════════════════════════════════════ */
        (function () {
            var element = new Image();
            var _fired = false;
            Object.defineProperty(element, 'id', {
                get: function () {
                    if (!_fired) {
                        _fired = true;
                        // DevTools is open — trigger same overlay
                        _devOpen = true;
                        document.body.style.filter = 'blur(10px)';
                        document.body.style.pointerEvents = 'none';
                        if (_overlay) _overlay.classList.add('active');
                        setTimeout(function () { _fired = false; }, 3000);
                    }
                }
            });
            // Runs silently; only fires id getter when DevTools formats the object
            setInterval(function () {
                _fired = false;
                console.log('%c', element);  // triggers toString in DevTools
            }, 1500);
        })();

        /* ════════════════════════════════════════════════════════════
           10. WATERMARK — tiled with page URL + timestamp
               Deters/identifies screenshots
        ════════════════════════════════════════════════════════════ */
        (function () {
            var wm = document.getElementById('__watermark');
            if (!wm) return;
            var label = window.location.hostname || 'NPTEL Score Splitter';
            var stamp = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
            var text  = label + '  ·  ' + stamp;
            var html  = '';
            for (var i = 0; i < 120; i++) {
                html += '<span>' + text + '</span>';
            }
            wm.innerHTML = html;
        })();

        /* ════════════════════════════════════════════════════════════
           11. IFRAME BUST — prevent embedding in iframes
               (clickjacking protection)
        ════════════════════════════════════════════════════════════ */
        if (window.top !== window.self) {
            try { window.top.location = window.self.location; } catch (_) {}
            document.body.style.display = 'none';
        }

        /* ════════════════════════════════════════════════════════════
           12. MUTATION OBSERVER — re-apply user-select if removed
               Prevents someone injecting <style> to re-enable selection
        ════════════════════════════════════════════════════════════ */
        (function () {
            var mo = new MutationObserver(function (mutations) {
                mutations.forEach(function (m) {
                    m.addedNodes.forEach(function (node) {
                        // Remove injected <style> or <link> that could override our CSS
                        if (node.tagName === 'STYLE' && node.id !== '__sec-css') {
                            var text = (node.textContent || '').toLowerCase();
                            if (text.includes('user-select') && text.includes('text')) {
                                node.textContent = '';
                            }
                        }
                    });
                });
            });
            mo.observe(document.head, { childList: true, subtree: false });
        })();

    })();
