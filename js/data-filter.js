            // ══════════════════════════════════════════════════════════════
            // DATA FILTER — optimised for 80L+ rows
            // Dictionary-encoded column storage + Web Worker filtering
            // ══════════════════════════════════════════════════════════════
            const DF = (() => {
                'use strict';
                const dfEl = id => document.getElementById(id);
                const dfEsc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const dfYield = () => new Promise(r => setTimeout(r, 0));
                const MAX_DROPDOWN = 8000; // cols with more uniques → text-search only

                /* ── State ── */
                let store = null;      // {cols, n, colData:{col:{uniqueCount:number, dict?:string[]}}}
                let filteredCount = 0; // current matching row count; worker owns the row index view
                let fmap = {};         // col → {mode:'multi'|'text', sel:Set, txt:''}
                let sortCol = null, sortDir = 1, pg = 1, ps = 25;
                let debT = null, worker = null;
                let panels = [];       // track portaled panels for cleanup
                let chunkAckResolver = null;
                let loadFailed = false;
                let latestFilterSeq = 0;
                let lastAppliedFilterState = null;
                let loadedSource = '';
                const pendingFilterStates = new Map();

                function setMode(mode) {
                    const isCandidates = mode === 'candidates';
                    const titleIcon = dfEl('df-title-icon');
                    const title = dfEl('df-title');
                    const titleSub = dfEl('df-title-sub');
                    const dzTitle = dfEl('df-dz-title');
                    const dzSub = dfEl('df-dz-sub');
                    if (titleIcon) titleIcon.className = isCandidates ? 'bi bi-person-lines-fill' : 'bi bi-funnel-fill';
                    if (title) title.textContent = isCandidates ? 'Candidates Export' : 'Data Filter';
                    if (titleSub) titleSub.textContent = isCandidates
                        ? 'Upload a candidates CSV/XLSX file to inspect'
                        : 'Up to 80 lakh rows · zero page freeze';
                    if (dzTitle) dzTitle.textContent = isCandidates
                        ? 'Drop candidates file here or click to browse'
                        : 'Drop file here or click to browse';
                    if (dzSub) dzSub.textContent = isCandidates
                        ? 'No default file is loaded automatically'
                        : 'Auto-detected columns · Dictionary-encoded · Worker-filtered';
                }

                function resetForLoad() {
                    store = null; filteredCount = 0; fmap = {};
                    chunkAckResolver = null;
                    loadFailed = false;
                    latestFilterSeq = 0;
                    lastAppliedFilterState = null;
                    pendingFilterStates.clear();
                    if (worker) { try { worker.terminate(); } catch (e) { } worker = null; }
                    worker = buildWorker();
                    if (!worker) {
                        dfToast('Web Worker not supported — try Chrome/Edge/Firefox', 'e');
                        return false;
                    }
                    worker.onmessage = onWorkerMessage;
                    worker.onerror = err => {
                        loadFailed = true;
                        if (chunkAckResolver) {
                            const fn = chunkAckResolver;
                            chunkAckResolver = null;
                            fn();
                        }
                        dfProgHide(); dfEl('df-file-inp').disabled = false;
                        dfToast('Worker error: ' + (err.message || err), 'e');
                    };
                    return true;
                }

                /* ── Progress helpers ── */
                function dfProg(lbl, pct, detail) {
                    const pw = dfEl('df-pw'); if (!pw) return;
                    pw.style.display = 'block';
                    if (lbl != null) { const el = dfEl('df-pl'); if (el) el.textContent = lbl; }
                    if (pct != null) {
                        const pp = dfEl('df-pp'); if (pp) pp.textContent = pct + '%';
                        const pf = dfEl('df-pf'); if (pf) pf.style.width = pct + '%';
                    }
                    if (detail != null) { const pd = dfEl('df-pd'); if (pd) pd.textContent = detail; }
                }
                function dfProgHide() { const pw = dfEl('df-pw'); if (pw) pw.style.display = 'none'; }

                /* ── Toast ── */
                function dfToast(msg, type) { toast(msg, type || 's'); }
                function waitChunkAck() { return new Promise(res => { chunkAckResolver = res; }); }
                function normaliseFilterState(colFilters, textFilters, gs) {
                    const multi = {};
                    const text = {};
                    colFilters.forEach(f => { multi[f.col] = [...f.vals].sort(); });
                    textFilters.forEach(f => { text[f.col] = String(f.q || '').toLowerCase(); });
                    return { multi, text, gs: String(gs || '').toLowerCase() };
                }
                function isNarrowerFilterState(nextState, prevState) {
                    if (!prevState) return false;
                    const prevMultiKeys = Object.keys(prevState.multi);
                    const prevTextKeys = Object.keys(prevState.text);
                    for (const col of prevMultiKeys) {
                        const prevVals = prevState.multi[col];
                        const nextVals = nextState.multi[col];
                        if (!nextVals || nextVals.length > prevVals.length) return false;
                        const prevSet = new Set(prevVals);
                        for (const v of nextVals) if (!prevSet.has(v)) return false;
                    }
                    for (const col of prevTextKeys) {
                        const prevQ = prevState.text[col];
                        const nextQ = nextState.text[col];
                        if (!nextQ || !nextQ.includes(prevQ)) return false;
                    }
                    if (prevState.gs && (!nextState.gs || !nextState.gs.includes(prevState.gs))) return false;
                    return true;
                }

                /* ── Web Worker: parse + index + filter + page + export all off main thread ── */
                function buildWorker() {
                    const src = `
'use strict';
let store=null;
let currentView=null;
let csvState=null;
const MAX_DROPDOWN=${MAX_DROPDOWN};
self.onmessage=function(e){
  const {type,payload}=e.data;
  if(type==='INIT_CSV'){
    csvState=createCSVState(payload&&payload.totalBytes?payload.totalBytes:0);
    store=null;
    currentView=null;
    self.postMessage({type:'PROGRESS',label:'Preparing CSV stream\u2026',pct:2,detail:'Chunked parse in background worker'});
  }
  else if(type==='APPEND_CSV_CHUNK'){
    try{
      if(!csvState)csvState=createCSVState(payload&&payload.totalBytes?payload.totalBytes:0);
      consumeCSVChunk(payload.buffer,payload.loadedBytes||0,payload.totalBytes||0,!!payload.final);
      self.postMessage({type:'CHUNK_ACK'});
    }catch(ex){self.postMessage({type:'ERROR',msg:ex.message});}
  }
  else if(type==='LOAD_COLS'){
    try{
      const {cols,colArrs,n}=payload;
      self.postMessage({type:'PROGRESS',label:'Building indexes\u2026',pct:20,detail:n.toLocaleString()+' rows'});
      store=buildStoreFromCols(cols,colArrs,n);
      currentView=null;
      const meta=buildMeta(store);
      self.postMessage({type:'STORE_META',meta});
    }catch(ex){self.postMessage({type:'ERROR',msg:ex.message});}
  }
  else if(type==='FILTER'){
    if(!store){currentView=null;self.postMessage({type:'RESULT',count:0});return;}
    const count=doFilter(payload);
    self.postMessage({type:'RESULT',count,seq:payload.seq||0});
  }
  else if(type==='GET_PAGE'){
    if(!store){self.postMessage({type:'PAGE_DATA',rows:[]});return;}
    const start=Math.max(0,payload.start|0);
    const size=Math.max(0,payload.size|0);
    const total=getViewCount();
    const rows=[];
    const end=Math.min(start+size,total);
    for(let pos=start;pos<end;pos++){
      const ri=getViewRowIndex(pos);const row={};
      store.cols.forEach(c=>{row[c]=store.colData[c].dict[store.colData[c].idx[ri]];});
      rows.push(row);
    }
    self.postMessage({type:'PAGE_DATA',rows});
  }
  else if(type==='GET_SORT_IDX'){
    if(!store){currentView=null;self.postMessage({type:'SORT_RESULT',count:0});return;}
    sortView(payload.sortColName,payload.sortDir);
    self.postMessage({type:'SORT_RESULT',count:getViewCount()});
  }
  else if(type==='GET_CSV'){
    if(!store){self.postMessage({type:'CSV_DATA',csv:''});return;}
    const csvCell=v=>{const s=String(v!=null?v:'');return(s.indexOf(',')>=0||s.indexOf('"')>=0||s.indexOf('\\n')>=0||s.indexOf('\\r')>=0)?'"'+s.replace(/"/g,'""')+'"':s;};
    const lines=[store.cols.map(csvCell).join(',')];
    const total=getViewCount();
    for(let i=0;i<total;i++){
      const ri=getViewRowIndex(i);
      lines.push(store.cols.map(c=>csvCell(store.colData[c].dict[store.colData[c].idx[ri]])).join(','));
    }
    self.postMessage({type:'CSV_DATA',csv:'\\uFEFF'+lines.join('\\r\\n')});
  }
  else if(type==='GET_COPY'){
    if(!store){self.postMessage({type:'COPY_DATA',text:''});return;}
    const lines=[store.cols.join('\\t')];
    const total=getViewCount();
    for(let i=0;i<total;i++){
      const ri=getViewRowIndex(i);
      lines.push(store.cols.map(c=>String(store.colData[c].dict[store.colData[c].idx[ri]]??'')).join('\\t'));
    }
    self.postMessage({type:'COPY_DATA',text:lines.join('\\n')});
  }
};

function buildMeta(store){
  const meta={cols:store.cols,n:store.n,colData:{}};
  store.cols.forEach(c=>{
    const cd=store.colData[c];
    meta.colData[c]={uniqueCount:cd.uniqueCount};
    if(cd.isMulti)meta.colData[c].dict=cd.dict;
  });
  return meta;
}

function createCSVState(totalBytes){
  return{
    totalBytes:totalBytes||0,
    loadedBytes:0,
    decoder:new TextDecoder(),
    headers:null,
    builder:null,
    field:'',
    row:[],
    inQ:false,
    skipLF:false,
    rows:0
  };
}

function consumeCSVChunk(buffer,loadedBytes,totalBytes,final){
  const st=csvState;
  if(!st)throw new Error('CSV parser not initialised');
  if(totalBytes)st.totalBytes=totalBytes;
  const text=st.decoder.decode(buffer,{stream:!final});
  parseCSVText(st,text);
  st.loadedBytes=loadedBytes||Math.min(st.totalBytes||0,(st.loadedBytes||0)+buffer.byteLength);
  if(final){
    if(st.field!==''||st.row.length){
      st.row.push(st.field);
      st.field='';
      commitCSVRow(st,st.row);
      st.row=[];
    }
    if(!st.builder||!st.builder.n)throw new Error('No data rows found');
    self.postMessage({type:'PROGRESS',label:'Compacting indexes\u2026',pct:82,detail:st.builder.n.toLocaleString()+' rows'});
    store=finalizeStreamingStore(st.builder);
    currentView=null;
    csvState=null;
    self.postMessage({type:'PROGRESS',label:'Finalising\u2026',pct:96,detail:'Preparing filter metadata'});
    self.postMessage({type:'STORE_META',meta:buildMeta(store)});
    return;
  }
  const pct=st.totalBytes?Math.min(78,4+Math.round((st.loadedBytes/st.totalBytes)*72)):40;
  self.postMessage({
    type:'PROGRESS',
    label:'Streaming CSV\u2026',
    pct,
    detail:(st.loadedBytes||0).toLocaleString()+' / '+(st.totalBytes||0).toLocaleString()+' bytes \u00b7 '+st.rows.toLocaleString()+' rows'
  });
}

function parseCSVText(st,text){
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(st.skipLF){
      st.skipLF=false;
      if(ch==='\\n')continue;
    }
    if(st.inQ){
      if(ch==='"'){
        if(text[i+1]==='"'){st.field+='"';i++;}
        else st.inQ=false;
      }else st.field+=ch;
      continue;
    }
    if(ch==='"'){st.inQ=true;continue;}
    if(ch===','){st.row.push(st.field);st.field='';continue;}
    if(ch==='\\n'){
      st.row.push(st.field);
      st.field='';
      commitCSVRow(st,st.row);
      st.row=[];
      continue;
    }
    if(ch==='\\r'){
      st.row.push(st.field);
      st.field='';
      commitCSVRow(st,st.row);
      st.row=[];
      if(text[i+1]==='\\n')i++;
      else st.skipLF=true;
      continue;
    }
    st.field+=ch;
  }
}

function commitCSVRow(st,row){
  let hasData=false;
  for(let i=0;i<row.length;i++){if(row[i]!==''&&row[i]!=null){hasData=true;break;}}
  if(!hasData)return;
  if(!st.headers){
    st.headers=row.map((v,i)=>i===0?String(v||'').replace(/^\\uFEFF/,'').trim():String(v||'').trim());
    st.builder=createStreamingStoreBuilder(st.headers);
    return;
  }
  appendStreamingRow(st.builder,row);
  st.rows=st.builder.n;
}

function createStreamingStoreBuilder(cols){
  const colBuilders=new Array(cols.length);
  for(let i=0;i<cols.length;i++)colBuilders[i]=createColBuilder();
  return{cols,colBuilders,n:0};
}

function createColBuilder(){
  return{dict:[],map:new Map(),chunks:[new Uint32Array(262144)],chunkPos:0};
}

function appendStreamingRow(builder,row){
  const cols=builder.cols.length;
  const colBuilders=builder.colBuilders;
  for(let ci=0;ci<cols;ci++){
    const cb=colBuilders[ci];
    const v=ci<row.length&&row[ci]!=null?row[ci]:'';
    let di=cb.map.get(v);
    if(di===undefined){di=cb.dict.length;cb.map.set(v,di);cb.dict.push(v);}
    if(cb.chunkPos===262144){cb.chunks.push(new Uint32Array(262144));cb.chunkPos=0;}
    cb.chunks[cb.chunks.length-1][cb.chunkPos++]=di;
  }
  builder.n++;
}

function finalizeStreamingStore(builder){
  const cols=builder.cols;
  const n=builder.n;
  const colData={};
  for(let ci=0;ci<cols.length;ci++){
    const col=cols[ci];
    const cb=builder.colBuilders[ci];
    const dictSize=cb.dict.length;
    const isMulti=dictSize<=MAX_DROPDOWN;
    let dict=cb.dict;
    let revMap=null;
    let remap=null;
    if(ci%5===0)self.postMessage({type:'PROGRESS',label:'Compacting: '+col,pct:82+Math.round((ci/cols.length)*12),detail:(ci+1)+'/'+cols.length+' cols \u00b7 '+n.toLocaleString()+' rows'});
    if(isMulti){
      dict=cb.dict.slice().sort((a,b)=>{const na=+a,nb=+b;if(!isNaN(na)&&!isNaN(nb))return na-nb;return a<b?-1:a>b?1:0;});
      remap=new Uint32Array(dictSize);
      revMap=new Map();
      for(let ni=0;ni<dict.length;ni++){const v=dict[ni];const old=cb.map.get(v);remap[old]=ni;revMap.set(v,ni);}
    }
    const Typed=dictSize<=256?Uint8Array:dictSize<=65536?Uint16Array:Uint32Array;
    const idx=new Typed(n);
    let pos=0;
    for(let k=0;k<cb.chunks.length;k++){
      const chunk=cb.chunks[k];
      const len=k===cb.chunks.length-1?cb.chunkPos:262144;
      if(isMulti){
        for(let i=0;i<len;i++)idx[pos++]=remap[chunk[i]];
      }else if(Typed===Uint32Array){
        idx.set(chunk.subarray(0,len),pos);
        pos+=len;
      }else{
        for(let i=0;i<len;i++)idx[pos++]=chunk[i];
      }
    }
    colData[col]={dict,idx,revMap,uniqueCount:dictSize,isMulti,lowerDict:null,numDict:null,maskCache:Object.create(null)};
  }
  return{cols,n,colData};
}

/* Build column-oriented dict-encoded store — runs entirely in worker */
function buildStoreFromCols(cols,colArrs,n){
  const colData={};
  for(let ci=0;ci<cols.length;ci++){
    const col=cols[ci];
    const arr=colArrs[ci]||[];
    if(ci%5===0)self.postMessage({type:'PROGRESS',label:'Indexing: '+col,pct:22+Math.round((ci/cols.length)*72),detail:(ci+1)+'/'+cols.length+' cols \u00b7 '+n.toLocaleString()+' rows'});
    const dictMap=new Map();let dictSize=0;
    const rawIdx=new Uint32Array(n);
    for(let i=0;i<n;i++){
      const v=arr[i]!=null?String(arr[i]):'';
      let di=dictMap.get(v);
      if(di===undefined){di=dictSize++;dictMap.set(v,di);}
      rawIdx[i]=di;
    }
    const isMulti=dictSize<=MAX_DROPDOWN;
    let dict=[...dictMap.keys()];
    let idx;
    let revMap=null;
    if(isMulti){
      dict.sort((a,b)=>{const na=+a,nb=+b;if(!isNaN(na)&&!isNaN(nb))return na-nb;return a<b?-1:a>b?1:0;});
      const remap=new Uint32Array(dictSize);
      revMap=new Map();
      for(let ni=0;ni<dict.length;ni++){const v=dict[ni];remap[dictMap.get(v)]=ni;revMap.set(v,ni);}
      const Typed=dictSize<=256?Uint8Array:dictSize<=65536?Uint16Array:Uint32Array;
      idx=new Typed(n);
      for(let i=0;i<n;i++)idx[i]=remap[rawIdx[i]];
    }else{
      if(dictSize<=256){idx=new Uint8Array(n);for(let i=0;i<n;i++)idx[i]=rawIdx[i];}
      else if(dictSize<=65536){idx=new Uint16Array(n);for(let i=0;i<n;i++)idx[i]=rawIdx[i];}
      else idx=rawIdx;
    }
    colData[col]={dict,idx,revMap,uniqueCount:dictSize,isMulti,lowerDict:null,numDict:null,maskCache:Object.create(null)};
    colArrs[ci]=null;
  }
  self.postMessage({type:'PROGRESS',label:'Finalising\u2026',pct:96,detail:'Almost there!'});
  return{cols,n,colData};
}

function doFilter({colFilters,textFilters,gs,sortColName,sortDir,narrowOnly}){
  if(!store||!store.n){currentView=null;return 0;}
  const n=store.n;
  const source=(narrowOnly&&currentView)?currentView:null;
  const scanLen=source?source.length:n;
  const masks=colFilters.map(f=>{
    const cd=store.colData[f.col];if(!cd)return null;
    const mask=new Uint8Array(cd.dict.length);
    f.vals.forEach(v=>{const di=cd.revMap?cd.revMap.get(v):undefined;if(di!==undefined)mask[di]=1;});
    return{idx:cd.idx,mask};
  }).filter(Boolean);
  const textF=textFilters.map(f=>{
    const cd=store.colData[f.col];if(!cd)return null;
    return{idx:cd.idx,mask:getMaskForQuery(cd,f.q)};
  }).filter(Boolean);
  const gsLow=gs?gs.toLowerCase():'';
  const gsCols=gsLow?store.cols.map(c=>{const cd=store.colData[c];return{idx:cd.idx,mask:getMaskForQuery(cd,gsLow)};}):null;
  const hasFilters=masks.length>0||textF.length>0||!!gsLow;
  if(!hasFilters&&!sortColName){currentView=null;return n;}
  const result=new Uint32Array(scanLen);
  let outLen=0;
  for(let i=0;i<scanLen;i++){
    const rowIdx=source?source[i]:i;
    let ok=true;
    for(let m=0;m<masks.length;m++){if(!masks[m].mask[masks[m].idx[rowIdx]]){ok=false;break;}}
    if(ok&&textF.length){for(let t=0;t<textF.length;t++){if(!textF[t].mask[textF[t].idx[rowIdx]]){ok=false;break;}}}
    if(ok&&gsCols){let found=false;for(let c=0;c<gsCols.length;c++){if(gsCols[c].mask[gsCols[c].idx[rowIdx]]){found=true;break;}}if(!found)ok=false;}
    if(ok)result[outLen++]=rowIdx;
  }
  if(outLen===0){currentView=new Uint32Array(0);return 0;}
  if(!sortColName){
    if(source&&outLen===source.length)return outLen;
    if(!source&&outLen===n){currentView=null;return n;}
  }
  currentView=result.subarray(0,outLen).slice();
  if(sortColName&&outLen>1)sortIndexArray(currentView,sortColName,sortDir);
  return outLen;
}

function getViewCount(){
  if(!store)return 0;
  return currentView?currentView.length:store.n;
}

function getViewRowIndex(pos){
  return currentView?currentView[pos]:pos;
}

function ensureLowerDict(cd){
  if(cd.lowerDict)return cd.lowerDict;
  const lower=new Array(cd.dict.length);
  for(let i=0;i<cd.dict.length;i++)lower[i]=String(cd.dict[i]).toLowerCase();
  cd.lowerDict=lower;
  return lower;
}

function getMaskForQuery(cd,q){
  const key=String(q||'').toLowerCase();
  if(!key)return null;
  let mask=cd.maskCache[key];
  if(mask)return mask;
  const lower=ensureLowerDict(cd);
  mask=new Uint8Array(lower.length);
  for(let i=0;i<lower.length;i++)if(lower[i].includes(key))mask[i]=1;
  cd.maskCache[key]=mask;
  return mask;
}

function ensureNumDict(cd){
  if(cd.numDict)return cd.numDict;
  const nums=new Float64Array(cd.dict.length);
  for(let i=0;i<cd.dict.length;i++)nums[i]=+cd.dict[i];
  cd.numDict=nums;
  return nums;
}

function sortIndexArray(arr,sortColName,sortDir){
  if(!sortColName||!store.colData[sortColName]||arr.length<2)return;
  const cd=store.colData[sortColName];
  const idx=cd.idx,dict=cd.dict,nums=ensureNumDict(cd),dir=sortDir||1;
  arr.sort((a,b)=>{
    const ia=idx[a],ib=idx[b],na=nums[ia],nb=nums[ib];
    if(!isNaN(na)&&!isNaN(nb)){const d=(na-nb)*dir;if(d)return d;}
    const va=dict[ia],vb=dict[ib];
    return va<vb?-dir:va>vb?dir:0;
  });
}

function sortView(sortColName,sortDir){
  if(!store){currentView=null;return;}
  if(!currentView){
    currentView=new Uint32Array(store.n);
    for(let i=0;i<store.n;i++)currentView[i]=i;
  }
  sortIndexArray(currentView,sortColName,sortDir);
}
`;
                    try {
                        const blob = new Blob([src], { type: 'application/javascript' });
                        const url = URL.createObjectURL(blob);
                        const w = new Worker(url);
                        URL.revokeObjectURL(url);
                        return w;
                    } catch (e) { console.error('Worker creation failed', e); return null; }
                }

                /* ── File handler — main thread only reads the file, worker does everything else ── */
                async function handleFile(file) {
                    if (!file) return;
                    const ext = (file.name.split('.').pop() || '').toLowerCase();
                    dfEl('df-file-inp').disabled = true;
                    if (!resetForLoad()) { dfEl('df-file-inp').disabled = false; return; }
                    loadedSource = file.name;
                    try {
                        dfProg('Reading ' + file.name + '\u2026', 3, 'Handing off to background thread');
                        if (ext === 'csv') {
                            const CHUNK_BYTES = 8 * 1024 * 1024;
                            dfProg('Starting CSV stream\u2026', 4, 'Chunked parse + index in worker');
                            worker.postMessage({ type: 'INIT_CSV', payload: { totalBytes: file.size } });
                            for (let start = 0; start < file.size; start += CHUNK_BYTES) {
                                const end = Math.min(start + CHUNK_BYTES, file.size);
                                const ab = await file.slice(start, end).arrayBuffer();
                                const ack = waitChunkAck();
                                worker.postMessage({
                                    type: 'APPEND_CSV_CHUNK',
                                    payload: {
                                        buffer: ab,
                                        loadedBytes: end,
                                        totalBytes: file.size,
                                        final: end >= file.size
                                    }
                                }, [ab]);
                                await ack;
                                if (loadFailed) break;
                                if (start && start % (CHUNK_BYTES * 4) === 0) await dfYield();
                            }
                            if (loadFailed) return;
                        } else {
                            /* XLSX/XLS: XLSX.js must run on main thread, then send column arrays to worker */
                            const ab = await file.arrayBuffer();
                            dfProg('Parsing spreadsheet\u2026', 10, 'XLSX parse on main thread');
                            await dfYield();
                            let rows;
                            await new Promise(res => setTimeout(() => {
                                const wb = XLSX.read(ab, { type: 'array', cellDates: true });
                                rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
                                res();
                            }, 20));
                            if (!rows || !rows.length) {
                                dfToast('No data found in file', 'e');
                                dfEl('df-file-inp').disabled = false; dfProgHide(); return;
                            }
                            const cols = Object.keys(rows[0]), n = rows.length;
                            dfProg('Extracting columns\u2026', 38, n.toLocaleString() + ' rows \u00b7 ' + cols.length + ' cols');
                            await dfYield();
                            /* Build column-first arrays (avoids sending 80L objects to worker) */
                            const colArrs = cols.map(col => {
                                const arr = new Array(n);
                                for (let i = 0; i < n; i++) arr[i] = rows[i][col] != null ? String(rows[i][col]) : '';
                                return arr;
                            });
                            rows = null; /* free row objects ASAP */
                            dfProg('Sending to worker\u2026', 50, 'Worker will build indexes');
                            worker.postMessage({ type: 'LOAD_COLS', payload: { cols, colArrs, n } });
                        }
                    } catch (err) {
                        dfProgHide(); dfEl('df-file-inp').disabled = false;
                        dfToast('Error: ' + err.message, 'e'); console.error(err);
                    }
                }

                function loadDefaultCandidates() {
                    setMode('candidates');
                }

                /* ── Worker message dispatcher ── */
                function onWorkerMessage(e) {
                    const msg = e.data, type = msg.type;
                    if (type === 'PROGRESS') {
                        dfProg(msg.label, msg.pct, msg.detail);
                    }
                    else if (type === 'CHUNK_ACK') {
                        if (chunkAckResolver) {
                            const fn = chunkAckResolver;
                            chunkAckResolver = null;
                            fn();
                        }
                    }
                    else if (type === 'STORE_META') {
                        /* Worker finished building store; main thread gets light meta (dicts, no idx) */
                        store = msg.meta; /* {cols, n, colData:{col:{uniqueCount, dict?}}} */
                        defaultCandidatesLoading = false;
                        filteredCount = store.n;
                        fmap = {};
                        store.cols.forEach(c => {
                            fmap[c] = { mode: store.colData[c].uniqueCount <= MAX_DROPDOWN ? 'multi' : 'text', sel: new Set(), txt: '' };
                        });
                        sortCol = null; sortDir = 1; pg = 1;
                        dfProg('Building filter UI\u2026', 98, '');
                        buildFilterUI();
                        dfEl('df-up-sec').style.display = 'none';
                        dfEl('df-dash-sec').style.display = 'block';
                        dfEl('df-exp-btn').disabled = false;
                        dfEl('df-copy-btn').disabled = false;
                        updStats(); updBadge();
                        renderTable(); /* sends GET_PAGE to worker */
                        dfProgHide();
                        dfEl('df-file-inp').disabled = false;
                        dfToast('Loaded ' + store.n.toLocaleString() + ' rows \u00b7 ' + store.cols.length + ' columns', 's');
                    }
                    else if (type === 'PAGE_DATA') {
                        _renderPageData(msg.rows);
                    }
                    else if (type === 'SORT_RESULT') {
                        filteredCount = msg.count || 0;
                        pg = 1;
                        renderTable();
                    }
                    else if (type === 'RESULT') {
                        if (msg.seq && msg.seq !== latestFilterSeq) return;
                        filteredCount = msg.count || 0;
                        if (msg.seq && pendingFilterStates.has(msg.seq)) {
                            lastAppliedFilterState = pendingFilterStates.get(msg.seq);
                            pendingFilterStates.forEach((_, key) => { if (key <= msg.seq) pendingFilterStates.delete(key); });
                        }
                        pg = 1;
                        updStats(); updBadge(); renderChips(); renderTable();
                        const fs = dfEl('df-filter-status'); if (fs) fs.textContent = '';
                    }
                    else if (type === 'CSV_DATA') {
                        if (!msg.csv) { dfToast('Nothing to export', 'e'); return; }
                        const blob = new Blob([msg.csv], { type: 'text/csv;charset=utf-8' });
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = 'filtered_' + filteredCount + 'rows_' + Date.now() + '.csv';
                        a.click(); URL.revokeObjectURL(a.href);
                        dfToast('Exported ' + filteredCount.toLocaleString() + ' rows', 's');
                    }
                    else if (type === 'COPY_DATA') {
                        if (!msg.text) { dfToast('Nothing to copy', 'e'); return; }
                        navigator.clipboard.writeText(msg.text).then(() => {
                            dfToast('Copied ' + filteredCount.toLocaleString() + ' rows', 's');
                        }).catch(() => dfToast('Copy failed \u2014 use Export CSV instead', 'e'));
                        const lbl = dfEl('df-copy-lbl');
                        if (lbl) { lbl.textContent = 'Copied!'; setTimeout(() => lbl.textContent = 'Copy', 2000); }
                    }
                    else if (type === 'ERROR') {
                        loadFailed = true;
                        if (chunkAckResolver) {
                            const fn = chunkAckResolver;
                            chunkAckResolver = null;
                            fn();
                        }
                        dfProgHide(); dfEl('df-file-inp').disabled = false;
                        dfToast('Worker error: ' + msg.msg, 'e'); console.error('DF Worker:', msg.msg);
                    }
                }

                /* ── Filter UI ── */
                function buildFilterUI() {
                    const grid = dfEl('df-fg'); if (!grid) return;
                    // Remove old portaled panels
                    panels.forEach(p => { try { p.remove(); } catch (e) { } });
                    panels = [];
                    grid.innerHTML = '';
                    const frag = document.createDocumentFragment();
                    store.cols.forEach(col => {
                        const item = document.createElement('div'); item.className = 'df-col-wrap';
                        const lbl = document.createElement('div'); lbl.className = 'df-col-label';
                        lbl.innerHTML = '<span>' + dfEsc(col) + '</span><span class="df-col-cnt">' + store.colData[col].uniqueCount + '</span>';
                        item.appendChild(lbl);
                        if (fmap[col].mode === 'text') {
                            item.appendChild(makeTextFilter(col));
                        } else {
                            item.appendChild(makeMultiSelect(col));
                        }
                        frag.appendChild(item);
                    });
                    grid.appendChild(frag);
                    // Global search
                    const gs = dfEl('df-gsearch');
                    if (gs) { gs.oninput = schedFilter; }
                }

                /* ── Text filter input ── */
                function makeTextFilter(col) {
                    const inp = document.createElement('input');
                    inp.className = 'df-txt';
                    inp.placeholder = 'Search ' + col + '...';
                    inp.type = 'text';
                    inp.oninput = () => {
                        fmap[col].txt = inp.value;
                        inp.classList.toggle('df-active', !!inp.value);
                        schedFilter();
                    };
                    return inp;
                }

                /* ── Multi-select ── */
                const BATCH = 80;
                function makeMultiSelect(col) {
                    const vals = store.colData[col].dict;
                    const outer = document.createElement('div'); outer.className = 'df-ms-outer';
                    const state = { open: false, q: '', filtered: vals, rendered: 0 };
                    const trigger = document.createElement('div');
                    trigger.className = 'df-ms-trig'; trigger.id = 'df-ms-' + col;
                    trigger.tabIndex = 0;
                    setTrigger(trigger, col);
                    outer.appendChild(trigger);

                    const panel = document.createElement('div'); panel.className = 'df-ms-panel';
                    panel.style.display = 'none'; document.body.appendChild(panel); panels.push(panel);

                    const sr = document.createElement('div'); sr.className = 'df-ms-srow';
                    sr.innerHTML = '<i class="bi bi-search df-ms-sico"></i>';
                    const si = document.createElement('input'); si.className = 'df-ms-sinp'; si.placeholder = 'Search options...';
                    sr.appendChild(si); panel.appendChild(sr);

                    const ar = document.createElement('div'); ar.className = 'df-ms-arow';
                    const selAll = document.createElement('button'); selAll.className = 'df-ms-act'; selAll.textContent = 'All';
                    const clrAll = document.createElement('button'); clrAll.className = 'df-ms-act'; clrAll.textContent = 'Clear';
                    const cntLbl = document.createElement('span'); cntLbl.className = 'df-ms-cnt';
                    ar.appendChild(selAll); ar.appendChild(clrAll); ar.appendChild(cntLbl); panel.appendChild(ar);

                    const list = document.createElement('div'); list.className = 'df-ms-list'; panel.appendChild(list);

                    function pos() {
                        const tr = trigger.getBoundingClientRect();
                        panel.style.left = tr.left + 'px';
                        panel.style.width = Math.max(tr.width, 210) + 'px';
                        panel.style.zIndex = '99999';
                        const spB = window.innerHeight - tr.bottom - 6, spA = tr.top - 6, panH = 280;
                        if (spB >= panH || spB >= spA) { panel.style.top = (tr.bottom + 3) + 'px'; panel.style.bottom = 'auto'; }
                        else { panel.style.bottom = (window.innerHeight - tr.top + 3) + 'px'; panel.style.top = 'auto'; }
                    }

                    function refilter() {
                        const q = state.q.toLowerCase();
                        state.filtered = q ? vals.filter(v => v.toLowerCase().includes(q)) : vals;
                        state.rendered = 0; list.innerHTML = '';
                        cntLbl.textContent = state.filtered.length + '/' + vals.length;
                        appendBatch();
                    }

                    function appendBatch() {
                        const total = state.filtered.length;
                        if (!total) { list.innerHTML = '<div class="df-ms-empty">No options</div>'; return; }
                        const end = Math.min(state.rendered + BATCH, total);
                        const frag = document.createDocumentFragment();
                        for (let i = state.rendered; i < end; i++) frag.appendChild(makeOpt(state.filtered[i]));
                        list.appendChild(frag); state.rendered = end;
                    }

                    function makeOpt(v) {
                        const isSel = fmap[col].sel.has(v);
                        const opt = document.createElement('div');
                        opt.className = 'df-ms-opt' + (isSel ? ' sel' : ''); opt.dataset.val = v;
                        opt.innerHTML = '<div class="df-ms-cb">' + (isSel ? '<svg width="9" height="9" fill="none" stroke="#fff" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</div>'
                            + '<span class="df-ms-opt-txt" title="' + dfEsc(v) + '">' + dfEsc(v) + '</span>';
                        opt.addEventListener('mousedown', ev => {
                            ev.preventDefault();
                            const nowSel = !fmap[col].sel.has(v);
                            if (nowSel) fmap[col].sel.add(v); else fmap[col].sel.delete(v);
                            opt.classList.toggle('sel', nowSel);
                            const cb = opt.querySelector('.df-ms-cb');
                            cb.style.background = nowSel ? 'var(--blue)' : '';
                            cb.style.borderColor = nowSel ? 'var(--blue)' : '';
                            cb.innerHTML = nowSel ? '<svg width="9" height="9" fill="none" stroke="#fff" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';
                            setTrigger(trigger, col); schedFilter();
                        });
                        return opt;
                    }

                    list.addEventListener('scroll', () => {
                        if (state.rendered < state.filtered.length && list.scrollTop + list.clientHeight >= list.scrollHeight - 60) appendBatch();
                    }, { passive: true });

                    function openPanel() {
                        document.querySelectorAll('.df-ms-panel').forEach(p => { if (p !== panel && p.style.display !== 'none') { p.style.display = 'none'; if (p._trig) p._trig.classList.remove('open'); } });
                        state.open = true; state.q = ''; si.value = ''; panel.style.display = 'flex';
                        panel._trig = trigger; trigger.classList.add('open'); pos(); refilter();
                        setTimeout(() => si.focus(), 0);
                    }
                    function closePanel() { state.open = false; panel.style.display = 'none'; trigger.classList.remove('open'); }

                    trigger.addEventListener('click', ev => { ev.stopPropagation(); state.open ? closePanel() : openPanel(); });
                    trigger.addEventListener('keydown', ev => {
                        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); state.open ? closePanel() : openPanel(); }
                        if (ev.key === 'Escape') closePanel();
                    });

                    let siT = null;
                    si.addEventListener('input', () => { clearTimeout(siT); siT = setTimeout(() => { state.q = si.value; list.scrollTop = 0; refilter(); }, 150); });

                    selAll.addEventListener('mousedown', ev => {
                        ev.preventDefault(); state.filtered.forEach(v => fmap[col].sel.add(v));
                        list.querySelectorAll('.df-ms-opt').forEach(o => {
                            if (!fmap[col].sel.has(o.dataset.val)) return;
                            o.classList.add('sel'); const cb = o.querySelector('.df-ms-cb');
                            cb.style.background = 'var(--blue)'; cb.style.borderColor = 'var(--blue)';
                            cb.innerHTML = '<svg width="9" height="9" fill="none" stroke="#fff" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
                        });
                        setTrigger(trigger, col); schedFilter();
                    });
                    clrAll.addEventListener('mousedown', ev => {
                        ev.preventDefault(); state.filtered.forEach(v => fmap[col].sel.delete(v));
                        list.querySelectorAll('.df-ms-opt').forEach(o => {
                            o.classList.remove('sel'); const cb = o.querySelector('.df-ms-cb');
                            cb.style.background = ''; cb.style.borderColor = ''; cb.innerHTML = '';
                        });
                        setTrigger(trigger, col); schedFilter();
                    });

                    document.addEventListener('click', ev => {
                        if (state.open && !outer.contains(ev.target) && !panel.contains(ev.target)) closePanel();
                    });
                    const onScroll = () => { if (state.open) pos(); };
                    window.addEventListener('scroll', onScroll, true);
                    window.addEventListener('resize', onScroll);
                    return outer;
                }

                function setTrigger(trigger, col) {
                    const sel = fmap[col] && fmap[col].sel;
                    if (!sel || sel.size === 0) {
                        trigger.innerHTML = '<span class="df-ms-ph">&#8212; All &#8212;</span>';
                        trigger.classList.remove('df-active');
                    } else {
                        trigger.classList.add('df-active');
                        const items = [...sel], show = items.slice(0, 2), extra = items.length - 2;
                        let html = '<div class="df-ms-tags">';
                        show.forEach(v => {
                            html += '<span class="df-ms-tag">' + dfEsc(v)
                                + '<button class="df-ms-tag-x" onmousedown="event.stopPropagation();event.preventDefault();DF.removeTag(\'' + dfEsc(col) + '\',\'' + dfEsc(v) + '\')">&#215;</button></span>';
                        });
                        if (extra > 0) html += '<span class="df-ms-more">+' + extra + '</span>';
                        html += '</div>'; trigger.innerHTML = html;
                    }
                }

                /* ── Filter scheduling & engine ── */
                function schedFilter() {
                    clearTimeout(debT);
                    // Show "filtering..." status for large datasets
                    if (store && store.n > 200000) {
                        const fs = dfEl('df-filter-status'); if (fs) fs.textContent = 'Filtering\u2026';
                    }
                    debT = setTimeout(applyFilters, 200);
                }

                function applyFilters() {
                    if (!store || !worker) return;
                    const gs = ((dfEl('df-gsearch') || {}).value || '').trim();
                    const colFilters = [], textFilters = [];
                    store.cols.forEach(col => {
                        const f = fmap[col]; if (!f) return;
                        if (f.mode === 'multi' && f.sel.size > 0) colFilters.push({ col, vals: [...f.sel] });
                        else if (f.mode === 'text' && f.txt) textFilters.push({ col, q: f.txt });
                    });
                    const seq = ++latestFilterSeq;
                    const state = normaliseFilterState(colFilters, textFilters, gs);
                    const narrowOnly = isNarrowerFilterState(state, lastAppliedFilterState);
                    pendingFilterStates.set(seq, state);
                    /* Always use worker — it has the idx arrays, main thread does not */
                    worker.postMessage({ type: 'FILTER', payload: { colFilters, textFilters, gs, sortColName: sortCol, sortDir, narrowOnly, seq } });
                }

                /* ── Stats ── */
                function updStats() {
                    if (!store) return;
                    const tot = store.n, f = filteredCount, exc = tot - f;
                    const pct = tot ? Math.round(f / tot * 100) : 0;
                    const sv = dfEl('df-sv-tot'); if (sv) sv.textContent = tot.toLocaleString();
                    const sf = dfEl('df-sv-fil'); if (sf) sf.textContent = f.toLocaleString();
                    const sc = dfEl('df-sv-col'); if (sc) sc.textContent = store.cols.length;
                    const se = dfEl('df-sv-exc'); if (se) se.textContent = exc.toLocaleString();
                    const sp2 = dfEl('df-sp2'); if (sp2) sp2.style.width = pct + '%';
                    const sp4 = dfEl('df-sp4'); if (sp4) sp4.style.width = (tot ? Math.round(exc / tot * 100) : 0) + '%';
                    const tb = dfEl('df-tbadge'); if (tb) tb.textContent = f.toLocaleString() + ' rows';
                }

                function updBadge() {
                    let a = 0;
                    if (fmap) { store && store.cols.forEach(c => { const f = fmap[c]; if (f && ((f.sel && f.sel.size > 0) || f.txt)) a++; }); }
                    const gs = dfEl('df-gsearch'); if (gs && gs.value) a++;
                    const fb = dfEl('df-fbadge');
                    if (fb) { fb.textContent = a ? a + ' active' : (store ? store.cols.length + ' filters' : ''); }
                }

                /* ── Chips ── */
                function renderChips() {
                    const row = dfEl('df-chips-row'), inner = dfEl('df-chips-inner'); if (!row || !inner) return;
                    const gs = dfEl('df-gsearch') && dfEl('df-gsearch').value;
                    const parts = [];
                    if (store) store.cols.forEach(col => {
                        const f = fmap[col]; if (!f) return;
                        if (f.sel && f.sel.size > 0) {
                            const items = [...f.sel];
                            const preview = items.slice(0, 2).join(', ') + (items.length > 2 ? ' +' + (items.length - 2) : '');
                            parts.push({ label: col + ': ' + preview, clear: () => { f.sel.clear(); const t = dfEl('df-ms-' + col); if (t) setTrigger(t, col); } });
                        }
                        if (f.txt) parts.push({ label: col + ' contains: ' + f.txt, clear: () => { f.txt = ''; } });
                    });
                    if (!parts.length && !gs) { row.style.display = 'none'; return; }
                    row.style.display = 'flex'; inner.innerHTML = '';
                    parts.forEach(({ label, clear }) => {
                        const c = document.createElement('span'); c.className = 'df-chip';
                        c.innerHTML = dfEsc(label) + '<button class="df-chip-x">&#215;</button>';
                        c.querySelector('.df-chip-x').onclick = () => { clear(); applyFilters(); };
                        inner.appendChild(c);
                    });
                    if (gs) {
                        const c = document.createElement('span'); c.className = 'df-chip';
                        c.innerHTML = 'Search: ' + dfEsc(gs) + '<button class="df-chip-x">&#215;</button>';
                        c.querySelector('.df-chip-x').onclick = () => { const el = dfEl('df-gsearch'); if (el) el.value = ''; applyFilters(); };
                        inner.appendChild(c);
                    }
                }

                /* ── Table rendering — requests page from worker (worker owns idx arrays) ── */
                function renderTable() {
                    const wrap = dfEl('df-tw'); if (!wrap || !store) return;
                    const total = filteredCount;
                    if (!total) {
                        wrap.innerHTML = '<div class="df-empty"><h3>' + (store.n > 0 ? 'No matching records' : 'No data loaded') + '</h3>'
                            + '<p>' + (store.n > 0 ? 'Try adjusting filters' : 'Upload a file above') + '</p></div>';
                        const pag = dfEl('df-pag'); if (pag) pag.style.display = 'none'; return;
                    }
                    renderPag(total);
                    const s = (pg - 1) * ps, e2 = Math.min(s + ps, total);
                    wrap.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">'
                        + '<i class="bi bi-hourglass-split"></i>&nbsp; Loading rows…</div>';
                    if (worker) worker.postMessage({ type: 'GET_PAGE', payload: { start: s, size: e2 - s } });
                }

                function _renderPageData(rows) {
                    const wrap = dfEl('df-tw'); if (!wrap || !store || !rows) return;
                    const parts = ['<table class="df-tbl"><thead><tr>'];
                    store.cols.forEach(c => {
                        const sorted = sortCol === c;
                        parts.push('<th class="' + (sorted ? 'df-sorted' : '') + '" onclick="DF.sort(\'' + dfEsc(c) + '\')">'
                            + dfEsc(c) + ' <span style="opacity:.35;font-size:9px">'
                            + (sorted ? (sortDir === 1 ? '&#9650;' : '&#9660;') : '&#8597;') + '</span></th>');
                    });
                    parts.push('</tr></thead><tbody>');
                    rows.forEach(row => {
                        parts.push('<tr>');
                        store.cols.forEach(c => {
                            const v = row[c] != null ? String(row[c]) : '';
                            parts.push('<td title="' + dfEsc(v) + '">'
                                + (v === '' ? '<span style="color:var(--text3);font-style:italic">&#8212;</span>' : dfEsc(v)) + '</td>');
                        });
                        parts.push('</tr>');
                    });
                    parts.push('</tbody></table>');
                    wrap.innerHTML = parts.join('');
                }
                function renderPag(total) {
                    const pag = dfEl('df-pag'), pb = dfEl('df-pb'), pi = dfEl('df-pi');
                    if (!pag) return;
                    const tp = Math.ceil(total / ps);
                    if (tp <= 1) { pag.style.display = 'none'; return; }
                    pag.style.display = 'flex';
                    const s = (pg - 1) * ps + 1, e = Math.min(pg * ps, total);
                    if (pi) pi.textContent = s.toLocaleString() + '\u2013' + e.toLocaleString() + ' of ' + total.toLocaleString() + ' records';
                    if (!pb) return; pb.innerHTML = '';
                    const mk = (lbl, p, dis, act) => {
                        const b = document.createElement('button'); b.className = 'df-pb' + (act ? ' df-cur' : '');
                        b.innerHTML = lbl; b.disabled = dis || act;
                        if (!dis && !act) b.onclick = () => { pg = p; renderTable(); };
                        pb.appendChild(b);
                    };
                    mk('&#8249;', pg - 1, pg === 1);
                    const lo = Math.max(1, pg - 2), hi = Math.min(tp, pg + 2);
                    if (lo > 1) { mk(1, 1); if (lo > 2) { const sp = document.createElement('span'); sp.textContent = '...'; sp.style.cssText = 'color:var(--text3);padding:0 4px;font-size:11px;line-height:26px'; pb.appendChild(sp); } }
                    for (let i = lo; i <= hi; i++) mk(i, i, false, i === pg);
                    if (hi < tp) { if (hi < tp - 1) { const sp = document.createElement('span'); sp.textContent = '...'; sp.style.cssText = 'color:var(--text3);padding:0 4px;font-size:11px;line-height:26px'; pb.appendChild(sp); } mk(tp, tp); }
                    mk('&#8250;', pg + 1, pg === tp);
                }

                /* ── Sort — offloaded to worker (worker has idx arrays) ── */
                function sort(col) {
                    if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
                    if (filteredCount > 1 && worker) {
                        worker.postMessage({ type: 'GET_SORT_IDX', payload: { sortColName: col, sortDir } });
                        /* SORT_RESULT message will update filtered + call renderTable */
                    } else {
                        pg = 1; renderTable();
                    }
                }

                /* ── Export CSV — worker builds the CSV string (it has idx arrays) ── */
                function exportCSV() {
                    if (!filteredCount) { dfToast('No data to export', 'e'); return; }
                    if (!worker) { dfToast('Worker unavailable', 'e'); return; }
                    dfToast('Preparing export…', 'i');
                    worker.postMessage({ type: 'GET_CSV', payload: {} });
                }

                /* ── Copy table — worker builds TSV string ── */
                function copyTable() {
                    if (!filteredCount) { dfToast('No data to copy', 'e'); return; }
                    if (!worker) { dfToast('Worker unavailable', 'e'); return; }
                    const lbl = dfEl('df-copy-lbl'); if (lbl) lbl.textContent = 'Copying…';
                    worker.postMessage({ type: 'GET_COPY', payload: {} });
                }

                /* ── Reset / Clear ── */
                function reset() {
                    if (!store) return;
                    store.cols.forEach(col => {
                        fmap[col].sel.clear(); fmap[col].txt = '';
                        const t = dfEl('df-ms-' + col); if (t) setTrigger(t, col);
                    });
                    const gs = dfEl('df-gsearch'); if (gs) gs.value = '';
                    applyFilters(); dfToast('Filters reset', 'i');
                }

                function clear() {
                    store = null; filteredCount = 0; fmap = {}; sortCol = null; sortDir = 1; pg = 1;
                    loadedSource = '';
                    defaultCandidatesLoading = false;
                    latestFilterSeq = 0;
                    lastAppliedFilterState = null;
                    pendingFilterStates.clear();
                    if (worker) { try { worker.terminate(); } catch (e) { } worker = null; }
                    panels.forEach(p => { try { p.remove(); } catch (e) { } }); panels = [];
                    dfEl('df-up-sec').style.display = 'block';
                    dfEl('df-dash-sec').style.display = 'none';
                    const fi = dfEl('df-file-inp'); if (fi) fi.value = '';
                    dfEl('df-exp-btn').disabled = true;
                    dfEl('df-copy-btn').disabled = true;
                    dfToast('Data Filter cleared', 'i');
                }

                function removeTag(col, val) {
                    if (fmap[col]) fmap[col].sel.delete(val);
                    const t = dfEl('df-ms-' + col); if (t) setTrigger(t, col);
                    schedFilter();
                }

                function changePS(v) { ps = parseInt(v); pg = 1; renderTable(); }

                /* ── Drag/drop on drop zone ── */
                (function initDZ() {
                    const dz = dfEl('df-dz'); if (!dz) return;
                    dz.addEventListener('dragover', ev => { ev.preventDefault(); dz.classList.add('over'); });
                    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
                    dz.addEventListener('drop', ev => { ev.preventDefault(); dz.classList.remove('over'); const f = ev.dataTransfer.files[0]; if (f) handleFile(f); });
                })();

                return { handleFile, reset, clear, sort, exportCSV, copyTable, changePS, removeTag, loadDefaultCandidates, setMode };
            })();
