            // ═══════════════════════════════════════════════════════════════
            // PRE-SCORING DASHBOARD
            // ═══════════════════════════════════════════════════════════════
            const PSO = { scoreChoice: null, mapData: [null, null], stuData: [null, null], courseId: [null, null], results: [null, null] };
            const PSO_CFG = { 12: { N: 12, K: 8 }, 8: { N: 8, K: 6 }, 4: { N: 4, K: 3 } };
            function psoSetPill(el, val) { document.querySelectorAll('.pso-pill').forEach(p => { p.classList.remove('active', 'btn-primary'); p.classList.add('btn-default'); }); el.classList.remove('btn-default'); el.classList.add('active', 'btn-primary'); PSO.scoreChoice = val; const d = { 'null': 'No best-score computation', 4: 'Top 3 of 4 weeks', 8: 'Top 6 of 8 weeks', 12: 'Top 8 of 12 weeks', rename: 'Rename headers from mapping sheet + fill blank/-- with 0 (no week avg / best score)' }; document.getElementById('pso-strat-desc').textContent = d[String(val)] !== undefined ? d[String(val)] : d['null']; }
            function psoDov(e, id) { e.preventDefault(); document.getElementById(id) && document.getElementById(id).classList.add('drag'); }
            function psoDlv(id) { document.getElementById(id) && document.getElementById(id).classList.remove('drag'); }
            function psoDrop(e, n, type) { e.preventDefault(); const z = 'pso-uz' + n + (type === 'map' ? 'm' : 's'); document.getElementById(z) && document.getElementById(z).classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) { if (type === 'map') psoMapUp(n, { files: [f] }); else psoStuUp(n, { files: [f] }); } }
            function psoSdot(n, s, state) { const el = document.getElementById('pso-sd' + n + s); if (el) { el.className = 'sdot'; if (state) el.classList.add(state); } }
            function psoBadge(n) { const el = document.getElementById('pso-badge' + n); if (!el) return; const cid = PSO.courseId[n - 1], map = PSO.mapData[n - 1], stu = PSO.stuData[n - 1]; if (cid && map && stu) { el.textContent = cid; el.style.background = 'rgba(0,166,90,.4)'; el.style.color = '#fff'; el.title = 'Course: ' + cid; } else if (cid && map) { el.textContent = 'Awaiting Scores'; el.style.background = ''; el.style.color = ''; el.title = ''; } else if (map) { el.textContent = 'Select Course ID'; el.style.background = ''; el.style.color = ''; el.title = ''; } else { el.textContent = 'Not Configured'; el.style.background = ''; el.style.color = ''; el.title = ''; } }
            function psoParseFile(file) { return new Promise((res, rej) => { if (file.name.toLowerCase().endsWith('.csv')) { Papa.parse(file, { header: true, skipEmptyLines: true, worker: true, complete: r => { const rawCols = (r.meta.fields || []).map(c => String(c == null ? '' : c)); const columns = sanitizeCols(rawCols); res({ columns, rows: normalizeParsedRows(r.data, rawCols, columns) }); }, error: rej }); } else { const rd = new FileReader(); rd.onload = e => { try { const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; const json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' }); const rawCols = json.length ? Object.keys(json[0]) : []; const columns = json.length ? sanitizeCols(rawCols) : []; res({ columns, rows: json.length ? normalizeParsedRows(json, rawCols, columns) : json }); } catch (err) { rej(err); } }; rd.onerror = rej; rd.readAsArrayBuffer(file); } }); }
            async function psoMapUp(n, input) { const file = input.files[0]; if (!file) return; try { const data = await psoParseFile(file); const cc = data.columns.find(c => /course.?id/i.test(c)) || data.columns[0]; const courseIndex = new Map(); const ids = []; for (let i = 0; i < data.rows.length; i++) { const raw = normCell(data.rows[i][cc]); if (!raw) continue; const key = raw.replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase(); if (!courseIndex.has(key)) { courseIndex.set(key, data.rows[i]); ids.push(raw); } } data._courseCol = cc; data._courseIndex = courseIndex; PSO.mapData[n - 1] = data; document.getElementById('pso-uz' + n + 'm').classList.add('loaded'); document.getElementById('pso-map' + n + 'fn').textContent = file.name; psoSdot(n, 'm', 'done'); const sel = document.getElementById('pso-csel' + n); sel.innerHTML = '<option value="">— Select Course ID —</option>' + ids.map(id => '<option value="' + escHtml(id) + '">' + escHtml(id) + '</option>').join(''); if (ids.length === 1) { sel.value = ids[0]; psoOnCourseSelect(n); } psoBadge(n); toast('Mapping loaded: ' + ids.length + ' course' + (ids.length !== 1 ? 's' : ''), 's'); } catch (e) { toast('Error: ' + e.message, 'e'); } }
            async function psoStuUp(n, input) { const file = input.files[0]; if (!file) return; try { showOv('Loading Score Dump', 'Reading...', '20'); await delay(20); const data = await psoParseFile(file); data.name = file.name; PSO.stuData[n - 1] = data; hideOv(); document.getElementById('pso-uz' + n + 's').classList.add('loaded'); document.getElementById('pso-stu' + n + 'fn').textContent = file.name; psoSdot(n, 's', 'done'); psoBadge(n); psoCheckReady(n); toast('Scores: ' + data.rows.length.toLocaleString() + ' rows', 's'); } catch (e) { hideOv(); toast('Error: ' + e.message, 'e'); } }
            function psoOnCourseSelect(n) { PSO.courseId[n - 1] = document.getElementById('pso-csel' + n).value || null; psoSdot(n, 'c', PSO.courseId[n - 1] ? 'done' : ''); psoBadge(n); psoCheckReady(n); }
            function psoCheckReady(n) { psoSdot(n, 'r', (PSO.mapData[n - 1] && PSO.stuData[n - 1] && PSO.courseId[n - 1]) ? 'act' : ''); }
            async function psoRunAnalysis() {
                const r1 = PSO.mapData[0] && PSO.stuData[0] && PSO.courseId[0];
                const r2 = PSO.mapData[1] && PSO.stuData[1] && PSO.courseId[1];
                if (!r1 && !r2) { toast('Configure at least one course', 'w'); return; }
                showOv('Running Analysis', 'Starting...', 5); await delay(30);
                let tM = 0, tW = 0, bR = false;
                if (r1) { pOv(20, 'Processing Course #1...'); await delay(20); PSO.results[0] = psoProcess(1); tM += Object.keys(PSO.results[0].renamedMap).length; tW += PSO.results[0].weeksCreated.length; if (PSO.results[0].bestScoreCol) bR = true; psoSdot(1, 'r', PSO.results[0].diag.notFound ? 'err' : 'done'); }
                if (r2) { pOv(60, 'Processing Course #2...'); await delay(20); PSO.results[1] = psoProcess(2); tM += Object.keys(PSO.results[1].renamedMap).length; tW += PSO.results[1].weeksCreated.length; if (PSO.results[1].bestScoreCol) bR = true; psoSdot(2, 'r', PSO.results[1].diag.notFound ? 'err' : 'done'); }
                pOv(90, 'Rendering...'); await delay(20);
                document.getElementById('pso-k-courses').textContent = (r1 ? 1 : 0) + (r2 ? 1 : 0);
                document.getElementById('pso-k-mapped').textContent = tM;
                document.getElementById('pso-k-weeks').textContent = tW;
                const bestEl = document.getElementById('pso-k-best');
                bestEl.textContent = bR ? 'Yes' : (PSO.scoreChoice && PSO.scoreChoice !== 'rename' ? 'No' : '—');
                bestEl.style.color = bR ? 'var(--green)' : '';
                document.getElementById('pso-s-txt').textContent = 'Analysis complete';
                document.getElementById('pso-results').style.display = 'block';
                document.getElementById('pso-export').style.display = 'block';
                const both = r1 && r2;
                const btnLbl = document.getElementById('pso-export-btn-lbl'), expDesc = document.getElementById('pso-export-desc');
                if (btnLbl) btnLbl.textContent = both ? 'Download Combined Excel' : 'Download Excel';
                if (expDesc) expDesc.textContent = both ? 'Both courses in one Excel — renamed headers' : 'Single course Excel — renamed headers';
                const c1btn = document.getElementById('pso-copy1-btn'), c2btn = document.getElementById('pso-copy2-btn');
                if (c1btn) c1btn.style.display = (r1 && PSO.results[0]) ? '' : 'none';
                if (c2btn) c2btn.style.display = (r2 && PSO.results[1]) ? '' : 'none';
                window._psoPreviewPending = [];
                if (r1 && PSO.results[0]) psoRenderResult(1, PSO.results[0], PSO.courseId[0]);
                if (r2 && PSO.results[1]) psoRenderResult(2, PSO.results[1], PSO.courseId[1]);
                psoRenderPreviews();
                hideOv(); toast('Analysis complete', 's');
            }
            function psoProcess(n) {
                const mapData = PSO.mapData[n - 1], stuData = PSO.stuData[n - 1], courseId = PSO.courseId[n - 1], scoreChoice = PSO.scoreChoice;
                // Normalize: trim all whitespace including non-breaking spaces (U+00A0)
                const normStr = s => String(s || '').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
                const mapRow = mapData._courseIndex ? mapData._courseIndex.get(normStr(courseId)) : mapData.rows.find(r => normStr(r[mapData._courseCol || mapData.columns[0]]) === normStr(courseId));
                if (!mapRow) {
                    toast('Course ID "' + courseId + '" not found in mapping sheet. Check mapping file has matching Course ID column.', 'e');
                    return { columns: stuData.columns, rows: stuData.rows.map(r => Object.assign({}, r)), renamedMap: {}, renamedList: [], weeksCreated: [], bestScoreCol: null, mappingIdCount: 0, formulaDesc: {}, diag: { matchCount: 0, notFound: true } };
                }

                // ── 1. Build id→label from mapping sheet ──
                const weekCols = mapData.columns.filter(c => /^week[\s_\-]*\d+$/i.test(c));
                const assignCols = mapData.columns.filter(c => /assign/i.test(c) && !/score|avg|total/i.test(c));
                const idToLabel = {}, weekToLabels = {};
                weekCols.forEach(wc => {
                    const wn = parseInt((String(wc).match(/\d+/) || [0])[0]); if (!wn) return;
                    const wName = 'Week ' + wn;
                    const acs = assignCols.filter(ac => parseInt((String(ac).match(/\d+/) || [0])[0]) === wn);
                    const lbls = [];
                    acs.forEach(ac => {
                        const ls = String(mapRow[wc] || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
                        const ids = String(mapRow[ac] || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
                        ls.forEach((l, i) => { if (ids[i]) { idToLabel[ids[i]] = l; lbls.push(l); } });
                    });
                    if (lbls.length) weekToLabels[wName] = [...new Set(lbls)];
                });

                // ── 2. Rename score-dump columns ──
                const newCols = [], renamedMap = {}, renamedList = [], seen = {};
                // Build a Set of all known assignment IDs from the mapping (for safe matching)
                const knownIds = new Set(Object.keys(idToLabel));
                stuData.columns.forEach(col => {
                    const raw = String(col);
                    // Match trailing numeric ID in explicit formats: (123), #123
                    // For _123 suffix: only match if the extracted number is actually a known assignment ID
                    // This prevents false matches on columns like "User_Name_1", "Score_2", "Week_1" etc.
                    const mParen = raw.match(/\((\d+)\)\s*$/);
                    const mHash = raw.match(/#(\d+)\s*$/);
                    const mUnder = raw.match(/_(\d+)\s*$/);
                    let nid = null;
                    if (mParen && knownIds.has(mParen[1])) nid = mParen[1];
                    else if (mHash && knownIds.has(mHash[1])) nid = mHash[1];
                    else if (mUnder && knownIds.has(mUnder[1])
                        // Extra guard: reject short ambiguous numbers (1-3 digits) for _N suffix
                        // unless the full column name is ONLY a prefix+number pattern (no other words)
                        && (mUnder[1].length >= 4 || /^[a-z0-9_\-]+$/i.test(raw.replace(/_\d+\s*$/, '')))
                    ) nid = mUnder[1];
                    if (nid && idToLabel[nid]) {
                        const tgt = idToLabel[nid];
                        seen[tgt] = (seen[tgt] || 0) + 1;
                        const fn = seen[tgt] > 1 ? tgt + '_' + seen[tgt] : tgt;
                        newCols.push(fn); renamedMap[col] = fn;
                        renamedList.push({ id: nid, original: col, renamed: fn });
                    } else newCols.push(col);
                });

                const resultRows = stuData.rows.map(row => {
                    const nr = {}; stuData.columns.forEach((col, i) => { nr[newCols[i]] = row[col]; });
                    return nr;
                });
                const resultCols = [...newCols], weeksCreated = [], formulaDesc = {};

                // ── 3. Header Renamer mode: fill blank / '--' values with 0, keep originals ──
                if (scoreChoice === 'rename') {
                    // Attach original raw values under __orig__ keys (shown next to renamed col)
                    const stuRows = stuData.rows;
                    renamedList.forEach(rl => {
                        resultRows.forEach((row, i) => {
                            const stuRow = stuRows[i] || {};
                            row['__orig__' + rl.renamed] = stuRow[rl.original] !== undefined ? stuRow[rl.original] : '';
                        });
                    });
                    // Zero-fill blank or '--' values for renamed (assignment) columns
                    const renamedKeys = new Set(renamedList.map(r => r.renamed));
                    resultRows.forEach(row => {
                        renamedKeys.forEach(key => {
                            const v = row[key];
                            if (v === undefined || v === null || v === '' || String(v).trim() === '' || String(v).trim() === '--') {
                                row[key] = 0;
                            }
                        });
                    });
                    return { columns: resultCols, rows: resultRows, renamedMap, renamedList, weeksCreated: [], bestScoreCol: null, mappingIdCount: Object.keys(idToLabel).length, formulaDesc: {}, diag: { matchCount: Object.keys(renamedMap).length }, scoreChoice: 'rename' };
                }

                // ── 4. Create Week columns using formula config from Assignment Logic ──
                const fcfg = psoGetFormulaCfg(courseId);
                const _aggr = fcfg.aggr;       // 'avg' | 'sum' | 'max' | 'min'
                const _rnd = fcfg.round;      // integer decimal places
                const _excl = new Set((fcfg.excludeCols || []).map(c => c.toLowerCase().trim()));

                Object.entries(weekToLabels).forEach(([wName, labels]) => {
                    // Filter: column must exist in result + not in exclude list
                    const avail = labels.filter(l => resultCols.includes(l) && !_excl.has(l.toLowerCase().trim()));
                    if (avail.length) {
                        resultRows.forEach(r => {
                            const vals = avail.map(l => { const v = parseFloat(r[l]); return isNaN(v) ? 0 : v; });
                            let s;
                            if (_aggr === 'sum') s = vals.reduce((a, b) => a + b, 0);
                            else if (_aggr === 'max') s = Math.max(...vals);
                            else if (_aggr === 'min') s = Math.min(...vals);
                            else s = vals.reduce((a, b) => a + b, 0) / vals.length; // avg default
                            r[wName] = +s.toFixed(_rnd);
                        });
                        // Only add Week column to resultCols if not already present (prevents duplicate columns)
                        if (!resultCols.includes(wName)) resultCols.push(wName);
                        weeksCreated.push(wName);
                        // Build formula description matching the chosen aggregation
                        const inner = _aggr === 'avg' ? 'SUM(' + avail.join(',') + ')/' + avail.length
                            : _aggr === 'sum' ? 'SUM(' + avail.join(',') + ')'
                                : _aggr === 'max' ? 'MAX(' + avail.join(',') + ')'
                                    : 'MIN(' + avail.join(',') + ')';
                        formulaDesc[wName] = 'ROUND(' + inner + ',' + _rnd + ')';
                    }
                });

                // ── 5. Best Score — ROUND(SUM(LARGE({w1,w2,...},{1,2,..,K}))/K, 2) ──
                let bestScoreCol = null;
                if (scoreChoice && PSO_CFG[scoreChoice]) {
                    const { N: ni, K: ki } = PSO_CFG[scoreChoice];
                    const cn = 'Best Score (' + scoreChoice + 'W-Best' + ki + ')';
                    const rel = weeksCreated.filter(w => { const m = w.match(/Week\s*(\d+)/i); return m && parseInt(m[1]) <= ni; });
                    if (rel.length > 0) {
                        resultRows.forEach(r => {
                            const vals = rel.map(w => parseFloat(r[w]) || 0).sort((a, b) => b - a);
                            const top = vals.slice(0, Math.min(ki, vals.length));
                            // pad with 0 if fewer weeks than K
                            while (top.length < ki) top.push(0);
                            r[cn] = +(top.reduce((a, b) => a + b, 0) / ki).toFixed(2);
                        });
                        resultCols.push(cn); bestScoreCol = cn;
                        const largeIdxArr = Array.from({ length: ki }, (_, i) => i + 1).join(',');
                        formulaDesc[cn] = 'ROUND(SUM(LARGE({' + rel.join(',') + '},{' + largeIdxArr + '}))/' + ki + ',2)';
                    }
                }
                return { columns: resultCols, rows: resultRows, renamedMap, renamedList, weeksCreated, bestScoreCol, mappingIdCount: Object.keys(idToLabel).length, formulaDesc, diag: { matchCount: Object.keys(renamedMap).length } };
            }
            function psoRenderResult(n, res, cid) {
                document.getElementById('pso-res' + n + 'title').textContent = cid + ' — ' + res.rows.length.toLocaleString() + ' rows';
                const body = document.getElementById('pso-res' + n + 'body');
                const mc = res.diag.matchCount, mt = res.mappingIdCount, pct = mt > 0 ? Math.round(mc / mt * 100) : 0;
                const pc = pct === 100 ? 'var(--green)' : pct > 80 ? 'var(--blue)' : 'var(--yellow)';
                const fEntries = Object.entries(res.formulaDesc || {});

                // ── KPI mini cards ──
                let html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">';
                html += '<div style="background:#f9f9f9;border-radius:3px;padding:8px;text-align:center;border-bottom:3px solid ' + pc + '"><div style="font-size:18px;font-weight:700;color:' + pc + '">' + mc + '/' + mt + '</div><div style="font-size:10px;color:var(--text3);text-transform:uppercase">IDs Mapped (' + pct + '%)</div></div>';
                html += '<div style="background:#f9f9f9;border-radius:3px;padding:8px;text-align:center"><div style="font-size:18px;font-weight:700">' + res.weeksCreated.length + '</div><div style="font-size:10px;color:var(--text3);text-transform:uppercase">Weeks Created</div></div>';
                html += '<div style="background:#f9f9f9;border-radius:3px;padding:8px;text-align:center;border-bottom:3px solid ' + (res.bestScoreCol ? 'var(--green)' : 'var(--border)') + '"><div style="font-size:18px;font-weight:700;color:' + (res.bestScoreCol ? 'var(--green)' : 'var(--text3)') + '">' + (res.bestScoreCol ? 'Yes' : 'No') + '</div><div style="font-size:10px;color:var(--text3);text-transform:uppercase">Best Score</div></div>';
                html += '</div>';

                // ── Formula reference ──
                if (fEntries.length) {
                    html += '<div style="margin-bottom:10px;padding:8px 10px;background:#f0f7ff;border-left:3px solid var(--blue);border-radius:2px;font-size:11px;line-height:1.7">';
                    html += '<b style="color:var(--blue)"><i class="bi bi-calculator-fill"></i> Formulas applied:</b><br>';
                    html += fEntries.map(([k, v]) => '<span style="display:inline-block;min-width:90px;font-weight:700;color:var(--text)">' + escHtml(k) + '</span><span style="color:var(--text2);font-family:monospace;font-size:10px"> = ' + escHtml(v) + '</span>').join('<br>');
                    html += '</div>';
                }

                // ── Mapped/Renamed IDs table ──
                const rl = res.renamedList || [];
                if (rl.length) {
                    html += '<div style="margin-bottom:10px">';
                    html += '<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px"><i class="bi bi-arrow-left-right"></i> Column Renames (' + rl.length + ' mapped) — download uses renamed headers</div>';
                    html += '<div style="max-height:110px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--rad)">';
                    html += '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:var(--card-head);position:sticky;top:0"><th style="padding:4px 8px;text-align:left;border-bottom:1px solid var(--border)">ID</th><th style="padding:4px 8px;text-align:left;border-bottom:1px solid var(--border)">Original Column</th><th style="padding:4px 8px;text-align:left;border-bottom:1px solid var(--border)">&#8594; Renamed To</th></tr></thead><tbody>';
                    html += rl.map((r, i) => '<tr style="background:' + (i % 2 === 0 ? '#fff' : '#f9f9f9') + '"><td style="padding:3px 8px;font-weight:700;color:var(--purple)">' + escHtml(r.id) + '</td><td style="padding:3px 8px;color:var(--text3);font-family:monospace;font-size:10px">' + escHtml(r.original) + '</td><td style="padding:3px 8px;color:var(--green);font-weight:600">' + escHtml(r.renamed) + '</td></tr>').join('');
                    html += '</tbody></table></div></div>';
                }

                if (res.diag && res.diag.notFound) {
                    html = '<div style="padding:12px 14px;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;color:#856404;font-size:12px">'
                        + '<b><i class="bi bi-exclamation-triangle-fill"></i> Course ID not found in mapping sheet</b><br>'
                        + 'No column renaming or week calculation was performed. Please verify the Course ID selected matches a row in your mapping file.</div>'
                        + html;
                }
                body.innerHTML = html;
                if (!window._psoPreviewPending) window._psoPreviewPending = [];
                window._psoPreviewPending.push({ n, res });
            }

            // ── Preview data store for search ──
            window._psoPreviewDataMap = {};
            const _psoSearchTimers = {};

            function psoRenderPreviews() {
                const old = document.getElementById('pso-full-preview');
                if (old) old.remove();
                window._psoPreviewDataMap = {};
                const pending = window._psoPreviewPending || [];
                if (!pending.length) return;
                const wrap = document.createElement('div');
                wrap.id = 'pso-full-preview';
                wrap.style.cssText = 'margin-top:16px';

                pending.forEach(({ n, res }) => {
                    const cid = PSO.courseId[n - 1] || 'Course #' + n;
                    const exportCols = psoBuildFlatCols(res);
                    window._psoPreviewDataMap[n] = { res, exportCols };

                    const div = document.createElement('div');
                    div.style.cssText = 'margin-bottom:16px;background:#fff;border:1px solid var(--border);border-radius:var(--rad);box-shadow:var(--shad);overflow:hidden';

                    const hdr = document.createElement('div');
                    hdr.style.cssText = 'background:linear-gradient(135deg,#3c8dbc,#2171a0);color:#fff;font-size:12px;font-weight:700;padding:8px 14px;display:flex;align-items:center;gap:8px';
                    hdr.innerHTML = '<i class="bi bi-table"></i><span style="flex:1">' + escHtml(cid) + ' — Full Data Preview</span>'
                        + '<span style="font-size:11px;font-weight:400;opacity:.85">' + res.rows.length.toLocaleString() + ' rows &nbsp;&middot;&nbsp; ' + exportCols.length + ' columns</span>';
                    div.appendChild(hdr);

                    const searchBar = document.createElement('div');
                    searchBar.style.cssText = 'padding:7px 12px;background:#f4f6f9;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px';
                    searchBar.innerHTML = '<i class="bi bi-search" style="color:var(--text3);font-size:13px;flex-shrink:0"></i>'
                        + '<input id="pso-search-' + n + '" type="text" placeholder="Search User ID, Email, Name&#8230;" autocomplete="off"'
                        + ' style="flex:1;border:1px solid var(--border);border-radius:3px;padding:4px 9px;font-size:12px;outline:none;background:#fff;min-width:0"'
                        + ' oninput="psoSearchPreviewDebounced(' + n + ',this.value)">'
                        + '<span id="pso-search-count-' + n + '" style="font-size:11px;white-space:nowrap;min-width:80px;text-align:right;color:var(--text3)"></span>'
                        + '<button onclick="document.getElementById(\'pso-search-' + n + '\').value=\'\';psoSearchPreview(' + n + ',\'\')"'
                        + ' style="border:none;background:none;color:var(--text3);cursor:pointer;padding:2px 4px;font-size:14px;line-height:1;flex-shrink:0" title="Clear"><i class="bi bi-x-circle"></i></button>';
                    div.appendChild(searchBar);

                    const tblWrap = document.createElement('div');
                    tblWrap.id = 'pso-tbl-wrap-' + n;
                    tblWrap.style.cssText = 'overflow:auto;max-height:340px;width:100%';
                    div.appendChild(tblWrap);

                    psoRenderPreviewTable(n, res.rows, exportCols, tblWrap, 100);
                    wrap.appendChild(div);
                });

                const resultsDiv = document.getElementById('pso-results');
                if (resultsDiv) resultsDiv.appendChild(wrap);
                window._psoPreviewPending = [];
            }

            function psoSearchPreviewDebounced(n, query) {
                clearTimeout(_psoSearchTimers[n]);
                _psoSearchTimers[n] = setTimeout(() => psoSearchPreview(n, query), 220);
            }

            function psoSearchPreview(n, query) {
                const pd = window._psoPreviewDataMap && window._psoPreviewDataMap[n];
                if (!pd) return;
                const { res, exportCols } = pd;
                const tblWrap = document.getElementById('pso-tbl-wrap-' + n);
                if (!tblWrap) return;
                const q = query.trim().toLowerCase();
                let filtered;
                if (!q) {
                    filtered = res.rows;
                } else {
                    // Search across text-type columns (user id, email, name) + all columns for numbers
                    const textCols = exportCols.filter(col => PSO_TEXT_COLS.test(col.header));
                    const searchCols = textCols.length > 0 ? textCols : exportCols.slice(0, Math.min(8, exportCols.length));
                    filtered = res.rows.filter(row => searchCols.some(col => String(row[col.dataKey] || '').toLowerCase().includes(q)));
                }
                const countEl = document.getElementById('pso-search-count-' + n);
                if (countEl) {
                    if (q) {
                        countEl.textContent = filtered.length.toLocaleString() + ' match' + (filtered.length !== 1 ? 'es' : '');
                        countEl.style.color = filtered.length > 0 ? 'var(--green)' : 'var(--red)';
                    } else { countEl.textContent = ''; countEl.style.color = ''; }
                }
                psoRenderPreviewTable(n, filtered, exportCols, tblWrap, q ? 100 : 25);
            }

            function psoRenderPreviewTable(n, rows, exportCols, tblWrap, limit) {
                limit = limit || 25;
                const showRows = rows.slice(0, limit);
                let tbl = '<table style="border-collapse:collapse;font-size:11px;white-space:nowrap;min-width:max-content;width:100%">';
                tbl += '<thead><tr style="background:var(--card-head)">';
                tbl += exportCols.map(col => {
                    const isOrig = col.dataKey.startsWith('__orig__');
                    const bg = isOrig ? 'background:#fffbe6;' : '';
                    return '<th style="position:sticky;top:0;z-index:2;padding:5px 10px;border:1px solid var(--border);font-weight:700;min-width:80px;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + bg + '" title="' + escHtml(col.header) + '">' + escHtml(col.header) + '</th>';
                }).join('');
                tbl += '</tr></thead><tbody>';
                if (showRows.length === 0) {
                    tbl += '<tr><td colspan="' + exportCols.length + '" style="padding:20px;text-align:center;color:var(--text3);font-style:italic">No matching rows found</td></tr>';
                } else {
                    tbl += showRows.map((row, i) => {
                        const bg = i % 2 === 0 ? '#fff' : '#f9f9f9';
                        return '<tr style="background:' + bg + '">' + exportCols.map(col => {
                            const isOrig = col.dataKey.startsWith('__orig__');
                            const v = String(row[col.dataKey] !== undefined ? row[col.dataKey] : '');
                            const isNum = v !== '' && !isNaN(parseFloat(v)) && isFinite(v);
                            const cellBg = isOrig ? (i % 2 === 0 ? '#fffdf0' : '#fffbe6') : '';
                            return '<td style="padding:3px 10px;border:1px solid #eee;text-align:' + (isNum ? 'right' : 'left') + ';background:' + cellBg + ';max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(v) + '">' + (v === '' || v === '--' ? '<span style="color:#ccc">&#8212;</span>' : escHtml(v)) + '</td>';
                        }).join('') + '</tr>';
                    }).join('');
                }
                tbl += '</tbody></table>';
                tblWrap.innerHTML = tbl;
                if (rows.length > limit) {
                    const foot = document.createElement('div');
                    foot.style.cssText = 'padding:5px 12px;font-size:11px;color:var(--text3);background:#f9f9f9;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center';
                    foot.innerHTML = '<span>Showing <b>' + Math.min(showRows.length, limit).toLocaleString() + '</b> of <b>' + rows.length.toLocaleString() + '</b> rows — all rows included in export</span>'
                        + '<button onclick="psoRenderPreviewTable(' + n + ',window._psoPreviewDataMap[' + n + '].res.rows,window._psoPreviewDataMap[' + n + '].exportCols,document.getElementById(\'pso-tbl-wrap-' + n + '\'),' + rows.length + ')" style="font-size:11px;padding:2px 8px;border:1px solid var(--blue);border-radius:3px;background:#fff;color:var(--blue);cursor:pointer">Show all ' + rows.length.toLocaleString() + ' rows</button>';
                    tblWrap.appendChild(foot);
                }
            }

            const PSO_TEXT_COLS = /user.?id|email|name/i;

            function psoBuildExportLayout(res) {
                const mainCols = res.columns.map(c => ({ header: c, dataKey: c }));
                if (res.scoreChoice === 'rename') {
                    const rl = res.renamedList || [];
                    const origAppend = rl.map(r => ({ header: r.original + ' [original]', dataKey: '__orig__' + r.renamed }));
                    return { mainCols, origAppend };
                }
                return { mainCols, origAppend: [] };
            }

            async function psoBuildDataSheetAsync(res, onProgress) {
                const { mainCols, origAppend } = psoBuildExportLayout(res);
                const allCols = [...mainCols, ...origAppend];
                const textCiSet = new Set();
                allCols.forEach((col, ci) => { if (PSO_TEXT_COLS.test(col.header)) textCiSet.add(ci); });
                const CHUNK = 10000;
                const aoa = [allCols.map(c => c.header)];
                for (let start = 0; start < res.rows.length; start += CHUNK) {
                    const end = Math.min(start + CHUNK, res.rows.length);
                    for (let ri = start; ri < end; ri++) {
                        const row = res.rows[ri];
                        aoa.push(allCols.map(col => {
                            const raw = row[col.dataKey];
                            return (raw !== undefined && raw !== null) ? raw : '';
                        }));
                    }
                    if (onProgress) onProgress(end / res.rows.length);
                    await delay(0);
                }
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                if (textCiSet.size > 0) {
                    const nRows = res.rows.length;
                    textCiSet.forEach(ci => {
                        for (let ri = 1; ri <= nRows; ri++) {
                            const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
                            const cell = ws[addr];
                            if (cell) { cell.t = 's'; cell.v = String(cell.v !== undefined ? cell.v : ''); delete cell.w; }
                            else ws[addr] = { t: 's', v: '' };
                        }
                    });
                }
                ws['!freeze'] = { xSplit: 0, ySplit: 1 };
                return ws;
            }

            async function psoExportExcel() {
                const r1 = PSO.results[0], r2 = PSO.results[1];
                if (!r1 && !r2) { toast('No results to export', 'w'); return; }
                const totalRows = (r1 ? r1.rows.length : 0) + (r2 ? r2.rows.length : 0);
                if (totalRows > 1048576) { toast('Dataset exceeds Excel row limit (1M). Use CSV ZIP for full data.', 'w'); return; }
                showOv('Building Excel', 'Preparing\u2026', 3); await delay(20);
                // Sanitize Excel sheet names: strip illegal chars [ ] : * ? / \, max 31 chars
                const psoSanitizeSheet = (s, fb) => String(s || fb || 'Sheet').replace(/[\[\]:*?\/\\]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 31) || String(fb || 'Sheet').slice(0, 31);
                try {
                    const wb = XLSX.utils.book_new();
                    if (r1) {
                        pOv(5, 'Building Course #1 (' + r1.rows.length.toLocaleString() + ' rows)\u2026'); await delay(0);
                        const ws1 = await psoBuildDataSheetAsync(r1, p => pOv(Math.round(5 + p * 40), 'Course #1: ' + Math.round(p * 100) + '%\u2026'));
                        XLSX.utils.book_append_sheet(wb, ws1, psoSanitizeSheet(PSO.courseId[0], 'Course1'));
                    }
                    if (r2) {
                        pOv(50, 'Building Course #2 (' + r2.rows.length.toLocaleString() + ' rows)\u2026'); await delay(0);
                        const ws2 = await psoBuildDataSheetAsync(r2, p => pOv(Math.round(50 + p * 40), 'Course #2: ' + Math.round(p * 100) + '%\u2026'));
                        XLSX.utils.book_append_sheet(wb, ws2, psoSanitizeSheet(PSO.courseId[1], 'Course2'));
                    }
                    pOv(93, 'Writing file\u2026'); await delay(0);
                    const fname = (r1 && r2) ? 'NPTEL_PreScoring_Combined.xlsx' : 'NPTEL_PreScoring_' + (PSO.courseId[r1 ? 0 : 1] || 'Course').replace(/[^\w\-. ]/g, '_') + '.xlsx';
                    XLSX.writeFile(wb, fname);
                    hideOv(); toast('Excel downloaded: ' + fname, 's');
                } catch (e) { hideOv(); toast('Export failed: ' + e.message, 'e'); }
            }

            function psoBuildFlatCols(res) {
                const { mainCols, origAppend } = psoBuildExportLayout(res);
                return [...mainCols, ...origAppend];
            }

            async function psoExportZip() {
                if (!PSO.results[0] && !PSO.results[1]) { toast('No results', 'w'); return; }
                showOv('Building CSV ZIP', 'Preparing\u2026', 3); await delay(20);
                try {
                    const zip = new JSZip();
                    const CHUNK = 10000;
                    const csvCell = v => { const s = String(v !== undefined && v !== null ? v : ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; };
                    for (let i = 0; i <= 1; i++) {
                        const res = PSO.results[i]; if (!res) continue;
                        const cols = psoBuildFlatCols(res);
                        const parts = [cols.map(c => csvCell(c.header)).join(',') + '\n'];
                        for (let start = 0; start < res.rows.length; start += CHUNK) {
                            const end = Math.min(start + CHUNK, res.rows.length);
                            for (let ri = start; ri < end; ri++) {
                                parts.push(cols.map(c => csvCell(res.rows[ri][c.dataKey] !== undefined ? res.rows[ri][c.dataKey] : '')).join(',') + '\n');
                            }
                            const pct = Math.round(5 + i * 40 + (end / res.rows.length) * 38);
                            pOv(pct, 'Course #' + (i + 1) + ': ' + end.toLocaleString() + ' / ' + res.rows.length.toLocaleString() + ' rows\u2026');
                            await delay(0);
                        }
                        zip.file((PSO.courseId[i] || 'Course' + (i + 1)) + '.csv', parts.join(''));
                    }
                    pOv(88, 'Compressing\u2026'); await delay(0);
                    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
                    dlBlob(blob, 'NPTEL_PreScoring.zip'); hideOv(); toast('CSV ZIP downloaded', 's');
                } catch (e) { hideOv(); toast('Export failed: ' + e.message, 'e'); }
            }

            function psoCopyResult(n) {
                const res = PSO.results[n - 1]; if (!res) { toast('No data for Course #' + n, 'w'); return; }
                const cols = psoBuildFlatCols(res);
                const lines = [cols.map(c => c.header).join('\t')];
                res.rows.forEach(r => lines.push(cols.map(c => String(r[c.dataKey] !== undefined ? r[c.dataKey] : '')).join('\t')));
                navigator.clipboard.writeText(lines.join('\n'))
                    .then(() => toast('Copied Course #' + n + ' \u2014 ' + res.rows.length.toLocaleString() + ' rows (' + cols.length + ' cols)', 's'))
                    .catch(() => toast('Copy failed', 'e'));
            }

            function psoClearAll() {
                PSO.mapData = [null, null]; PSO.stuData = [null, null]; PSO.courseId = [null, null]; PSO.results = [null, null];
                [1, 2].forEach(n => {
                    ['pso-uz' + n + 'm', 'pso-uz' + n + 's'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('loaded'); });
                    ['pso-map' + n + 'fn', 'pso-stu' + n + 'fn'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
                    const sel = document.getElementById('pso-csel' + n); if (sel) sel.innerHTML = '<option value="">-- Upload mapping to populate --</option>';
                    ['m', 'c', 's', 'r'].forEach(s => psoSdot(n, s, '')); psoBadge(n);
                });
                const rs = document.getElementById('pso-results'); if (rs) rs.style.display = 'none';
                const ex = document.getElementById('pso-export'); if (ex) ex.style.display = 'none';
                const fp = document.getElementById('pso-full-preview'); if (fp) fp.remove();
                window._psoPreviewPending = [];
                window._psoPreviewDataMap = {};
                document.querySelectorAll('.pso-pill').forEach((p, i) => { p.classList.toggle('active', i === 0); p.classList.toggle('btn-primary', i === 0); p.classList.toggle('btn-default', i !== 0); });
                PSO.scoreChoice = null;
                const sd = document.getElementById('pso-strat-desc'); if (sd) sd.textContent = 'No best-score computation';
                toast('PSO cleared', 'i');
            }
