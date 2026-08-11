            // ═══════════════════════════════════════════════════════════════
            // SCORE CROSS CHECK
            // ═══════════════════════════════════════════════════════════════
            let _scSheetData = null;
            let _scSheetIndex = null;
            let _scAllResults = [];
            let _scFiltered = [];
            let _scColFilters = {};
            let _scStatusFilter = 'all';
            let _scGlobalSearch = '';
            let _scCommonACols = [];
            let _scHasOut25 = false;
            let _scCourseAll = [];
            let _scCourseSelected = new Set();
            const SC_PAGE = 100;
            let _scPage = 1;

            // --- Backend (Supabase, shared with Count dashboard) ---
            const SC_SUPABASE_URL = 'https://oiebamupeucekvcfscpj.supabase.co';
            const SC_SUPABASE_KEY = 'sb_publishable_w_l-WFz9E-IrPoQwGqodZw_Zsx929gv';
            const SC_SAVE_ROW_LIMIT = 20000; // above this, only the run summary is saved, not row detail
            let _scUserRole = 'viewer';
            let _scLastFileNames = { dump: '', sheet: '' };
            window.addEventListener('tool-auth-ready', ev => {
                _scUserRole = (ev.detail && ev.detail.role) || 'viewer';
                scUpdateSaveBtn();
            });

            async function scSupabaseFetch(path, options = {}) {
                const response = await fetch(`${SC_SUPABASE_URL}${path}`, {
                    ...options,
                    headers: {
                        apikey: SC_SUPABASE_KEY,
                        Authorization: `Bearer ${SC_SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        ...(options.headers || {})
                    }
                });
                if (!response.ok) throw new Error((await response.text()) || response.statusText);
                return response.status === 204 ? null : response.json();
            }

            function scOnShow() {
                scUpdateDumpBox();
                if (store) scBuildCourses();
                scCheckRunReady();
            }

            function scUpdateDumpBox() {
                const box = $('sc-dump-box');
                if (!box) return;
                if (store) {
                    box.classList.add('loaded');
                    $('sc-dump-ico').innerHTML = '<i class="bi bi-database-fill"></i>';
                    $('sc-dump-ico').style.color = 'var(--green)';
                    $('sc-dump-t').textContent = '✓ Assignment dump loaded';
                    $('sc-dump-sub').textContent = `${store.rowCount.toLocaleString()} rows · ${origCols.length} cols`;
                } else {
                    box.classList.remove('loaded');
                    $('sc-dump-ico').innerHTML = '<i class="bi bi-database"></i>';
                    $('sc-dump-ico').style.color = '#ccc';
                    $('sc-dump-t').textContent = 'Load assignment dump first';
                    $('sc-dump-sub').textContent = 'Use the Dashboard upload to load the score file';
                }
            }

            function scBuildCourses() {
                if (!store) return;
                if (!storeIndex) storeIndex = buildStoreIndex();
                _scCourseAll = storeIndex ? storeIndex.courseList.slice() : [];
                _scCourseSelected = new Set(_scCourseAll);
                scRenderCourseList();
                $('sc-course-panel').style.display = 'block';
                scUpdateCourseLabel();
            }

            function scRenderCourseList(filter) {
                const list = $('sc-course-list');
                if (!list) return;
                const fl = (filter || '').toLowerCase();
                const items = _scCourseAll.map((c, i) => ({ c, i })).filter(({ c }) => !fl || c.toLowerCase().includes(fl));
                list.innerHTML = items.map(({ c, i }) => `
          <label style="display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;font-size:12px">
            <input type="checkbox" style="cursor:pointer" ${_scCourseSelected.has(c) ? 'checked' : ''}
              onchange="scToggleCourse(${i})">
            <span style="font-family:var(--mono);font-size:11px">${escHtml2(c)}</span>
          </label>`).join('');
                if ($('sc-course-count')) $('sc-course-count').textContent = `${_scCourseSelected.size} / ${_scCourseAll.length} selected`;
            }

            function scToggleCourse(idx) {
                const c = _scCourseAll[idx];
                if (!c) return;
                if (_scCourseSelected.has(c)) _scCourseSelected.delete(c);
                else _scCourseSelected.add(c);
                scUpdateCourseLabel();
                if ($('sc-course-count')) $('sc-course-count').textContent = `${_scCourseSelected.size} / ${_scCourseAll.length} selected`;
            }

            function scFilterCourseList() { scRenderCourseList(($('sc-course-search') || {}).value); }

            function scCourseSelectAll() {
                _scCourseSelected = new Set(_scCourseAll);
                scRenderCourseList(($('sc-course-search') || {}).value);
                scUpdateCourseLabel();
                if ($('sc-course-count')) $('sc-course-count').textContent = `${_scCourseSelected.size} / ${_scCourseAll.length} selected`;
            }

            function scCourseSelectNone() {
                _scCourseSelected.clear();
                scRenderCourseList(($('sc-course-search') || {}).value);
                scUpdateCourseLabel();
                if ($('sc-course-count')) $('sc-course-count').textContent = `0 / ${_scCourseAll.length} selected`;
            }

            function scUpdateCourseLabel() {
                const lbl = $('sc-course-label');
                if (!lbl) return;
                if (_scCourseSelected.size === 0) lbl.textContent = '— No courses selected —';
                else if (_scCourseSelected.size === _scCourseAll.length) lbl.textContent = '— All Courses —';
                else lbl.textContent = `${_scCourseSelected.size} course(s) selected`;
            }

            function scToggleCourseDropdown() {
                const dd = $('sc-course-dd'), ch = $('sc-course-chevron');
                if (!dd) return;
                const open = dd.style.display !== 'none';
                dd.style.display = open ? 'none' : 'block';
                if (ch) ch.style.transform = open ? '' : 'rotate(180deg)';
            }

            function scSheetDrop(ev) {
                ev.preventDefault();
                $('sc-sheet-uz').classList.remove('drag');
                const f = ev.dataTransfer.files[0];
                if (f) scLoadSheet(f);
            }

            async function scLoadSheet(file) {
                if (!file) return;
                try {
                    showOv('Parsing score sheet…');
                    await delay(10);
                    _scSheetData = await parseFile(file);
                    _scSheetIndex = buildKeyedRowIndex(_scSheetData.rows, _scSheetData.cols);
                    $('sc-sheet-uz').classList.add('loaded');
                    $('sc-sheet-t').textContent = `✓ ${file.name}`;
                    $('sc-sheet-fn').textContent = `${_scSheetData.rows.length.toLocaleString()} rows · ${_scSheetData.cols.length} cols`;
                    hideOv();
                    toast(`Score sheet loaded: ${_scSheetData.rows.length.toLocaleString()} rows`, 's');
                    scCheckRunReady();
                } catch (e) { hideOv(); toast('Error loading sheet: ' + e.message, 'e'); }
            }

            function scCheckRunReady() {
                const btn = $('sc-run-btn'), hint = $('sc-run-hint');
                if (!btn) return;
                if (store && _scSheetData) {
                    btn.disabled = false;
                    hint.textContent = 'Both files ready — click Run Cross Check';
                } else {
                    btn.disabled = true;
                    hint.textContent = !store ? 'Load assignment dump on Dashboard first' : 'Upload a score sheet to enable';
                }
            }

            async function scRunCheck() {
                if (!store || !_scSheetData) { toast('Load both files first', 'w'); return; }
                if (_scCourseSelected.size === 0) { toast('Select at least one course', 'w'); return; }
                const btn = $('sc-run-btn');
                btn.disabled = true;
                btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Checking…';
                try {
                    showOv('Running cross-check…');
                    await delay(20);
                    if (!storeIndex) storeIndex = buildStoreIndex();
                    if (!_scSheetIndex && _scSheetData) _scSheetIndex = buildKeyedRowIndex(_scSheetData.rows, _scSheetData.cols);

                    const dEmailCol = (storeIndex && storeIndex.emailCol) || findEmailCol(origCols) || 'EmailId';
                    const dCourseCol = (storeIndex && storeIndex.courseCol) || findCourseCol(origCols) || 'new_courseid';
                    const dAsnCols = getAsnCols(origCols);
                    const dOut25Col = origCols.find(c => /out_of_25/i.test(c));

                    const sCols = _scSheetData.cols;
                    const sEmailCol = (_scSheetIndex && _scSheetIndex.emailCol) || findEmailCol(sCols) || sCols[0];
                    const sCourseCol = (_scSheetIndex && _scSheetIndex.courseCol) || findCourseCol(sCols);
                    const sAsnCols = getAsnCols(sCols);
                    const sOut25Col = sCols.find(c => /out_of_25|out25/i.test(c));

                    _scHasOut25 = !!sOut25Col;
                    _scCommonACols = dAsnCols.filter(c => sAsnCols.includes(c));
                    const useSheetCourse = !!sCourseCol;

                    pOv(10, 'Building sheet index…');
                    await delay(10);

                    const sheetMap = _scSheetIndex ? _scSheetIndex.keyToRow : new Map();

                    pOv(20, 'Scanning dump rows…');
                    await delay(10);

                    const results = [];
                    const CHUNK = 20000;
                    const seenKeys = new Set();
                    let dumpRows = null;
                    if (storeIndex && _scCourseSelected.size > 0 && _scCourseSelected.size < storeIndex.courseList.length) {
                        dumpRows = [];
                        _scCourseSelected.forEach(courseId => {
                            const bucket = storeIndex.courseRows.get(courseId);
                            if (bucket) for (let i = 0; i < bucket.length; i++) dumpRows.push(bucket[i]);
                        });
                    }
                    const dumpTotal = dumpRows ? dumpRows.length : store.rowCount;

                    for (let pos = 0; pos < dumpTotal; pos++) {
                        if (pos > 0 && pos % CHUNK === 0) {
                            pOv(20 + Math.round(60 * pos / dumpTotal), `Row ${pos.toLocaleString()} / ${dumpTotal.toLocaleString()}…`);
                            await delay(0);
                        }
                        const i = dumpRows ? dumpRows[pos] : pos;
                        const course = getStr(dCourseCol, i);
                        if (!dumpRows && !_scCourseSelected.has(course)) continue;
                        const email = getStr(dEmailCol, i);
                        const emailL = normKey(email);
                        const key = useSheetCourse ? `${emailL}|${normKey(course)}` : emailL;
                        const sRow = sheetMap.get(key);
                        if (!sRow) {
                            results.push({ _status: 'miss_sheet', _email: email, _course: course, _dVals: {}, _sVals: {} });
                            continue;
                        }
                        seenKeys.add(key);
                        const dVals = {}, sVals = {};
                        let allMatch = true;
                        for (const ac of _scCommonACols) {
                            const dv = getNum(ac, i);
                            const svRaw = sRow[ac];
                            const sv = (svRaw === '' || svRaw == null) ? NaN : parseFloat(svRaw);
                            dVals[ac] = isNaN(dv) ? '' : dv;
                            sVals[ac] = isNaN(sv) ? '' : sv;
                            // blank and 0 are treated as equal — only flag diff on actual numeric mismatch
                            const dvN = isNaN(dv) ? 0 : dv;
                            const svN = isNaN(sv) ? 0 : sv;
                            if (Math.abs(dvN - svN) > 0.011) allMatch = false;
                        }
                        if (_scHasOut25) {
                            const dv = dOut25Col ? getNum(dOut25Col, i) : NaN;
                            const svRaw = sRow[sOut25Col];
                            const sv = (svRaw === '' || svRaw == null) ? NaN : parseFloat(svRaw);
                            dVals['_out25'] = isNaN(dv) ? '' : dv;
                            sVals['_out25'] = isNaN(sv) ? '' : sv;
                            const dvN = isNaN(dv) ? 0 : dv;
                            const svN = isNaN(sv) ? 0 : sv;
                            if (Math.abs(dvN - svN) > 0.011) allMatch = false;
                        }
                        results.push({ _status: allMatch ? 'match' : 'diff', _email: email, _course: course, _dVals: dVals, _sVals: sVals });
                    }

                    pOv(83, 'Collecting sheet-only rows…');
                    await delay(0);

                    for (let i = 0; i < _scSheetData.rows.length; i++) {
                        const row = _scSheetData.rows[i];
                        const email = normCell(row[sEmailCol]);
                        if (!email) continue;
                        const course = useSheetCourse ? normCell(row[sCourseCol]) : '';
                        const key = useSheetCourse ? `${email.toLowerCase()}|${course.toLowerCase()}` : email.toLowerCase();
                        if (seenKeys.has(key)) continue;
                        if (useSheetCourse && !_scCourseSelected.has(course)) continue;
                        const sVals = {};
                        for (const ac of _scCommonACols) {
                            const sv2 = (row[ac] === '' || row[ac] == null) ? NaN : parseFloat(row[ac]);
                            sVals[ac] = isNaN(sv2) ? '' : sv2;
                        }
                        if (_scHasOut25) {
                            const sv2 = (row[sOut25Col] === '' || row[sOut25Col] == null) ? NaN : parseFloat(row[sOut25Col]);
                            sVals['_out25'] = isNaN(sv2) ? '' : sv2;
                        }
                        results.push({ _status: 'miss_dump', _email: email, _course: course, _dVals: {}, _sVals: sVals });
                    }

                    pOv(93, 'Rendering results…');
                    await delay(10);

                    _scAllResults = results;
                    _scFiltered = results;
                    _scStatusFilter = 'all';
                    _scGlobalSearch = '';
                    _scColFilters = {};
                    _scPage = 1;
                    if ($('sc-global-search')) $('sc-global-search').value = '';

                    scRenderSummary();
                    scRenderTable();
                    $('sc-results').style.display = 'block';
                    scUpdateSaveBtn();

                    pOv(100, 'Done!');
                    await delay(250); hideOv();
                    const cnt = results.reduce((a, r) => { a[r._status] = (a[r._status] || 0) + 1; return a; }, {});
                    toast(`Done: ${cnt.match || 0} match · ${cnt.diff || 0} diff · ${cnt.miss_sheet || 0} miss-sheet · ${cnt.miss_dump || 0} miss-dump`, 's', 6000);
                } catch (e) {
                    hideOv(); toast('Error: ' + e.message, 'e', 8000); console.error(e);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-play-circle-fill"></i> Run Cross Check';
                }
            }

            function scRenderSummary() {
                const cnt = _scAllResults.reduce((a, r) => { a[r._status] = (a[r._status] || 0) + 1; return a; }, {});
                const total = _scAllResults.length;
                const defs = [
                    { k: 'all', label: 'Total', val: total, color: 'var(--blue)' },
                    { k: 'match', label: 'Match', val: cnt.match || 0, color: 'var(--green)' },
                    { k: 'diff', label: 'Diff', val: cnt.diff || 0, color: 'var(--red)' },
                    { k: 'miss_sheet', label: 'Missing in Sheet', val: cnt.miss_sheet || 0, color: '#c77a00' },
                    { k: 'miss_dump', label: 'Missing in Dump', val: cnt.miss_dump || 0, color: 'var(--purple)' },
                ];
                $('sc-sum-row').innerHTML = defs.map(d => `
          <div class="sc-sum-card${_scStatusFilter === d.k ? ' sc-sum-active' : ''}" onclick="scSetStatus('${d.k}')" title="Click to filter by ${d.label}">
            <div class="sc-sum-val" style="color:${d.color}">${d.val.toLocaleString()}</div>
            <div class="sc-sum-lbl">${d.label}</div>
          </div>`).join('');
            }

            function scSetStatus(k) { _scStatusFilter = k; _scPage = 1; scApplyFilters(); }

            function scApplyFilters() {
                const gs = ($('sc-global-search') ? $('sc-global-search').value : '').toLowerCase();
                _scGlobalSearch = gs;
                let rows = _scAllResults;
                if (_scStatusFilter !== 'all') rows = rows.filter(r => r._status === _scStatusFilter);
                if (gs) rows = rows.filter(r => {
                    if (r._email.toLowerCase().includes(gs) || r._course.toLowerCase().includes(gs) || r._status.includes(gs)) return true;
                    for (const ac of _scCommonACols) {
                        if (String(r._dVals[ac] ?? '').includes(gs) || String(r._sVals[ac] ?? '').includes(gs)) return true;
                    }
                    return false;
                });
                for (const [col, fv] of Object.entries(_scColFilters)) {
                    if (!fv) continue;
                    const fl = fv.toLowerCase();
                    if (col === '_status') rows = rows.filter(r => r._status.includes(fl));
                    else if (col === '_email') rows = rows.filter(r => r._email.toLowerCase().includes(fl));
                    else if (col === '_course') rows = rows.filter(r => r._course.toLowerCase().includes(fl));
                    else if (col.endsWith('_D')) { const ac = col.slice(0, -2); rows = rows.filter(r => String(r._dVals[ac] ?? '').includes(fl)); }
                    else if (col.endsWith('_S')) { const ac = col.slice(0, -2); rows = rows.filter(r => String(r._sVals[ac] ?? '').includes(fl)); }
                }
                _scFiltered = rows;
                const mp = Math.max(1, Math.ceil(_scFiltered.length / SC_PAGE));
                if (_scPage > mp) _scPage = mp;
                scRenderSummary();
                scRenderTable();
            }

            function scBuildCols() {
                const cols = ['_status', '_email', '_course'];
                const labels = { _status: 'Status', _email: 'EmailId', _course: 'CourseId' };
                for (const ac of _scCommonACols) {
                    cols.push(`${ac}_D`, `${ac}_S`);
                    labels[`${ac}_D`] = `${ac} Dump`;
                    labels[`${ac}_S`] = `${ac} Sheet`;
                }
                if (_scHasOut25) {
                    cols.push('_out25_D', '_out25_S');
                    labels['_out25_D'] = 'Out25 Dump';
                    labels['_out25_S'] = 'Out25 Sheet';
                }
                return { cols, labels };
            }

            function scFmtNum(v) {
                if (v === '' || v == null) return '';
                const n = parseFloat(v);
                return isNaN(n) ? String(v) : n.toFixed(2);
            }

            function scCellCls(r, col) {
                if (r._status === 'miss_sheet' || r._status === 'miss_dump') return '';
                const ac = col.slice(0, -2);
                const dv = parseFloat(r._dVals[ac]);
                const sv = parseFloat(r._sVals[ac]);
                const dvB = isNaN(dv), svB = isNaN(sv);
                if (dvB && svB) return 'sc-match';
                if (dvB !== svB) return 'sc-diff';
                return Math.abs(dv - sv) <= 0.011 ? 'sc-match' : 'sc-diff';
            }

            const SC_STATUS_HTML = {
                match: '<span class="sc-pill sc-pill-match">Match</span>',
                diff: '<span class="sc-pill sc-pill-diff">Diff</span>',
                miss_sheet: '<span class="sc-pill sc-pill-miss">Miss Sheet</span>',
                miss_dump: '<span class="sc-pill sc-pill-dump">Miss Dump</span>',
            };

            function scRenderTable() {
                const { cols, labels } = scBuildCols();
                const thead = $('sc-thead'), tbody = $('sc-tbody'), pager = $('sc-pager'), lbl = $('sc-result-label');
                if (!thead) return;
                thead.innerHTML = '<tr>' + cols.map(c => `<th>
          <div style="font-weight:700;margin-bottom:3px;font-size:11px">${escHtml2(labels[c])}</div>
          <input class="sc-col-flt" placeholder="Filter…" value="${escHtml2(_scColFilters[c] || '')}"
            oninput="scColFilter('${c}',this.value)" onclick="event.stopPropagation()">
          </th>`).join('') + '</tr>';
                const start = (_scPage - 1) * SC_PAGE;
                const pageRows = _scFiltered.slice(start, start + SC_PAGE);
                tbody.innerHTML = pageRows.map(r => '<tr>' + cols.map(c => {
                    if (c === '_status') return `<td style="text-align:center;white-space:nowrap">${SC_STATUS_HTML[r._status] || r._status}</td>`;
                    if (c === '_email') return `<td style="font-size:11px">${escHtml2(r._email)}</td>`;
                    if (c === '_course') return `<td style="font-family:var(--mono);font-size:11px">${escHtml2(r._course)}</td>`;
                    if (c.endsWith('_D') || c.endsWith('_S')) {
                        const cls = scCellCls(r, c);
                        const map = c.endsWith('_D') ? r._dVals : r._sVals;
                        return `<td class="${cls}" style="font-family:var(--mono);text-align:right;font-size:11px">${escHtml2(scFmtNum(map[c.slice(0, -2)]))}</td>`;
                    }
                    return '<td></td>';
                }).join('') + '</tr>').join('');
                const total = _scFiltered.length;
                const maxPage = Math.max(1, Math.ceil(total / SC_PAGE));
                if (lbl) lbl.textContent = `Showing ${total === 0 ? 0 : start + 1}–${Math.min(start + SC_PAGE, total)} of ${total.toLocaleString()} rows`;
                const btns = [];
                btns.push(`<button ${_scPage <= 1 ? 'disabled' : ''} onclick="scGoPage(${_scPage - 1})">‹ Prev</button>`);
                scPageRange(_scPage, maxPage).forEach(p => {
                    if (p === '…') btns.push('<span style="padding:3px 6px;color:var(--text3)">…</span>');
                    else btns.push(`<button class="${p === _scPage ? 'sc-pg-active' : ''}" onclick="scGoPage(${p})">${p}</button>`);
                });
                btns.push(`<button ${_scPage >= maxPage ? 'disabled' : ''} onclick="scGoPage(${_scPage + 1})">Next ›</button>`);
                btns.push(`<span style="font-size:11px;color:var(--text2);margin-left:6px">Page ${_scPage}/${maxPage}</span>`);
                if (pager) pager.innerHTML = btns.join('');
            }

            function scPageRange(cur, max) {
                if (max <= 7) return Array.from({ length: max }, (_, i) => i + 1);
                const r = [1];
                if (cur > 3) r.push('…');
                for (let p = Math.max(2, cur - 1); p <= Math.min(max - 1, cur + 1); p++) r.push(p);
                if (cur < max - 2) r.push('…');
                r.push(max);
                return r;
            }

            function scGoPage(p) { _scPage = p; scRenderTable(); }

            function scColFilter(col, val) { _scColFilters[col] = val; _scPage = 1; scApplyFilters(); }

            function scGetExportData() {
                const { cols, labels } = scBuildCols();
                const headers = cols.map(c => labels[c]);
                const rows = _scFiltered.map(r => cols.map(c => {
                    if (c === '_status') return r._status;
                    if (c === '_email') return r._email;
                    if (c === '_course') return r._course;
                    if (c.endsWith('_D') || c.endsWith('_S')) {
                        const map = c.endsWith('_D') ? r._dVals : r._sVals;
                        return map[c.slice(0, -2)] ?? '';
                    }
                    return '';
                }));
                return [headers, ...rows];
            }

            function scCopy() {
                const text = scGetExportData().map(row => row.join('\t')).join('\n');
                navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard', 's')).catch(() => toast('Copy failed', 'w'));
            }

            function scExport(fmt) {
                const data = scGetExportData();
                if (fmt === 'csv') {
                    const csv = data.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
                    dlBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'sc_crosscheck.csv');
                } else {
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Cross Check');
                    XLSX.writeFile(wb, 'sc_crosscheck.xlsx');
                }
            }

            // ═══════════════════════════════════════════════════════════════
            // SCORE CROSS CHECK — BACKEND (saved runs)
            // Nothing changes about the normal flow above — run stays fully
            // local/client-side as before. This only adds an explicit
            // "Save to Backend" button (Admin/Super Admin only) so a run can
            // be persisted on demand, and a Saved Runs panel to reload past
            // ones without re-uploading both files.
            // ═══════════════════════════════════════════════════════════════
            function scUpdateSaveBtn() {
                const btn = $('sc-save-btn');
                if (!btn) return;
                const canSave = _scUserRole === 'admin' || _scUserRole === 'super_admin';
                btn.style.display = canSave ? '' : 'none';
                btn.disabled = !_scAllResults.length;
            }

            async function scSaveRun() {
                if (_scUserRole !== 'admin' && _scUserRole !== 'super_admin') return;
                if (!_scAllResults.length) { toast('Run a cross-check first', 'w'); return; }
                const btn = $('sc-save-btn');
                if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving…'; }
                try {
                    const cnt = _scAllResults.reduce((a, r) => { a[r._status] = (a[r._status] || 0) + 1; return a; }, {});
                    const auth = (window.firebase && firebase.auth && firebase.auth().currentUser) || null;
                    const runRow = {
                        run_by_email: auth ? auth.email : null,
                        dump_file_name: ($('sc-dump-sub') || {}).textContent || 'Assignment dump',
                        sheet_file_name: ($('sc-sheet-t') || {}).textContent || 'Score sheet',
                        courses: Array.from(_scCourseSelected),
                        common_cols: _scCommonACols,
                        has_out25: _scHasOut25,
                        total_count: _scAllResults.length,
                        match_count: cnt.match || 0,
                        diff_count: cnt.diff || 0,
                        miss_sheet_count: cnt.miss_sheet || 0,
                        miss_dump_count: cnt.miss_dump || 0
                    };
                    let inserted;
                    try {
                        inserted = await scSupabaseFetch('/rest/v1/score_check_runs', {
                            method: 'POST',
                            headers: { Prefer: 'return=representation' },
                            body: JSON.stringify([runRow])
                        });
                    } catch (err) {
                        toast('Could not save run to backend: ' + err.message, 'w', 5000);
                        return;
                    }
                    const runId = inserted && inserted[0] && inserted[0].id;
                    if (!runId) return;
                    if (_scAllResults.length > SC_SAVE_ROW_LIMIT) {
                        toast(`Run summary saved. Row detail skipped (${_scAllResults.length.toLocaleString()} rows > ${SC_SAVE_ROW_LIMIT.toLocaleString()} limit).`, 'w', 6000);
                        return;
                    }
                    const CHUNK = 500;
                    try {
                        for (let start = 0; start < _scAllResults.length; start += CHUNK) {
                            const chunk = _scAllResults.slice(start, start + CHUNK).map(r => ({
                                run_id: runId,
                                status: r._status,
                                email: r._email,
                                course: r._course,
                                d_vals: r._dVals,
                                s_vals: r._sVals
                            }));
                            await scSupabaseFetch('/rest/v1/score_check_results', {
                                method: 'POST',
                                headers: { Prefer: 'return=minimal' },
                                body: JSON.stringify(chunk)
                            });
                        }
                        toast('Run saved to backend.', 's', 3000);
                        _scSavedRunsLoaded = false;
                    } catch (err) {
                        toast('Run summary saved, but row detail failed: ' + err.message, 'w', 6000);
                    }
                } finally {
                    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill"></i> Save to Backend'; }
                }
            }

            let _scSavedRunsLoaded = false;
            function scToggleSavedRuns() {
                const panel = $('sc-saved-panel');
                if (!panel) return;
                const opening = panel.style.display === 'none';
                panel.style.display = opening ? 'block' : 'none';
                if (opening && !_scSavedRunsLoaded) scLoadSavedRuns();
            }

            async function scLoadSavedRuns() {
                const list = $('sc-saved-list');
                if (!list) return;
                list.textContent = 'Loading…';
                try {
                    const runs = await scSupabaseFetch('/rest/v1/score_check_runs?select=id,run_at,run_by_email,dump_file_name,sheet_file_name,total_count,match_count,diff_count,miss_sheet_count,miss_dump_count&order=run_at.desc&limit=50');
                    _scSavedRunsLoaded = true;
                    if (!runs.length) { list.innerHTML = '<div style="color:var(--text3);padding:8px 0">No saved runs yet.</div>'; return; }
                    list.innerHTML = `<div style="max-height:260px;overflow-y:auto"><table style="width:100%;font-size:11px">
            <thead><tr><th style="text-align:left">When</th><th style="text-align:left">By</th><th class="num">Total</th><th class="num">Match</th><th class="num">Diff</th><th class="num">Miss</th><th></th></tr></thead>
            <tbody>${runs.map(r => `
              <tr>
                <td>${new Date(r.run_at).toLocaleString()}</td>
                <td>${escHtml2(r.run_by_email || '-')}</td>
                <td class="num">${(r.total_count || 0).toLocaleString()}</td>
                <td class="num">${(r.match_count || 0).toLocaleString()}</td>
                <td class="num">${(r.diff_count || 0).toLocaleString()}</td>
                <td class="num">${((r.miss_sheet_count || 0) + (r.miss_dump_count || 0)).toLocaleString()}</td>
                <td><button class="btn btn-xs btn-default" style="font-size:11px;padding:2px 8px" onclick="scLoadRunDetail('${r.id}')">Load</button></td>
              </tr>`).join('')}</tbody>
          </table></div>`;
                } catch (err) {
                    list.innerHTML = `<div style="color:var(--text3);padding:8px 0">Could not load saved runs: ${escHtml2(err.message || String(err))}</div>`;
                }
            }

            async function scLoadRunDetail(runId) {
                try {
                    showOv('Loading saved run…');
                    await delay(10);
                    const [[run], rows] = await Promise.all([
                        scSupabaseFetch(`/rest/v1/score_check_runs?select=*&id=eq.${encodeURIComponent(runId)}`),
                        scSupabaseFetch(`/rest/v1/score_check_results?select=status,email,course,d_vals,s_vals&run_id=eq.${encodeURIComponent(runId)}&limit=100000`)
                    ]);
                    hideOv();
                    if (!run) { toast('Saved run not found', 'w'); return; }
                    _scCommonACols = run.common_cols || [];
                    _scHasOut25 = !!run.has_out25;
                    _scAllResults = rows.map(r => ({ _status: r.status, _email: r.email, _course: r.course, _dVals: r.d_vals || {}, _sVals: r.s_vals || {} }));
                    _scFiltered = _scAllResults;
                    _scStatusFilter = 'all';
                    _scGlobalSearch = '';
                    _scColFilters = {};
                    _scPage = 1;
                    if (!_scAllResults.length) {
                        toast('This run only has a summary saved (row detail was skipped for size).', 'w', 6000);
                    }
                    scRenderSummary();
                    scRenderTable();
                    $('sc-results').style.display = 'block';
                    if ($('sc-save-btn')) $('sc-save-btn').style.display = 'none'; // already saved
                    $('sc-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
                    toast(`Loaded saved run from ${new Date(run.run_at).toLocaleString()}`, 's');
                } catch (err) {
                    hideOv();
                    toast('Could not load run: ' + (err.message || String(err)), 'e', 6000);
                }
            }

