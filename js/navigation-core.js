            'use strict';
            // ════════════════════════════════════════════════════════
            // PAGE NAVIGATION
            // ════════════════════════════════════════════════════════
            const PAGES = {
                main: { el: 'page-main', title: 'Dashboard', bc: 'Dashboard', nb: 0 },
                al: { el: 'page-al', title: 'Assignment Logic', bc: 'Assignment Logic', nb: 1 },
                att: { el: 'page-att', title: 'Attendance Dashboard', bc: 'Attendance', nb: 2 },
                reg: { el: 'page-reg', title: 'Registration Checker', bc: 'Reg Checker', nb: 3 },
                diff: { el: 'page-diff', title: 'Score Diff', bc: 'Score Diff', nb: 4 },
                sc: { el: 'page-sc', title: 'Score Cross Check', bc: 'Score Cross Check', nb: 5 },
                cand: { el: 'page-df', title: 'Candidates Export', bc: 'Candidates', nb: 7 },
                df: { el: 'page-df', title: 'Data Filter', bc: 'Data Filter', nb: 8 },
            };
            const PAGES_EXTRA = {
            };
            // Merge into PAGES
            Object.assign(PAGES, PAGES_EXTRA);
            let currentPage = 'main';

            function showPage(name) {
                Object.values(PAGES).forEach(p => { const el = document.getElementById(p.el); if (el) el.classList.remove('active'); });
                const p = PAGES[name];
                if (!p) return;
                const el = document.getElementById(p.el);
                if (el) el.classList.add('active');
                // Hide PSO section when navigating away from main (or to main without prescoring)
                const psoSec = document.getElementById('pso-section');
                if (psoSec) psoSec.style.display = 'none';
                document.getElementById('page-title').textContent = p.title;
                document.getElementById('bc-active').textContent = p.bc;
                // Update active nav button
                document.querySelectorAll('.nb').forEach((nb, i) => nb.classList.toggle('active', i === p.nb));
                currentPage = name;
                window.scrollTo(0, 0);
                if (name === 'sc') setTimeout(scOnShow, 0);
                if (name === 'cand') setTimeout(() => DF.loadDefaultCandidates(), 0);
                if (name === 'df') setTimeout(() => DF.setMode('default'), 0);
            }

            // ════════════════════════════════════════════════════════
            // SIDEBAR + THEME TOGGLE
            // ════════════════════════════════════════════════════════
            const $ = id => document.getElementById(id);
            function toggleSb() {
                $('sidebar').classList.toggle('collapsed');
            }
            function toggleTheme() {
                // AdminLTE is light-only, but we can toggle the body bg slightly
                const btn = $('thLbl');
                // For AdminLTE style we just show a note
                toast('AdminLTE theme is light mode only', 'i');
            }

            // Show Pre-Scoring section inside main dashboard
            function showPsoPage() {
                // Switch to main page
                Object.values(PAGES).forEach(p => { const el = document.getElementById(p.el); if (el) el.classList.remove('active'); });
                const mainEl = document.getElementById('page-main');
                if (mainEl) mainEl.classList.add('active');
                // Update breadcrumb
                document.getElementById('page-title').textContent = 'Manual/Programming Dashboard';
                document.getElementById('bc-active').textContent = 'Manual/Programming';
                // Highlight nav button
                document.querySelectorAll('.nb').forEach((nb, i) => nb.classList.toggle('active', i === 0));
                currentPage = 'prescoring';
                // Show PSO section, scroll to it
                const sec = document.getElementById('pso-section');
                if (sec) { sec.style.display = 'block'; setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }
                window.scrollTo(0, 0);
            }
            // Hide PSO section when navigating away
            function psoToggle(forceOpen) {
                const sec = document.getElementById('pso-section');
                if (!sec) return;
                sec.style.display = forceOpen ? 'block' : 'none';
            }

            function goto(id) { $(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            function toast(msg, t = 'i', dur = 3500) {
                const ic = { s: 'bi-check-circle-fill', e: 'bi-x-circle-fill', w: 'bi-exclamation-triangle-fill', i: 'bi-info-circle-fill' };
                const cl = { s: 'var(--green)', e: 'var(--red)', w: 'var(--yellow)', i: 'var(--blue)' };
                const el = document.createElement('div'); el.className = `toast-i ${t}`;
                el.innerHTML = `<i class="bi ${ic[t]}" style="color:${cl[t]};font-size:14px"></i><span>${msg}</span>`;
                $('toasts').appendChild(el); setTimeout(() => el.remove(), dur);
            }
            function showOv(t, m, p = 0, s = '') { $('ov').classList.add('show'); $('ovT').textContent = t; $('ovM').textContent = m; $('ovP').style.width = p + '%'; $('ovS').textContent = s; }
            function pOv(p, m, s = '') { $('ovP').style.width = p + '%'; if (m) $('ovM').textContent = m; $('ovS').textContent = s; }
            function hideOv() { $('ov').classList.remove('show'); }
            function dov(e) { e.preventDefault(); $('uz').classList.add('drag'); }
            function dlv() { $('uz').classList.remove('drag'); }
            const delay = ms => new Promise(r => setTimeout(r, ms));
            function startMemMonitor() {
                if (!performance.memory) return;
                $('mem-badge').style.display = 'inline';
                setInterval(() => {
                    const mb = Math.round(performance.memory.usedJSHeapSize / 1048576);
                    $('mem-badge').textContent = `RAM: ${mb}MB`;
                }, 2000);
            }
            function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
