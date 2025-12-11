const game = document.getElementById('game');
const character = document.getElementById('character');
const scoreDisplay = document.getElementById('score');
let score = 0;

let isGameOver = false;
let obstacleInterval;
let gameLoopInterval;
// Physics variables for vertical movement
// Positive yPos = upward distance from ground (bottom). vy positive = moving up.
let yPos = 0; // bottom offset in px
let vy = 0; // vertical velocity (px per frame)
// Flappy-style physics: single tap sets an immediate upward velocity (can tap repeatedly while airborne)
let gravity = -0.5; // gravity acceleration (negative pulls down)
let jumpVelocity = 8.5; // set vy = jumpVelocity on each flap
let runningLoop = null;
const startBtn = document.getElementById('startBtn');
const startOverlay = document.getElementById('startOverlay');
const muteBtn = document.getElementById('muteBtn');
const panelStartBtn = document.getElementById('panelStartBtn');
const panelMuteBtn = document.getElementById('panelMuteBtn');
const highScoreEl = document.getElementById('highScore');
const retryBtn = document.getElementById('retryBtn');
const menuBtn = document.getElementById('menuBtn');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoreEl = document.getElementById('finalScore');
const leaderboardOverlay = document.getElementById('leaderboardOverlay');
const leaderboardList = document.getElementById('leaderboardList');
const closeLeaderboard = document.getElementById('closeLeaderboard');
const shareBtn = document.getElementById('shareBtn');
const colorPicker = document.getElementById('colorPicker');
const swatches = document.querySelectorAll('.swatch');
const readoutMultiplier = document.getElementById('readoutMultiplier');
const readoutDifficulty = document.getElementById('readoutDifficulty');
const readoutScore = document.getElementById('readoutScore');

// Audio setup and mute state
let audioCtx = null;
let muted = localStorage.getItem('jc_muted') === '1';
function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function updateMuteUI(){ if(muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊'; if(panelMuteBtn) panelMuteBtn.textContent = muted ? '🔇' : '🔊'; }
updateMuteUI();
if(muteBtn){ muteBtn.addEventListener('click', ()=>{ muted = !muted; try{ localStorage.setItem('jc_muted', muted? '1':'0'); }catch(e){} updateMuteUI(); }); }
if(panelMuteBtn){ panelMuteBtn.addEventListener('click', ()=>{ muted = !muted; try{ localStorage.setItem('jc_muted', muted? '1':'0'); }catch(e){} updateMuteUI(); }); }

// Panel play wiring
if(panelStartBtn){ panelStartBtn.addEventListener('click', ()=>{ startGame(); }); }
// make the panel Play glow for attention
if(panelStartBtn){ panelStartBtn.classList.add('glow'); }

// High score handling
let highScore = parseInt(localStorage.getItem('jc_highscore') || '0', 10) || 0;
if(highScoreEl) highScoreEl.textContent = highScore;
let coinInterval = null;
let flyingInterval = null;
let baseTickSpeed = 3; // px per tick baseline (used by obstacles; 10ms tick -> 300px/s)
let speedMultiplier = 1;
let speedIncreaseInterval = null;
// Difficulty presets (affect base speed and per-point scaling)
const difficulties = {
    easy: { baseTick: 2.4, perPoint: 0.012, maxMult: 2.0 },
    normal: { baseTick: 3.0, perPoint: 0.03, maxMult: 3.0 },
    hard: { baseTick: 3.6, perPoint: 0.05, maxMult: 4.0 }
};
let currentDifficulty = 'normal';

function setDifficulty(level){
    if(!difficulties[level]) level = 'normal';
    currentDifficulty = level;
    baseTickSpeed = difficulties[level].baseTick;
    try{ localStorage.setItem('jc_difficulty', level); }catch(e){}
    // if select exists, reflect it
    const ds = document.getElementById('difficultySelect'); if(ds) ds.value = level;
    updateSpeedFromScore();
    if(readoutDifficulty) readoutDifficulty.textContent = level.toUpperCase();
}

function updateSpeedFromScore(){
    const cfg = difficulties[currentDifficulty] || difficulties.normal;
    speedMultiplier = Math.min(cfg.maxMult, 1 + score * cfg.perPoint);
    if(readoutMultiplier) readoutMultiplier.textContent = speedMultiplier.toFixed(2);
    updateProgressBar();
}

function playFlap(){ if(muted) return; try{ ensureAudio(); const now=audioCtx.currentTime; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='triangle'; o.frequency.setValueAtTime(700, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.06, now+0.008); g.gain.exponentialRampToValueAtTime(0.0001, now+0.22); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now+0.22);}catch(e){} }
function playCrash(){ if(muted) return; try{ ensureAudio(); const now=audioCtx.currentTime; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(160, now); g.gain.setValueAtTime(0.18, now); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.frequency.exponentialRampToValueAtTime(40, now+0.25); g.gain.exponentialRampToValueAtTime(0.0001, now+0.6); setTimeout(()=>{ try{ o.stop(); }catch(e){} },700);}catch(e){} }

// Particle-related SFX
function playSparkSfx(){ if(muted) return; try{ ensureAudio(); const now=audioCtx.currentTime; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='square'; o.frequency.setValueAtTime(1200, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.08, now+0.001); g.gain.exponentialRampToValueAtTime(0.0001, now+0.09); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now+0.1);}catch(e){} }
function playWhooshSfx(){ if(muted) return; try{ ensureAudio(); const now=audioCtx.currentTime; const bufferSize = audioCtx.sampleRate * 0.2; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i=0;i<bufferSize;i++){ data[i] = (Math.random()*2-1) * (1 - i/bufferSize) * 0.35; } const src = audioCtx.createBufferSource(); src.buffer = buffer; const filt = audioCtx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.setValueAtTime(1200, now); filt.frequency.exponentialRampToValueAtTime(400, now+0.18); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.06, now+0.01); g.gain.exponentialRampToValueAtTime(0.0001, now+0.22); src.connect(filt); filt.connect(g); g.connect(audioCtx.destination); src.start(now); src.stop(now+0.22);}catch(e){} }

