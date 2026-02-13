
const state = {
    text: '',
    mode: 'char',
    freqMap: new Map(),
    totalChars: 0, totalWords: 0, unique: 0,
    
    // huffman tree
    forest: [],
    nodes: [],
    steps: [],           // array of forest snapshots
    currentStepIdx: 0,
    rootNode: null,
    huffmanCodes: null,
    
    // animation
    playInterval: null,
    isPlaying: false,
    
    // canvases
    treeCtx: null,
    barCtx: null,
};

// ---------- HUFFMAN NODE ----------
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

// ---------- DOM ELEMENTS ----------
const inputEl = document.getElementById('inputText');
const modeChar = document.getElementById('modeChar');
const modeWord = document.getElementById('modeWord');
const processBtn = document.getElementById('processBtn');
const clearBtn = document.getElementById('clearBtn');
const freqTableEl = document.getElementById('freqTableContainer');
const uniqueEl = document.getElementById('uniqueCount');
const counterEl = document.getElementById('charWordCounter');
const barCanvas = document.getElementById('freqBarCanvas');
const treeCanvas = document.getElementById('treeCanvas');
state.barCtx = barCanvas.getContext('2d');
state.treeCtx = treeCanvas.getContext('2d');

// step controls
const prevBtn = document.getElementById('prevStepBtn');
const nextBtn = document.getElementById('nextStepBtn');
const resetBtn = document.getElementById('resetStepBtn');
const playBtn = document.getElementById('playPauseBtn');
const stepInd = document.getElementById('stepIndicator');
const treeMsg = document.getElementById('treeStateMsg');
const mergeBadge = document.getElementById('mergeCountBadge');

// bit & compression elements
const originalBitsSpan = document.getElementById('originalBits');
const compressedBitsSpan = document.getElementById('compressedBits');
const savedBitsSpan = document.getElementById('savedBits');
const compressionRatioSpan = document.getElementById('compressionRatio');
const bitAnalysisContainer = document.getElementById('bitAnalysisContainer');
const detailedBreakdown = document.getElementById('detailedBitBreakdown');

// encoder
const encodeInput = document.getElementById('encodeInput');
const encodeBtn = document.getElementById('encodeBtn');
const copyBtn = document.getElementById('copyBtn');
const binaryOut = document.getElementById('binaryOutput');

// ---------- MODE TOGGLE ----------
modeChar.addEventListener('click', () => {
    modeChar.classList.add('active');
    modeWord.classList.remove('active');
    state.mode = 'char';
});
modeWord.addEventListener('click', () => {
    modeWord.classList.add('active');
    modeChar.classList.remove('active');
    state.mode = 'word';
});

// ---------- PROCESS TEXT (CORE) ----------
function processText() {
    const text = inputEl.value.trim();
    if (!text) return;
    state.text = text;
    
    // count
    state.totalChars = text.length;
    state.totalWords = text.split(/\s+/).filter(w => w).length;
    counterEl.innerText = `chars: ${state.totalChars} | words: ${state.totalWords}`;
    
    // freq map
    state.freqMap.clear();
    if (state.mode === 'char') {
    for (let ch of text) if (ch !== ' ' && ch !== '\n') 
        state.freqMap.set(ch, (state.freqMap.get(ch) || 0) + 1);
    } else {
    const words = text.split(/\s+/).filter(w => w);
    for (let w of words) state.freqMap.set(w, (state.freqMap.get(w) || 0) + 1);
    }
    
    state.unique = state.freqMap.size;
    uniqueEl.innerText = `unique: ${state.unique}`;
    updateFreqTable();
    drawBarChart();
    buildHuffmanFromFreq();
    updateBitAnalysis();
    updateCompressionStats();
}

