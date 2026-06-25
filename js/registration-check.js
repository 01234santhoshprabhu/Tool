            // ═══════════════════════════════════════════════════════════════
            // TOOL HELPERS — shared upload handling
            // ═══════════════════════════════════════════════════════════════
            const toolData = { reg: null, 'diff-old': null, 'diff-new': null };

            function toolDov(e, zoneId) { e.preventDefault(); $(zoneId).classList.add('drag'); }
            function toolDlv(zoneId) { $(zoneId).classList.remove('drag'); }
            function toolDrop(e, key) {
                e.preventDefault();
                const zoneId = key === 'reg' ? 'reg-uz' : key === 'diff-old' ? 'diff-old-uz' : 'diff-new-uz';
                $(zoneId).classList.remove('drag');
                const f = e.dataTransfer.files[0]; if (f) loadToolFile(f, key);
            }
            function toolFile(inp, key) { const f = inp.files[0]; if (f) loadToolFile(f, key); }

            async function loadToolFile(file, key) {
                const zoneId = key === 'reg' ? 'reg-uz' : key === 'diff-old' ? 'diff-old-uz' : 'diff-new-uz';
                const titleId = key === 'reg' ? 'reg-uz-t' : key === 'diff-old' ? 'diff-old-t' : 'diff-new-t';
                const fnId = key === 'reg' ? 'reg-uz-fn' : key === 'diff-old' ? 'diff-old-fn' : 'diff-new-fn';
                const zone = $(zoneId);
                try {
                    zone.classList.remove('loaded');
                    $(titleId).textContent = 'Loading…';
                    const data = await parseFile(file);
                    toolData[key] = { rows: data.rows, cols: data.cols, fileName: file.name, index: buildKeyedRowIndex(data.rows, data.cols) };
                    zone.classList.add('loaded');
                    $(titleId).textContent = '✓ ' + file.name;
                    $(fnId).textContent = `${data.rows.length.toLocaleString()} rows · ${data.cols.length} columns`;
                    checkToolReady(key);
                    toast(`Loaded: ${file.name} (${data.rows.length.toLocaleString()} rows)`, 's');
                } catch (e) {
                    $(titleId).textContent = 'Error loading file';
                    toast('Error: ' + e.message, 'e', 6000);
                }
            }

            // ── Reg Checker: multi-select course filter state ──
            let _regCourseAll = [];          // sorted unique course IDs
            let _regCourseSelected = new Set();
            let _regCourseFindCol = null;
            let _regCourseCounts = {};       // { courseId: count } — built once, reused everywhere
            let _regCourseRowMap = new Map();// courseId → [rows] — built once for fast filter

            function buildRegCourseDropdown() {
                if (!toolData.reg) return;
                const regIdx = toolData.reg.index;
                _regCourseFindCol = regIdx ? regIdx.courseCol : null;
                if (_regCourseFindCol) {
                    _regCourseCounts = regIdx.courseCounts;
                    _regCourseRowMap = regIdx.rowsByCourse;
                    _regCourseAll = regIdx.courseList;
                    _regCourseSelected = new Set();
                    if (storeIndex && storeIndex.courseList.length === 1) {
                        const only = storeIndex.courseList[0];
                        if (_regCourseAll.includes(only)) _regCourseSelected.add(only);
                    }
                    $('reg-course-count').textContent = `${_regCourseAll.length} unique course${_regCourseAll.length !== 1 ? 's' : ''} in reg dump`;
                    $('reg-course-panel').style.display = 'block';
                    renderRegCourseList('');
                    updateRegCourseTrigger();
                } else {
                    $('reg-course-panel').style.display = 'none';
                }
                onRegCourseChange();
            }

            function renderRegCourseList(searchTerm) {
                if (!toolData.reg) return;
                const regRows = toolData.reg.rows;
                const term = searchTerm.toLowerCase().trim();
                const filtered = term ? _regCourseAll.filter(c => c.toLowerCase().includes(term)) : _regCourseAll;
                const list = $('reg-course-list');
                list.innerHTML = filtered.map(cid => {
                    const cnt = _regCourseCounts[cid] || 0;   // O(1) lookup — no row scan
                    const checked = _regCourseSelected.has(cid);
                    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--card-border);transition:background .1s" onmouseover="this.style.background='var(--card-head)'" onmouseout="this.style.background=''">
            <input type="checkbox" value="${escHtml2(cid)}" ${checked ? 'checked' : ''} onchange="regCourseToggle(this)" style="accent-color:var(--purple);cursor:pointer;flex-shrink:0">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml2(cid)}">${escHtml2(cid)}</span>
            <span style="font-size:11px;color:var(--text3);flex-shrink:0">${cnt.toLocaleString()}</span>
          </label>`;
                }).join('') || `<div style="padding:10px;font-size:12px;color:var(--text3);text-align:center">No courses match</div>`;
            }

            function regCourseToggle(cb) {
                const val = cb.value;
                if (cb.checked) _regCourseSelected.add(val); else _regCourseSelected.delete(val);
                updateRegCourseTrigger();
                onRegCourseChange();
            }

            function regCourseSelectAll() {
                _regCourseAll.forEach(c => _regCourseSelected.add(c));
                renderRegCourseList($('reg-course-search') ? $('reg-course-search').value : '');
                updateRegCourseTrigger(); onRegCourseChange();
            }

            function regCourseSelectNone() {
                _regCourseSelected.clear();
                renderRegCourseList($('reg-course-search') ? $('reg-course-search').value : '');
                updateRegCourseTrigger(); onRegCourseChange();
            }

            function filterRegCourseList() {
                const term = $('reg-course-search') ? $('reg-course-search').value : '';
                renderRegCourseList(term);
            }

            function updateRegCourseTrigger() {
                const lbl = $('reg-course-trigger-label');
                if (!lbl) return;
                const n = _regCourseSelected.size;
                if (n === 0) {
                    lbl.textContent = '— All Courses (no filter) —';
                    lbl.style.color = 'var(--text3)';
                } else if (n === 1) {
                    lbl.textContent = [..._regCourseSelected][0];
                    lbl.style.color = 'var(--purple)';
                } else {
                    lbl.textContent = `${n} courses selected`;
                    lbl.style.color = 'var(--purple)';
                }
            }

            function toggleRegCourseDropdown() {
                const dd = $('reg-course-dropdown');
                const ch = $('reg-course-chevron');
                if (!dd) return;
                const open = dd.style.display !== 'none';
                dd.style.display = open ? 'none' : 'block';
                if (ch) ch.style.transform = open ? '' : 'rotate(180deg)';
                if (!open) { const s = $('reg-course-search'); if (s) { s.value = ''; filterRegCourseList(); s.focus(); } }
            }

            // Close dropdown when clicking outside
            document.addEventListener('click', function (e) {
                const panel = $('reg-course-panel');
                if (panel && !panel.contains(e.target)) {
                    const dd = $('reg-course-dropdown');
                    const ch = $('reg-course-chevron');
                    if (dd) dd.style.display = 'none';
                    if (ch) ch.style.transform = '';
                }
            });

            function onRegCourseChange() {
                if (!toolData.reg) return;
                const totalRows = toolData.reg.rows.length;
                if (_regCourseSelected.size === 0 || !_regCourseFindCol) {
                    $('reg-run-hint').textContent = `${totalRows.toLocaleString()} rows will be checked (all courses)`;
                } else {
                    // Sum counts from prebuilt map — O(selected) not O(rows)
                    let cnt = 0;
                    _regCourseSelected.forEach(c => { cnt += (_regCourseCounts[c] || 0); });
                    const label = _regCourseSelected.size === 1 ? `course "${[..._regCourseSelected][0]}"` : `${_regCourseSelected.size} selected courses`;
                    $('reg-run-hint').textContent = `${cnt.toLocaleString()} rows for ${label} will be checked`;
                }
            }

            function checkToolReady(changedKey) {
                // Registration check
                if (store && toolData.reg) {
                    $('reg-run-btn').disabled = false;
                    $('reg-run-hint').textContent = `${toolData.reg.rows.length.toLocaleString()} reg rows ready`;
                    buildRegCourseDropdown();
                    $('score-ref-box').classList.add('loaded');
                    $('score-ref-ico').innerHTML = '<i class="bi bi-database-fill"></i>';
                    $('score-ref-ico').style.color = 'var(--accent)';
                    $('score-ref-t').textContent = '✓ Assignment dump loaded';
                    $('score-ref-sub').textContent = `${store.rowCount.toLocaleString()} rows · ${origCols.length} cols`;
                }
                // Score diff
                if (toolData['diff-old'] && toolData['diff-new']) {
                    $('diff-run-btn').disabled = false;
                    $('diff-run-hint').textContent = 'Both files ready — click Run';
                    showDiffColInfo();
                }
            }

            // Update score ref box when main dump loads
            function updateToolScoreRef() {
                if (store) {
                    $('score-ref-box').classList.add('loaded');
                    $('score-ref-ico').innerHTML = '<i class="bi bi-database-fill"></i>';
                    $('score-ref-ico').style.color = 'var(--accent)';
                    $('score-ref-t').textContent = '✓ Assignment dump loaded';
                    $('score-ref-sub').textContent = `${store.rowCount.toLocaleString()} rows · ${origCols.length} cols`;
                    if (toolData.reg) { $('reg-run-btn').disabled = false; buildRegCourseDropdown(); }
                    scUpdateDumpBox();
                    scBuildCourses();
                }
            }

            // ═══════════════════════════════════════════════════════════════
            // REGISTRATION CHECKER
            // ═══════════════════════════════════════════════════════════════
            let regMissingRows = [];

            async function runRegCheck() {
                if (!store) { toast('Load assignment dump first', 'w'); return; }
                if (!toolData.reg) { toast('Load registration dump first', 'w'); return; }
                if (!storeIndex) storeIndex = buildStoreIndex();
                const btn = $('reg-run-btn');
                btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Checking…';

                await delay(20);
                const regAllRows = toolData.reg.rows;
                const regIdx = toolData.reg.index || buildKeyedRowIndex(toolData.reg.rows, toolData.reg.cols);
                toolData.reg.index = regIdx;
                const emailCol = regIdx.emailCol;
                const courseCol = regIdx.courseCol;

                const hasFilter = _regCourseSelected.size > 0 && courseCol;
                let regRows;
                if (hasFilter) {
                    regRows = [];
                    _regCourseSelected.forEach(c => {
                        const bucket = _regCourseRowMap.get(c);
                        if (bucket) for (let k = 0; k < bucket.length; k++) regRows.push(bucket[k]);
                    });
                    const label = _regCourseSelected.size === 1 ? `"${[..._regCourseSelected][0]}"` : `${_regCourseSelected.size} courses`;
                    toast(`Filtering to ${label} — ${regRows.length.toLocaleString()} rows`, 'i', 2500);
                    await delay(20);
                } else {
                    regRows = regAllRows;
                }

                if (!emailCol) { toast('Registration file missing EmailId column', 'e', 5000); btn.disabled = false; btn.innerHTML = '<i class="bi bi-play-circle-fill"></i> Run Registration Check'; return; }

                const results = [];
                const CHUNK = 50000;
                for (let i = 0; i < regRows.length; i += CHUNK) {
                    const end = Math.min(i + CHUNK, regRows.length);
                    for (let j = i; j < end; j++) {
                        const row = regRows[j];
                        const email = normKey(row[emailCol]);
                        const course = courseCol ? normKey(row[courseCol]) : '';
                        if (!email) continue;
                        const key = `${email}|${course}`;
                        const hasEmail = storeIndex.emailSet.has(email);
                        const hasCourse = course ? storeIndex.courseSetLower.has(course) : true;
                        const hasExact = course ? storeIndex.emailCourseSet.has(key) : hasEmail;
                        let status, statusClass;
                        if (hasExact) { status = '✓ Found'; statusClass = 't-ok'; }
                        else if (hasEmail && !hasCourse) { status = '⚠ Course missing'; statusClass = 't-warn'; }
                        else if (!hasEmail && hasCourse) { status = '✗ Email missing'; statusClass = 't-miss'; }
                        else { status = '✗ Not found'; statusClass = 't-miss'; }
                        results.push({ email: row[emailCol], course: courseCol ? row[courseCol] : '', status, statusClass, isMissing: !hasExact, origRow: row });
                    }
                    await delay(0);
                }

                regMissingRows = results.filter(r => r.isMissing);
                const found = results.filter(r => !r.isMissing).length;
                const missing = regMissingRows.length;
                const warnCount = results.filter(r => r.statusClass === 't-warn').length;

                // Summary cards
                const filterDesc = hasFilter
                    ? (_regCourseSelected.size === 1 ? [..._regCourseSelected][0] : `${_regCourseSelected.size} courses`)
                    : null;
                const courseFilterLabel = filterDesc ? `<div style="text-align:center;margin-bottom:8px;font-size:12px;color:var(--purple);font-weight:700"><i class="bi bi-funnel-fill"></i> Filtered: ${escHtml2(filterDesc)}</div>` : '';
                $('reg-summary').innerHTML = `${courseFilterLabel}
    <div class="chk-card ${missing === 0 ? 'ok' : 'err'}"><div class="chk-val">${results.length.toLocaleString()}</div><div class="chk-lbl">Total Checked</div></div>
    <div class="chk-card ok"><div class="chk-val">${found.toLocaleString()}</div><div class="chk-lbl">Found in Dump</div></div>
    <div class="chk-card ${missing > 0 ? 'err' : 'ok'}"><div class="chk-val">${missing.toLocaleString()}</div><div class="chk-lbl">Missing</div></div>
    <div class="chk-card ${warnCount > 0 ? 'warn' : 'ok'}"><div class="chk-val">${warnCount.toLocaleString()}</div><div class="chk-lbl">Course Mismatch</div></div>
  `;

                if (missing === 0 && warnCount === 0) {
                    $('reg-empty').style.display = 'block';
                    $('reg-results').style.display = 'none';
                } else {
                    $('reg-empty').style.display = 'none';
                    $('reg-results').style.display = 'block';
                    const courseTags = hasFilter ? [..._regCourseSelected].map(c => `<span style="margin-left:4px;padding:2px 7px;background:var(--purple);color:#fff;border-radius:10px;font-size:11px">${escHtml2(c)}</span>`).join('') : '';
                    $('reg-result-label').innerHTML = `<span style="color:var(--danger)"><i class="bi bi-exclamation-triangle-fill"></i> ${missing.toLocaleString()} missing rows</span>${courseTags}`;

                    // Build table header
                    const extraCols = regCols.filter(c => c !== emailCol && c !== courseCol).slice(0, 5);
                    $('reg-tbl-head').innerHTML = `<th>Email ID</th><th>Course ID</th>${extraCols.map(c => `<th>${c}</th>`).join('')}<th>Status</th>`;

                    // Build table body (show all missing + warnings, limit 2000 for perf)
                    const displayRows = regMissingRows.slice(0, 2000);
                    $('reg-tbl-body').innerHTML = displayRows.map(r => `<tr>
      <td class="t-email">${escHtml2(r.email)}</td>
      <td class="t-cid">${escHtml2(r.course)}</td>
      ${extraCols.map(c => `<td>${escHtml2(r.origRow[c] || '')}</td>`).join('')}
      <td class="${r.statusClass}">${r.status}</td>
    </tr>`).join('') + (regMissingRows.length > 2000 ? `<tr><td colspan="${3 + extraCols.length}" style="text-align:center;padding:12px;color:var(--txt3);font-style:italic">… ${(regMissingRows.length - 2000).toLocaleString()} more rows — download for full list</td></tr>` : ``);
                }

                btn.disabled = false; btn.innerHTML = '<i class="bi bi-play-circle-fill"></i> Run Registration Check';
                toast(`Check complete — ${missing.toLocaleString()} missing`, (missing === 0 ? 's' : 'w'));
            }

            function regCopyMissing() {
                if (!regMissingRows.length) { toast('No missing rows', 'i'); return; }
                const regCols = toolData.reg.cols;
                const lines = [regCols.join('\t')];
                regMissingRows.forEach(r => lines.push(regCols.map(c => r.origRow[c] || '').join('\t')));
                navigator.clipboard.writeText(lines.join('\n')).then(() => toast(`Copied ${regMissingRows.length.toLocaleString()} rows`, 's')).catch(() => toast('Copy failed', 'e'));
            }

            function regDownloadMissing(fmt) {
                if (!regMissingRows.length) { toast('No missing rows to download', 'i'); return; }
                const regCols = toolData.reg.cols;
                if (fmt === 'csv') {
                    const lines = [regCols.join(',')];
                    regMissingRows.forEach(r => lines.push(regCols.map(c => { const v = String(r.origRow[c] || ''); return v.includes(',') ? `"${v}"` : v; }).join(',')));
                    dlBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), 'Reg_Missing_Candidates.csv');
                } else {
                    const aoa = [regCols, ...regMissingRows.map(r => regCols.map(c => r.origRow[c] || ''))];
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Missing_Candidates');
                    XLSX.writeFile(wb, 'Reg_Missing_Candidates.xlsx');
                }
                toast(`Downloaded ${regMissingRows.length.toLocaleString()} rows`, 's');
            }