function playParticleBurstSfx(){ // trigger layered SFX for particles
    playSparkSfx();
    setTimeout(()=> playSparkSfx(), 40);
    setTimeout(()=> playWhooshSfx(), 30);
}

// -- Player color helpers --
function clamp(v,min,max){ return Math.min(max, Math.max(min, v)); }
function hexToRgb(hex){
    const h = hex.replace('#','');
    const bigint = parseInt(h,16);
    if(h.length===3){
        const r = parseInt(h[0]+h[0],16);
        const g = parseInt(h[1]+h[1],16);
        const b = parseInt(h[2]+h[2],16);
        return [r,g,b];
    }
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r,g,b];
}
function shadeHex(hex, percent){
    const [r,g,b] = hexToRgb(hex);
    const p = percent/100;
    const nr = Math.round(clamp(r + (p<0? r*p : (255-r)*p),0,255));
    const ng = Math.round(clamp(g + (p<0? g*p : (255-g)*p),0,255));
    const nb = Math.round(clamp(b + (p<0? b*p : (255-b)*p),0,255));
    return `rgb(${nr}, ${ng}, ${nb})`;
}

function applyPlayerColor(hex){
    if(!hex) return;
    // create a two-stop gradient using hex and a darker shade
    const darker = shadeHex(hex, -28);
    const mid = shadeHex(hex, -8);
    character.style.background = `linear-gradient(180deg, ${hex} 0%, ${mid} 55%, ${darker} 100%)`;
    // store
    try{ localStorage.setItem('jc_color', hex); }catch(e){}
}

// restore saved color on load
try{
    const saved = localStorage.getItem('jc_color');
    if(saved) {
        applyPlayerColor(saved);
        if(colorPicker) colorPicker.value = saved;
    }
}catch(e){}

// color picker events
if(colorPicker){ colorPicker.addEventListener('input', (e)=>{ applyPlayerColor(e.target.value); updateSwatchSelection(e.target.value); }); }
if(swatches && swatches.length){ swatches.forEach(s=> s.addEventListener('click', ()=>{ const c = s.getAttribute('data-color'); if(c){ applyPlayerColor(c); if(colorPicker) colorPicker.value = c; updateSwatchSelection(c); } })); }

function updateSwatchSelection(hex){
    if(swatches){ swatches.forEach(s=>{ if(s.getAttribute('data-color')===hex) s.classList.add('selected'); else s.classList.remove('selected'); }); }
}

function updateProgressBar(){
    const cfg = difficulties[currentDifficulty] || difficulties.normal;
    const pct = (speedMultiplier - 1) / (cfg.maxMult - 1) * 100;
    const pb = document.getElementById('progressBar');
    if(pb) pb.style.width = Math.min(100, pct) + '%';
}

