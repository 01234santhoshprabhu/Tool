            // ═══════════════════════════════════════════════════════════════
            // ATTENDANCE DASHBOARD
            // ═══════════════════════════════════════════════════════════════
            // ═══════════════════════════════════════════════════════════════
            // ATTENDANCE DASHBOARD — Optimized for 1 Crore+ rows
            // NO charts. Action + Category pill filters. Summary tables only.
            // ═══════════════════════════════════════════════════════════════
            let attRawRows = [], attRawCols = [], attFilteredRows = [];
            let attSelActions = new Set(), attSelCats = new Set();
            let attPivotData = null, attFilterToken = 0, attMeta = null;

            function buildAttendanceMeta(rows, cols) {
                const fc = n => cols.find(c => c.toLowerCase().replace(/[_\s]/g, '') === n) || cols.find(c => c.toLowerCase().includes(n.replace(/[_\s]/g, ''))) || '';
                const colMeta = { action: fc('action'), cat: fc('category'), course: fc('courseid') || fc('course'), email: fc('emailid') || fc('email'), date: fc('examdate') || fc('date') };
                const byAction = new Map(), byCat = new Map();
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const action = String(row[colMeta.action] || '');
                    const cat = String(row[colMeta.cat] || '');
                    if (action) {
                        if (!byAction.has(action)) byAction.set(action, []);
                        byAction.get(action).push(i);
                    }
                    if (cat) {
                        if (!byCat.has(cat)) byCat.set(cat, []);
                        byCat.get(cat).push(i);
                    }
                }
                return { cols: colMeta, byAction, byCat, actions: [...byAction.keys()].sort(), cats: [...byCat.keys()].sort() };
            }

            function attConcatBuckets(map, selected) {
                const out = [];
                selected.forEach(v => {
                    const bucket = map.get(v);
                    if (bucket) for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
                });
                return out;
            }

            function attDov(e) { e.preventDefault(); document.getElementById('att-uz').classList.add('drag'); }
            function attDlv() { document.getElementById('att-uz').classList.remove('drag'); }
            function attDrop(e) { e.preventDefault(); document.getElementById('att-uz').classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) attLoadFile(f); }

            async function attLoadFile(file) {
                if (!file) return;
                document.getElementById('att-uz-t').textContent = 'Loading\u2026';
                try {
                    showOv('Loading Attendance Data', 'Reading ' + file.name + '\u2026', 10);
                    await delay(30);
                    let rows, cols;
                    if (file.name.toLowerCase().endsWith('.csv')) {
                        const data = await new Promise((res, rej) => { Papa.parse(file, { header: true, skipEmptyLines: true, worker: true, complete: r => res(r), error: rej }); });
                        const rawCols = (data.meta.fields || []).map(c => String(c == null ? '' : c));
                        cols = sanitizeCols(rawCols);
                        rows = normalizeParsedRows(data.data, rawCols, cols);
                    } else {
                        const ab = await file.arrayBuffer();
                        const wb = XLSX.read(new Uint8Array(ab), { type: 'array' });
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        const json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
                        const rawCols = json.length ? Object.keys(json[0]) : [];
                        cols = json.length ? sanitizeCols(rawCols) : [];
                        rows = json.length ? normalizeParsedRows(json, rawCols, cols) : json;
                    }
                    pOv(70, 'Building filters\u2026'); await delay(10);
                    attRawRows = rows; attRawCols = cols;
                    attMeta = buildAttendanceMeta(rows, cols);
                    window._attCols = attMeta.cols;
                    attBuildFilterPills();
                    document.getElementById('att-uz').classList.add('loaded');
                    document.getElementById('att-uz-t').textContent = '\u2713 ' + file.name;
                    document.getElementById('att-uz-fn').textContent = rows.length.toLocaleString() + ' rows \u00b7 ' + cols.length + ' columns';
                    document.getElementById('att-filters').style.display = 'block';
                    hideOv();
                    await attApplyFilters();
                    toast('Loaded ' + rows.length.toLocaleString() + ' rows', 's');
                } catch (e) { hideOv(); document.getElementById('att-uz-t').textContent = 'Error'; toast('Error: ' + e.message, 'e', 6000); }
            }

            function attBuildFilterPills() {
                const actions = attMeta ? attMeta.actions : [];
                attSelActions = new Set(actions);
                document.getElementById('att-action-pills').innerHTML = actions.map(a => '<span class="att-filter-pill active" data-val="' + escHtml(a) + '" onclick="attTogglePill(this,\'action\')">' + escHtml(a) + '</span>').join('');
                document.getElementById('att-f-action-count').textContent = '(' + actions.length + ')';
                const cats = attMeta ? attMeta.cats : [];
                attSelCats = new Set(cats);
                document.getElementById('att-cat-pills').innerHTML = cats.map(c => '<span class="att-filter-pill active" data-val="' + escHtml(c) + '" onclick="attTogglePill(this,\'cat\')">' + escHtml(c) + '</span>').join('');
                document.getElementById('att-f-cat-count').textContent = '(' + cats.length + ')';
            }

            function attTogglePill(el, type) {
                const val = el.dataset.val;
                const active = el.classList.toggle('active');
                if (type === 'action') { if (active) attSelActions.add(val); else attSelActions.delete(val); }
                else { if (active) attSelCats.add(val); else attSelCats.delete(val); }
                attApplyFilters();
            }

            async function attApplyFilters() {
                if (!attRawRows.length) return;
                const token = ++attFilterToken;
                document.getElementById('att-loading').style.display = 'block';
                await delay(10);
                const ac = window._attCols.action, cc = window._attCols.cat;
                const allActions = attMeta ? attMeta.actions.length : 0;
                const allCats = attMeta ? attMeta.cats.length : 0;
                const actionFiltered = attMeta && attSelActions.size < allActions;
                const catFiltered = attMeta && attSelCats.size < allCats;
                let candidates = null;
                if (!actionFiltered && !catFiltered) {
                    attFilteredRows = attRawRows;
                    document.getElementById('att-loading').style.display = 'none';
                    attUpdateKPIs(); attRenderSummaryTables(); attRenderPivot();
                    return;
                }
                if (actionFiltered) candidates = attConcatBuckets(attMeta.byAction, attSelActions);
                if (catFiltered) {
                    const catCandidates = attConcatBuckets(attMeta.byCat, attSelCats);
                    if (!candidates || catCandidates.length < candidates.length) candidates = catCandidates;
                }
                const source = candidates || Array.from({ length: attRawRows.length }, (_, i) => i);
                const CHUNK = 200000; const result = [];
                for (let i = 0; i < source.length; i += CHUNK) {
                    if (attFilterToken !== token) return;
                    const end = Math.min(i + CHUNK, source.length);
                    for (let j = i; j < end; j++) {
                        const r = attRawRows[source[j]];
                        if (attSelActions.size && !attSelActions.has(String(r[ac] || ''))) continue;
                        if (attSelCats.size && !attSelCats.has(String(r[cc] || ''))) continue;
                        result.push(r);
                    }
                    if (i + CHUNK < source.length) { document.getElementById('att-loading-msg').textContent = 'Filtering\u2026 ' + Math.min(i + CHUNK, source.length).toLocaleString() + '/' + source.length.toLocaleString(); await delay(0); }
                }
                if (attFilterToken !== token) return;
                attFilteredRows = result;
                document.getElementById('att-loading').style.display = 'none';
                attUpdateKPIs(); attRenderSummaryTables(); attRenderPivot();
            }

            function attUpdateKPIs() {
                const rows = attFilteredRows;
                const { action: ac, cat: cc, course: crc, email: em, date: dt } = window._attCols;
                document.getElementById('att-k-total').textContent = rows.length.toLocaleString();
                document.getElementById('att-k-total-sub').textContent = 'of ' + attRawRows.length.toLocaleString() + ' total';
                document.getElementById('att-k-emails').textContent = em ? [...new Set(rows.map(r => r[em]).filter(Boolean))].length.toLocaleString() : '---';
                document.getElementById('att-k-courses').textContent = crc ? [...new Set(rows.map(r => r[crc]).filter(Boolean))].length.toLocaleString() : '---';
                document.getElementById('att-k-cats').textContent = cc ? [...new Set(rows.map(r => r[cc]).filter(Boolean))].length.toLocaleString() : '---';
                document.getElementById('att-k-actions').textContent = ac ? [...new Set(rows.map(r => r[ac]).filter(Boolean))].length.toLocaleString() : '---';
                if (dt) { const ds = rows.map(r => r[dt]).filter(Boolean).sort(); document.getElementById('att-k-dates').textContent = ds.length ? ds[0] + ' \u2013 ' + ds[ds.length - 1] : '---'; }
                else document.getElementById('att-k-dates').textContent = '---';
            }

            function attRenderSummaryTables() {
                const rows = attFilteredRows;
                const { action: ac, cat: cc, course: crc, email: em } = window._attCols;
                const total = rows.length || 1;
                // Action
                const actMap = new Map(); rows.forEach(r => { const a = String(r[ac] || ''); if (a) actMap.set(a, (actMap.get(a) || 0) + 1); });
                document.getElementById('att-action-body').innerHTML = [...actMap.entries()].sort((a, b) => b[1] - a[1]).map(([a, n], i) => '<tr><td class="si">' + (i + 1) + '</td><td>' + escHtml(a) + '</td><td class="snum">' + n.toLocaleString() + '</td><td class="sbest">' + (n / total * 100).toFixed(1) + '%</td></tr>').join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:12px">No data</td></tr>';
                // Category
                const catMap = new Map(); rows.forEach(r => { const c = String(r[cc] || ''); if (c) catMap.set(c, (catMap.get(c) || 0) + 1); });
                document.getElementById('att-cat-body').innerHTML = [...catMap.entries()].sort((a, b) => b[1] - a[1]).map(([c, n], i) => '<tr><td class="si">' + (i + 1) + '</td><td>' + escHtml(c) + '</td><td class="snum">' + n.toLocaleString() + '</td><td class="sbest">' + (n / total * 100).toFixed(1) + '%</td></tr>').join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:12px">No data</td></tr>';
                // Course
                if (crc) {
                    const cmap = new Map(), emap = new Map();
                    rows.forEach(r => { const c = String(r[crc] || ''); if (!c) return; cmap.set(c, (cmap.get(c) || 0) + 1); if (em && r[em]) { if (!emap.has(c)) emap.set(c, new Set()); emap.get(c).add(r[em]); } });
                    document.getElementById('att-course-info').textContent = cmap.size + ' courses';
                    document.getElementById('att-course-body').innerHTML = [...cmap.entries()].sort((a, b) => b[1] - a[1]).map(([c, n], i) => '<tr><td class="si">' + (i + 1) + '</td><td class="scid">' + escHtml(c) + '</td><td class="snum">' + n.toLocaleString() + '</td><td class="snum">' + (emap.has(c) ? emap.get(c).size.toLocaleString() : '---') + '</td></tr>').join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:12px">No data</td></tr>';
                }
            }

            function attRenderPivot() {
                const rows = attFilteredRows;
                const wrap = document.getElementById('att-pivot-wrap');
                const { course: crc, date: dt } = window._attCols;
                if (!rows.length || !dt || !crc) { wrap.innerHTML = '<div class="no-data-msg"><i class="bi bi-table" style="font-size:20px;display:block;margin-bottom:8px;opacity:.3"></i>Needs courseid + exam_date columns</div>'; return; }
                const courseMap = new Map(), dateSet = new Set();
                rows.forEach(r => { const cid = String(r[crc] || '(blank)'), d = String(r[dt] || '(no date)'); dateSet.add(d); if (!courseMap.has(cid)) courseMap.set(cid, {}); const cm = courseMap.get(cid); cm[d] = (cm[d] || 0) + 1; });
                const dates = [...dateSet].sort(), courses = [...courseMap.keys()].sort();
                document.getElementById('att-pivot-info').textContent = courses.length + ' courses x ' + dates.length + ' dates';
                const colTotals = {}; dates.forEach(d => { colTotals[d] = 0; }); let grandTotal = 0;
                let html = '<table class="att-pivot-tbl" id="att-pivot-inner-tbl"><thead><tr><th>Course ID</th>' + dates.map(d => '<th>' + escHtml(d) + '</th>').join('') + '<th>Total</th></tr></thead><tbody>';
                courses.forEach(cid => { const cm = courseMap.get(cid) || {}; let rt = 0; const cells = dates.map(d => { const v = cm[d] || 0; colTotals[d] += v; rt += v; grandTotal += v; return v; }); html += '<tr><td>' + escHtml(cid) + '</td>' + cells.map(v => '<td class="' + (v ? 'val-cell' : 'val-zero') + '">' + (v || '') + '</td>').join('') + '<td class="total-col">' + rt.toLocaleString() + '</td></tr>'; });
                html += '<tr style="background:#f4f9fd;font-weight:700"><td style="color:#1f2c56">Grand Total</td>' + dates.map(d => '<td class="val-cell" style="font-weight:700;color:#1f2c56">' + (colTotals[d] || 0).toLocaleString() + '</td>').join('') + '<td class="total-col">' + grandTotal.toLocaleString() + '</td></tr></tbody></table>';
                wrap.innerHTML = html;
                attPivotData = { courses, dates, courseMap, colTotals, grandTotal };
            }

            function attResetFilters() { attBuildFilterPills(); attApplyFilters(); }

            function attCopyTable(tblId) {
                const tbl = document.getElementById(tblId); if (!tbl) { toast('No table', 'w'); return; }
                const txt = [...tbl.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].map(c => c.textContent.trim()).join('\t')).join('\n');
                navigator.clipboard.writeText(txt).then(() => toast('Copied', 's')).catch(() => toast('Copy failed', 'e'));
            }
            function attDownloadTableCSV(tblId, fname) {
                const tbl = document.getElementById(tblId); if (!tbl) { toast('No data', 'w'); return; }
                const rows = [...tbl.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].map(c => c.textContent.trim()).join(','));
                dlBlob(new Blob([rows.join('\n')], { type: 'text/csv' }), fname + '.csv'); toast('Downloaded', 's');
            }
            function attDownloadPivotCSV() {
                if (!attPivotData) { toast('No pivot data', 'w'); return; }
                const { courses, dates, courseMap, colTotals, grandTotal } = attPivotData;
                const lines = [['Course ID', ...dates, 'Grand Total'].join(',')];
                courses.forEach(cid => { const cm = courseMap.get(cid) || {}; let rt = 0; const cells = dates.map(d => { const v = cm[d] || 0; rt += v; return v; }); lines.push([cid, ...cells, rt].join(',')); });
                lines.push(['Grand Total', ...dates.map(d => colTotals[d] || 0), grandTotal].join(','));
                dlBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), 'Attendance_Pivot.csv'); toast('Pivot CSV downloaded', 's');
            }
            function attDownloadPivotXLSX() {
                if (!attPivotData) { toast('No pivot', 'w'); return; }
                const { courses, dates, courseMap, colTotals, grandTotal } = attPivotData;
                const aoa = [['Course ID', ...dates, 'Grand Total']];
                courses.forEach(cid => { const cm = courseMap.get(cid) || {}; let rt = 0; const cells = dates.map(d => { const v = cm[d] || 0; rt += v; return v; }); aoa.push([cid, ...cells, rt]); });
                aoa.push(['Grand Total', ...dates.map(d => colTotals[d] || 0), grandTotal]);
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Pivot');
                XLSX.writeFile(wb, 'Attendance_Pivot.xlsx'); toast('XLSX downloaded', 's');
            }
            function attExportCourseXLSX() {
                const { course: crc, email: em } = window._attCols;
                if (!crc) { toast('No course column', 'w'); return; }
                const cmap = new Map(), emap = new Map();
                attFilteredRows.forEach(r => { const c = String(r[crc] || ''); if (!c) return; cmap.set(c, (cmap.get(c) || 0) + 1); if (em && r[em]) { if (!emap.has(c)) emap.set(c, new Set()); emap.get(c).add(r[em]); } });
                const aoa = [['#', 'Course ID', 'Total', 'Unique Emails']];
                [...cmap.entries()].sort((a, b) => b[1] - a[1]).forEach(([c, n], i) => aoa.push([i + 1, c, n, emap.has(c) ? emap.get(c).size : 0]));
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Course Summary');
                XLSX.writeFile(wb, 'Attendance_Course_Summary.xlsx'); toast('XLSX downloaded', 's');
            }
            async function attExportExcel() {
                if (!attFilteredRows.length) { toast('No data', 'w'); return; }
                showOv('Building Excel', 'Preparing\u2026', 10); await delay(20);
                const wb = XLSX.utils.book_new();
                const { action: ac, cat: cc } = window._attCols;
                const actMap = new Map(); attFilteredRows.forEach(r => { const a = String(r[ac] || ''); if (a) actMap.set(a, (actMap.get(a) || 0) + 1); });
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['action', 'count'], ...[...actMap.entries()].sort((a, b) => b[1] - a[1])]), 'Action_Count');
                const catMap = new Map(); attFilteredRows.forEach(r => { const c = String(r[cc] || ''); if (c) catMap.set(c, (catMap.get(c) || 0) + 1); });
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['category', 'count'], ...[...catMap.entries()].sort((a, b) => b[1] - a[1])]), 'Category_Count');
                if (attPivotData) { const { courses, dates, courseMap, colTotals, grandTotal } = attPivotData; const pa = [['Course ID', ...dates, 'Grand Total']]; courses.forEach(cid => { const cm = courseMap.get(cid) || {}; let rt = 0; const cells = dates.map(d => { const v = cm[d] || 0; rt += v; return v; }); pa.push([cid, ...cells, rt]); }); pa.push(['Grand Total', ...dates.map(d => colTotals[d] || 0), grandTotal]); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pa), 'Pivot'); }
                pOv(90, 'Writing\u2026'); await delay(20);
                XLSX.writeFile(wb, 'Attendance_Report.xlsx'); hideOv(); toast('Excel downloaded', 's');
            }