function updateFreqTable() {
    const entries = Array.from(state.freqMap.entries()).sort((a,b) => b[1] - a[1]);
    let html = '';
    entries.forEach(([sym, freq]) => {
    html += `<div class="freq-holo-row" onmouseenter="highlightSymbol('${escapeHTML(sym.toString())}')" onmouseleave="unhighlightSymbol()">
                <span class="symbol-glow">${escapeHTML(sym.toString())}</span>
                <span class="freq-pulse">${freq}</span>
                </div>`;
    });
    freqTableEl.innerHTML = html || '<div style="padding: 1.5rem;">🌀 no symbols</div>';
}

window.highlightSymbol = function(sym) {
    if (state.huffmanCodes) {
    const code = state.huffmanCodes.get(sym) || '❌';
    const freq = state.freqMap.get(sym) || 0;
    const origBits = freq * 8;
    const compBits = code !== '❌' ? freq * code.length : 0;
    const saved = origBits - compBits;
    detailedBreakdown.innerHTML = `🔍 SYMBOL: "${sym}" | FREQ: ${freq} | HUFFMAN: ${code} | ORIG: ${origBits} bits | COMP: ${compBits} bits | SAVED: ${saved} bits (${((compBits/origBits)*100).toFixed(1)}%)`;
    }
};
window.unhighlightSymbol = function() {
    detailedBreakdown.innerHTML = `⚡ hover on any symbol row → see bit savings, code length & compression gain`;
};

function drawBarChart() {
    const ctx = state.barCtx;
    const w = barCanvas.width, h = barCanvas.height;
    ctx.clearRect(0,0,w,h);
    const entries = Array.from(state.freqMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,9);
    if (!entries.length) return;
    const maxFreq = Math.max(...entries.map(e=>e[1]),1);
    const barW = (w - 90) / entries.length;
    entries.forEach(([sym, freq], i) => {
    const bh = (freq/maxFreq) * (h-50);
    ctx.fillStyle = '#4b9eff';
    ctx.shadowColor = '#0099ff';
    ctx.shadowBlur = 12;
    ctx.fillRect(45 + i*barW, h-25-bh, barW-6, bh);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e6f0ff';
    ctx.font = 'bold 11px "JetBrains Mono"';
    ctx.fillText(sym.toString().slice(0,3), 45 + i*barW, h-32);
    ctx.fillStyle = '#b3dbff';
    ctx.fillText(freq, 45 + i*barW, h-38-bh);
    });
}

// ---------- BUILD HUFFMAN + STEPS ----------
function buildHuffmanFromFreq() {
    const leaves = [];
    for (let [sym, freq] of state.freqMap.entries()) 
    leaves.push(new HuffNode(sym, freq));
    leaves.sort((a,b) => a.freq - b.freq);
    state.forest = leaves.map(n => n);
    state.nodes = leaves.slice();
    state.steps = [leaves.map(n => n)];
    
    let forest = leaves.map(n => n);
    while (forest.length > 1) {
    forest.sort((a,b) => a.freq - b.freq);
    const left = forest.shift();
    const right = forest.shift();
    const parent = new HuffNode(null, left.freq + right.freq, left, right);
    forest.push(parent);
    state.nodes.push(parent);
    state.steps.push(forest.map(n => n));
    }
    state.rootNode = forest[0] || null;
    state.currentStepIdx = 0;
    generateHuffmanCodes();
    updateStepDisplay();
    drawTreeCanvas();
}

function generateHuffmanCodes() {
    state.huffmanCodes = new Map();
    if (!state.rootNode) return;
    function dfs(node, code) {
    if (!node) return;
    if (node.isLeaf() && node.symbol !== null) {
        state.huffmanCodes.set(node.symbol, code || '0');
    }
    dfs(node.left, code + '0');
    dfs(node.right, code + '1');
    }
    dfs(state.rootNode, '');
    if (state.huffmanCodes.size === 1 && state.rootNode.isLeaf()) {
    state.huffmanCodes.set(state.rootNode.symbol, '0');
    }
}

function nextStep() { if (state.currentStepIdx < state.steps.length - 1) { state.currentStepIdx++; updateStepDisplay(); drawTreeCanvas(); } }
function prevStep() { if (state.currentStepIdx > 0) { state.currentStepIdx--; updateStepDisplay(); drawTreeCanvas(); } }
function resetStep() { state.currentStepIdx = 0; updateStepDisplay(); drawTreeCanvas(); }