// coin SFX
function playCoinSfx(){ if(muted) return; try{ ensureAudio(); const now=audioCtx.currentTime; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='triangle'; o.frequency.setValueAtTime(1200, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.09, now+0.008); g.gain.exponentialRampToValueAtTime(0.0001, now+0.26); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now+0.18);}catch(e){} }

// --- Coins and extra obstacles ---
function createCoin(){
    if (isGameOver) return;
    const coin = document.createElement('div');
    coin.className = 'coin';
    // spawn somewhere between ground and max height, but reachable
    const minY = 40;
    const maxY = 220;
    const cy = Math.floor(Math.random() * (maxY - minY)) + minY;
    coin.style.bottom = cy + 'px';
    coin.style.right = '-24px';
    game.appendChild(coin);
    let pos = 600;
    const speed = getTickSpeed() * (0.85 + Math.random()*0.5); // use current game speed
    const move = setInterval(()=>{
        if(isGameOver){ clearInterval(move); try{ coin.remove(); }catch(e){}; return; }
        pos -= speed;
        coin.style.right = `${600 - pos}px`;
        // check collect
        const cRect = coin.getBoundingClientRect();
        const gRect = game.getBoundingClientRect();
        const charRect = character.getBoundingClientRect();
        if(!(charRect.right < cRect.left || charRect.left > cRect.right || charRect.bottom < cRect.top || charRect.top > cRect.bottom)){
            // collected
            clearInterval(move);
            try{ coin.classList.add('coin-collected'); }catch(e){}
            try{ playCoinSfx(); }catch(e){}
            // award bonus points
            score += 5;
            scoreDisplay.textContent = `Score: ${score}`;
            if (score > highScore) { highScore = score; try{ localStorage.setItem('jc_highscore', String(highScore)); }catch(e){} if (highScoreEl) highScoreEl.textContent = highScore; }
            // floating +5 points animation
            try{
                const fp = document.createElement('div');
                fp.className = 'floatPoints';
                fp.textContent = '+5';
                // position near coin
                const coinRect = coin.getBoundingClientRect();
                const parentRect = game.getBoundingClientRect();
                fp.style.left = (coinRect.left - parentRect.left + coinRect.width/2) + 'px';
                fp.style.top = (coinRect.top - parentRect.top) + 'px';
                game.appendChild(fp);
                setTimeout(()=>{ try{ fp.remove(); }catch(e){} }, 800);
            }catch(e){}
            // update speed based on score
            updateSpeedFromScore();
            if(readoutScore) readoutScore.textContent = score;
            setTimeout(()=>{ try{ coin.remove(); }catch(e){} }, 240);
            return;
        }
        if(pos < -40){ clearInterval(move); try{ coin.remove(); }catch(e){} }
    }, 10);
}

function createFlyingObstacle(){
    if (isGameOver) return;
    const f = document.createElement('div');
    f.className = 'flying-obstacle';
    // random vertical between 60 and 200
    const y = Math.floor(60 + Math.random()*140);
    f.style.top = (y - 24) + 'px';
    f.style.right = '-60px';
    game.appendChild(f);
    let pos = 600;
    const speed = getTickSpeed() * (1.3 + Math.random()*0.6); // flying obstacles are faster
    const move = setInterval(()=>{
        if(isGameOver){ clearInterval(move); try{ f.remove(); }catch(e){}; return; }
        pos -= speed;
        f.style.right = `${600 - pos}px`;
        // collision with character
        const rectF = f.getBoundingClientRect();
        const rectC = character.getBoundingClientRect();
        const gRect = game.getBoundingClientRect();
        if(!(rectC.right < rectF.left || rectC.left > rectF.right || rectC.bottom < rectF.top || rectC.top > rectF.bottom)){
            clearInterval(move);
            try{ f.remove(); }catch(e){}
            endGame();
            return;
        }
        if(pos < -80){ clearInterval(move); try{ f.remove(); }catch(e){} }
    }, 10);
}

function getTickSpeed(){
    return baseTickSpeed * speedMultiplier;
}

// --- Physics and Movement ---

function jump() {
    if (isGameOver) return;
    if (startOverlay && startOverlay.style.display !== 'none') return; // don't jump before starting
    // Flappy-style flap: set upward velocity immediately
    vy = jumpVelocity;
    playFlap();
}

// Attach jump function to the spacebar press
document.addEventListener('keydown', function(event) {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault();
        jump();
    }
});

