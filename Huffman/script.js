
const state = {
    text: '',
    mode: 'char',
    freqMap: new Map(),
    totalChars: 0, totalWords: 0, unique: 0,

    // huffman tree
    forest: [],
    nodes: [],
    steps: [],
    currentStepIdx: 0,
    rootNode: null,
    huffmanCodes: null,

    // animation
    playInterval: null,
    isPlaying: false,

    // canvases
    treeCtx: null,
    barCtx: null,

    // transformation
    zoom: 1.1,
    panX: 0,
    panY: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0
};

class HuffNode {
    constructor(symbol, freq, left = null, right = null) {
        this.id = Math.random().toString(36).substring(2, 8);
        this.symbol = symbol;
        this.freq = freq;
        this.left = left;
        this.right = right;
    }
    isLeaf() { return !this.left && !this.right; }
}

// DOM Mapping
const inputEl = document.getElementById('inputText');
const processBtn = document.getElementById('processBtn');
const clearBtn = document.getElementById('clearBtn');
const freqTableEl = document.getElementById('freqTableContainer');
const uniqueEl = document.getElementById('uniqueCount');
const charCountEl = document.getElementById('charCount');
const wordCountEl = document.getElementById('wordCount');
const treeCanvas = document.getElementById('treeCanvas');
const prevBtn = document.getElementById('prevStepBtn');
const nextBtn = document.getElementById('nextStepBtn');
const resetBtn = document.getElementById('resetStepBtn');
const playBtn = document.getElementById('playPauseBtn');
const stepInd = document.getElementById('stepIndicator');
const treeMsg = document.getElementById('treeStateMsg');
const mergeBadge = document.getElementById('mergeCountBadge');
const originalBitsSpan = document.getElementById('originalBits');
const compressedBitsSpan = document.getElementById('compressedBits');
const savedBitsSpan = document.getElementById('savedBits');
const compressionRatioSpan = document.getElementById('compressionRatio');
const bitAnalysisContainer = document.getElementById('bitAnalysisContainer');
const detailedBreakdown = document.getElementById('detailedBitBreakdown');
const encodeInput = document.getElementById('encodeInput');
const encodeBtn = document.getElementById('encodeBtn');
const copyBtn = document.getElementById('copyBtn');
const binaryOut = document.getElementById('binaryOutput');

if (treeCanvas) state.treeCtx = treeCanvas.getContext('2d');

function processText() {
    const text = inputEl.value.trim();
    if (!text) {
        updateEmptyUI();
        return;
    }
    state.text = text;
    state.totalChars = text.length;
    state.totalWords = text.split(/\s+/).filter(w => w).length;
    if (charCountEl) charCountEl.innerText = `${state.totalChars} characters`;
    if (wordCountEl) wordCountEl.innerText = `${state.totalWords} words`;
    state.freqMap.clear();
    for (let ch of text) state.freqMap.set(ch, (state.freqMap.get(ch) || 0) + 1);
    state.unique = state.freqMap.size;
    if (uniqueEl) uniqueEl.innerText = state.unique;
    updateFreqTable();
    buildHuffmanTree();
    updateBitAnalytics();
    updateStatus('STREAM PROCESSED', 'text-accent');
}

function updateEmptyUI() {
    if (freqTableEl) freqTableEl.innerHTML = '<div class="text-center py-10 text-slate-400 italic text-[11px] font-medium">Inject corpus for spectral analysis...</div>';
    if (binaryOut) binaryOut.innerText = '_ binary_stream_idle _';
    updateStatus('NEXUS ONLINE', 'text-slate-200');
}

function updateStatus(msg, colorClass) {
    if (treeMsg) {
        treeMsg.className = `flex items-center gap-2 text-[9px] font-bold ${colorClass} uppercase tracking-widest mt-0.5`;
        treeMsg.innerHTML = `<span class="w-1.5 h-1.5 ${colorClass.replace('text-', 'bg-')} rounded-full animate-pulse"></span> ${msg}`;
    }
}

function updateFreqTable() {
    if (!freqTableEl) return;
    const entries = Array.from(state.freqMap.entries()).sort((a, b) => b[1] - a[1]);
    let html = '';
    entries.forEach(([sym, freq]) => {
        const displaySym = sym === ' ' ? 'SPC' : (sym === '\n' ? '↵' : sym);
        html += `
            <div class="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-white/10 hover:border-primary/40 transition-all cursor-default group" 
                 onmouseenter="highlightNode('${escapeHTML(sym.toString())}')" onmouseleave="unhighlightNode()">
                <div class="flex items-center gap-3">
                    <span class="w-8 h-8 flex items-center justify-center bg-slate-950 rounded-lg text-[10px] font-mono font-bold text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                        ${escapeHTML(displaySym.toString())}
                    </span>
                    <span class="text-[9px] font-bold text-white uppercase tracking-tighter">symb</span>
                </div>
                <div class="badge badge-sm font-mono font-bold text-[11px] bg-primary text-white border-none px-2">${freq}</div>
            </div>`;
    });
    freqTableEl.innerHTML = html;
}

