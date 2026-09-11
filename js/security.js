    (function () {
        'use strict';

        /* ════════════════════════════════════════════════════════════
           1. KEYBOARD SHORTCUT BLOCKING
           Ctrl/Cmd + U C P V I S A  |  F12  |  Ctrl+Shift+I/J/C/K
        ════════════════════════════════════════════════════════════ */
        const CTRL_BLOCKED = new Set(['u','p','i','s','j','k']);

        function isFormField(target) {
            if (!target) return false;
            const tag = target.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
        }

        document.addEventListener('keydown', function (e) {
            const ctrl = e.ctrlKey || e.metaKey;

            // Always allow normal editing shortcuts inside fields.
            if (ctrl && !e.shiftKey && !e.altKey && isFormField(e.target) && ['a','c','v','x'].includes(e.key.toLowerCase())) {
                return;
            }

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
                if (isFormField(e.target)) return;
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
           6. DEVTOOLS NOTE
              Do not suppress console output or run debugger traps. Those
              patterns break legitimate support and are trivial to bypass.
              Access control belongs in Firebase/Supabase policy, while this
              file keeps only low-friction UI deterrents.
        ════════════════════════════════════════════════════════════ */
        window.addEventListener('tool-auth-ready', function (ev) {
            const role = ev.detail && ev.detail.role;
            if (role === 'admin' || role === 'super_admin') {
                console.info('[security] Admin diagnostics enabled.');
            }
        });
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