// Allow clicking/tapping the game area to jump (desktop-focused but works cross-browser)
if (game) {
    game.addEventListener('pointerdown', function(e){
        // ignore clicks on UI buttons
        const target = e.target;
        if (target && (target.tagName === 'BUTTON' || target.closest('.overlay'))) return;
        e.preventDefault();
        jump();
    }, {passive:false});
}

// --- Obstacle Generation ---

function createObstacle() {
    if (isGameOver) return;

    // Game variables
    const gameHeight = 300;
    const minHeight = 50;
    const gapHeight = 100; // The size of the space the cube must fit through

    // 1. Calculate random height for the bottom bar
    // Random height between minHeight (50px) and (gameHeight - minHeight - gapHeight)
    const bottomHeight = Math.floor(Math.random() * (gameHeight - minHeight - gapHeight)) + minHeight;
    const topHeight = gameHeight - bottomHeight - gapHeight;

    // 2. Create the HTML elements (top and bottom bars)
    const obstacleDiv = document.createElement('div');
    const bottomBar = document.createElement('div');
    const topBar = document.createElement('div');

    // 3. Apply classes and styles
    bottomBar.classList.add('obstacle', 'obstacle-bottom');
    topBar.classList.add('obstacle', 'obstacle-top');

    // Use CSS custom properties to set height dynamically
    bottomBar.style.setProperty('--bottom-height', `${bottomHeight}px`);
    topBar.style.setProperty('--top-height', `${topHeight}px`);

    // 4. Append to the game container
    obstacleDiv.appendChild(bottomBar);
    obstacleDiv.appendChild(topBar);
    game.appendChild(obstacleDiv);

    // 5. Start the obstacle's horizontal movement
    // The obstacle moves 3px every 10ms (300px/sec)
    let obstaclePosition = 600; // Start at the right edge
    
    // Interval for the single obstacle's movement and collision check
    let movementInterval = setInterval(() => {
        if (isGameOver) {
            clearInterval(movementInterval);
            return;
        }

        obstaclePosition -= 3;
        bottomBar.style.right = `${600 - obstaclePosition}px`;
        topBar.style.right = `${600 - obstaclePosition}px`;

        // 6. Collision Detection
        if (checkCollision(bottomBar, topBar)) {
            clearInterval(movementInterval);
            endGame();
        }

        // 7. Remove when off-screen and update score
        if (obstaclePosition < -40) {
            clearInterval(movementInterval);
            game.removeChild(obstacleDiv);
                    if (!isGameOver) {
                            score++;
                            scoreDisplay.textContent = `Score: ${score}`;
                            if (score > highScore) {
                                highScore = score;
                                try{ localStorage.setItem('jc_highscore', String(highScore)); }catch(e){}
                                if (highScoreEl) highScoreEl.textContent = highScore;
                            }
                            // update speed based on score
                            updateSpeedFromScore();
                            if(readoutScore) readoutScore.textContent = score;
            }
        }
    }, 10);
}

// Start generating obstacles every 2 seconds
function startObstacleGeneration() {
    obstacleInterval = setInterval(createObstacle, 2000);
    coinInterval = setInterval(()=>{ if(Math.random() < 0.6) createCoin(); }, 2200);
    flyingInterval = setInterval(()=>{ if(Math.random() < 0.55) createFlyingObstacle(); }, 3500);
    // reset speed multiplier based on current score/difficulty
    speedMultiplier = 1;
    updateSpeedFromScore();
}

// Game loop to update physics (character) and ensure smooth motion
function frameUpdate() {
    if (isGameOver) return;
    // apply gravity (gravity is negative)
    vy += gravity;
    // update position (vy positive moves up)
    yPos += vy;
    // landed detection
    if (yPos <= 0) {
        yPos = 0;
        vy = 0;
    }
    // clamp a maximum height so the character doesn't go too high
    const maxY = 260; // px
    if (yPos > maxY) {
        yPos = maxY;
        vy = Math.min(vy, 2);
    }
    character.style.bottom = yPos + 'px';
    // squash / stretch based on vertical velocity for lively feel
    const scaleY = Math.max(0.78, Math.min(1.12, 1 + vy * 0.03));
    const scaleX = Math.max(0.9, Math.min(1.18, 1 + (1 - scaleY) * 0.35));
    character.style.transform = `scale(${scaleX}, ${scaleY})`;

    runningLoop = requestAnimationFrame(frameUpdate);
}