window.highlightNode = function (sym) {
    if (state.huffmanCodes && detailedBreakdown) {
        const code = state.huffmanCodes.get(sym) || '—';
        detailedBreakdown.innerHTML = `<span class="text-primary font-bold">"${sym}"</span> <span class="mx-1 text-slate-400">::</span> <span class="text-white font-mono tracking-widest font-bold">${code}</span>`;
    }
};

window.unhighlightNode = function () {
    if (detailedBreakdown) detailedBreakdown.innerHTML = `Hover symbols for architectural insights...`;
};

function buildHuffmanTree() {
    const leaves = [];
    for (let [sym, freq] of state.freqMap.entries()) leaves.push(new HuffNode(sym, freq));
    leaves.sort((a, b) => a.freq - b.freq);
    state.steps = [leaves.map(n => n)];
    let forest = leaves.map(n => n);
    while (forest.length > 1) {
        forest.sort((a, b) => a.freq - b.freq || (a.id < b.id ? -1 : 1));
        const left = forest.shift();
        const right = forest.shift();
        const parent = new HuffNode(null, left.freq + right.freq, left, right);
        forest.push(parent);
        state.steps.push(forest.map(n => n));
    }
    state.rootNode = forest[0] || null;
    state.currentStepIdx = 0;
    computeCodes();
    syncUI();
    autoPosition();
    drawNexus();
}

function computeCodes() {
    state.huffmanCodes = new Map();
    if (!state.rootNode) return;
    const dfs = (node, code) => {
        if (!node) return;
        if (node.isLeaf()) state.huffmanCodes.set(node.symbol, code || '0');
        dfs(node.left, code + '0');
        dfs(node.right, code + '1');
    };
    dfs(state.rootNode, '');
}

function nextStep() { if (state.currentStepIdx < state.steps.length - 1) { state.currentStepIdx++; drawNexus(); syncUI(); } }
function prevStep() { if (state.currentStepIdx > 0) { state.currentStepIdx--; drawNexus(); syncUI(); } }
function resetStep() { state.currentStepIdx = 0; drawNexus(); syncUI(); }

function syncUI() {
    if (stepInd) stepInd.innerText = `${state.currentStepIdx + 1} / ${state.steps.length}`;
    if (mergeBadge) mergeBadge.innerText = state.currentStepIdx;
}

function drawNexus() {
    const ctx = state.treeCtx;
    if (!ctx) return;
    const w = treeCanvas.width / (window.devicePixelRatio || 1);
    const h = treeCanvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; // Brighter Grid
    ctx.lineWidth = 1;
    const gS = 50 * state.zoom;
    for (let x = state.panX % gS; x < w; x += gS) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = state.panY % gS; y < h; y += gS) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.save();
    ctx.translate(w / 2 + state.panX, h / 4 + state.panY);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-w / 2, -h / 4);
    if (state.steps.length) {
        const forest = state.steps[state.currentStepIdx];
        if (forest.length === 1) {
            drawHNode(forest[0], w / 2, 60, w / 4, 0);
        } else {
            const totalW = w * 0.9;
            const part = totalW / (forest.length + 1);
            const startX = (w - totalW) / 2;
            forest.forEach((root, i) => drawHNode(root, startX + (i + 1) * part, 60, part / 2.8, 0));
        }
    }
    ctx.restore();
}