function updateStepDisplay() {
    stepInd.innerText = `${state.currentStepIdx+1}/${state.steps.length}`;
    mergeBadge.innerText = `merges: ${state.currentStepIdx}`;
    if (state.currentStepIdx === 0) treeMsg.innerHTML = '<i class="fas fa-leaf"></i> initial leaves';
    else if (state.currentStepIdx === state.steps.length-1) treeMsg.innerHTML = '<i class="fas fa-check-double"></i> final root';
    else treeMsg.innerHTML = `<i class="fas fa-code-branch"></i> merge #${state.currentStepIdx}`;
}

// 🎨 VIBRANT TREE COLORS: EMERALD & CORAL + LARGE FREQUENCY NUMBERS
function drawTreeCanvas() {
    const ctx = state.treeCtx;
    const w = treeCanvas.width, h = treeCanvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#0e1a2a'; // deep rich background
    ctx.fillRect(0,0,w,h);
    
    if (!state.steps.length) return;
    const forest = state.steps[state.currentStepIdx];
    if (!forest) return;
    
    ctx.shadowBlur = 0;
    
    if (forest.length === 1) {
    drawTreeRecursive(forest[0], w/2, 70, 190);
    } else {
    const part = w / (forest.length + 1);
    forest.forEach((root, i) => drawTreeRecursive(root, (i+1)*part, 70, 150));
    }
}

function drawTreeRecursive(node, x, y, xOffset) {
    if (!node) return;
    const ctx = state.treeCtx;
    const rad = 30; // bigger nodes
    
    // ---- BOLD, VIBRANT CONNECTION LINES ----
    if (node.left) {
    const xL = x - xOffset/1.5;
    const yL = y + 75;
    ctx.beginPath();
    ctx.strokeStyle = '#ffaa88'; // warm coral for left
    ctx.lineWidth = 4.2;
    ctx.shadowColor = '#ff8844';
    ctx.shadowBlur = 14;
    ctx.moveTo(x, y + rad/2);
    ctx.lineTo(xL, yL - rad/2);
    ctx.stroke();
    drawTreeRecursive(node.left, xL, yL, xOffset * 0.7);
    }
    if (node.right) {
    const xR = x + xOffset/1.5;
    const yR = y + 75;
    ctx.beginPath();
    ctx.strokeStyle = '#88ddff'; // cool cyan for right
    ctx.lineWidth = 4.2;
    ctx.shadowColor = '#44aaff';
    ctx.shadowBlur = 14;
    ctx.moveTo(x, y + rad/2);
    ctx.lineTo(xR, yR - rad/2);
    ctx.stroke();
    drawTreeRecursive(node.right, xR, yR, xOffset * 0.7);
    }
    
    ctx.shadowBlur = 0;
    
    // ---- NODE FILL: VIBRANT EMERALD & SUNSET ----
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2*Math.PI);
    if (node.isLeaf()) {
    ctx.fillStyle = '#2ad4b6'; // brilliant emerald
    ctx.shadowColor = '#1affc0';
    ctx.shadowBlur = 24;
    } else {
    ctx.fillStyle = '#ff7b72'; // vibrant coral/salmon
    ctx.shadowColor = '#ff5555';
    ctx.shadowBlur = 24;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    
    // ---- SYMBOL TEXT: LARGE & BOLD ----
    ctx.fillStyle = 'white';
    ctx.font = 'bold 17px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let label = node.symbol !== null ? node.symbol.toString().slice(0,5) : '⚡';
    ctx.fillText(label, x, y - 20);
    
    // ---- FREQUENCY: EXTRA LARGE + NEON YELLOW (BIG SIZE) ----
    ctx.font = 'bold 19px "JetBrains Mono"'; // BIGGER FREQUENCY
    ctx.fillStyle = '#ffec9e'; // bright neon yellow
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 14;
    ctx.fillText(node.freq, x, y + 25);
    ctx.shadowBlur = 0;
}

