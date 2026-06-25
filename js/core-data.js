            // ═══════════════════════════════════════════════════════════════
            // SEM HELPERS — timezone-safe, all formats
            // ═══════════════════════════════════════════════════════════════
            const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            function fmtSem(raw) {
                const s = String(raw || '').trim();
                if (!s || s === 'nan' || s === 'undefined' || s === 'null') return '';
                const m1 = s.match(/^([A-Za-z]{3})-(\d{2})$/);
                if (m1) return `${cap(m1[1])} ${2000 + parseInt(m1[2])}`;
                const m2 = s.match(/^(\d{4})-(\d{2})/);
                if (m2) return `${MONTHS[parseInt(m2[2])] || m2[2]} ${m2[1]}`;
                const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (m3) return `${MONTHS[parseInt(m3[1])] || m3[1]} ${m3[3]}`;
                const serial = parseFloat(s);
                if (!isNaN(serial) && serial > 40000 && serial < 60000) {
                    const d = new Date((serial - 25569) * 86400 * 1000);
                    return `${MONTHS[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}`;
                }
                return s;
            }
            function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

            function semToDate(raw) {
                const s = String(raw || '').trim();
                if (!s || s === 'nan' || s === 'undefined' || s === 'null') return null;
                const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (m1) return new Date(Date.UTC(+m1[1], +m1[2] - 1, +m1[3]));
                const m2 = s.match(/^([A-Za-z]{3})-(\d{2})$/);
                if (m2) { const mi = MONTHS.indexOf(cap(m2[1])); if (mi > 0) return new Date(Date.UTC(2000 + parseInt(m2[2]), mi - 1, 1)); }
                const m3 = s.match(/^([A-Za-z]{3})\s+(\d{4})$/);
                if (m3) { const mi = MONTHS.indexOf(cap(m3[1])); if (mi > 0) return new Date(Date.UTC(+m3[2], mi - 1, 1)); }
                const m4 = s.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
                if (m4) return new Date(Date.UTC(+m4[2], +m4[1] - 1, 1));
                return null;
            }

            function semToStr(raw) {
                const d = semToDate(raw);
                if (!d) return String(raw || '');
                const mon = MONTHS[d.getUTCMonth() + 1];
                const yy = String(d.getUTCFullYear()).slice(2);
                return mon ? `${mon}-${yy}` : String(raw || '');
            }

            // ═══════════════════════════════════════════════════════════════
            // DURATION PARSING — FIX #1: Robust multi-format parsing
            // Supports: "4 Weeks", "4W", "4-Week", "4 Week Standard", etc.
            // Falls back to Total_Assignments if Duration field is blank/0
            // ═══════════════════════════════════════════════════════════════
            function parseDurationWeeks(durStr) {
                if (!durStr) return 0;
                const s = String(durStr).trim();
                // Match leading number: "4 Weeks", "12W", "4-week", "04 weeks"
                const m = s.match(/^(\d+)/);
                if (m) { const n = parseInt(m[1]); if (n > 0) return n; }
                // Spelled out: "Four", "Eight", "Twelve"
                const words = { four: 4, eight: 8, twelve: 12, six: 6, ten: 10, two: 2 };
                const lower = s.toLowerCase();
                for (const [w, n] of Object.entries(words)) { if (lower.startsWith(w)) return n; }
                return 0;
            }

            // Built-in bestN rules: key="${dw}_${ta}" → bestN
            // 12W → best 8 is the KEY fix for the reported issue
            const BUILTIN_BEST = {
                '4_4': 3, '8_8': 6, '12_12': 8,
                '4_8': 6, '8_12': 8, '12_16': 10,
            };

            function getBuiltInBestN(dw, ta) {
                const key = `${dw}_${ta}`;
                return BUILTIN_BEST[key] ?? null;
            }

            // ═══════════════════════════════════════════════════════════════
            // NUMERIC COLS — using Float64 for out_of_25 to fix FIX #4 precision
            // ═══════════════════════════════════════════════════════════════
            const NUMERIC_COLS = new Set(['Total_Assignments', 'best_assignments', 'out_of_25',
                'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14']);
            // These need double precision (Float64)
            const FLOAT64_COLS = new Set(['out_of_25']);

            // ═══════════════════════════════════════════════════════════════
            // COLUMNAR STORE
            // ═══════════════════════════════════════════════════════════════
            let store = null;
            let origCols = [];
            let baseCols = [];
            let groups = [];
            let storeIndex = null;

            function normCell(v) { return String(v == null ? '' : v).trim(); }
            function normKey(v) { return normCell(v).toLowerCase(); }
            function sanitizeCols(cols) {
                const out = (cols || []).map(c => String(c == null ? '' : c));
                if (out.length) out[0] = out[0].replace(/^\uFEFF/, '');
                return out;
            }
            function normalizeParsedRows(rows, rawCols, safeCols) {
                let changed = false;
                for (let i = 0; i < safeCols.length; i++) {
                    if (safeCols[i] !== String(rawCols[i] == null ? '' : rawCols[i])) { changed = true; break; }
                }
                if (!changed) return rows;
                return rows.map(row => {
                    const out = {};
                    safeCols.forEach((c, i) => { out[c] = row[rawCols[i]] != null ? row[rawCols[i]] : ''; });
                    return out;
                });
            }

            function buildStore(rows, cols) {
                const N = rows.length;
                const s = { rowCount: N, cols, strings: {}, floats: {}, doubles: {} };
                const numCols = cols.filter(c => NUMERIC_COLS.has(c) && !FLOAT64_COLS.has(c));
                const dblCols = cols.filter(c => FLOAT64_COLS.has(c));
                const strCols = cols.filter(c => !NUMERIC_COLS.has(c) && c !== 'sem');

                for (const c of numCols) s.floats[c] = new Float32Array(N);
                for (const c of dblCols) s.doubles[c] = new Float64Array(N); // FIX #4: double precision
                for (const c of strCols) s.strings[c] = new Array(N);

                const semMap = new Map();
                s.semIdx = new Uint16Array(N);
                s.semRaw = []; // keep raw for semToDate
                s.semDisplay = [];
                s.semExcel = [];

                for (let i = 0; i < N; i++) {
                    const row = rows[i];
                    for (const c of numCols) { const v = parseFloat(row[c]); s.floats[c][i] = isNaN(v) ? NaN : v; }
                    for (const c of dblCols) { const v = parseFloat(row[c]); s.doubles[c][i] = isNaN(v) ? NaN : v; }
                    for (const c of strCols) s.strings[c][i] = row[c] ?? '';
                    const semRaw = row['sem'] ?? '';
                    if (!semMap.has(semRaw)) {
                        semMap.set(semRaw, semMap.size);
                        s.semRaw.push(semRaw);
                        s.semDisplay.push(fmtSem(semRaw));
                        s.semExcel.push(semToStr(semRaw));
                    }
                    s.semIdx[i] = semMap.get(semRaw);
                }
                return s;
            }

            function buildStoreIndex() {
                if (!store) return null;
                const emailCol = findEmailCol(origCols) || 'EmailId';
                const courseCol = findCourseCol(origCols) || 'new_courseid';
                const emailSet = new Set();
                const courseSetLower = new Set();
                const emailCourseSet = new Set();
                const courseRows = new Map();
                for (let i = 0; i < store.rowCount; i++) {
                    const email = normKey(getStr(emailCol, i));
                    const courseRaw = normCell(getStr(courseCol, i));
                    const course = courseRaw.toLowerCase();
                    if (email) emailSet.add(email);
                    if (courseRaw) {
                        courseSetLower.add(course);
                        if (!courseRows.has(courseRaw)) courseRows.set(courseRaw, []);
                        courseRows.get(courseRaw).push(i);
                    }
                    if (email && course) emailCourseSet.add(`${email}|${course}`);
                }
                const courseList = [...courseRows.keys()].sort();
                const courseCounts = {};
                courseList.forEach(c => { courseCounts[c] = courseRows.get(c).length; });
                return { emailCol, courseCol, emailSet, courseSetLower, emailCourseSet, courseRows, courseList, courseCounts };
            }

            function buildKeyedRowIndex(rows, cols) {
                const emailCol = findEmailCol(cols) || '';
                const courseCol = findCourseCol(cols) || '';
                const semCol = findSemCol(cols) || '';
                const keyToRow = new Map();
                const keySet = new Set();
                const emailSet = new Set();
                const courseSetLower = new Set();
                const courseCounts = {};
                const rowsByCourse = new Map();
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const email = normKey(emailCol ? row[emailCol] : '');
                    const courseRaw = normCell(courseCol ? row[courseCol] : '');
                    const course = courseRaw.toLowerCase();
                    if (courseRaw) {
                        courseSetLower.add(course);
                        courseCounts[courseRaw] = (courseCounts[courseRaw] || 0) + 1;
                        if (!rowsByCourse.has(courseRaw)) rowsByCourse.set(courseRaw, []);
                        rowsByCourse.get(courseRaw).push(row);
                    }
                    if (email) {
                        emailSet.add(email);
                        const key = courseCol ? `${email}|${course}` : email;
                        keySet.add(key);
                        keyToRow.set(key, row);
                    }
                }
                return {
                    emailCol, courseCol, semCol,
                    keyToRow, keySet, emailSet, courseSetLower,
                    courseCounts, rowsByCourse,
                    courseList: Object.keys(courseCounts).sort()
                };
            }

            function finalizeMainLoadUI(fileName) {
                storeIndex = buildStoreIndex();
                const total = store ? store.rowCount : 0;
                const uniqueCourses = storeIndex ? storeIndex.courseList.length : 0;
                const extR = groups.filter(g => g.isExt).reduce((s, g) => s + g.rows.length, 0);

                buildInsights();
                buildDurStrip();
                buildDropdown();
                buildCheckboxes();
                buildAssignmentLogicUI();
                $('al-sec').style.display = 'block';
                updateToolScoreRef();

                $('kT').textContent = total.toLocaleString();
                $('kC').textContent = uniqueCourses.toLocaleString();
                $('kG').textContent = groups.length;
                $('kS').textContent = (total - extR).toLocaleString();
                $('kE').textContent = extR.toLocaleString();

                $('uz').classList.add('loaded');
                $('uz-fn').textContent = `✓ ${fileName} — ${total.toLocaleString()} rows`;
                $('uz-t').textContent = 'File loaded successfully';
                $('orig-info').textContent = `${total.toLocaleString()} rows · ${origCols.length} columns · original untouched`;
                $('results').style.display = 'block';
                goto('vw-sec');
            }

            function getStr(col, i) { return store.strings[col]?.[i] ?? ''; }
            function getNum(col, i) {
                if (FLOAT64_COLS.has(col)) return store.doubles[col]?.[i];
                return store.floats[col]?.[i];
            }
            function getSemDisplay(i) { return store.semDisplay[store.semIdx[i]] ?? ''; }
            function getSemExcel(i) { return store.semExcel[store.semIdx[i]] ?? ''; }
            function getSemRaw(i) { return store.semRaw[store.semIdx[i]] ?? ''; }

            function createMainCsvBuilder(cols, rawCols) {
                const numCols = cols.filter(c => NUMERIC_COLS.has(c) && !FLOAT64_COLS.has(c));
                const dblCols = cols.filter(c => FLOAT64_COLS.has(c));
                const strCols = cols.filter(c => !NUMERIC_COLS.has(c) && c !== 'sem');
                const rawColMap = {};
                cols.forEach((c, i) => { rawColMap[c] = rawCols && rawCols[i] != null ? String(rawCols[i]) : c; });
                const builder = {
                    cols,
                    numCols, dblCols, strCols,
                    rawColMap,
                    strings: {}, floatRows: {}, doubleRows: {},
                    semMap: new Map(), semIdx: [], semRaw: [], semDisplay: [], semExcel: [],
                    gmapArr: {}, total: 0
                };
                for (const c of numCols) builder.floatRows[c] = [];
                for (const c of dblCols) builder.doubleRows[c] = [];
                for (const c of strCols) builder.strings[c] = [];
                return builder;
            }

            function appendMainCsvRows(builder, rows) {
                for (let r = 0; r < rows.length; r++) {
                    const row = rows[r];
                    const i = builder.total++;
                    for (const c of builder.numCols) {
                        const v = parseFloat(row[builder.rawColMap[c]]);
                        builder.floatRows[c][i] = isNaN(v) ? NaN : v;
                    }
                    for (const c of builder.dblCols) {
                        const v = parseFloat(row[builder.rawColMap[c]]);
                        builder.doubleRows[c][i] = isNaN(v) ? NaN : v;
                    }
                    for (const c of builder.strCols) {
                        const rawKey = builder.rawColMap[c];
                        builder.strings[c][i] = row[rawKey] != null ? String(row[rawKey]) : '';
                    }

                    const semKey = builder.rawColMap['sem'] || 'sem';
                    const semRaw = row[semKey] != null ? String(row[semKey]) : '';
                    if (!builder.semMap.has(semRaw)) {
                        builder.semMap.set(semRaw, builder.semMap.size);
                        builder.semRaw.push(semRaw);
                        builder.semDisplay.push(fmtSem(semRaw));
                        builder.semExcel.push(semToStr(semRaw));
                    }
                    builder.semIdx[i] = builder.semMap.get(semRaw);

                    const durStr = builder.strings['Duration']?.[i] ?? '';
                    let dw = parseDurationWeeks(durStr);
                    const tav = builder.floatRows['Total_Assignments']?.[i];
                    const ta = (!isNaN(tav) && tav > 0) ? Math.round(tav) : (dw || 0);
                    if (!dw && ta > 0) dw = ta <= 4 ? 4 : ta <= 8 ? 8 : ta <= 12 ? 12 : ta;

                    const bnv = builder.floatRows['best_assignments']?.[i];
                    const builtIn = getBuiltInBestN(dw, ta);
                    const bn = builtIn !== null ? builtIn : (!isNaN(bnv) && bnv > 0) ? Math.round(bnv) : Math.ceil(ta * 0.75) || 1;
                    const isExt = ta > dw && dw > 0;
                    const key = `${dw}_${ta}`;

                    if (!builder.gmapArr[key]) {
                        const weekPart = dw > 0 ? `${dw}W` : '?W';
                        const asnPart = `A1-A${ta}`;
                        builder.gmapArr[key] = {
                            key,
                            label: isExt ? `${weekPart} Extended ${asnPart}` : `${weekPart} Standard ${asnPart}`,
                            shortLabel: isExt ? `${dw > 0 ? dw : '?'}-Week Extended` : `${dw > 0 ? dw : '?'}-Week Standard`,
                            durLabel: `${dw > 0 ? dw : '?'} Weeks`,
                            isExt, dw, maxA: ta || 1, bestN: bn,
                            _tmp: [], _summary: new Map()
                        };
                    }
                    const g = builder.gmapArr[key];
                    g._tmp.push(i);

                    const cid = builder.strings['new_courseid']?.[i] || builder.strings['Course Id']?.[i] || 'Unknown';
                    if (!g._summary.has(cid)) {
                        g._summary.set(cid, {
                            Duration: builder.strings['Duration']?.[i] || '',
                            sem: builder.semDisplay[builder.semIdx[i]] || '',
                            semExcel: builder.semExcel[builder.semIdx[i]] || '',
                            ta: builder.floatRows['Total_Assignments']?.[i] || '',
                            bn: builder.floatRows['best_assignments']?.[i] || '',
                            count: 0, scoreSum: 0
                        });
                    }
                    const sum = g._summary.get(cid);
                    sum.count++;
                    const s25v = builder.doubleRows['out_of_25']?.[i];
                    sum.scoreSum += isNaN(s25v) ? 0 : s25v;
                }
            }

            function finalizeMainCsvBuilder(builder) {
                const total = builder.total;
                const nextStore = {
                    rowCount: total,
                    cols: builder.cols,
                    strings: builder.strings,
                    floats: {},
                    doubles: {},
                    semRaw: builder.semRaw,
                    semDisplay: builder.semDisplay,
                    semExcel: builder.semExcel,
                    semIdx: builder.semMap.size <= 65535 ? Uint16Array.from(builder.semIdx) : Uint32Array.from(builder.semIdx)
                };
                for (const c of builder.numCols) nextStore.floats[c] = Float32Array.from(builder.floatRows[c]);
                for (const c of builder.dblCols) nextStore.doubles[c] = Float64Array.from(builder.doubleRows[c]);

                const nextGroups = Object.values(builder.gmapArr).sort((a, b) => a.dw - b.dw || a.isExt - b.isExt || a.maxA - b.maxA);
                for (const g of nextGroups) {
                    g.rows = Int32Array.from(g._tmp);
                    delete g._tmp;
                    g.hdrs = [...baseCols];
                    for (let i = 1; i <= g.maxA; i++) g.hdrs.push(`A${i}`);
                    g.summary = [...g._summary.entries()]
                        .map(([cid, v]) => ({ cid, ...v, avg: Math.round(v.scoreSum / v.count * 100) / 100 }))
                        .sort((a, b) => b.count - a.count);
                    delete g._summary;
                }
                return { store: nextStore, groups: nextGroups, total };
            }

            function processMainCsvFile(file) {
                return new Promise((resolve, reject) => {
                    let builder = null;
                    let rowCount = 0;
                    Papa.parse(file, {
                        header: true,
                        worker: true,
                        skipEmptyLines: true,
                        chunkSize: 8 * 1024 * 1024,
                        chunk: (results, parser) => {
                            try {
                                const rows = results.data || [];
                                if (!rows.length) return;
                                if (!builder) {
                                    const rawCols = (results.meta.fields || Object.keys(rows[0] || {})).map(c => String(c == null ? '' : c));
                                    const cols = sanitizeCols(rawCols);
                                    if (!cols.length) return;
                                    origCols = cols;
                                    baseCols = origCols.filter(c => !/^A\d+$/i.test(c.trim()));
                                    builder = createMainCsvBuilder(origCols, rawCols);
                                }
                                appendMainCsvRows(builder, rows);
                                rowCount = builder.total;
                                const cursor = results.meta && typeof results.meta.cursor === 'number' ? results.meta.cursor : 0;
                                const pct = Math.min(78, 8 + Math.round((cursor / file.size) * 68));
                                pOv(pct, `Parsed ${rowCount.toLocaleString()} rows`, 'Streaming CSV into column store…');
                                if (rowCount && rowCount % 200000 === 0) {
                                    parser.pause();
                                    setTimeout(() => parser.resume(), 0);
                                }
                            } catch (err) {
                                parser.abort();
                                reject(err);
                            }
                        },
                        complete: () => {
                            try {
                                if (!builder || !builder.total) { resolve({ store: null, groups: [], total: 0 }); return; }
                                pOv(82, `Parsed ${builder.total.toLocaleString()} rows`, 'Finalising store…');
                                resolve(finalizeMainCsvBuilder(builder));
                            } catch (err) { reject(err); }
                        },
                        error: reject
                    });
                });
            }

            // ═══════════════════════════════════════════════════════════════
            // SCORE CACHE — per group, per blankMode
            // ═══════════════════════════════════════════════════════════════
            const scoreCache = new Map();

            function buildScoreCache(g, blankMode) {
                const ck = g.key + '|' + blankMode;
                const ex = scoreCache.get(ck); if (ex) return ex;

                const N = g.rows.length;
                const bestAvgArr = new Float64Array(N); // FIX #4: use double
                const score25Arr = new Float64Array(N);
                const tmp = new Float64Array(g.maxA);

                for (let ri = 0; ri < N; ri++) {
                    const si = g.rows[ri];
                    for (let a = 0; a < g.maxA; a++) {
                        const v = getNum(`A${a + 1}`, si);
                        tmp[a] = (isNaN(v) && blankMode) ? 0 : (isNaN(v) ? 0 : v);
                    }
                    let sum = 0;
                    if (g.bestN >= g.maxA) { for (let a = 0; a < g.maxA; a++) sum += tmp[a]; }
                    else {
                        const s2 = tmp.slice(0, g.maxA);
                        s2.sort((a, b) => b - a);
                        for (let k = 0; k < g.bestN; k++) sum += s2[k];
                    }
                    const avg = Math.round(sum / g.bestN * 100) / 100;
                    bestAvgArr[ri] = avg;
                    score25Arr[ri] = Math.round(avg * 0.25 * 100) / 100;
                }

                const cache = { bestAvg: bestAvgArr, score25: score25Arr, blankMode, ck };
                scoreCache.set(ck, cache);
                return cache;
            }

            function invalidateScoreCache() { scoreCache.clear(); }

            // ═══════════════════════════════════════════════════════════════
            // FILE PARSER
            // ═══════════════════════════════════════════════════════════════
            function parseFile(file) {
                return new Promise((res, rej) => {
                    if (file.name.toLowerCase().endsWith('.csv')) {
                        Papa.parse(file, {
                            header: true, skipEmptyLines: true, worker: true,
                            complete: r => {
                                const rawCols = (r.meta.fields || []).map(c => String(c == null ? '' : c));
                                const cols = sanitizeCols(rawCols);
                                res({ cols, rows: normalizeParsedRows(r.data, rawCols, cols) });
                            }, error: rej
                        });
                    } else {
                        const rd = new FileReader();
                        rd.onload = e => {
                            try {
                                const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                                const ws = wb.Sheets[wb.SheetNames[0]];
                                const json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
                                if (!json.length) { res({ cols: [], rows: [] }); return; }
                                const rawCols = Object.keys(json[0]);
                                const cols = sanitizeCols(rawCols);
                                const rows = json.map(row => {
                                    const r = {};
                                    cols.forEach((c, i) => { let v = row[rawCols[i]]; if (v === null || v === undefined) v = ''; r[c] = String(v); });
                                    return r;
                                });
                                res({ cols, rows });
                            } catch (err) { rej(err); }
                        };
                        rd.onerror = rej;
                        rd.readAsArrayBuffer(file);
                    }
                });
            }

            // ═══════════════════════════════════════════════════════════════
            // PROCESS FILE
            // ═══════════════════════════════════════════════════════════════
            function onDrop(e) { e.preventDefault(); dlv(); const f = e.dataTransfer.files[0]; if (f) processFile(f); }
            function onFile(inp) { const f = inp.files[0]; if (f) processFile(f); }

            async function processFile(file) {
                try {
                    startMemMonitor();
                    invalidateScoreCache();
                    storeIndex = null;
                    showOv('Reading File', 'Parsing data…', 5, 'Loading into memory');
                    await delay(40);
                    if (file.name.toLowerCase().endsWith('.csv')) {
                        const built = await processMainCsvFile(file);
                        if (!built.store || !built.total) throw new Error('No data rows found');
                        store = built.store;
                        groups = built.groups;
                    } else {
                        const data = await parseFile(file);
                        const rawRows = data.rows;
                        origCols = data.cols;
                        baseCols = origCols.filter(c => !/^A\d+$/i.test(c.trim()));

                        const total = rawRows.length;
                        pOv(18, `Parsed ${total.toLocaleString()} rows`, 'Building columnar store…');
                        await delay(30);

                        store = buildStore(rawRows, origCols);

                        pOv(40, 'Store built', 'Grouping by Duration + Total_Assignments…');
                        await delay(20);

                        const gmapArr = {};
                        const CHUNK = 100000;

                        for (let start = 0; start < total; start += CHUNK) {
                            const end = Math.min(start + CHUNK, total);
                            for (let i = start; i < end; i++) {
                                const durStr = store.strings['Duration']?.[i] ?? '';
                                let dw = parseDurationWeeks(durStr);
                                const tav = store.floats['Total_Assignments']?.[i];
                                const ta = (!isNaN(tav) && tav > 0) ? Math.round(tav) : (dw || 0);
                                if (!dw && ta > 0) dw = ta <= 4 ? 4 : ta <= 8 ? 8 : ta <= 12 ? 12 : ta;

                                const bnv = store.floats['best_assignments']?.[i];
                                const builtIn = getBuiltInBestN(dw, ta);
                                const bn = builtIn !== null ? builtIn : (!isNaN(bnv) && bnv > 0) ? Math.round(bnv) : Math.ceil(ta * 0.75) || 1;
                                const isExt = ta > dw && dw > 0;
                                const key = `${dw}_${ta}`;

                                if (!gmapArr[key]) {
                                    const weekPart = dw > 0 ? `${dw}W` : '?W';
                                    const asnPart = `A1-A${ta}`;
                                    gmapArr[key] = {
                                        key,
                                        label: isExt ? `${weekPart} Extended ${asnPart}` : `${weekPart} Standard ${asnPart}`,
                                        shortLabel: isExt ? `${dw > 0 ? dw : '?'}-Week Extended` : `${dw > 0 ? dw : '?'}-Week Standard`,
                                        durLabel: `${dw > 0 ? dw : '?'} Weeks`,
                                        isExt, dw, maxA: ta || 1, bestN: bn,
                                        _tmp: []
                                    };
                                }
                                gmapArr[key]._tmp.push(i);
                            }
                            pOv(40 + Math.round((end / total) * 25), `Grouped ${end.toLocaleString()} / ${total.toLocaleString()} rows`, `Chunk ${Math.ceil(end / CHUNK)}…`);
                            await delay(0);
                        }

                        groups = Object.values(gmapArr).sort((a, b) => a.dw - b.dw || a.isExt - b.isExt || a.maxA - b.maxA);
                        for (const g of groups) { g.rows = new Int32Array(g._tmp); delete g._tmp; }

                        pOv(68, 'Building summaries…');
                        await delay(20);

                        for (const g of groups) {
                            const cm = {};
                            g.hdrs = [...baseCols];
                            for (let i = 1; i <= g.maxA; i++) g.hdrs.push(`A${i}`);

                            for (let ri = 0; ri < g.rows.length; ri++) {
                                const si = g.rows[ri];
                                const cid = getStr('new_courseid', si) || getStr('Course Id', si) || 'Unknown';
                                if (!cm[cid]) cm[cid] = { Duration: getStr('Duration', si), sem: getSemDisplay(si), semExcel: getSemExcel(si), ta: getNum('Total_Assignments', si) || '', bn: getNum('best_assignments', si) || '', count: 0, scoreSum: 0 };
                                cm[cid].count++;
                                const s25v = getNum('out_of_25', si);
                                cm[cid].scoreSum += isNaN(s25v) ? 0 : s25v;
                            }
                            g.summary = Object.entries(cm)
                                .map(([cid, v]) => ({ cid, ...v, avg: Math.round(v.scoreSum / v.count * 100) / 100 }))
                                .sort((a, b) => b.count - a.count);
                        }
                    }

                    pOv(82, 'Priming score cache…');
                    await delay(15);
                    for (const g of groups) buildScoreCache(g, true);

                    pOv(90, 'Building UI…');
                    await delay(15);
                    finalizeMainLoadUI(file.name);

                    pOv(100, 'Done!');
                    await delay(280); hideOv();
                    toast(`${store.rowCount.toLocaleString()} rows · ${groups.length} groups · ready`, 's');
                } catch (e) { hideOv(); toast('Error: ' + e.message, 'e', 8000); console.error(e); }
            }

            // ═══════════════════════════════════════════════════════════════
            // VIRTUAL SCROLL
            // ═══════════════════════════════════════════════════════════════
            const ROW_H = 32, BUF = 8;
            let vsG = null, vsHdrs = [], vsOpts = {};
            let vsScrollEl = null, vsInnerEl = null, vsRowsEl = null;
            let vsRaf = null, vsDebounce = null, vsFilterToken = 0;
            let vsSearch = '', vsColFilters = {}, vsSortCol = null, vsSortDir = 0;
            let vsFilteredIdx = null;

            function initVS(g, opts) {
                vsG = g; vsOpts = opts;
                vsHdrs = [...g.hdrs];
                if (opts.avg) vsHdrs.push('Best_Avg');
                if (opts.s25) vsHdrs.push('Score_25');
                if (opts.match) vsHdrs.push('Match');
                vsSearch = ''; vsColFilters = {}; vsSortCol = null; vsSortDir = 0;
                const si = $('vs-search'); if (si) si.value = '';
                vsScrollEl = $('vs-scroll'); vsInnerEl = $('vs-inner'); vsRowsEl = $('vs-rows');
                vsScrollEl.onscroll = () => {
                    $('vs-head').querySelector('div') && ($('vs-head').querySelector('div').scrollLeft = vsScrollEl.scrollLeft);
                    scheduleRender();
                };
                applyFilterSort();
            }

            async function applyFilterSort() {
                if (!vsG) return;
                const token = ++vsFilterToken;
                const FCHUNK = 100000;
                const total = vsG.rows.length;
                const cache = buildScoreCache(vsG, vsOpts.blank || $('ck-blank').checked);
                const q = vsSearch ? vsSearch.toLowerCase() : null;
                const hasColFilter = Object.keys(vsColFilters).some(k => vsColFilters[k]);

                if (!q && !hasColFilter && !vsSortCol) {
                    vsFilteredIdx = null;
                    updatePills(total, total);
                    renderVSHead();
                    vsInnerEl.style.height = (total * ROW_H) + 'px';
                    vsRowsEl.innerHTML = '';
                    vsScrollEl.scrollTop = 0;
                    renderVSRows(0);
                    renderScorePanel(null, cache);
                    return;
                }

                if (total > 500000) $('p-r').innerHTML = `<i class="bi bi-hourglass-split"></i> Filtering…`;

                const result = [];
                for (let start = 0; start < total; start += FCHUNK) {
                    if (vsFilterToken !== token) return;
                    const end = Math.min(start + FCHUNK, total);
                    for (let ri = start; ri < end; ri++) {
                        const si = vsG.rows[ri];
                        if (q) {
                            let hit = false;
                            for (const h of vsG.hdrs) {
                                let v;
                                if (h === 'sem') v = getSemDisplay(si);
                                else if (NUMERIC_COLS.has(h)) { const fv = getNum(h, si); v = isNaN(fv) ? '' : String(fv); }
                                else v = getStr(h, si);
                                if (v.toLowerCase().includes(q)) { hit = true; break; }
                            }
                            if (!hit) continue;
                        }
                        if (hasColFilter) {
                            let pass = true;
                            for (const [col, val] of Object.entries(vsColFilters)) {
                                if (!val) continue;
                                let v;
                                if (col === 'sem') v = getSemDisplay(si);
                                else if (NUMERIC_COLS.has(col)) { const fv = getNum(col, si); v = isNaN(fv) ? '' : String(fv); }
                                else v = getStr(col, si);
                                if (v !== val) { pass = false; break; }
                            }
                            if (!pass) continue;
                        }
                        result.push(ri);
                    }
                    if (total > 500000) await delay(0);
                }
                if (vsFilterToken !== token) return;

                if (vsSortCol && result.length > 0) {
                    const isNum = /^(A\d+|out_of_25|Total_Assignments|best_assignments|Best_Avg|Score_25)$/.test(vsSortCol);
                    const dir = vsSortDir;
                    result.sort((a, b) => {
                        const sia = vsG.rows[a], sib = vsG.rows[b];
                        let va, vb;
                        if (vsSortCol === 'Best_Avg') { va = cache.bestAvg[a]; vb = cache.bestAvg[b]; }
                        else if (vsSortCol === 'Score_25') { va = cache.score25[a]; vb = cache.score25[b]; }
                        else if (vsSortCol === 'sem') { va = getSemDisplay(sia); vb = getSemDisplay(sib); }
                        else if (NUMERIC_COLS.has(vsSortCol)) { va = getNum(vsSortCol, sia) || 0; vb = getNum(vsSortCol, sib) || 0; }
                        else { va = getStr(vsSortCol, sia).toLowerCase(); vb = getStr(vsSortCol, sib).toLowerCase(); }
                        return dir * (isNum ? (va - vb) : (va < vb ? -1 : va > vb ? 1 : 0));
                    });
                }

                vsFilteredIdx = new Int32Array(result);
                updatePills(result.length, total);
                renderVSHead();
                vsInnerEl.style.height = (result.length * ROW_H) + 'px';
                vsRowsEl.innerHTML = '';
                vsScrollEl.scrollTop = 0;
                renderVSRows(0);
                renderScorePanel(vsFilteredIdx, cache);
            }

            function updatePills(filtered, total) {
                $('p-r').innerHTML = `<i class="bi bi-people-fill"></i> ${filtered < total ? `${filtered.toLocaleString()} / ${total.toLocaleString()} rows` : total.toLocaleString() + ' rows'}`;
                const pw = $('p-w');
                if (filtered < total) { pw.style.display = ''; pw.innerHTML = `<i class="bi bi-funnel-fill"></i> ${(total - filtered).toLocaleString()} hidden`; }
                else pw.style.display = 'none';
            }

            function renderVSHead() {
                const headEl = $('vs-head');
                let th = '';
                vsHdrs.forEach(h => {
                    let cls = '';
                    if (h === 'Best_Avg') cls = 'h-avg';
                    else if (h === 'Score_25') cls = 'h-s25';
                    else if (h === 'Match') cls = 'h-match';
                    const isSorted = vsSortCol === h;
                    const sortIco = isSorted ? (vsSortDir === 1 ? '▲' : '▼') : '⇅';
                    const sortClr = isSorted ? 'var(--txt)' : 'var(--txt3)';
                    let filterBtn = '';
                    if (!['Best_Avg', 'Score_25', 'Match'].includes(h)) {
                        const uniq = new Set();
                        for (let i = 0; i < vsG.rows.length && uniq.size < 201; i++) {
                            const si = vsG.rows[i];
                            let v = h === 'sem' ? getSemDisplay(si) : NUMERIC_COLS.has(h) ? (() => { const fv = getNum(h, si); return isNaN(fv) ? '' : String(fv); })() : getStr(h, si);
                            uniq.add(v);
                        }
                        if (uniq.size <= 200) {
                            const opts = [...uniq].sort().map(v => `<option value="${v.replace(/"/g, '&quot;')}" ${vsColFilters[h] === v ? 'selected' : ''}>${v || '(blank)'}</option>`).join('');
                            filterBtn = `<select onchange="setColFilter('${h}',this.value)" style="margin-left:3px;font-size:9px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;color:var(--txt2);cursor:pointer;max-width:68px;outline:none;padding:1px 2px">
          <option value="">All</option>${opts}</select>`;
                        }
                    }
                    th += `<th class="${cls}" style="white-space:nowrap">
      <div style="display:flex;align-items:center;gap:3px;padding:8px 10px">
        <span onclick="cycleSort('${h}')" style="cursor:pointer;flex:1">${h}</span>
        <span onclick="cycleSort('${h}')" style="color:${sortClr};cursor:pointer;font-size:10px">${sortIco}</span>
        ${filterBtn}
      </div>
    </th>`;
                });
                headEl.innerHTML = `<div style="overflow-x:hidden"><table style="width:100%;border-collapse:collapse;table-layout:auto;white-space:nowrap"><thead><tr>${th}</tr></thead></table></div>`;
            }

            function cycleSort(col) {
                if (vsSortCol === col) { vsSortDir = vsSortDir === 1 ? -1 : vsSortDir === -1 ? 0 : 1; if (vsSortDir === 0) vsSortCol = null; }
                else { vsSortCol = col; vsSortDir = 1; }
                applyFilterSort();
            }
            function setColFilter(col, val) { if (val) vsColFilters[col] = val; else delete vsColFilters[col]; applyFilterSort(); }
            function setSearch(val) { vsSearch = val; if (vsDebounce) clearTimeout(vsDebounce); vsDebounce = setTimeout(applyFilterSort, 220); }
            function clearAllFilters() { vsSearch = ''; vsColFilters = {}; vsSortCol = null; vsSortDir = 0; const si = $('vs-search'); if (si) si.value = ''; applyFilterSort(); toast('Filters cleared', 'i'); }

            function scheduleRender() {
                if (vsRaf) cancelAnimationFrame(vsRaf);
                vsRaf = requestAnimationFrame(() => renderVSRows(vsScrollEl.scrollTop));
            }

            function renderVSRows(scrollTop) {
                if (!vsG) return;
                const cache = scoreCache.get(vsG.key + '|' + (vsOpts.blank || $('ck-blank').checked));
                const idxArr = vsFilteredIdx;
                const total = idxArr ? idxArr.length : vsG.rows.length;
                if (total === 0) {
                    vsRowsEl.innerHTML = '<table><tbody><tr><td colspan="99" style="text-align:center;padding:28px;color:var(--txt3);font-size:12px"><i class="bi bi-search" style="display:block;font-size:24px;margin-bottom:8px;opacity:.4"></i>No rows match current filter</td></tr></tbody></table>';
                    return;
                }
                const viewH = vsScrollEl.clientHeight || 400;
                const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - BUF);
                const endIdx = Math.min(total - 1, Math.ceil((scrollTop + viewH) / ROW_H) + BUF);
                vsRowsEl.style.top = (startIdx * ROW_H) + 'px';
                const qL = vsSearch ? vsSearch.toLowerCase() : null;

                let html = `<table style="width:100%;border-collapse:collapse;table-layout:auto;white-space:nowrap"><tbody>`;
                for (let i = startIdx; i <= endIdx; i++) {
                    const ri = idxArr ? idxArr[i] : i;
                    const si = vsG.rows[ri];
                    const bestAvg = cache ? cache.bestAvg[ri] : 0;
                    const score25 = cache ? cache.score25[ri] : 0;
                    const out25 = getNum('out_of_25', si);
                    const isMatch = !isNaN(out25) && Math.abs(score25 - out25) < 0.015;

                    html += `<tr style="height:${ROW_H}px">`;
                    vsG.hdrs.forEach(h => {
                        let v, cls = '';
                        if (h === 'sem') { v = getSemDisplay(si); cls = 't-sem'; }
                        else if (h === 'EmailId') { v = getStr(h, si); cls = 't-email'; }
                        else if (h === 'new_courseid') { v = getStr(h, si); cls = 't-cid'; }
                        else if (h === 'out_of_25') { const fv = getNum(h, si); v = isNaN(fv) ? '' : Math.round(fv * 100) / 100; cls = 't-score'; }
                        else if (/^A\d+$/.test(h)) {
                            const fv = getNum(h, si);
                            if (isNaN(fv)) { v = vsOpts.blank ? '0' : ''; cls = vsOpts.blank ? 't-zero' : ''; }
                            else { v = fv; cls = 't-asgn'; }
                        }
                        else if (NUMERIC_COLS.has(h)) { const fv = getNum(h, si); v = isNaN(fv) ? '' : fv; cls = 't-num'; }
                        else v = getStr(h, si);
                        if (qL && String(v).toLowerCase().includes(qL))
                            v = `<mark style="background:#fef08a;color:#0f172a;border-radius:2px;padding:0 1px">${v}</mark>`;
                        html += `<td class="${cls}">${v}</td>`;
                    });
                    if (vsOpts.avg) html += `<td class="t-avg">${bestAvg}</td>`;
                    if (vsOpts.s25) html += `<td class="t-s25">${score25}</td>`;
                    if (vsOpts.match) html += `<td class="${isMatch ? 't-ok' : 't-diff'}">${isMatch ? '✓ Match' : '✗ Diff'}</td>`;
                    html += '</tr>';
                }
                html += '</tbody></table>';
                vsRowsEl.innerHTML = html;
            }

            // ═══════════════════════════════════════════════════════════════
            // VIEWER CONTROLS
            // ═══════════════════════════════════════════════════════════════
            function getOpts() { return { blank: $('ck-blank').checked, avg: $('ck-avg').checked, s25: $('ck-s25').checked, match: $('ck-match').checked }; }
            function getEOpts() { return { blank: $('ef-blank').checked, avg: $('ef-avg').checked, s25: $('ef-s25').checked, match: $('ef-match').checked }; }
            function curGroup() { return groups.find(g => g.key === $('grp-sel').value); }

            function buildDropdown() {
                const sel = $('grp-sel'); sel.innerHTML = '';
                groups.forEach(g => {
                    const o = document.createElement('option');
                    o.value = g.key;
                    // FIX #1: Use proper label showing actual weeks + assignment range
                    o.textContent = `${g.label} — Best-${g.bestN} — ${g.rows.length.toLocaleString()} rows`;
                    sel.appendChild(o);
                });
                onGroupChange();
            }

            function onGroupChange() {
                const g = curGroup(); if (!g) return;
                const arr = Array.from({ length: g.bestN }, (_, i) => i + 1).join(',');
                $('ft-avg').textContent = `ROUND(SUM(LARGE(A1:A${g.maxA},{${arr}}))/${g.bestN},2) × 0.25`;
                $('p-c').innerHTML = `<i class="bi bi-journal-bookmark-fill"></i> ${g.summary.length} courses`;
                $('p-r').innerHTML = `<i class="bi bi-people-fill"></i> ${g.rows.length.toLocaleString()} rows`;
                $('p-w').style.display = 'none';
                renderSummary(g);
                initVS(g, getOpts());
            }

            function refreshViewer() {
                invalidateScoreCache();
                const g = curGroup(); if (!g) return;
                const o = getOpts();
                buildScoreCache(g, o.blank);
                initVS(g, o);
            }

            // ═══════════════════════════════════════════════════════════════
            // SCORE PANEL
            // ═══════════════════════════════════════════════════════════════
            function renderScorePanel(idxArr, cache) {
                const panel = $('score-panel');
                if (!panel || !vsG || !cache) return;
                const total = vsG.rows.length;
                const filteredLen = idxArr ? idxArr.length : total;
                if (!idxArr || filteredLen === total) { panel.classList.remove('show'); return; }
                if (filteredLen === 0) { panel.classList.remove('show'); return; }

                const SAMPLE_LIMIT = 100000;
                const sampleLen = Math.min(filteredLen, SAMPLE_LIMIT);
                const step = filteredLen / sampleLen;
                let matchCount = 0, diffCount = 0, totalAvg = 0, totalS25 = 0;
                const courseSet = new Set();

                for (let i = 0; i < sampleLen; i++) {
                    const ri = idxArr[Math.min(Math.round(i * step), filteredLen - 1)];
                    const si = vsG.rows[ri];
                    const bestAvg = cache.bestAvg[ri];
                    const score25 = cache.score25[ri];
                    const out25 = getNum('out_of_25', si);
                    if (!isNaN(out25) && Math.abs(score25 - out25) < 0.015) matchCount++; else diffCount++;
                    totalAvg += bestAvg; totalS25 += score25;
                    const cid = getStr('new_courseid', si); if (cid) courseSet.add(cid);
                }
                const n = sampleLen;
                const isSampled = n < filteredLen;
                const matchPct = Math.round(matchCount / n * 100);

                panel.classList.add('show');
                $('sp-title').innerHTML = `<i class="bi bi-calculator-fill"></i> Score Summary — ${filteredLen.toLocaleString()} rows${isSampled ? ` (sample: ${n.toLocaleString()})` : ''}`;
                $('sp-grid').innerHTML = `
    <div class="sp-card"><div class="sp-val" style="color:var(--primary)">${Math.round(totalAvg / n * 100) / 100}</div><div class="sp-lbl">Avg Best_Avg</div></div>
    <div class="sp-card"><div class="sp-val" style="color:var(--accent)">${Math.round(totalS25 / n * 100) / 100}</div><div class="sp-lbl">Avg Score_25</div></div>
    <div class="sp-card" style="background:rgba(0,212,170,.05);border-color:rgba(0,212,170,.2)"><div class="sp-val" style="color:var(--accent)">${matchCount.toLocaleString()} <span style="font-size:13px">(${matchPct}%)</span></div><div class="sp-lbl">✓ Match</div></div>
    <div class="sp-card" style="background:rgba(231,76,60,.05);border-color:rgba(231,76,60,.2)"><div class="sp-val" style="color:var(--danger)">${diffCount.toLocaleString()} <span style="font-size:13px">(${100 - matchPct}%)</span></div><div class="sp-lbl">✗ Diff</div></div>`;
            }

            function renderSummary(g) {
                $('sum-pill').innerHTML = `<i class="bi bi-journal-bookmark-fill"></i> ${g.summary.length}`;
                $('sum-lbl').textContent = g.label;
                let html = '';
                g.summary.forEach((c, i) => {
                    html += `<tr>
      <td class="s-i">${i + 1}</td>
      <td class="s-cid">${c.cid}</td>
      <td><span class="dur-badge ${g.isExt ? 'dur-ext' : 'dur-std'}">${c.Duration || g.label}</span></td>
      <td><span class="sem-badge">${c.sem || '—'}</span></td>
      <td class="s-num">${c.ta || g.maxA}</td>
      <td class="s-best">Best ${c.bn || g.bestN}</td>
      <td class="s-num">${c.count.toLocaleString()}</td>
      <td class="s-best">${c.avg.toFixed(2)}</td>
    </tr>`;
                });
                $('stbody').innerHTML = html;
            }

            // ═══════════════════════════════════════════════════════════════
            // INSIGHTS + DUR STRIP
            // ═══════════════════════════════════════════════════════════════
            function buildInsights() {
                const sems = new Set();
                const lim = Math.min(5000, store.rowCount);
                for (let i = 0; i < lim; i++) { const s = getSemDisplay(i); if (s) sems.add(s); }
                const ext = groups.filter(g => g.isExt);
                const allC = new Set();
                for (let i = 0; i < store.rowCount; i++) { const c = getStr('new_courseid', i); if (c) allC.add(c); }
                $('ins-summary-text').textContent = `${groups.length} groups · ${allC.size} courses · ${store.rowCount.toLocaleString()} rows`;
                $('ins-body').innerHTML = `
    <div class="ins-row"><i class="bi bi-layers-fill" style="color:var(--primary)"></i>
      <span><b>${groups.length} groups:</b> ${groups.map(g => `<span style="font-family:var(--mono);background:rgba(47,128,237,.1);padding:1px 6px;border-radius:3px;font-size:10px;color:var(--primary)">${g.label}</span>`).join(' ')}</span></div>
    <div class="ins-row"><i class="bi bi-calendar-check-fill" style="color:var(--accent)"></i>
      <span><b>Sem:</b> ${[...sems].map(s => `<span style="font-family:var(--mono);background:rgba(0,212,170,.08);color:var(--accent);padding:1px 6px;border-radius:3px;font-size:10px">${s}</span>`).join(' · ')} — timezone-safe, all formats</span></div>
    <div class="ins-row"><i class="bi bi-calculator-fill" style="color:var(--primary)"></i>
      <span><b>Score cache primed</b> — Float64 Best_Avg/Score_25 pre-computed, zero recompute on scroll. 12W→Best 8 built-in.</span></div>
    ${ext.length ? `<div class="ins-row"><i class="bi bi-exclamation-triangle-fill" style="color:var(--warn)"></i>
      <span><b>${ext.length} extended groups:</b> ${ext.map(g => `<span style="font-size:10px;color:var(--warn)">${g.label} (${g.rows.length.toLocaleString()} rows)</span>`).join(', ')}</span></div>` : ''}
    <div class="ins-row"><i class="bi bi-lightning-charge-fill" style="color:var(--accent)"></i>
      <span><b>v14 fixes:</b> Duration 0-week bug fixed · sem blank in Excel fixed · Float64 precision (no more 21.8999996) · Best_Avg/Score_25/Match always in output</span></div>`;
            }

            function toggleIns() {
                const b = $('ins-body'), a = $('ins-arrow');
                const open = b.classList.contains('open');
                b.classList.toggle('open', !open);
                a.classList.toggle('open', !open);
            }

            function buildDurStrip() {
                const durMap = {};
                groups.forEach(g => {
                    const k = g.durLabel || `${g.dw} Weeks`;
                    if (!durMap[k]) durMap[k] = { courses: new Set(), rows: 0, ext: 0, std: 0 };
                    g.summary.forEach(c => durMap[k].courses.add(c.cid));
                    durMap[k].rows += g.rows.length;
                    if (g.isExt) durMap[k].ext += g.rows.length;
                    else durMap[k].std += g.rows.length;
                });
                const totalC = new Set();
                for (let i = 0; i < store.rowCount; i++) { const c = getStr('new_courseid', i); if (c) totalC.add(c); }

                let html = `<div class="dur-card c-total">
    <div class="dur-card-val" style="color:var(--primary)">${totalC.size}</div>
    <div class="dur-card-lbl">Total Courses</div>
    <div class="dur-card-sub">${store.rowCount.toLocaleString()} rows</div>
  </div>`;

                Object.entries(durMap).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([dur, d]) => {
                    html += `<div class="dur-card c-std">
      <div class="dur-card-val" style="color:var(--accent)">${d.courses.size}</div>
      <div class="dur-card-lbl">${dur}</div>
      <div class="dur-card-sub">${d.std.toLocaleString()} std${d.ext ? ` · ${d.ext.toLocaleString()} ext` : ''}</div>
    </div>`;
                });
                groups.filter(g => g.isExt).forEach(g => {
                    html += `<div class="dur-card c-ext">
      <div class="dur-card-val" style="color:var(--warn)">${g.summary.length}</div>
      <div class="dur-card-lbl" style="color:var(--warn)">⚠ ${g.label}</div>
      <div class="dur-card-sub">${g.rows.length.toLocaleString()} rows · Best-${g.bestN}</div>
    </div>`;
                });
                $('dur-strip').innerHTML = html;
            }

            // ═══════════════════════════════════════════════════════════════
            // ORIGINAL DATA DOWNLOAD
            // ═══════════════════════════════════════════════════════════════
            async function dlOriginalCSV() {
                const N = store.rowCount;
                showOv('Preparing Original CSV', `${N.toLocaleString()} rows…`, 10);
                await delay(30);
                const CHUNK = 30000;
                const lines = [origCols.join(',')];
                for (let start = 0; start < N; start += CHUNK) {
                    const end = Math.min(start + CHUNK, N);
                    for (let i = start; i < end; i++) {
                        const cells = origCols.map(h => {
                            let v;
                            if (h === 'sem') v = getSemExcel(i);
                            else if (NUMERIC_COLS.has(h)) { const fv = getNum(h, i); v = isNaN(fv) ? '' : Math.round(fv * 100) / 100; }
                            else v = getStr(h, i);
                            return typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${String(v).replace(/"/g, '""')}"` : v;
                        });
                        lines.push(cells.join(','));
                    }
                    pOv(10 + Math.round((end / N) * 80), `${end.toLocaleString()} / ${N.toLocaleString()} rows`);
                    await delay(0);
                }
                pOv(96, 'Writing…'); await delay(10);
                dlBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), 'Original_Data_Dump.csv');
                hideOv(); toast('CSV downloaded', 's');
            }

            async function dlOriginalXLSX() {
                const N = store.rowCount;
                showOv('Preparing Original XLSX', `${N.toLocaleString()} rows…`, 10);
                await delay(30);
                const aoa = [origCols];
                const CHUNK = 30000;
                for (let start = 0; start < N; start += CHUNK) {
                    const end = Math.min(start + CHUNK, N);
                    for (let i = start; i < end; i++) {
                        aoa.push(origCols.map(h => {
                            if (h === 'sem') return getSemExcel(i) || '';
                            if (NUMERIC_COLS.has(h)) { const fv = getNum(h, i); return isNaN(fv) ? '' : Math.round(fv * 100) / 100; }
                            return getStr(h, i);
                        }));
                    }
                    pOv(10 + Math.round((end / N) * 75), `${end.toLocaleString()} / ${N.toLocaleString()} rows`);
                    await delay(0);
                }
                pOv(90, 'Writing XLSX…'); await delay(20);
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                ws['!cols'] = origCols.map(h => ({ wch: h === 'EmailId' ? 34 : h === 'new_courseid' ? 16 : 10 }));
                XLSX.utils.book_append_sheet(wb, ws, 'Original_Dump');
                XLSX.writeFile(wb, 'Original_Data_Dump.xlsx');
                hideOv(); toast('XLSX downloaded', 's');
            }

            // ═══════════════════════════════════════════════════════════════
            // COPY ALL
            // ═══════════════════════════════════════════════════════════════
            async function copyAll() {
                const g = curGroup(); if (!g) return;
                const o = getOpts();
                const cache = buildScoreCache(g, o.blank);
                const hdrs = [...g.hdrs, ...(o.avg ? ['Best_Avg'] : []), ...(o.s25 ? ['Score_25'] : []), ...(o.match ? ['Match'] : [])];
                const rowsToUse = vsFilteredIdx || Array.from({ length: g.rows.length }, (_, i) => i);
                toast(`Preparing ${rowsToUse.length.toLocaleString()} rows…`, 'i');
                await delay(10);
                const lines = [hdrs.join('\t')];
                for (let ri = 0; ri < rowsToUse.length; ri++) {
                    const idx = vsFilteredIdx ? rowsToUse[ri] : ri;
                    const si = g.rows[idx];
                    const bestAvg = cache.bestAvg[idx];
                    const score25 = cache.score25[idx];
                    const out25 = getNum('out_of_25', si);
                    const cells = g.hdrs.map(h => {
                        if (h === 'sem') return getSemExcel(si);
                        if (/^A\d+$/.test(h)) { const fv = getNum(h, si); return isNaN(fv) ? (o.blank ? 0 : '') : fv; }
                        if (NUMERIC_COLS.has(h)) { const fv = getNum(h, si); return isNaN(fv) ? '' : Math.round(fv * 100) / 100; }
                        return getStr(h, si);
                    });
                    if (o.avg) cells.push(bestAvg);
                    if (o.s25) cells.push(score25);
                    if (o.match) cells.push(!isNaN(out25) && Math.abs(score25 - out25) < 0.015 ? '✓ Match' : '✗ Diff');
                    lines.push(cells.join('\t'));
                }
                navigator.clipboard.writeText(lines.join('\n'))
                    .then(() => toast(`Copied ${rowsToUse.length.toLocaleString()} rows!`, 's'))
                    .catch(() => toast('Copy failed — use CSV', 'e'));
            }

            function copySummary() {
                const g = curGroup(); if (!g) return;
                let txt = '#\tCourse ID\tDuration\tSem\tTotal\tBest Of\tRows\tAvg /25\n';
                g.summary.forEach((c, i) => { txt += `${i + 1}\t${c.cid}\t${c.Duration}\t${c.semExcel}\t${c.ta}\t${c.bn}\t${c.count}\t${c.avg}\n`; });
                navigator.clipboard.writeText(txt).then(() => toast('Copied!', 's')).catch(() => toast('Failed', 'e'));
            }

            // ═══════════════════════════════════════════════════════════════
            // CSV DOWNLOAD
            // ═══════════════════════════════════════════════════════════════
            async function dlCSV(type) {
                const g = curGroup(); if (!g) return;
                const o = getOpts();
                const cache = buildScoreCache(g, o.blank);
                let csv, fn;

                if (type === 'data') {
                    const rowsToUse = vsFilteredIdx || new Int32Array(Array.from({ length: g.rows.length }, (_, i) => i));
                    const isFiltered = rowsToUse.length < g.rows.length;
                    showOv('Preparing CSV', `${rowsToUse.length.toLocaleString()} rows…`, 10); await delay(20);
                    const hdrs = [...g.hdrs, ...(o.avg ? ['Best_Avg'] : []), ...(o.s25 ? ['Score_25'] : []), ...(o.match ? ['Match'] : [])];
                    const rows = [hdrs.join(',')];
                    const CHUNK = 30000;
                    for (let i = 0; i < rowsToUse.length; i += CHUNK) {
                        const end = Math.min(i + CHUNK, rowsToUse.length);
                        for (let j = i; j < end; j++) {
                            const ri = rowsToUse[j];
                            const si = g.rows[ri];
                            const bestAvg = cache.bestAvg[ri];
                            const score25 = cache.score25[ri];
                            const out25 = getNum('out_of_25', si);
                            const cells = g.hdrs.map(h => {
                                let v;
                                if (h === 'sem') v = getSemExcel(si) || ''; // FIX #2: fallback for blank sem
                                else if (/^A\d+$/.test(h)) { const fv = getNum(h, si); v = isNaN(fv) ? (o.blank ? 0 : '') : fv; }
                                else if (NUMERIC_COLS.has(h)) { const fv = getNum(h, si); v = isNaN(fv) ? '' : Math.round(fv * 100) / 100; }
                                else v = getStr(h, si);
                                return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
                            });
                            if (o.avg) cells.push(bestAvg);
                            if (o.s25) cells.push(score25);
                            if (o.match) cells.push(!isNaN(out25) && Math.abs(score25 - out25) < 0.015 ? '✓ Match' : '✗ Diff');
                            rows.push(cells.join(','));
                        }
                        pOv(10 + Math.round((end / rowsToUse.length) * 80), `${end.toLocaleString()} / ${rowsToUse.length.toLocaleString()} rows`);
                        await delay(0);
                    }
                    csv = rows.join('\n');
                    fn = g.label.replace(/[^a-zA-Z0-9_\-]/g, '_') + (isFiltered ? '_filtered' : '') + '.csv';
                    hideOv();
                } else {
                    const rows = g.summary.map((c, i) => ({ idx: i + 1, 'Course ID': c.cid, Duration: c.Duration, Semester: c.semExcel || '', 'Total': c.ta, 'Best Of': c.bn, Rows: c.count, 'Avg /25': c.avg }));
                    csv = Papa.unparse(rows);
                    fn = 'Summary_' + g.label.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.csv';
                }
                dlBlob(new Blob([csv], { type: 'text/csv' }), fn);
                toast(`Downloaded: ${fn}`, 's');
            }

            // ═══════════════════════════════════════════════════════════════
            // EXCEL HELPERS
            // ═══════════════════════════════════════════════════════════════
            function colLetter(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

            // FIX #2: sem cell writer — tries date first, falls back to string
            function semCell(si) {
                const raw = getSemRaw(si);
                const excel = getSemExcel(si);
                if (!excel) return '';
                const d = semToDate(raw);
                if (d) return { t: 'd', v: d, z: 'mmm-yy' };
                // fallback: write as string — never blank
                return excel;
            }

            // FIX #3: buildDataRow always includes Best_Avg/Score_25/Match based on opts
            // FIX #4: values from Float64 cache — no precision loss
            function buildDataRow(si, ri, g, o, cache, excelRowNum) {
                const dr = [];
                const nBase = baseCols.length;
                const a1L = colLetter(nBase + 1);
                const aNL = colLetter(nBase + g.maxA);
                const avgPos = nBase + g.maxA + 1;
                const s25Pos = avgPos + (o.avg ? 1 : 0);
                const avgL = colLetter(avgPos);
                const s25L = colLetter(s25Pos);
                const out25L = colLetter(baseCols.indexOf('out_of_25') >= 0 ? baseCols.indexOf('out_of_25') + 1 : 6);
                const arr = Array.from({ length: g.bestN }, (_, i) => i + 1).join(',');
                const rn = excelRowNum;

                // Base + assignment columns
                g.hdrs.forEach(h => {
                    if (h === 'sem') dr.push(semCell(si)); // FIX #2
                    else if (/^A\d+$/.test(h)) { const fv = getNum(h, si); dr.push(isNaN(fv) ? (o.blank ? 0 : '') : fv); }
                    else if (h === 'EmailId' || h === 'new_courseid' || h === 'Duration') dr.push(getStr(h, si));
                    else if (NUMERIC_COLS.has(h)) { const fv = getNum(h, si); dr.push(isNaN(fv) ? '' : Math.round(fv * 100) / 100); }
                    else dr.push(getStr(h, si));
                });

                // FIX #3: Score columns — always written if opts say so
                const bestAvg = cache.bestAvg[ri];  // from Float64
                const score25 = cache.score25[ri];
                const out25 = getNum('out_of_25', si);
                const isMatch = !isNaN(out25) && Math.abs(score25 - out25) < 0.015;

                if (o.avg) dr.push({ t: 'n', f: `ROUND(SUM(LARGE(${a1L}${rn}:${aNL}${rn},{${arr}}))/${g.bestN},2)`, v: bestAvg });
                if (o.s25) dr.push({ t: 'n', f: `ROUND(${avgL}${rn}*0.25,2)`, v: score25 });
                if (o.match) dr.push({ t: 's', f: `IF(${s25L}${rn}=${out25L}${rn},"✓ Match","✗ Diff")`, v: isMatch ? '✓ Match' : '✗ Diff' });
                return dr;
            }

            // ═══════════════════════════════════════════════════════════════
            // CONVERT — single group
            // ═══════════════════════════════════════════════════════════════
            async function runConvert() {
                const g = curGroup(); if (!g) { toast('Select a group', 'w'); return; }
                const o = getOpts();
                const cache = buildScoreCache(g, o.blank);
                const btn = $('conv-btn'); const st = $('cv-st');
                btn.disabled = true;
                st.innerHTML = '<span style="color:var(--primary)"><i class="bi bi-hourglass-split"></i> Building…</span>';
                await delay(30);
                try {
                    showOv('Building Excel', `${g.rows.length.toLocaleString()} rows…`, 10);
                    const hdrs = [...g.hdrs, ...(o.avg ? ['Best_Avg'] : []), ...(o.s25 ? ['Score_25'] : []), ...(o.match ? ['Match'] : [])];
                    const aoa = [hdrs];
                    const CHUNK = 30000;
                    for (let ri = 0; ri < g.rows.length; ri += CHUNK) {
                        const end = Math.min(ri + CHUNK, g.rows.length);
                        for (let i = ri; i < end; i++) {
                            aoa.push(buildDataRow(g.rows[i], i, g, o, cache, aoa.length + 1));
                        }
                        pOv(10 + Math.round((end / g.rows.length) * 75), `${end.toLocaleString()} / ${g.rows.length.toLocaleString()} rows`);
                        await delay(0);
                    }
                    pOv(88, 'Writing file…'); await delay(20);
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellStyles: true });
                    ws['!cols'] = hdrs.map(h => ({ wch: h === 'EmailId' ? 34 : h === 'new_courseid' ? 16 : h === 'sem' ? 11 : h === 'Match' ? 12 : 10 }));
                    XLSX.utils.book_append_sheet(wb, ws, safeSheet(g.label));
                    const sa = [['Course ID', 'Duration', 'Semester', 'Total Asgn', 'Best Of', 'Rows', 'Avg /25']];
                    g.summary.forEach(c => sa.push([c.cid, c.Duration, c.semExcel || '', c.ta, c.bn, c.count, c.avg]));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sa), 'Course_Summary');
                    const fn = g.label.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.xlsx';
                    XLSX.writeFile(wb, fn);
                    hideOv();
                    st.innerHTML = `<span style="color:var(--accent)"><i class="bi bi-check-circle-fill"></i> Downloaded: ${fn}</span>`;
                    toast(`Excel: ${fn}`, 's');
                } catch (e) {
                    hideOv();
                    st.innerHTML = `<span style="color:var(--danger)"><i class="bi bi-x-circle-fill"></i> ${e.message}</span>`;
                    toast('Error: ' + e.message, 'e'); console.error(e);
                }
                btn.disabled = false;
            }

            // ═══════════════════════════════════════════════════════════════
            // CHECKBOXES
            // ═══════════════════════════════════════════════════════════════
            function buildCheckboxes() {
                const c = $('cbx-list'); c.innerHTML = '';
                groups.forEach(g => {
                    const div = document.createElement('label');
                    div.className = 'cbi checked';
                    div.style.cssText = g.isExt ? 'border-left:2px solid var(--warn)' : '';
                    div.innerHTML = `
      <input type="checkbox" id="chk_${g.key}" checked style="accent-color:var(--primary)">
      <div class="cbi-info">
        <div class="cbi-name" style="color:${g.isExt ? 'var(--warn)' : 'var(--accent)'}">
          <i class="bi ${g.isExt ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}" style="font-size:11px;margin-right:4px"></i>${g.label}
        </div>
        <div class="cbi-meta">${g.rows.length.toLocaleString()} rows · Best-${g.bestN} · ${g.summary.length} courses</div>
      </div>`;
                    div.querySelector('input').addEventListener('change', function () { div.classList.toggle('checked', this.checked); });
                    c.appendChild(div);
                });
            }

            // ═══════════════════════════════════════════════════════════════
            // BULK EXPORT
            // ═══════════════════════════════════════════════════════════════
            function safeSheet(s) { return s.replace(/[:\\/\?\*\[\]]/g, '_').substring(0, 31); }

            /* ── Combined Excel download — xlsb (binary) for large, xlsx for small ──
               Always includes Excel formulas. XLSX.write() runs in a blob Worker so
               the main thread stays responsive and the progress bar keeps animating.   ── */
            async function exportExcel() {
                showOv('Building Excel', 'Compiling all groups…', 3); await delay(30);
                const o = getEOpts();
                const sel = groups.filter(g => $(`chk_${g.key}`)?.checked);
                if (!sel.length) { hideOv(); toast('No groups selected', 'w'); return; }
                const totalRows = sel.reduce((s, g) => s + g.rows.length, 0);

                /* Build the full workbook AOA on main thread (fast) */
                const wb = XLSX.utils.book_new();
                let totalDone = 0;
                for (const g of sel) {
                    const cache = buildScoreCache(g, o.blank);
                    const hdrs = [...g.hdrs, ...(o.avg ? ['Best_Avg'] : []), ...(o.s25 ? ['Score_25'] : []), ...(o.match ? ['Match'] : [])];
                    const aoa = [hdrs];
                    const CHUNK = 80000;
                    for (let ri = 0; ri < g.rows.length; ri += CHUNK) {
                        const end = Math.min(ri + CHUNK, g.rows.length);
                        for (let i = ri; i < end; i++) aoa.push(buildDataRow(g.rows[i], i, g, o, cache, aoa.length + 1));
                        totalDone += end - ri;
                        pOv(3 + Math.round((totalDone / totalRows) * 72), `${totalDone.toLocaleString()} / ${totalRows.toLocaleString()} rows`, g.label);
                        await delay(0);
                    }
                    const ws = XLSX.utils.aoa_to_sheet(aoa);
                    ws['!cols'] = hdrs.map(h => ({ wch: h === 'EmailId' ? 34 : h === 'new_courseid' ? 16 : h === 'sem' ? 11 : h === 'Match' ? 12 : 10 }));
                    XLSX.utils.book_append_sheet(wb, ws, safeSheet(g.label));
                }
                const sa = [['Group', 'Course ID', 'Duration', 'Semester', 'Total', 'Best Of', 'Rows', 'Avg /25']];
                sel.forEach(g => g.summary.forEach(c => sa.push([g.label, c.cid, c.Duration, c.semExcel || '', c.ta, c.bn, c.count, c.avg])));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sa), 'Course_Summary');

                /* Choose format: xlsb (binary) = ~5x faster write for large files */
                const useBin = totalRows > 100000;
                const fmt = useBin ? 'xlsb' : 'xlsx';
                const mime = useBin
                    ? 'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
                    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                const fname = 'NPTEL_Combined_Scores.' + fmt;

                pOv(78, (useBin ? 'Writing ' + fmt.toUpperCase() + ' (binary — faster)…' : 'Writing file…'), ''); await delay(20);

                /* Offload XLSX.write() to a blob Worker so the UI stays responsive */
                try {
                    const buf = await xlsbWorkerWrite(wb, fmt);
                    dlBlob(new Blob([buf], { type: mime }), fname);
                    hideOv();
                    toast('Downloaded ' + fname + ' — ' + totalRows.toLocaleString() + ' rows' + (useBin ? ' (Excel binary, opens normally)' : ''), 's');
                } catch (err) {
                    /* Worker failed — fallback to synchronous write */
                    console.warn('Worker write failed, falling back:', err);
                    pOv(85, 'Writing (fallback mode)…'); await delay(10);
                    const buf2 = XLSX.write(wb, { bookType: fmt, type: 'array', compression: false });
                    dlBlob(new Blob([buf2], { type: mime }), fname);
                    hideOv();
                    toast('Downloaded ' + fname + ' — ' + totalRows.toLocaleString() + ' rows', 's');
                }
            }

            /* Run XLSX.write() in a Web Worker so the main thread stays alive */
            function xlsbWorkerWrite(wb, fmt) {
                return new Promise((resolve, reject) => {
                    const src = `
importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
self.onmessage = function(e) {
  try {
    const buf = XLSX.write(e.data.wb, { bookType: e.data.fmt, type: 'array', compression: false });
    self.postMessage({ ok: true, buf: buf }, [buf.buffer]);
  } catch(ex) {
    self.postMessage({ ok: false, err: ex.message });
  }
};`;
                    let w;
                    try {
                        const blob = new Blob([src], { type: 'application/javascript' });
                        const url = URL.createObjectURL(blob);
                        w = new Worker(url);
                        URL.revokeObjectURL(url);
                    } catch (e) { reject(e); return; }
                    w.onmessage = function (e) {
                        w.terminate();
                        if (e.data.ok) resolve(new Uint8Array(e.data.buf));
                        else reject(new Error(e.data.err));
                    };
                    w.onerror = function (e) { w.terminate(); reject(new Error(e.message || 'Worker error')); };
                    w.postMessage({ wb, fmt });
                });
            }

            async function exportZip() {
                showOv('Building ZIP', 'Preparing…', 3); await delay(30);
                const o = getEOpts();
                const zip = new JSZip();
                let totalDone = 0;
                const sel = groups.filter(g => $(`chk_${g.key}`)?.checked);
                if (!sel.length) { hideOv(); toast('No groups selected', 'w'); return; }
                const totalRows = sel.reduce((s, g) => s + g.rows.length, 0);

                /* CSV escape — extract .v from XLSX cell objects {t,v,f} before encoding */
                const cellVal = v => (v !== null && typeof v === 'object' && 'v' in v) ? v.v : v;
                const ce = v => {
                    const s = String(cellVal(v) != null ? cellVal(v) : '');
                    return (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0)
                        ? '"' + s.replace(/"/g, '""') + '"' : s;
                };

                for (const g of sel) {
                    const cache = buildScoreCache(g, o.blank);
                    const hdrs = [...g.hdrs, ...(o.avg ? ['Best_Avg'] : []), ...(o.s25 ? ['Score_25'] : []), ...(o.match ? ['Match'] : [])];
                    const lines = [hdrs.map(ce).join(',')];
                    const CHUNK = 50000;
                    for (let ri = 0; ri < g.rows.length; ri += CHUNK) {
                        const end = Math.min(ri + CHUNK, g.rows.length);
                        for (let i = ri; i < end; i++) {
                            lines.push(buildDataRow(g.rows[i], i, g, o, cache, lines.length + 1).map(ce).join(','));
                        }
                        totalDone += end - ri;
                        pOv(3 + Math.round((totalDone / totalRows) * 84), `${totalDone.toLocaleString()} / ${totalRows.toLocaleString()} rows`, g.label);
                        await delay(0);
                    }
                    const fn = g.label.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_') + '.csv';
                    zip.file(fn, '\uFEFF' + lines.join('\r\n'));  /* UTF-8 BOM — Excel auto-detects encoding */
                }

                /* Summary CSV */
                const sumH = ['Group', 'Course ID', 'Duration', 'Semester', 'Total', 'Best Of', 'Rows', 'Avg /25'];
                const sumLines = [sumH.join(',')];
                sel.forEach(g => g.summary.forEach(c =>
                    sumLines.push([g.label, c.cid, c.Duration, c.semExcel || '', c.ta, c.bn, c.count, c.avg].map(ce).join(','))
                ));
                zip.file('Course_Summary.csv', '\uFEFF' + sumLines.join('\r\n'));

                pOv(90, 'Compressing…'); await delay(20);
                /* level:1 = fast compression, CSV text compresses extremely well */
                const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
                dlBlob(blob, 'NPTEL_Separate_Scores.zip');
                hideOv(); toast('ZIP downloaded — ' + totalRows.toLocaleString() + ' rows across ' + sel.length + ' groups', 's');
            }

            // ═══════════════════════════════════════════════════════════════
            // FORMULA RULES — PSO week formula configuration
            // ═══════════════════════════════════════════════════════════════
            const AL_FORMULA_CFG = {
                global: { aggr: 'avg', round: 0 },
                courses: {}   // courseId → { aggr, round, excludeCols:[] }
            };

            // Get effective config for a course (falls back to global)
            function psoGetFormulaCfg(courseId) {
                const co = AL_FORMULA_CFG.courses[courseId ? courseId.trim() : ''];
                return {
                    aggr: (co && co.aggr) ? co.aggr : AL_FORMULA_CFG.global.aggr,
                    round: (co && co.round !== undefined) ? co.round : AL_FORMULA_CFG.global.round,
                    excludeCols: (co && co.excludeCols) ? co.excludeCols : []
                };
            }