// --- Collision Logic ---

function checkCollision(bottomBar, topBar) {
    // Get the character's current position and dimensions
    const charRect = character.getBoundingClientRect();
    const gameRect = game.getBoundingClientRect();

    // Convert character's position relative to the game container
    const charLeft = charRect.left - gameRect.left;
    const charRight = charLeft + charRect.width;
    const charTop = charRect.top - gameRect.top;
    const charBottom = charTop + charRect.height;
    
    // Convert obstacle's position relative to the game container
    const obsLeft = bottomBar.offsetLeft; // Works because obstacle is a child of game
    const obsRight = obsLeft + bottomBar.offsetWidth;

    // Check for horizontal overlap with the obstacle
    const horizontalOverlap = charRight > obsLeft && charLeft < obsRight;

    if (horizontalOverlap) {
        // Get obstacle heights
        const bottomHeight = bottomBar.offsetHeight;
        const topHeight = topBar.offsetHeight;

        // Check for vertical collision
        const hitBottom = charBottom > (game.offsetHeight - bottomHeight);
        const hitTop = charTop < topHeight;

        if (hitBottom || hitTop) {
            return true; // Collision detected
        }
    }
    return false;
}

// --- Game Control ---

function endGame() {
    isGameOver = true;
    clearInterval(obstacleInterval);
    clearInterval(coinInterval);
    clearInterval(flyingInterval);
    if (speedIncreaseInterval) clearInterval(speedIncreaseInterval);
    if (runningLoop) cancelAnimationFrame(runningLoop);
    
    // Stop all moving obstacles by finding and stopping their intervals
    // (In a simple version, just setting isGameOver=true and returning in the loop is enough)

    // Visual feedback
    character.style.backgroundColor = 'red';
    playCrash();
    // big squash on crash
    character.style.transform = 'scale(1.2,0.6)';
    
    // Display Game Over message
    const gameOverMessage = document.createElement('div');
    gameOverMessage.classList.add('game-over-text');
    gameOverMessage.textContent = 'GAME OVER';
    game.appendChild(gameOverMessage);
    // camera shake and particles for impact
    try{
        if(document.querySelector('.scene')){
            const sc = document.querySelector('.scene');
            sc.classList.remove('shake');
            // force reflow
            void sc.offsetWidth;
            sc.classList.add('shake');
            setTimeout(()=> sc.classList.remove('shake'), 520);
        }
        // create particles at character location
        const rect = character.getBoundingClientRect();
        const parentRect = game.getBoundingClientRect();
        const cx = rect.left - parentRect.left + rect.width/2;
        const cy = rect.top - parentRect.top + rect.height/2;
        // play layered particle SFX
        playParticleBurstSfx();
        for(let i=0;i<20;i++){
            const typeRand = Math.random();
            const p = document.createElement('div');
            p.className = 'particle';
            let angle = Math.random()*Math.PI*2;
            let dist = 20 + Math.random()*110;
            let duration = 700 + Math.random()*400;
            if (typeRand < 0.45){
                p.classList.add('spark');
                const hue = 40 + Math.round(Math.random()*40);
                p.style.background = `linear-gradient(45deg, hsl(${hue} 100% 60%), hsl(${hue+30} 100% 45%))`;
                dist = 40 + Math.random()*80; duration = 400 + Math.random()*240;
            } else if (typeRand < 0.8){
                p.classList.add('ember');
                const hue = 300 + Math.round(Math.random()*40);
                p.style.background = `linear-gradient(45deg, hsl(${hue} 100% 65%), hsl(${hue-30} 80% 45%))`;
                dist = 20 + Math.random()*60; duration = 600 + Math.random()*400;
            } else {
                p.classList.add('smoke');
                p.style.background = `rgba(200,220,255,${0.06 + Math.random()*0.12})`;
                dist = 10 + Math.random()*60; duration = 900 + Math.random()*600;
            }
            p.style.left = cx + 'px'; p.style.top = cy + 'px';
            game.appendChild(p);
            (function(el, ang, d, dur){
                const dx = Math.cos(ang)*d;
                const dy = Math.sin(ang)*d - 6;
                requestAnimationFrame(()=>{
                    el.style.transition = `transform ${dur}ms cubic-bezier(.2,.9,.2,1), opacity ${Math.max(400,dur-200)}ms linear`;
                    el.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
                    el.style.opacity = '0';
                });
                setTimeout(()=> el.remove(), dur + 80);
            })(p, angle, dist, duration);
        }
    }catch(e){}
    
    // Show a nice in-overlay Game Over card with Retry/menu
    setTimeout(() => {
        // set final score text
        if (finalScoreEl) finalScoreEl.textContent = score;
        // show overlay
        if (gameOverOverlay) {
            gameOverOverlay.style.display = 'flex';
        } else if (startOverlay) {
            startOverlay.style.display = 'flex';
        }
            // add final score to leaderboard storage
            try{
                const raw = localStorage.getItem('jc_scores');
                const arr = raw ? JSON.parse(raw) : [];
                arr.push(score);
                arr.sort((a,b)=>b-a);
                const trimmed = arr.slice(0,10);
                localStorage.setItem('jc_scores', JSON.stringify(trimmed));
                if (leaderboardList) updateLeaderboardUI();
            }catch(e){}
        // clean up existing obstacles (already stopped movement by isGameOver)
        document.querySelectorAll('.obstacle').forEach(n=>n.remove());
        document.querySelectorAll('.flying-obstacle').forEach(n=>n.remove());
        document.querySelectorAll('.coin').forEach(n=>n.remove());
        character.style.backgroundColor = '#5cb85c';
    }, 500);
}

