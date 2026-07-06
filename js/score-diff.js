            // ═══════════════════════════════════════════════════════════════
            // SCORE DIFF
            // ═══════════════════════════════════════════════════════════════
            let diffMissingRows = [];
            let diffAllRows = [];
            let diffCommonCols = [];

            function getAsnCols(cols) { return cols.filter(c => /^A\d+$/i.test(c)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))); }
            function findEmailCol(cols) { return cols.find(c => /^email/i.test(c)) || cols.find(c => /email/i.test(c)) || ''; }
            function findCourseCol(cols) { return cols.find(c => /courseid/i.test(c.replace(/[_\s]/g, ''))) || ''; }
            function findSemCol(cols) { return cols.find(c => /^sem$/i.test(c)) || cols.find(c => /sem/i.test(c)) || ''; }

            function showDiffColInfo() {
                const old = toolData['diff-old'], nw = toolData['diff-new'];
                if (!old || !nw) { $('diff-col-info').style.display = 'none'; return; }
                const oldA = getAsnCols(old.cols), newA = getAsnCols(nw.cols);
                const onlyInOld = oldA.filter(c => !newA.includes(c));
                const onlyInNew = newA.filter(c => !oldA.includes(c));
                const common = oldA.filter(c => newA.includes(c));
                diffCommonCols = common;
                const semOld = findSemCol(old.cols), semNew = findSemCol(nw.cols);
                const out25Old = old.cols.find(c => /out_of_25/i.test(c)) || '';
                const out25New = nw.cols.find(c => /out_of_25/i.test(c)) || '';
                let html = `<b>Old:</b> ${old.cols.length} total cols, ${oldA.length} assignment cols (${oldA[0] || '?'}–${oldA.at(-1) || '?'})`;
                html += ` &nbsp;|&nbsp; <b>New:</b> ${nw.cols.length} total cols, ${newA.length} assignment cols (${newA[0] || '?'}–${newA.at(-1) || '?'})`;
                html += `<br><span style="color:var(--txt2)"><i class="bi bi-check2-all"></i> Will compare: <b>sem</b>${semOld && semNew ? ' ✓' : ' ✗'} · <b>${common.length} assignment cols</b> · <b>out_of_25</b>${out25Old && out25New ? ' ✓' : ' ✗'}</span>`;
                if (onlyInOld.length) html += `<br><span style="color:var(--danger)"><i class="bi bi-exclamation-triangle-fill"></i> Only in old: ${onlyInOld.join(', ')}</span>`;
                if (onlyInNew.length) html += `<br><span style="color:var(--accent)"><i class="bi bi-plus-circle-fill"></i> Only in new: ${onlyInNew.join(', ')}</span>`;
                $('diff-col-detail').innerHTML = html;
                $('diff-col-info').style.display = 'block';
            }

            async function runScoreDiff() {
                const old = toolData['diff-old'], nw = toolData['diff-new'];
                if (!old || !nw) { toast('Load both files first', 'w'); return; }
                old.index = old.index || buildKeyedRowIndex(old.rows, old.cols);
                nw.index = nw.index || buildKeyedRowIndex(nw.rows, nw.cols);
                const btn = $('diff-run-btn');
                btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Comparing…';
                await delay(20);

                const oldCols = old.cols, newCols = nw.cols;
                const emailOld = findEmailCol(oldCols), emailNew = findEmailCol(newCols);
                const courseOld = findCourseCol(oldCols), courseNew = findCourseCol(newCols);
                const semOld = findSemCol(oldCols), semNew = findSemCol(newCols);
                const asnOld = getAsnCols(oldCols), asnNew = getAsnCols(newCols);
                const commonAsn = asnOld.filter(c => asnNew.includes(c));
                const onlyInOld = asnOld.filter(c => !asnNew.includes(c));
                const onlyInNew = asnNew.filter(c => !asnOld.includes(c));
                diffCommonCols = commonAsn;

                // Also compare sem + out_of_25 if present in both
                const out25Old = oldCols.find(c => /out_of_25/i.test(c)) || '';
                const out25New = newCols.find(c => /out_of_25/i.test(c)) || '';
                const compareSem = !!(semOld && semNew);
                const compareOut25 = !!(out25Old && out25New);

                // All columns to compare (sem + assignments + out_of_25)
                // compareColsOld: [colNameInOldFile, label]
                const compareCols = [];
                if (compareSem) compareCols.push({ old: semOld, new: semNew, label: 'sem', isNum: false });
                commonAsn.forEach(c => compareCols.push({ old: c, new: c, label: c, isNum: true }));
                if (compareOut25) compareCols.push({ old: out25Old, new: out25New, label: 'out_of_25', isNum: true });

                const newLookup = nw.index.keyToRow;

                diffMissingRows = []; diffAllRows = [];
                const CHUNK = 30000;
                for (let i = 0; i < old.rows.length; i += CHUNK) {
                    const end = Math.min(i + CHUNK, old.rows.length);
                    for (let j = i; j < end; j++) {
                        const oRow = old.rows[j];
                        const em = normKey(oRow[emailOld]);
                        const cid = courseOld ? normKey(oRow[courseOld]) : '';
                        const key = `${em}|${cid}`;
                        const nRow = newLookup.get(key);

                        if (!nRow) {
                            // Missing in new — store full old row data
                            const oldVals = {};
                            compareCols.forEach(cc => { oldVals[cc.label] = oRow[cc.old] || ''; });
                            diffMissingRows.push({
                                email: oRow[emailOld] || '',
                                course: courseOld ? oRow[courseOld] || '' : '',
                                sem: oRow[semOld] || '',
                                status: '✗ Missing in new',
                                oldVals,
                                origRow: oRow
                            });
                            diffAllRows.push({ email: oRow[emailOld] || '', course: courseOld ? oRow[courseOld] || '' : '', isMissing: true, oldRow: oRow, newRow: null, diffs: {}, changedCols: [] });
                        } else {
                            // Found — compare all columns
                            const diffs = {}; const changedCols = [];
                            compareCols.forEach(cc => {
                                const ov = oRow[cc.old]; const nv = nRow[cc.new];
                                let isDiff = false;
                                if (cc.isNum) {
                                    const ovn = parseFloat(ov); const nvn = parseFloat(nv);
                                    const ovVal = isNaN(ovn) ? 0 : ovn;
                                    const nvVal = isNaN(nvn) ? 0 : nvn;
                                    isDiff = Math.abs(ovVal - nvVal) > 0.001;
                                } else {
                                    isDiff = String(ov || '').trim() !== String(nv || '').trim();
                                }
                                if (isDiff) { diffs[cc.label] = true; changedCols.push(cc.label); }
                            });
                            const hasDiff = changedCols.length > 0;
                            diffAllRows.push({ email: oRow[emailOld] || '', course: courseOld ? oRow[courseOld] || '' : '', isMissing: false, hasDiff, oldRow: oRow, newRow: nRow, diffs, changedCols });
                        }
                    }
                    await delay(0);
                }

                const oldLookup = old.index.keySet;
                const newOnly = nw.rows.filter(row => {
                    const em = normKey(row[emailNew]);
                    const cid = courseNew ? normKey(row[courseNew]) : '';
                    return !oldLookup.has(`${em}|${cid}`);
                });

                const totalOld = old.rows.length, totalNew = nw.rows.length;
                const missing = diffMissingRows.length;
                const changed = diffAllRows.filter(r => !r.isMissing && r.hasDiff).length;
                const matched = diffAllRows.filter(r => !r.isMissing && !r.hasDiff).length;
                const addedInNew = newOnly.length;

                // ── Summary cards ──
                $('diff-summary').innerHTML = `
    <div class="chk-card"><div class="chk-val" style="color:var(--warn)">${totalOld.toLocaleString()}</div><div class="chk-lbl">Old Rows</div></div>
    <div class="chk-card"><div class="chk-val" style="color:var(--accent)">${totalNew.toLocaleString()}</div><div class="chk-lbl">New Rows</div></div>
    <div class="chk-card ok"><div class="chk-val">${matched.toLocaleString()}</div><div class="chk-lbl">Matched (All Cols)</div></div>
    <div class="chk-card ${missing > 0 ? 'err' : 'ok'}"><div class="chk-val">${missing.toLocaleString()}</div><div class="chk-lbl">Missing in New</div></div>
    <div class="chk-card ${addedInNew > 0 ? 'warn' : 'ok'}"><div class="chk-val">${addedInNew.toLocaleString()}</div><div class="chk-lbl">Added in New</div></div>
    <div class="chk-card ${changed > 0 ? 'warn' : 'ok'}"><div class="chk-val">${changed.toLocaleString()}</div><div class="chk-lbl">Score Changed</div></div>
    <div class="chk-card ${onlyInOld.length > 0 ? 'warn' : 'ok'}"><div class="chk-val">${onlyInOld.length}</div><div class="chk-lbl">Cols Only Old</div></div>
    <div class="chk-card ${onlyInNew.length > 0 ? 'warn' : 'ok'}"><div class="chk-val">${onlyInNew.length}</div><div class="chk-lbl">Cols Only New</div></div>
  `;

                $('diff-results').style.display = 'block';

                // ── Missing rows block ──
                if (missing > 0) {
                    $('diff-missing-block').style.display = 'block';
                    $('diff-miss-label').innerHTML = `<span style="color:var(--danger)"><i class="bi bi-person-x-fill"></i> ${missing.toLocaleString()} rows in old but missing from new — all columns shown</span>`;
                    // Show full old data for missing rows
                    const dispMissCols = compareCols.slice(0, 12);// limit display
                    $('diff-miss-body').innerHTML = diffMissingRows.slice(0, 1500).map(r => `<tr>
      <td class="t-email">${escHtml2(r.email)}</td>
      <td class="t-cid">${escHtml2(r.course)}</td>
      ${dispMissCols.map(cc => `<td style="font-family:var(--mono);font-size:10px;color:var(--txt2)">${escHtml2(r.origRow[cc.old] || '')}</td>`).join('')}
      <td class="t-miss">${r.status}</td>
    </tr>`).join('') + (missing > 1500 ? `<tr><td colspan="${4 + dispMissCols.length}" style="text-align:center;padding:10px;color:var(--txt3)">… ${(missing - 1500).toLocaleString()} more — download full list</td></tr>` : '');
                    // Update header to show all columns
                    $('diff-miss-head').innerHTML = `<th>Email ID</th><th>Course ID</th>${dispMissCols.map(cc => `<th>${cc.label}</th>`).join('')}<th>Status</th>`;
                } else {
                    $('diff-missing-block').style.display = 'none';
                }

                // ── Changed rows full comparison table ──
                // Layout: Email | Course | for each compareCol → show new value (red if changed, green if same)
                const diffDisplayRows = diffAllRows.filter(r => !r.isMissing && r.hasDiff).slice(0, 800);
                if (diffDisplayRows.length > 0) {
                    $('diff-compare-block').style.display = 'block';
                    $('diff-compare-label').innerHTML = `<span style="color:var(--warn)"><i class="bi bi-arrow-left-right"></i> ${changed.toLocaleString()} rows with score/column changes — old→new per cell</span>`;

                    const dispCmpCols = compareCols.slice(0, 16);// limit for perf
                    $('diff-cmp-head').innerHTML = `<tr>
      <th>Email</th><th>Course</th>
      ${dispCmpCols.map(cc => `<th class="${cc.label.startsWith('A') ? 'th-new' : cc.label === 'sem' ? 'th-old' : 'th-miss'}">${cc.label}</th>`).join('')}
      <th style="min-width:120px">Changed Cols</th>
    </tr>`;
                    $('diff-cmp-body').innerHTML = diffDisplayRows.map(r => `<tr>
      <td class="t-email" style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${escHtml2(r.email)}">${escHtml2(r.email)}</td>
      <td class="t-cid">${escHtml2(r.course)}</td>
      ${dispCmpCols.map(cc => {
                        const ov = r.oldRow[cc.old]; const nv = r.newRow[cc.new];
                        const changed2 = r.diffs[cc.label];
                        // Show old → new if changed, just new if same
                        const cell = changed2
                            ? `<span style="color:var(--danger);text-decoration:line-through;font-size:9px">${escHtml2(ov || '')}</span><br><span style="color:var(--accent);font-weight:700">${escHtml2(nv || '')}</span>`
                            : `<span style="color:var(--txt3)">${escHtml2(nv || '')}</span>`;
                        return `<td class="${changed2 ? 'miss-cell' : 'ok-cell'}" style="font-family:var(--mono);font-size:10px;min-width:60px">${cell}</td>`;
                    }).join('')}
      <td style="font-size:9px;color:var(--warn);font-family:var(--mono);max-width:140px;overflow:hidden;text-overflow:ellipsis" title="${escHtml2(r.changedCols.join(', '))}">${escHtml2(r.changedCols.join(', '))}</td>
    </tr>`).join('');
                } else {
                    $('diff-compare-block').style.display = 'none';
                    if (changed === 0 && missing === 0 && addedInNew === 0) {
                        $('diff-results').innerHTML += '<div style="text-align:center;padding:24px;color:var(--accent);font-size:13px;font-weight:700"><i class="bi bi-check-circle-fill" style="font-size:20px;display:block;margin-bottom:8px"></i>All columns match perfectly!</div>';
                    }
                }

                btn.disabled = false; btn.innerHTML = '<i class="bi bi-play-circle-fill"></i> Run Score Diff';
                toast(`Diff done — ${missing} missing, ${changed} changed, ${addedInNew} new-only`, (missing > 0 || changed > 0 ? 'w' : 's'));
            }

            function diffCopyMissing() {
                if (!diffMissingRows.length) { toast('No missing rows', 'i'); return; }
                const lines = ['EmailId\tnew_courseid\tsem\tStatus'];
                diffMissingRows.forEach(r => lines.push(`${r.email}\t${r.course}\t${r.sem}\t${r.status}`));
                navigator.clipboard.writeText(lines.join('\n')).then(() => toast(`Copied ${diffMissingRows.length.toLocaleString()} rows`, 's')).catch(() => toast('Copy failed', 'e'));
            }

            function diffDownload(type, fmt) {
                const old = toolData['diff-old'], nw = toolData['diff-new'];
                const oldCols = old.cols, newCols = nw.cols;
                const emailOld = findEmailCol(oldCols), courseOld = findCourseCol(oldCols), semOld = findSemCol(oldCols);
                const emailNew = findEmailCol(newCols), courseNew = findCourseCol(newCols), semNew = findSemCol(newCols);
                const asnOld = getAsnCols(oldCols), asnNew = getAsnCols(newCols);
                const commonAsn = asnOld.filter(c => asnNew.includes(c));
                const out25Old = oldCols.find(c => /out_of_25/i.test(c)) || '';
                const out25New = newCols.find(c => /out_of_25/i.test(c)) || '';

                let aoa, filename;

                if (type === 'missing') {
                    // Export: all old columns as-is for missing rows
                    const exportCols = oldCols;
                    aoa = [[...exportCols, 'Status'], ...diffMissingRows.map(r => [...exportCols.map(c => r.origRow[c] || ''), 'Missing in New'])];
                    filename = 'Score_Missing_Rows';
                } else {
                    // Export changed rows: Email, Course, Sem, for each asn col → old val, new val, then Changed_Cols
                    const dispCols = commonAsn;
                    const headers = ['EmailId', 'new_courseid', 'sem_old', 'sem_new',
                        ...dispCols.map(c => `${c}_old`), ...dispCols.map(c => `${c}_new`),
                        ...(out25Old ? ['out_of_25_old'] : []), ...(out25New ? ['out_of_25_new'] : []),
                        'Changed_Cols', 'Change_Count'];
                    const dataRows = diffAllRows.filter(r => !r.isMissing && r.hasDiff).map(r => [
                        r.email, r.course,
                        r.oldRow[semOld] || '', r.newRow[semNew] || '',
                        ...dispCols.map(c => r.oldRow[c] || ''),
                        ...dispCols.map(c => r.newRow[c] || ''),
                        ...(out25Old ? [r.oldRow[out25Old] || ''] : []),
                        ...(out25New ? [r.newRow[out25New] || ''] : []),
                        r.changedCols.join(', '), r.changedCols.length
                    ]);
                    aoa = [headers, ...dataRows];
                    filename = 'Score_Diff_Changed';
                }

                if (fmt === 'csv') {
                    const lines = aoa.map(row => row.map(v => { const s = String(v || ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; }).join(','));
                    dlBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), filename + '.csv');
                } else {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(aoa);
                    // Auto col widths
                    const widths = aoa[0].map((h, ci) => ({ wch: Math.max(String(h).length, 10) }));
                    ws['!cols'] = widths;
                    XLSX.utils.book_append_sheet(wb, ws, filename.replace(/_/g, ' ').substring(0, 31));
                    XLSX.writeFile(wb, filename + '.xlsx');
                }
                toast(`Downloaded ${filename} (${(aoa.length - 1).toLocaleString()} rows)`, 's');
            }

            function escHtml2(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

            function dlBlob(blob, fn) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = fn;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
            }