// ---------- BIT ANALYSIS & COMPRESSION STATS ----------
function updateBitAnalysis() {
    if (!state.huffmanCodes || !state.freqMap) return;
    let totalOrig = 0, totalComp = 0;
    let analysisHtml = '';
    for (let [sym, freq] of state.freqMap.entries()) {
    const code = state.huffmanCodes.get(sym) || '?';
    const origBits = freq * 8;
    const compBits = code !== '?' ? freq * code.length : 0;
    totalOrig += origBits;
    totalComp += compBits;
    analysisHtml += `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #2a4c70;">
        <span>${escapeHTML(sym.toString())}</span>
        <span style="color:#aad0ff;">code: ${code}</span>
        <span>${origBits} → ${compBits} bits</span>
        <span style="color:${origBits-compBits > 0 ? '#88ff88' : '#ff8888'}">save: ${origBits-compBits}</span>
    </div>`;
    }
    bitAnalysisContainer.innerHTML = analysisHtml || '—';
    
    originalBitsSpan.innerText = totalOrig;
    compressedBitsSpan.innerText = totalComp;
    const saved = totalOrig - totalComp;
    savedBitsSpan.innerText = saved;
    const ratio = totalOrig ? ((totalComp/totalOrig)*100).toFixed(2) : 0;
    compressionRatioSpan.innerText = `${ratio}%`;
}

function updateCompressionStats() { updateBitAnalysis(); }

function encodeSymbol() {
    const val = encodeInput.value.trim();
    if (!val || !state.huffmanCodes) { binaryOut.innerText = '⚠️ no tree / empty'; return; }
    const code = state.huffmanCodes.get(val);
    if (code) {
    binaryOut.innerText = `🟢 HUFFMAN: ${code}`;
    detailedBreakdown.innerHTML = `✨ "${val}" → code: ${code} (${code.length} bits) · original: 8 bits · saved: ${8 - code.length} bits · compression: ${((code.length/8)*100).toFixed(1)}%`;
    } else {
    binaryOut.innerText = `❌ symbol '${val}' not in tree`;
    }
}

// ---------- EVENT LISTENERS ----------
processBtn.addEventListener('click', processText);
clearBtn.addEventListener('click', ()=>{
    inputEl.value = '';
    state.freqMap.clear();
    updateFreqTable();
    state.steps = [];
    drawTreeCanvas();
});
nextBtn.addEventListener('click', nextStep);
prevBtn.addEventListener('click', prevStep);
resetBtn.addEventListener('click', resetStep);
playBtn.addEventListener('click', ()=>{
    if (state.isPlaying) {
    clearInterval(state.playInterval);
    state.isPlaying = false;
    playBtn.innerHTML = '<i class="fas fa-play"></i> PLAY';
    } else {
    state.isPlaying = true;
    playBtn.innerHTML = '<i class="fas fa-pause"></i> PAUSE';
    state.playInterval = setInterval(() => {
        if (state.currentStepIdx < state.steps.length-1) nextStep();
        else {
        clearInterval(state.playInterval);
        state.isPlaying = false;
        playBtn.innerHTML = '<i class="fas fa-play"></i> PLAY';
        }
    }, 900);
    }
});
encodeBtn.addEventListener('click', encodeSymbol);
copyBtn.addEventListener('click', ()=>{
    navigator.clipboard.writeText(binaryOut.innerText);
    alert('📋 binary copied');
});

function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, function(c) {
    if(c==='&') return '&amp;'; if(c==='<') return '&lt;'; if(c==='>') return '&gt;'; if(c==='"') return '&quot;'; return c;
    });
}

// init + responsive canvas resize handling
window.onload = ()=>{
    treeCanvas.width = 800; treeCanvas.height = 380;
    barCanvas.width = 550; barCanvas.height = 160;
    processText();
    
    // Responsive: redraw on resize with debounce
    let resizeTimer;
    window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        drawTreeCanvas();
        drawBarChart();
    }, 100);
    });
};