function startGame(){
    // reset state
    isGameOver = false;
    score = 0;
    scoreDisplay.textContent = `Score: ${score}`;
    if(readoutScore) readoutScore.textContent = score;
    // remove game over text if present
    document.querySelectorAll('.game-over-text').forEach(n=>n.remove());
    // remove old obstacles
    document.querySelectorAll('.obstacle').forEach(n=>n.remove());
    // reset character appearance
    character.style.backgroundColor = '';
    // reset physics
    yPos = 0; vy = 0; character.style.bottom = '0px';
    // hide overlay
    if(startOverlay) startOverlay.style.display = 'none';
    if(gameOverOverlay) gameOverOverlay.style.display = 'none';
    // start generating obstacles
    clearInterval(obstacleInterval);
    startObstacleGeneration();
    // start the frame loop
    if (runningLoop) cancelAnimationFrame(runningLoop);
    runningLoop = requestAnimationFrame(frameUpdate);
}

if(startBtn){
    startBtn.addEventListener('click', function(){
        startGame();
    });
}

// Difficulty select wiring & load saved difficulty
const difficultySelect = document.getElementById('difficultySelect');
try{
    const savedDiff = localStorage.getItem('jc_difficulty') || 'normal';
    setDifficulty(savedDiff);
}catch(e){ setDifficulty('normal'); }
if(difficultySelect){ difficultySelect.addEventListener('change', (e)=>{ setDifficulty(e.target.value); }); }

// Panel start and retry/menu wiring
if(retryBtn){ retryBtn.addEventListener('click', ()=>{ if(gameOverOverlay) gameOverOverlay.style.display='none'; startGame(); }); }
if(menuBtn){ menuBtn.addEventListener('click', ()=>{ if(gameOverOverlay) gameOverOverlay.style.display='none'; if(leaderboardOverlay) { updateLeaderboardUI(); leaderboardOverlay.style.display='flex'; } else if(startOverlay) startOverlay.style.display='flex'; }); }

function updateLeaderboardUI(){
    if(!leaderboardList) return;
    const raw = localStorage.getItem('jc_scores');
    const arr = raw ? JSON.parse(raw) : [];
    leaderboardList.innerHTML = '';
    if(arr.length===0){ leaderboardList.innerHTML = '<li>No scores yet</li>'; return; }
    arr.forEach((s, i)=>{
        const li = document.createElement('li');
        li.textContent = `${i+1}. ${s}`;
        leaderboardList.appendChild(li);
    });
}

if(closeLeaderboard){ closeLeaderboard.addEventListener('click', ()=>{ if(leaderboardOverlay) leaderboardOverlay.style.display='none'; }); }
if(shareBtn){ shareBtn.addEventListener('click', ()=>{
    const raw = localStorage.getItem('jc_scores');
    const arr = raw ? JSON.parse(raw) : [];
    const top = arr && arr.length? arr[0] : 0;
    const text = `Jumping Cube — Top score: ${top}`;
    if(navigator.clipboard){ navigator.clipboard.writeText(text).then(()=>{ alert('Top score copied to clipboard'); }).catch(()=>{ alert(text); }); } else { alert(text); }
}); }