function drawHNode(node, x, y, xOffset, depth) {
    if (!node) return;
    const ctx = state.treeCtx;
    const rad = 28 - Math.min(depth * 1.8, 15);
    const vG = 110 - Math.min(depth * 4, 60);
    if (node.left) {
        const lx = x - xOffset, ly = y + vG;
        ctx.beginPath();
        const grad = ctx.createLinearGradient(x, y, lx, ly);
        grad.addColorStop(0, '#60a5fa'); grad.addColorStop(1, '#2563eb');
        ctx.strokeStyle = grad; ctx.lineWidth = 5 - Math.min(depth * 0.3, 3);
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x, y + vG / 2, lx, ly); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace';
        ctx.fillText('0', x - xOffset / 2 - 15, y + vG / 2);
        drawHNode(node.left, lx, ly, xOffset * 0.58, depth + 1);
    }
    if (node.right) {
        const rx = x + xOffset, ry = y + vG;
        ctx.beginPath();
        const grad = ctx.createLinearGradient(x, y, rx, ry);
        grad.addColorStop(0, '#34d399'); grad.addColorStop(1, '#059669');
        ctx.strokeStyle = grad; ctx.lineWidth = 5 - Math.min(depth * 0.3, 3);
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x, y + vG / 2, rx, ry); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace';
        ctx.fillText('1', x + xOffset / 2 + 15, y + vG / 2);
        drawHNode(node.right, rx, ry, xOffset * 0.58, depth + 1);
    }
    ctx.save();
    ctx.shadowBlur = 25; ctx.shadowColor = node.isLeaf() ? 'rgba(52, 211, 153, 0.6)' : 'rgba(96, 165, 250, 0.5)';
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
    const nG = ctx.createRadialGradient(x - 4, y - 4, 0, x, y, rad);
    if (node.isLeaf()) { nG.addColorStop(0, '#34d399'); nG.addColorStop(1, '#065f46'); }
    else { nG.addColorStop(0, '#60a5fa'); nG.addColorStop(1, '#1e3a8a'); }
    ctx.fillStyle = nG; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${17 - Math.min(depth, 6)}px "JetBrains Mono"`;
    ctx.fillText(node.freq, x, y);
    if (node.isLeaf()) {
        ctx.fillStyle = '#34d399'; ctx.font = '900 12px sans-serif';
        const lbl = node.symbol === ' ' ? 'SPC' : node.symbol.toString();
        ctx.fillText(lbl.toUpperCase(), x, y - rad - 13);
    }
}

function autoPosition() {
    const unique = state.unique;
    if (unique < 5) state.zoom = 1.4;
    else if (unique < 12) state.zoom = 1.1;
    else if (unique < 25) state.zoom = 0.8;
    else state.zoom = 0.5;
    state.panX = 0; state.panY = unique > 12 ? -100 : 0;
}

function resizeNexus() {
    const dpr = window.devicePixelRatio || 1;
    const parent = treeCanvas.parentElement;
    treeCanvas.width = parent.offsetWidth * dpr;
    treeCanvas.height = parent.offsetHeight * dpr;
    state.treeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawNexus();
}

treeCanvas.addEventListener('mousedown', (e) => { state.isDragging = true; state.lastMouseX = e.clientX; state.lastMouseY = e.clientY; treeCanvas.style.cursor = 'grabbing'; });
window.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    state.panX += e.clientX - state.lastMouseX;
    state.panY += e.clientY - state.lastMouseY;
    state.lastMouseX = e.clientX; state.lastMouseY = e.clientY;
    drawNexus();
});
window.addEventListener('mouseup', () => { state.isDragging = false; treeCanvas.style.cursor = 'grab'; });
treeCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.zoom = Math.max(0.1, Math.min(state.zoom - e.deltaY * 0.001, 5));
    drawNexus();
}, { passive: false });

function updateBitAnalytics() {
    if (!state.huffmanCodes || !bitAnalysisContainer) return;
    let tO = 0, tC = 0;
    let html = '';
    Array.from(state.freqMap.entries()).sort((a, b) => b[1] - a[1]).forEach(([s, f]) => {
        const c = state.huffmanCodes.get(s) || '0';
        tO += f * 8; tC += f * c.length;
        html += `<div class="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-xl border border-white/10"><span class="font-mono text-[10px] text-primary font-black">${escapeHTML(s === ' ' ? 'Space' : s.toString())}</span><span class="font-mono text-[10px] text-white font-bold">${c}</span><span class="text-[9px] text-accent font-black">-${f * 8 - f * c.length}b</span></div>`;
    });
    bitAnalysisContainer.innerHTML = html;
    if (originalBitsSpan) originalBitsSpan.innerText = tO;
    if (compressedBitsSpan) compressedBitsSpan.innerText = tC;
    if (savedBitsSpan) savedBitsSpan.innerText = tO - tC;
    if (compressionRatioSpan) compressionRatioSpan.innerText = tO ? (((tO - tC) / tO) * 100).toFixed(1) + '%' : '0%';
}

function encodeCipher() {
    const v = encodeInput.value.trim();
    if (!v || !state.huffmanCodes) return;
    let r = '';
    for (let c of v) r += (state.huffmanCodes.get(c) || '?') + ' ';
    if (binaryOut) { binaryOut.innerText = r; binaryOut.classList.remove('opacity-60', 'italic'); binaryOut.classList.add('text-primary'); }
}

processBtn.addEventListener('click', processText);
clearBtn.addEventListener('click', () => { inputEl.value = ''; state.freqMap.clear(); processText(); updateEmptyUI(); });
nextBtn.addEventListener('click', nextStep);
prevBtn.addEventListener('click', prevStep);
resetBtn.addEventListener('click', resetStep);
playBtn.addEventListener('click', () => {
    if (state.isPlaying) {
        clearInterval(state.playInterval); state.isPlaying = false;
        playBtn.innerHTML = 'AUTO RUN'; playBtn.classList.remove('btn-active');
    } else {
        state.isPlaying = true; playBtn.innerHTML = 'PAUSE ENGINE'; playBtn.classList.add('btn-active');
        state.playInterval = setInterval(() => {
            if (state.currentStepIdx < state.steps.length - 1) nextStep();
            else {
                clearInterval(state.playInterval); state.isPlaying = false;
                playBtn.innerHTML = 'AUTO RUN'; playBtn.classList.remove('btn-active');
                lucide.createIcons();
            }
        }, 900);
    }
});
encodeBtn.addEventListener('click', encodeCipher);
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(binaryOut.innerText);
    const oldIcon = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-accent"></i>'; lucide.createIcons();
    setTimeout(() => { copyBtn.innerHTML = oldIcon; lucide.createIcons(); }, 2000);
});

function escapeHTML(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
window.addEventListener('resize', resizeNexus);
window.onload = () => { resizeNexus(); lucide.createIcons(); treeCanvas.style.cursor = 'grab'; };
