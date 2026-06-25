            // ── Formula Rules UI ──────────────────────────────────────────
            function alFmlUpdateGlobal() {
                const sel = document.getElementById('fml-global-aggr');
                if (sel) AL_FORMULA_CFG.global.aggr = sel.value;
                alFmlUpdatePreview('global');
            }

            function alFmlSetRound(scope, val, btn) {
                if (scope === 'global') {
                    AL_FORMULA_CFG.global.round = val;
                    document.querySelectorAll('.fml-rnd-btn[data-scope="global"]').forEach(b => b.classList.toggle('active', b === btn));
                    const cust = document.getElementById('fml-global-rnd-custom');
                    if (cust) cust.value = '';
                } else {
                    // per-course
                    if (!AL_FORMULA_CFG.courses[scope]) AL_FORMULA_CFG.courses[scope] = { aggr: AL_FORMULA_CFG.global.aggr, round: AL_FORMULA_CFG.global.round, excludeCols: [] };
                    AL_FORMULA_CFG.courses[scope].round = val;
                    document.querySelectorAll(`.fml-rnd-btn[data-scope="${scope}"]`).forEach(b => b.classList.toggle('active', b === btn));
                    const cust = document.getElementById('fml-co-rnd-custom-' + scope);
                    if (cust) cust.value = '';
                }
                alFmlUpdatePreview(scope);
            }

            function alFmlSetRoundCustom(scope, rawVal) {
                const v = parseInt(rawVal);
                if (isNaN(v) || v < 0 || v > 10) return;
                if (scope === 'global') {
                    AL_FORMULA_CFG.global.round = v;
                    document.querySelectorAll('.fml-rnd-btn[data-scope="global"]').forEach(b => b.classList.remove('active'));
                } else {
                    if (!AL_FORMULA_CFG.courses[scope]) AL_FORMULA_CFG.courses[scope] = { aggr: AL_FORMULA_CFG.global.aggr, round: AL_FORMULA_CFG.global.round, excludeCols: [] };
                    AL_FORMULA_CFG.courses[scope].round = v;
                    document.querySelectorAll(`.fml-rnd-btn[data-scope="${scope}"]`).forEach(b => b.classList.remove('active'));
                }
                alFmlUpdatePreview(scope);
            }

            function alFmlUpdateAggrCourse(courseId, val) {
                if (!AL_FORMULA_CFG.courses[courseId]) AL_FORMULA_CFG.courses[courseId] = { aggr: AL_FORMULA_CFG.global.aggr, round: AL_FORMULA_CFG.global.round, excludeCols: [] };
                AL_FORMULA_CFG.courses[courseId].aggr = val;
                alFmlUpdatePreview(courseId);
            }

            function alFmlUpdateExcludeCols(courseId, val) {
                if (!AL_FORMULA_CFG.courses[courseId]) AL_FORMULA_CFG.courses[courseId] = { aggr: AL_FORMULA_CFG.global.aggr, round: AL_FORMULA_CFG.global.round, excludeCols: [] };
                AL_FORMULA_CFG.courses[courseId].excludeCols = val.split(',').map(s => s.trim()).filter(Boolean);
            }

            function alFmlUpdatePreview(scope) {
                const cfg = scope === 'global' ? AL_FORMULA_CFG.global : (AL_FORMULA_CFG.courses[scope] || AL_FORMULA_CFG.global);
                const aggr = cfg.aggr, rnd = cfg.round !== undefined ? cfg.round : AL_FORMULA_CFG.global.round;
                let inner;
                if (aggr === 'avg') inner = 'SUM(A1,…,AN)/N';
                else if (aggr === 'sum') inner = 'SUM(A1,…,AN)';
                else if (aggr === 'max') inner = 'MAX(A1,…,AN)';
                else inner = 'MIN(A1,…,AN)';
                const formula = 'ROUND(' + inner + ', ' + rnd + ')';
                const el = document.getElementById(scope === 'global' ? 'fml-global-preview' : 'fml-co-preview-' + scope);
                if (el) el.textContent = formula;
            }

            let _fmlCoCounter = 0;
            function alFmlAddCourseOverride() {
                const cid = prompt('Enter Course ID to override (e.g. noc26-ar04):');
                if (!cid || !cid.trim()) return;
                const key = cid.trim();
                if (AL_FORMULA_CFG.courses[key]) { toast('Override for ' + key + ' already exists', 'w'); return; }
                AL_FORMULA_CFG.courses[key] = { aggr: AL_FORMULA_CFG.global.aggr, round: AL_FORMULA_CFG.global.round, excludeCols: [] };
                alFmlRenderOverrides();
                toast('Override added: ' + key, 's');
            }

            function alFmlRemoveCourseOverride(key) {
                delete AL_FORMULA_CFG.courses[key];
                alFmlRenderOverrides();
                toast('Override removed', 'i');
            }

            function alFmlRenderOverrides() {
                const wrap = document.getElementById('fml-course-overrides');
                const empty = document.getElementById('fml-co-empty');
                if (!wrap) return;
                const keys = Object.keys(AL_FORMULA_CFG.courses);
                if (!keys.length) {
                    wrap.innerHTML = '<div id="fml-co-empty" style="text-align:center;padding:28px;color:var(--text3);font-size:12px"><i class="bi bi-bookmark-plus" style="font-size:20px;display:block;margin-bottom:8px;opacity:.4"></i>No course overrides yet. Global default applies to all courses.</div>';
                    return;
                }
                // Header row
                let html = '<div style="display:grid;grid-template-columns:160px 160px 180px 1fr 32px;gap:8px;padding:0 10px 4px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">'
                    + '<span>Course ID</span><span>Aggregation</span><span>Decimal Places</span><span>Exclude Cols (comma-sep)</span><span></span></div>';
                keys.forEach(key => {
                    const co = AL_FORMULA_CFG.courses[key];
                    const rnd = co.round !== undefined ? co.round : AL_FORMULA_CFG.global.round;
                    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
                    html += `<div class="fml-co-row">
            <span style="font-weight:700;color:var(--purple);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(key)}">${escHtml(key)}</span>
            <select onchange="alFmlUpdateAggrCourse('${escHtml(key)}',this.value)" style="border:1px solid var(--border);border-radius:var(--rad);padding:4px 7px;font-size:12px;width:100%">
              <option value="avg" ${co.aggr === 'avg' ? 'selected' : ''}>Average (SUM/N)</option>
              <option value="sum" ${co.aggr === 'sum' ? 'selected' : ''}>Sum total</option>
              <option value="max" ${co.aggr === 'max' ? 'selected' : ''}>Max score</option>
              <option value="min" ${co.aggr === 'min' ? 'selected' : ''}>Min score</option>
            </select>
            <div style="display:flex;gap:0">
              <button class="fml-rnd-btn ${rnd === 0 ? 'active' : ''}" data-scope="${escHtml(key)}" data-v="0" onclick="alFmlSetRound('${escHtml(key)}',0,this)">0</button>
              <button class="fml-rnd-btn ${rnd === 1 ? 'active' : ''}" data-scope="${escHtml(key)}" data-v="1" onclick="alFmlSetRound('${escHtml(key)}',1,this)">1</button>
              <button class="fml-rnd-btn ${rnd === 2 ? 'active' : ''}" data-scope="${escHtml(key)}" data-v="2" onclick="alFmlSetRound('${escHtml(key)}',2,this)">2</button>
              <input id="fml-co-rnd-custom-${escHtml(key)}" type="number" min="0" max="6" placeholder="?"
                style="width:38px;border:1px solid var(--border);border-left:none;border-radius:0 var(--rad) var(--rad) 0;padding:4px 4px;font-size:12px;text-align:center"
                oninput="alFmlSetRoundCustom('${escHtml(key)}',this.value)">
            </div>
            <input type="text" placeholder="e.g. A1, A3" value="${escHtml((co.excludeCols || []).join(', '))}"
              oninput="alFmlUpdateExcludeCols('${escHtml(key)}',this.value)"
              style="border:1px solid var(--border);border-radius:var(--rad);padding:4px 7px;font-size:12px;width:100%">
            <button onclick="alFmlRemoveCourseOverride('${escHtml(key)}')" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:15px;padding:2px" title="Remove"><i class="bi bi-x-circle-fill"></i></button>
          </div>`;
                });
                wrap.innerHTML = html;
            }

            function alFmlSave() {
                const status = document.getElementById('fml-rules-status');
                if (status) { status.textContent = '✓ Formula rules saved — will apply on next Run Analysis'; setTimeout(() => { if (status) status.textContent = ''; }, 3500); }
                toast('Formula rules saved', 's');
            }

            function alFmlReset() {
                AL_FORMULA_CFG.global.aggr = 'avg';
                AL_FORMULA_CFG.global.round = 0;
                AL_FORMULA_CFG.courses = {};
                const sel = document.getElementById('fml-global-aggr');
                if (sel) sel.value = 'avg';
                document.querySelectorAll('.fml-rnd-btn[data-scope="global"]').forEach((b, i) => b.classList.toggle('active', i === 0));
                alFmlUpdatePreview('global');
                alFmlRenderOverrides();
                toast('Formula rules reset to defaults', 'i');
            }

            // ═══════════════════════════════════════════════════════════════
            // ASSIGNMENT LOGIC — state
            // ═══════════════════════════════════════════════════════════════
            const BUILTIN_RULES = { '4_4': 3, '8_8': 6, '12_12': 8, '4_8': 6, '8_12': 8, '16_16': 12 };
            let durOverrides = { ...BUILTIN_RULES };
            let courseOverrides = new Map();
            let customFormulas = [];
            let outputColsSelected = new Set();
            let outputColsAll = [];
            let formulaIdCounter = 0;
            let _focusedFormula = null;

            function getBuiltInBestN(dw, ta) {
                const key = `${dw}_${ta}`;
                if (durOverrides[key] !== undefined) return durOverrides[key];
                return null;
            }

            // ── Tab switching ──
            function alTab(name) {
                document.querySelectorAll('.al-tab-btn').forEach((t, i) => {
                    t.classList.toggle('active', ['fmlrules', 'dur', 'formula', 'course', 'output'][i] === name);
                });
                document.querySelectorAll('.al-pane').forEach(p => p.classList.remove('active'));
                const pane = $(`al-${name}`); if (pane) pane.classList.add('active');
            }

            // ── Init AL UI after file load ──
            function buildAssignmentLogicUI() {
                buildDurRulesTable();
                buildFormulaTokens();
                buildTemplateRow();
                buildOutputCols();
                renderFormulaList();
                renderCourseOverrides();
            }

            // ── Duration Rules ──
            function buildDurRulesTable() {
                const tbody = $('dur-rules-body'); if (!tbody) return;
                const allKeys = new Set([...Object.keys(durOverrides)]);
                groups.forEach(g => allKeys.add(g.key));

                let html = '';
                [...allKeys].sort().forEach(key => {
                    const [dw, ta] = [parseInt(key.split('_')[0]), parseInt(key.split('_')[1])];
                    const isBuiltin = BUILTIN_RULES[key] !== undefined;
                    const currentBN = durOverrides[key] ?? Math.ceil(ta * 0.75);
                    const src = isBuiltin ? 'built-in' : 'user rule';
                    const gMatch = groups.find(g => g.key === key);
                    html += `<tr>
      <td><span class="dr-badge ${isBuiltin ? 'auto' : 'override'}">${dw > 0 ? dw : '?'}W</span></td>
      <td><code style="font-size:11px;font-family:var(--mono)">${ta}</code></td>
      <td>
        <input class="dr-input" id="dr_${key}" type="number" min="1" max="${ta}" value="${currentBN}"
          onchange="onDurRuleChange('${key}',this)" oninput="validateDrInput(this,${ta})">
      </td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--txt3)" id="dr-fml-${key}">${buildLargeFormula(ta, currentBN)}</td>
      <td class="dr-src">${src}${gMatch ? ` · ${gMatch.rows.length.toLocaleString()} rows` : ''}</td>
      <td>${!isBuiltin ? `<button class="fb-del" onclick="removeDurRule('${key}')"><i class="bi bi-x"></i></button>` : ''}</td>
    </tr>`;
                });
                tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--txt3);font-size:11px">Load a file to see detected groups</td></tr>';
            }

            function buildLargeFormula(maxA, bestN) {
                const n = Math.min(bestN, maxA);
                const idxs = Array.from({ length: n }, (_, i) => i + 1).join(',');
                return `LARGE(A1:A${maxA},{${idxs}})/${n}×0.25`;
            }

            function validateDrInput(el, max) {
                const v = parseInt(el.value);
                el.classList.toggle('invalid', isNaN(v) || v < 1 || v > max);
            }

            function onDurRuleChange(key, el) {
                const v = parseInt(el.value);
                const ta = parseInt(key.split('_')[1]);
                if (isNaN(v) || v < 1 || v > ta) { el.classList.add('invalid'); return; }
                el.classList.remove('invalid');
                durOverrides[key] = v;
                const fc = $(`dr-fml-${key}`);
                if (fc) fc.textContent = buildLargeFormula(ta, v);
            }

            function addDurRule() {
                const dw = prompt('Duration weeks (e.g. 12):'); if (!dw || isNaN(dw)) return;
                const ta = prompt(`Total assignments for ${dw}W:`); if (!ta || isNaN(ta)) return;
                const bn = prompt(`Best N out of ${ta}:`); if (!bn || isNaN(bn)) return;
                const key = `${parseInt(dw)}_${parseInt(ta)}`;
                durOverrides[key] = parseInt(bn);
                buildDurRulesTable();
                toast(`Rule: ${dw}W/${ta}→Best ${bn}`, 's');
            }

            function removeDurRule(key) {
                delete durOverrides[key];
                buildDurRulesTable();
                toast('Rule removed', 'i');
            }

            function resetDurRules() {
                durOverrides = { ...BUILTIN_RULES };
                buildDurRulesTable();
                toast('Reset to built-in defaults', 'i');
            }

            function applyDurRules() {
                groups.forEach(g => { if (durOverrides[g.key] !== undefined) g.bestN = durOverrides[g.key]; });
                invalidateScoreCache();
                for (const g of groups) buildScoreCache(g, $('ck-blank').checked);
                refreshViewer(); buildDropdown();
                $('dur-status').innerHTML = `<span style="color:var(--success)"><i class="bi bi-check-circle-fill"></i> Applied — cache rebuilt</span>`;
                setTimeout(() => { if ($('dur-status')) $('dur-status').innerHTML = ''; }, 3000);
                toast('Duration rules applied', 's');
            }

            // ── Formula token bar ──
            function buildFormulaTokens() {
                const bar = $('col-tokens-bar'); if (!bar) return;
                if (!store || !groups.length) { bar.innerHTML = '<span style="font-size:10px;color:var(--txt3)">Load a file first</span>'; return; }
                const g = curGroup() || groups[0];
                let html = '';
                baseCols.forEach(c => { html += `<span class="col-tok" onclick="insertTok('${c}')" title="Base">${c}</span>`; });
                for (let i = 1; i <= g.maxA; i++) { html += `<span class="col-tok asgn" onclick="insertTok('A${i}')">A${i}</span>`; }
                ['Best_Avg', 'Score_25', 'out_of_25'].forEach(c => { html += `<span class="col-tok calc" onclick="insertTok('${c}')">${c}</span>`; });
                bar.innerHTML = html;
            }

            function insertTok(name) {
                if (!_focusedFormula) return toast('Click a formula field first', 'w');
                const el = _focusedFormula;
                const s = el.selectionStart, e = el.selectionEnd;
                el.value = el.value.slice(0, s) + name + el.value.slice(e);
                el.selectionStart = el.selectionEnd = s + name.length;
                el.focus();
                const fid = parseInt(el.dataset.fid || 0);
                if (fid) scheduleFormulaPreview(fid);
            }

            // ── Template library ──
            const FORMULA_TEMPLATES = [
                { label: 'Pass/Fail', cls: 'green', col: 'Pass_Fail', formula: 'IF(Score_25>=12.5,"Pass","Fail")' },
                { label: 'Grade S-D', cls: 'blue', col: 'Grade', formula: 'IF(Score_25>=22,"S",IF(Score_25>=20,"A",IF(Score_25>=17.5,"B",IF(Score_25>=15,"C","D"))))' },
                { label: 'Penalty', cls: 'warn', col: 'Penalty_Score', formula: 'MAX(0,Score_25-2)' },
                { label: 'Attempts', cls: 'purple', col: 'Attempted', formula: 'COUNTIF(A1:A{N},">0")' },
                { label: 'Max Score', cls: 'blue', col: 'Max_Asgn', formula: 'MAX(A1:A{N})' },
                { label: 'Zero Count', cls: 'warn', col: 'Zero_Count', formula: 'COUNTIF(A1:A{N},"=0")' },
            ];

            function buildTemplateRow() {
                const row = $('tpl-row'); if (!row) return;
                row.innerHTML = FORMULA_TEMPLATES.map((t, i) =>
                    `<button class="tpl-pill ${t.cls}" onclick="applyTemplate(${i})">${t.label}</button>`
                ).join('');
            }

            function applyTemplate(idx) {
                const t = FORMULA_TEMPLATES[idx];
                const g = curGroup() || groups[0];
                const n = g ? g.maxA : 8;
                addFormulaRow(t.col, t.formula.replace(/{N}/g, n));
                alTab('formula');
            }

            // ── Formula rows ──
            function renderFormulaList() {
                const list = $('fb-list'); if (!list) return;
                if (!customFormulas.length) {
                    list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--txt3);font-size:11px"><i class="bi bi-plus-circle" style="font-size:20px;display:block;margin-bottom:7px;opacity:.35"></i>No custom columns yet. Use a template or click "Add Formula Column".</div>';
                    return;
                }
                list.innerHTML = customFormulas.map(f => buildFbRowHTML(f)).join('');
                customFormulas.forEach(f => {
                    const el = $(`fbf_${f.id}`);
                    if (el) { el.dataset.fid = f.id; el.addEventListener('focus', () => _focusedFormula = el); }
                });
            }

            function buildFbRowHTML(f) {
                const g = curGroup() || groups[0];
                const scopeOpts = `<option value="all" ${f.scope === 'all' ? 'selected' : ''}>All Groups</option>` +
                    (groups || []).map(gr => `<option value="${gr.key}" ${f.scope === gr.key ? 'selected' : ''}>${gr.shortLabel}</option>`).join('');
                const prev = previewFormula(f, g);
                const haserr = !!prev.error;
                return `<div class="fb-row ${haserr ? 'has-error' : prev.rows ? 'is-valid' : ''}" id="fbrow_${f.id}">
    <div class="fb-hdr">
      <span style="font-size:10px;font-weight:700;color:var(--txt3);width:80px;flex-shrink:0">Col Name</span>
      <input class="fb-name" value="${f.colName}" placeholder="Column_Name"
        oninput="updateFml(${f.id},'colName',this.value)">
      <span style="font-size:10px;font-weight:700;color:var(--txt3);margin-left:8px;width:50px;flex-shrink:0">Scope</span>
      <select class="fb-scope" onchange="updateFml(${f.id},'scope',this.value)">${scopeOpts}</select>
      <button class="fb-del" onclick="removeFormula(${f.id})" title="Delete"><i class="bi bi-trash3"></i></button>
    </div>
    <div style="display:flex;align-items:flex-start;gap:8px">
      <span style="font-size:10px;font-weight:700;color:var(--txt3);width:80px;flex-shrink:0;padding-top:7px">Formula</span>
      <textarea class="fb-formula" id="fbf_${f.id}" placeholder='IF(Score_25>=12.5,"Pass","Fail")'
        oninput="updateFml(${f.id},'formula',this.value)">${escHtml(f.formula)}</textarea>
    </div>
    ${haserr ? `<div class="fb-err"><i class="bi bi-exclamation-circle-fill"></i>${escHtml(prev.error)}</div>` : ''}
    ${prev.rows ? `<div class="fb-preview">
      <div class="fb-preview-lbl">Preview — first 3 rows of current group</div>
      ${prev.rows.map((r, i) => `<div class="fb-preview-row"><span style="color:var(--txt3);width:16px">${i + 1}.</span><span style="color:var(--warn);font-weight:700">${escHtml(getStr('new_courseid', r.si))}</span><span style="margin-left:8px;color:var(--success);font-weight:700">${r.val}</span></div>`).join('')}
    </div>`: ''}
  </div>`;
            }

            function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

            function previewFormula(f, g) {
                if (!f.formula.trim() || !store || !g || !g.rows.length) return {};
                try {
                    const rows = [];
                    for (let ri = 0; ri < Math.min(3, g.rows.length); ri++) {
                        const si = g.rows[ri];
                        const val = evalFml(f.formula, si, g, ri);
                        rows.push({ si, val });
                    }
                    return { rows };
                } catch (e) { return { error: e.message }; }
            }

            function evalFml(formula, si, g, ri) {
                const cache = scoreCache.get(g.key + '|' + $('ck-blank').checked);
                const vals = { 'Score_25': cache ? cache.score25[ri] : 0, 'Best_Avg': cache ? cache.bestAvg[ri] : 0, 'out_of_25': getNum('out_of_25', si) || 0 };
                baseCols.forEach(c => { const fv = getNum(c, si); vals[c] = isNaN(fv) ? `"${getStr(c, si)}"` : fv; });
                for (let a = 1; a <= g.maxA; a++) { const fv = getNum(`A${a}`, si); vals[`A${a}`] = isNaN(fv) ? 0 : fv; }
                let expr = formula;
                Object.entries(vals).sort((a, b) => b[0].length - a[0].length).forEach(([k, v]) => {
                    expr = expr.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), v);
                });
                expr = excelToJS(expr);
                return new Function(`return (${expr})`)(); // eslint-disable-line
            }

            function excelToJS(expr) {
                let e = expr, prev;
                do { prev = e; e = e.replace(/IF\s*\(([^()]+),([^,()]+),([^()]+)\)/gi, '($1?$2:$3)'); }
                while (e !== prev && e.length < 3000);
                e = e.replace(/MAX\s*\(([^)]+)\)/gi, (_, a) => `Math.max(${a})`);
                e = e.replace(/MIN\s*\(([^)]+)\)/gi, (_, a) => `Math.min(${a})`);
                e = e.replace(/ROUND\s*\(([^,)]+),([^)]+)\)/gi, (_, n, d) => `(Math.round(${n}*Math.pow(10,${d}))/Math.pow(10,${d}))`);
                e = e.replace(/ABS\s*\(([^)]+)\)/gi, (_, a) => `Math.abs(${a})`);
                return e;
            }

            function addFormulaRow(colName = 'Custom_Col', formula = '') {
                const id = ++formulaIdCounter;
                customFormulas.push({ id, colName, formula, scope: 'all' });
                renderFormulaList(); buildOutputCols(); alTab('formula');
            }

            function removeFormula(id) {
                customFormulas = customFormulas.filter(f => f.id !== id);
                renderFormulaList(); buildOutputCols();
            }

            function updateFml(id, field, val) {
                const f = customFormulas.find(x => x.id === id); if (!f) return;
                f[field] = val;
                if (field === 'formula') { scheduleFormulaPreview(id); }
                else { renderFormulaList(); buildOutputCols(); }
            }

            const _previewTimers = {};
            function scheduleFormulaPreview(id) {
                clearTimeout(_previewTimers[id]);
                _previewTimers[id] = setTimeout(() => renderFormulaList(), 400);
            }

            function validateFormulas() {
                const errors = [];
                const g = curGroup() || groups[0];
                customFormulas.forEach(f => {
                    if (!f.colName.trim()) errors.push(`Formula #${f.id}: empty column name`);
                    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.colName)) errors.push(`"${f.colName}": invalid name`);
                    if (f.formula.trim() && g) { try { evalFml(f.formula, g.rows[0], g, 0); } catch (e) { errors.push(`"${f.colName}": ${e.message}`); } }
                });
                const names = customFormulas.map(f => f.colName);
                const dupes = names.filter((n, i) => names.indexOf(n) !== i);
                if (dupes.length) errors.push(`Duplicate: ${dupes.join(', ')}`);
                return errors;
            }

            // ── Course Overrides ──
            function renderCourseOverrides() {
                const list = $('co-list'), empty = $('co-empty'); if (!list) return;
                if (!courseOverrides.size) { list.innerHTML = ''; empty.style.display = 'block'; return; }
                empty.style.display = 'none';
                let html = '';
                courseOverrides.forEach((co, cid) => {
                    const g = groups.find(gr => gr.summary.some(s => s.cid === cid));
                    const maxA = g ? g.maxA : 14;
                    html += `<div class="co-row">
      <span class="co-cid"><i class="bi bi-bookmark-fill" style="font-size:9px;margin-right:3px"></i>${escHtml(cid)}</span>
      <input class="co-inp" type="number" value="${co.bestN || ''}" min="1" max="${maxA}" placeholder="Best N"
        onchange="updateCO('${cid}','bestN',parseInt(this.value)||0)">
      <input class="co-finp" value="${escHtml(co.formula || '')}" placeholder="Optional formula (leave blank = use group logic)"
        onchange="updateCO('${cid}','formula',this.value)">
      <button class="fb-del" onclick="removeCO('${cid}')"><i class="bi bi-x"></i></button>
    </div>`;
                });
                list.innerHTML = html;
            }

            function filterCourseSearch(val) {
                const dd = $('co-dropdown'); if (!dd) return;
                if (!val.trim() || !store) { dd.style.display = 'none'; return; }
                const q = val.toLowerCase();
                const allC = new Set(); groups.forEach(g => g.summary.forEach(s => allC.add(s.cid)));
                const matches = [...allC].filter(c => c.toLowerCase().includes(q) && !courseOverrides.has(c)).slice(0, 12);
                if (!matches.length) { dd.style.display = 'none'; return; }
                dd.style.display = 'block';
                dd.innerHTML = matches.map(c => {
                    const g = groups.find(gr => gr.summary.some(s => s.cid === c));
                    const cnt = g ? g.summary.find(s => s.cid === c)?.count || 0 : 0;
                    return `<div class="co-dd-item" onclick="addCO('${c}')">
      <b style="font-family:var(--mono);color:var(--warn)">${escHtml(c)}</b>
      <span style="color:var(--txt3);font-size:10px;margin-left:8px">${g ? g.shortLabel : ''} · ${cnt.toLocaleString()} rows</span>
    </div>`;
                }).join('');
            }

            function addCO(cid) {
                courseOverrides.set(cid, { bestN: 0, formula: '' });
                $('co-search').value = ''; $('co-dropdown').style.display = 'none';
                renderCourseOverrides(); invalidateScoreCache();
                toast(`Override added: ${cid}`, 's');
            }

            function removeCO(cid) {
                courseOverrides.delete(cid); renderCourseOverrides();
                if (!courseOverrides.size) $('co-empty').style.display = 'block';
                invalidateScoreCache();
            }

            function updateCO(cid, field, val) {
                const co = courseOverrides.get(cid); if (!co) return;
                co[field] = val; courseOverrides.set(cid, co);
            }

            // ── Output Columns ──
            function buildOutputCols() {
                const grid = $('oc-grid'); if (!grid) return;
                if (!store || !groups.length) { grid.innerHTML = '<span style="font-size:11px;color:var(--txt3)">Load a file first.</span>'; return; }
                const g = curGroup() || groups[0];
                outputColsAll = [];
                baseCols.forEach(c => outputColsAll.push({ name: c, type: 'base', label: 'Base' }));
                for (let i = 1; i <= g.maxA; i++) outputColsAll.push({ name: `A${i}`, type: 'asgn', label: 'Assignment' });
                ['Best_Avg', 'Score_25', 'Match'].forEach(c => outputColsAll.push({ name: c, type: 'score', label: 'Score Engine' }));
                customFormulas.forEach(f => outputColsAll.push({ name: f.colName, type: 'custom', label: 'Custom' }));
                // Init selection: all cols selected by default
                if (!outputColsSelected.size) outputColsAll.forEach(c => outputColsSelected.add(c.name));
                customFormulas.forEach(f => { if (!outputColsSelected.has(f.colName)) outputColsSelected.add(f.colName); });
                const colorMap = { base: 'var(--primary)', asgn: 'var(--success)', score: '#7c3aed', custom: 'var(--warn)' };
                grid.innerHTML = outputColsAll.map(c => {
                    const checked = outputColsSelected.has(c.name);
                    return `<label class="oc-item ${checked ? 'checked' : ''}" onclick="toggleOC('${c.name}',this)">
      <input type="checkbox" ${checked ? 'checked' : ''} onclick="event.stopPropagation();toggleOC('${c.name}',this.closest('.oc-item'))">
      <div>
        <div class="oc-lbl" style="color:${colorMap[c.type] || 'var(--txt)'}">${escHtml(c.name)}</div>
        <div class="oc-type">${c.label}</div>
      </div>
    </label>`;
                }).join('');
                updateOcCount();
            }

            function toggleOC(name, el) {
                if (outputColsSelected.has(name)) outputColsSelected.delete(name);
                else outputColsSelected.add(name);
                el.classList.toggle('checked', outputColsSelected.has(name));
                el.querySelector('input').checked = outputColsSelected.has(name);
                updateOcCount();
            }

            function updateOcCount() { const el = $('oc-count'); if (el) el.textContent = `${outputColsSelected.size} / ${outputColsAll.length} selected`; }
            function ocSelectAll(v) { outputColsAll.forEach(c => v ? outputColsSelected.add(c.name) : outputColsSelected.delete(c.name)); buildOutputCols(); }
            function ocResetDefault() { outputColsSelected.clear(); buildOutputCols(); }

            // ── Apply All ──
            function applyAllLogic() {
                const errs = validateFormulas();
                if (errs.length) {
                    $('al-global-status').innerHTML = `<span style="color:var(--danger)"><i class="bi bi-x-circle-fill"></i> ${escHtml(errs[0])}</span>`;
                    toast(errs[0], 'e', 5000); return;
                }
                groups.forEach(g => { if (durOverrides[g.key] !== undefined) g.bestN = durOverrides[g.key]; });
                invalidateScoreCache();
                for (const g of groups) buildScoreCache(g, $('ck-blank').checked);
                refreshViewer(); buildDropdown(); buildOutputCols(); buildCheckboxes();
                $('al-global-status').innerHTML = `<span style="color:var(--success)"><i class="bi bi-check-circle-fill"></i> Applied — ${groups.length} groups · ${courseOverrides.size} course overrides · ${customFormulas.length} custom cols</span>`;
                setTimeout(() => { if ($('al-global-status')) $('al-global-status').innerHTML = ''; }, 4000);
                toast(`Logic applied · ${customFormulas.length} custom cols`, 's');
            }

            // ── Close dropdown on outside click ──
            document.addEventListener('click', e => {
                const dd = $('co-dropdown');
                if (dd && !dd.contains(e.target) && e.target.id !== 'co-search') dd.style.display = 'none';
            });

