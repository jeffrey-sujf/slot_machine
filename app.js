document.addEventListener('DOMContentLoaded', () => {

    // ═══════════════════════════════════════════════
    // STATE & PERSISTENCE
    // Supabase-ready: swap the db.* calls below with
    // real API calls when a backend is wired up.
    // ═══════════════════════════════════════════════
    const STORAGE_KEY = 'pocketpulse_v2';

    const defaultState = {
        wallet: { 'Neon Green': 0, 'Cyan': 0, 'Magenta': 0, 'Orange': 0, 'Purple': 0, 'Yellow': 0 },
        lifetimeTokens: 0,
        habits: [
            { id: uid(), title: 'Drink Water',        isCompleted: false, earnedToken: null },
            { id: uid(), title: 'Morning Stretch',    isCompleted: false, earnedToken: null },
            { id: uid(), title: 'Read 20 Pages',      isCompleted: false, earnedToken: null },
            { id: uid(), title: 'Code Practice',      isCompleted: false, earnedToken: null }
        ],
        rewards:    { T1: '15-min Break', T2: 'Gourmet Coffee', T3: 'Movie Night', Jackpot: 'Weekend Getaway' },
        goal: {
            targetTokens: 9,
            awards: ['Mini Treat', 'Mid Goal Reward', 'Grand Celebration'],
            claimed: [false, false, false]
        },
        pastHabits: [],
        lastVisit: null,
        spinHistory: [],
        tokenColors: [
            { name: 'Neon Green', var: '--token-1', icon: 'stars'        },
            { name: 'Cyan',       var: '--token-2', icon: 'diamond'      },
            { name: 'Magenta',    var: '--token-3', icon: 'favorite'     },
            { name: 'Orange',     var: '--token-4', icon: 'bolt'         },
            { name: 'Purple',     var: '--token-5', icon: 'brightness_7' },
            { name: 'Yellow',     var: '--token-6', icon: 'potted_plant' }
        ],
        baseWeights: { Miss: 9, T1: 40, T2: 30, T3: 20, Jackpot: 1 }
    };

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function loadState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return deepClone(defaultState);
            const s = JSON.parse(saved);
            // Ensure habits have ids (migration from old saves)
            s.habits = (s.habits || []).map(h => ({ earnedToken: null, isRepeated: false, ...h, id: h.id || uid() }));
            s.pastHabits = s.pastHabits || [];
            s.lastVisit = s.lastVisit || null;
            s.spinHistory = s.spinHistory || [];
            s.tokenColors = defaultState.tokenColors; // always use canonical token list
            s.baseWeights = defaultState.baseWeights;
            s.rewards = { ...defaultState.rewards, ...(s.rewards || {}) };
            s.goal = {
                targetTokens: (s.goal && Number.isInteger(s.goal.targetTokens) && s.goal.targetTokens > 0) ? s.goal.targetTokens : defaultState.goal.targetTokens,
                awards: [
                    (s.goal && s.goal.awards && s.goal.awards[0]) || defaultState.goal.awards[0],
                    (s.goal && s.goal.awards && s.goal.awards[1]) || defaultState.goal.awards[1],
                    (s.goal && s.goal.awards && s.goal.awards[2]) || defaultState.goal.awards[2]
                ],
                claimed: [
                    (s.goal && s.goal.claimed && s.goal.claimed[0]) || false,
                    (s.goal && s.goal.claimed && s.goal.claimed[1]) || false,
                    (s.goal && s.goal.claimed && s.goal.claimed[2]) || false
                ]
            };
            return s;
        } catch { return deepClone(defaultState); }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        // Supabase hook: db.upsertState(state)
    }

    function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

    function getTodayKey() {
        return new Date().toISOString().slice(0, 10);
    }

    function rolloverHabitsIfNeeded() {
        const today = getTodayKey();
        if (!state.lastVisit) {
            state.lastVisit = today;
            saveState();
            return;
        }
        if (state.lastVisit === today) return;

        const snapshot = state.habits.map(h => ({ ...h }));
        state.pastHabits.unshift({ date: state.lastVisit, habits: snapshot });
        if (state.pastHabits.length > 7) state.pastHabits.length = 7;

        state.habits = state.habits.filter(h => h.isRepeated).map(h => ({
            ...h,
            isCompleted: false,
            earnedToken: null
        }));
        state.lastVisit = today;
        saveState();
    }

    let state = loadState();
    rolloverHabitsIfNeeded();
    let isSpinning = false;
    let isLoaded   = false;
    let loadedLevel = null;
    let lastDeletedHabit = null;
    let undoDeleteTimer = null;

    function confirmAction(primaryMessage, secondaryMessage) {
        if (!window.confirm(primaryMessage)) return false;
        return window.confirm(secondaryMessage);
    }

    function undoLastDelete() {
        if (!lastDeletedHabit) return;
        const { habit, index } = lastDeletedHabit;
        state.habits.splice(Math.min(index, state.habits.length), 0, habit);
        lastDeletedHabit = null;
        if (undoDeleteTimer) {
            clearTimeout(undoDeleteTimer);
            undoDeleteTimer = null;
        }
        saveState();
        renderAll();
        showToast(`Restored habit: ${habit.title}`);
    }

    function bindHabitSwipeGesture(row, content, habit, editButton, deleteButton) {
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        let activePointerId = null;

        function resetSwipe() {
            content.style.transition = 'transform 0.18s ease-out';
            content.style.transform = '';
            row.dataset.swipeState = '';
            currentX = 0;
            isDragging = false;
            activePointerId = null;
        }

        function handleEditAction() {
            if (!confirmAction('Swipe right to edit this habit. Continue?', 'Open the editor for this habit?')) {
                resetSwipe();
                return;
            }
            openHabitModal(habit);
            resetSwipe();
        }

        function handleDeleteAction() {
            if (!confirmAction('Swipe left to delete this habit. Continue?', 'Confirm permanent deletion?')) {
                resetSwipe();
                return;
            }
            deleteHabit(habit.id);
        }

        function finishSwipe() {
            if (!isDragging) return;
            isDragging = false;
            if (Math.abs(currentX) > 100) {
                if (currentX > 0) handleEditAction();
                else handleDeleteAction();
            } else {
                resetSwipe();
            }
        }

        function startSwipe(clientX) {
            isDragging = true;
            startX = clientX;
            currentX = 0;
            content.style.transition = 'none';
            row.dataset.swipeState = '';
        }

        function moveSwipe(clientX) {
            if (!isDragging) return;
            const deltaX = clientX - startX;
            if (Math.abs(deltaX) < 8 && currentX === 0) return;
            currentX = Math.max(-140, Math.min(140, deltaX));
            content.style.transform = `translateX(${currentX}px)`;
            row.dataset.swipeState = currentX > 20 ? 'edit' : currentX < -20 ? 'delete' : '';
        }

        content.addEventListener('pointerdown', event => {
            if (!event.isPrimary || event.button !== 0) return;
            if (event.target.closest('button, input')) return;
            activePointerId = event.pointerId;
            startSwipe(event.clientX);
            content.setPointerCapture(activePointerId);
        });

        content.addEventListener('pointermove', event => {
            if (!isDragging || event.pointerId !== activePointerId) return;
            moveSwipe(event.clientX);
            event.preventDefault();
        });

        content.addEventListener('pointerup', event => {
            if (event.pointerId !== activePointerId) return;
            finishSwipe();
        });
        content.addEventListener('pointercancel', finishSwipe);
        content.addEventListener('pointerleave', finishSwipe);

        if (!window.PointerEvent) {
            content.addEventListener('touchstart', event => {
                if (event.target.closest('button, input')) return;
                const touch = event.changedTouches[0];
                if (!touch) return;
                startSwipe(touch.clientX);
            });
            content.addEventListener('touchmove', event => {
                if (!isDragging) return;
                const touch = event.changedTouches[0];
                if (!touch) return;
                moveSwipe(touch.clientX);
                event.preventDefault();
            }, { passive: false });
            content.addEventListener('touchend', finishSwipe);
            content.addEventListener('touchcancel', finishSwipe);
        }

        if (editButton) editButton.addEventListener('click', handleEditAction);
        if (deleteButton) deleteButton.addEventListener('click', handleDeleteAction);
        row.addEventListener('transitionend', () => {
            if (!row.dataset.swipeState) content.style.transform = '';
        });
    }

    // ═══════════════════════════════════════════════
    // DOM REFS
    // ═══════════════════════════════════════════════
    const habitList        = document.getElementById('habit-list');
    const remainingCount   = document.getElementById('remaining-count');
    const progressPercent  = document.getElementById('progress-percent');
    const habitChart       = document.getElementById('habit-chart');
    const btnResetDay      = document.getElementById('btn-reset-day');
    const btnAddHabit      = document.getElementById('btn-add-habit');
    const creditCountDisplay = document.getElementById('credit-count');
    const outcomeDisplay   = document.getElementById('outcome-display');
    const machineContainer = document.getElementById('machine-container');
    const spinHandle       = document.getElementById('spin-handle');
    const walletContainer  = document.getElementById('wallet-container');
    const totalBalanceDisplay = document.getElementById('total-balance');
    const statsLifetime    = document.getElementById('stats-lifetime');
    const weeklyText       = document.getElementById('weekly-progress-text');
    const monthlyText      = document.getElementById('monthly-progress-text');
    const monthlyFill      = document.getElementById('monthly-progress-fill');
    const reelCols         = [document.getElementById('reel-1'), document.getElementById('reel-2'), document.getElementById('reel-3')];
    const coinModal        = document.getElementById('coin-modal');
    const coinSlotTrigger  = document.getElementById('coin-slot-trigger');
    const btnModalCancel   = document.getElementById('btn-modal-cancel');
    const spinHistoryEl    = document.getElementById('spin-history-entries');
    const rewardSettingsEl = document.getElementById('reward-settings');
    const goalSettingsEl   = document.getElementById('goal-settings');
    const pastHabitsContainer = document.getElementById('past-habits-container');
    const pastHabitsCount  = document.getElementById('past-habits-count');
    const toastContainer   = document.getElementById('toast-container');

    // Wallet / physics modal refs (me.html)
    const walletModal         = document.getElementById('wallet-modal');
    const walletModalBalance  = document.getElementById('wallet-modal-balance');
    const walletModalClose    = document.getElementById('wallet-modal-close');
    const walletOpenTrigger   = document.getElementById('wallet-open-trigger');
    const btnOpenWallet       = document.getElementById('btn-open-wallet');
    const walletJiggleBtn     = document.getElementById('wallet-jiggle-btn');
    const walletPhysicsCanvas = document.getElementById('wallet-physics-canvas');

    // ═══════════════════════════════════════════════
    // SPA ROUTING
    // ═══════════════════════════════════════════════
    const spaViews = document.querySelectorAll('.spa-view');
    const navItems = document.querySelectorAll('.nav-item');

    function switchView(targetId) {
        spaViews.forEach(v => v.classList.toggle('active', v.id === targetId));
        navItems.forEach(i => i.classList.toggle('active', i.dataset.target === targetId));
        renderAll();
    }

    navItems.forEach(item => item.addEventListener('click', () => switchView(item.dataset.target)));

    // ═══════════════════════════════════════════════
    // SLOT MACHINE ENGINE
    // ═══════════════════════════════════════════════
    function generateIconHTML(token) {
        return `<div class="icon-box" style="color:var(${token.var})"><span class="material-symbols-outlined">${token.icon}</span></div>`;
    }

    function updateIconBox(box, token) {
        if (!box) return;
        box.style.color = `var(${token.var})`;
        box.querySelector('.material-symbols-outlined').textContent = token.icon;
    }

    function setInitialItems() {
        reelCols.forEach((col, i) => {
            if (!col) return;
            let html = '';
            for (let x = 0; x < 40 + (i * 6); x++) {
                html += generateIconHTML(state.tokenColors[Math.floor(Math.random() * 6)]);
            }
            col.innerHTML = html;
        });
    }

    function syncDestination(resultType) {
        let winningToken;
        if (resultType !== 'Miss') {
            winningToken = resultType === 'Jackpot'
                ? { var: '--token-4', icon: 'looks_one' }
                : state.tokenColors[Math.floor(Math.random() * 6)];
        }

        reelCols.forEach(col => {
            const icons = col.querySelectorAll('.icon-box');
            const mid = winningToken || state.tokenColors[Math.floor(Math.random() * 6)];
            const top = state.tokenColors[Math.floor(Math.random() * 6)];
            const bot = state.tokenColors[Math.floor(Math.random() * 6)];

            updateIconBox(icons[0], top);
            updateIconBox(icons[1], mid);
            updateIconBox(icons[2], bot);
            updateIconBox(icons[icons.length - 3], top);
            updateIconBox(icons[icons.length - 2], mid);
            updateIconBox(icons[icons.length - 1], bot);
        });
    }

    // Strict per-level probability table (each row sums to 100).
    // Lookup is exact — no global re-weighting, no eligibility juggling.
    const LEVEL_ODDS = {
        1: [ { type: 'T1',      pct: 40 },
             { type: 'Miss',    pct: 60 } ],
        2: [ { type: 'T1',      pct: 40 },
             { type: 'T2',      pct: 30 },
             { type: 'Miss',    pct: 30 } ],
        3: [ { type: 'T1',      pct: 40 },
             { type: 'T2',      pct: 30 },
             { type: 'T3',      pct: 20 },
             { type: 'Jackpot', pct:  1 },
             { type: 'Miss',    pct:  9 } ]
    };

    function rollOutcome(level) {
        const table = LEVEL_ODDS[level] || LEVEL_ODDS[1];
        let roll = Math.random() * 100;          // 0 ≤ roll < 100
        for (const row of table) {
            if (roll < row.pct) return row.type;
            roll -= row.pct;
        }
        return 'Miss'; // float-rounding safety net
    }

    async function handleSpin() {
        if (isSpinning || !isLoaded) return;
        isSpinning = true;
        const level = loadedLevel || 1;
        isLoaded = false;

        // Determine outcome via the strict per-level odds table
        const result = rollOutcome(level);

        syncDestination(result);
        machineContainer.classList.add('spinning');
        outcomeDisplay.textContent = 'PROBABILITY FLUX...';
        renderAll();

        await new Promise(r => setTimeout(r, 3100));

        machineContainer.classList.remove('spinning');

        if (result === 'Miss') {
            machineContainer.classList.add('shake-it');
            setTimeout(() => machineContainer.classList.remove('shake-it'), 500);
            outcomeDisplay.textContent = 'MISS — TRY AGAIN';
            showToast('Miss — try again');
        } else {
            // Enhanced win celebration with multiple effects
            createParticles(window.innerWidth / 2, window.innerHeight / 2, '--token-4', 40, true);
            triggerWinBurst(window.innerWidth / 2, window.innerHeight / 2, token);
            outcomeDisplay.textContent = `${result} WIN!`;
            showToast(`Result: ${state.rewards[result] || result}`);
            setTimeout(() => { outcomeDisplay.textContent = `REWARD: ${state.rewards[result]}`; }, 2500);
        }

        // Record in history (keep last 5)
        state.spinHistory.unshift(result);
        if (state.spinHistory.length > 5) state.spinHistory.length = 5;

        document.getElementById('coin-slot-label').textContent = 'INSERT CREDIT';
        isSpinning = false;
        saveState();
        renderAll();
    }

    // ═══════════════════════════════════════════════
    // HABIT RENDERING
    // ═══════════════════════════════════════════════
    function renderHabits() {
        if (!habitList) return;
        habitList.innerHTML = '';
        let completed = 0;

        state.habits.forEach(h => {
            if (h.isCompleted) completed++;
            const li = document.createElement('li');
            li.className = 'habit-row' + (h.isCompleted ? ' is-done' : '');
            li.dataset.id = h.id;

            li.innerHTML = `
                <div class="habit-swipe-bg">
                    <button class="swipe-action-btn swipe-edit-btn" type="button">Edit</button>
                    <button class="swipe-action-btn swipe-delete-btn" type="button">Delete</button>
                </div>
                <div class="habit-row-content">
                    <input class="pixel-checkbox" type="checkbox" ${h.isCompleted ? 'checked' : ''} aria-label="Complete ${h.title}">
                    <span class="habit-title ${h.isCompleted ? 'struck' : ''}">
                        ${escHtml(h.title)}
                        ${h.isRepeated ? '<span class="habit-repeat-chip">REPEAT</span>' : ''}
                    </span>
                    <div class="habit-actions">
                        <button class="habit-action-btn edit-btn" title="Edit" aria-label="Edit habit">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button class="habit-action-btn delete-btn" title="Delete" aria-label="Delete habit">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                </div>
            `;

            const checkbox = li.querySelector('input');
            checkbox.addEventListener('change', () => onHabitToggle(h, li, checkbox));

            const editButton = li.querySelector('.edit-btn');
            const deleteButton = li.querySelector('.delete-btn');
            const swipeEditButton = li.querySelector('.swipe-edit-btn');
            const swipeDeleteButton = li.querySelector('.swipe-delete-btn');
            const rowContent = li.querySelector('.habit-row-content');

            if (editButton) editButton.addEventListener('click', () => {
                if (confirmAction('Tap Edit to modify this habit. Continue?', 'Open the editor for this habit?')) {
                    openHabitModal(h);
                }
            });
            if (deleteButton) deleteButton.addEventListener('click', () => {
                if (confirmAction('Tap Delete to remove this habit. Continue?', 'Confirm permanent deletion?')) {
                    deleteHabit(h.id);
                }
            });

            bindHabitSwipeGesture(li, rowContent, h, swipeEditButton, swipeDeleteButton);

            habitList.appendChild(li);
        });

        const total = state.habits.length;
        remainingCount.textContent = `${total - completed} REMAINING`;
        progressPercent.textContent = total ? `${Math.round((completed / total) * 100)}%` : '0%';

        habitChart.innerHTML = state.habits.map(h => `
            <div class="w-full bg-stone-200 rounded-sm h-full flex items-end">
                <div class="w-full bg-tertiary-fixed ${h.isCompleted ? 'h-full animate-pulse shadow-[0_0_10px_#69ff88]' : 'h-[20%] opacity-20'} rounded-sm transition-all duration-700"></div>
            </div>
        `).join('');
    }

    // ═══════════════════════════════════════════════
    // HABIT ACTIONS
    // ═══════════════════════════════════════════════
    function pickNewHabitToken(excludeName) {
        const available = state.tokenColors.filter(token => token.name !== excludeName);
        if (!available.length) return state.tokenColors[0];
        return available[Math.floor(Math.random() * available.length)];
    }

    function onHabitToggle(h, li, checkbox) {
        const nowChecked = checkbox.checked;

        if (nowChecked && !h.isCompleted) {
            // Completing a habit → earn token
            const token = pickNewHabitToken(h.earnedToken);
            h.isCompleted  = true;
            h.earnedToken  = token.name;
            state.wallet[token.name]++;
            state.lifetimeTokens++;
            saveState();

            // Enhanced visual sequence: flash → coin rain → fly to wallet
            li.style.animation = 'habitFlash 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards';
            setTimeout(() => triggerCoinRain(token, 24), 200);
            setTimeout(() => flyTokenToWallet(li.getBoundingClientRect(), token), 400);
            showToast(`+1 ${token.name} token earned!`, token);

            // Defer render until all animations complete (1.2s total)
            setTimeout(() => renderAll(), 1200);

            // Supabase hook: db.completeHabit(h.id, token.name)

        } else if (!nowChecked && h.isCompleted) {
            // Unticking → revert token
            const tokenName = h.earnedToken;
            if (tokenName && state.wallet[tokenName] > 0) {
                state.wallet[tokenName]--;
                state.lifetimeTokens = Math.max(0, state.lifetimeTokens - 1);
            }
            h.isCompleted = false;
            h.earnedToken = null;
            saveState();
            renderAll();

            // Supabase hook: db.revertHabit(h.id)
        }
    }

    // ═══════════════════════════════════════════════
    // HABIT ADD / EDIT MODAL
    // One modal serves both flows:
    //   openHabitModal(null)  → add a brand-new habit
    //   openHabitModal(habit) → edit an existing habit's title + repeat flag
    // Replaces the old in-place row editor and the auto-row-then-edit add hack.
    // ═══════════════════════════════════════════════
    const habitModal       = document.getElementById('habit-modal');
    const habitModalTitle  = document.getElementById('habit-modal-title');
    const habitModalInput  = document.getElementById('habit-modal-input');
    const habitModalRepeat = document.getElementById('habit-modal-repeat');
    const habitModalSave   = document.getElementById('habit-modal-save');
    const habitModalCancel = document.getElementById('habit-modal-cancel');
    let habitModalEditingId = null;   // null = create mode

    function openHabitModal(habit) {
        if (!habitModal) return;
        habitModalEditingId = habit ? habit.id : null;
        habitModalTitle.textContent = habit ? 'Edit Habit' : 'New Habit';
        habitModalInput.value       = habit ? habit.title : '';
        habitModalRepeat.checked    = !!(habit && habit.isRepeated);
        habitModal.style.display    = 'flex';
        // focus & select after the modal is paint-flipped to flex
        requestAnimationFrame(() => {
            habitModalInput.focus();
            habitModalInput.select();
        });
    }

    function closeHabitModal() {
        if (!habitModal) return;
        habitModal.style.display = 'none';
        habitModalEditingId = null;
    }

    function commitHabitModal() {
        const title = habitModalInput.value.trim();
        if (!title) {
            habitModalInput.focus();
            return; // require a non-empty title
        }
        const isRepeated = habitModalRepeat.checked;

        if (habitModalEditingId) {
            const h = state.habits.find(x => x.id === habitModalEditingId);
            if (h) {
                h.title      = title;
                h.isRepeated = isRepeated;
            }
        } else {
            state.habits.push({
                id: uid(),
                title,
                isCompleted: false,
                earnedToken: null,
                isRepeated,
                completedDate: null,
                canceledDate: null
            });
        }
        saveState();
        closeHabitModal();
        renderAll();
    }

    if (habitModalSave)   habitModalSave.addEventListener('click', commitHabitModal);
    if (habitModalCancel) habitModalCancel.addEventListener('click', closeHabitModal);
    if (habitModal) habitModal.addEventListener('click', e => {
        if (e.target === habitModal) closeHabitModal(); // click backdrop
    });
    if (habitModalInput) habitModalInput.addEventListener('keydown', e => {
        if (e.key === 'Enter')  commitHabitModal();
        if (e.key === 'Escape') closeHabitModal();
    });

    function deleteHabit(id) {
        const index = state.habits.findIndex(h => h.id === id);
        if (index === -1) return;

        const [deleted] = state.habits.splice(index, 1);
        lastDeletedHabit = { habit: deleted, index };

        saveState();
        renderAll();
        showUndoToast(`Deleted habit: ${deleted.title}`, 'Undo', undoLastDelete);

        if (undoDeleteTimer) clearTimeout(undoDeleteTimer);
        undoDeleteTimer = setTimeout(() => {
            lastDeletedHabit = null;
            undoDeleteTimer = null;
        }, 6500);
    }

    function addHabit() {
        // Open the empty modal — no placeholder row is inserted into state
        // until the user actually saves a title.
        openHabitModal(null);
        // Supabase hook: db.addHabit(h) — fires inside commitHabitModal on save
    }

    // ═══════════════════════════════════════════════
    // WALLET & STATS RENDERING
    // ═══════════════════════════════════════════════
    function renderWallet() {
        if (!walletContainer) return;
        walletContainer.innerHTML = '';
        state.tokenColors.forEach(token => {
            const count = state.wallet[token.name] || 0;
            const div = document.createElement('div');
            div.className = 'bg-white rounded-2xl p-4 shadow-sm border border-surface-variant flex flex-col items-center gap-2';
            div.innerHTML = `
                <div class="w-12 h-12 rounded-full flex items-center justify-center border-2 border-stone-100 shadow-inner" style="background:var(${token.var});color:rgba(0,0,0,0.6)">
                    <span class="material-symbols-outlined text-xl">${token.icon}</span>
                </div>
                <div class="text-center">
                    <p class="text-[9px] font-bold uppercase opacity-40 leading-none mb-1">${token.name}</p>
                    <p class="text-lg font-bold text-stone-800 leading-none">${count}</p>
                </div>
            `;
            walletContainer.appendChild(div);
        });
    }

    function renderStats() {
        const total = Object.values(state.wallet).reduce((a, b) => a + b, 0);
        if (totalBalanceDisplay)  totalBalanceDisplay.textContent  = total.toLocaleString();
        if (creditCountDisplay)   creditCountDisplay.textContent   = total.toLocaleString();
        if (statsLifetime)        statsLifetime.textContent        = state.lifetimeTokens.toLocaleString();
        if (weeklyText)           weeklyText.textContent           = `${state.lifetimeTokens % 20}/20`;
        if (monthlyText)          monthlyText.textContent          = `${state.lifetimeTokens % 100}/100`;
        if (monthlyFill)          monthlyFill.style.width          = `${state.lifetimeTokens % 100}%`;

        if (spinHandle) {
            const active = !isSpinning && isLoaded;
            spinHandle.style.opacity       = active ? '1' : '0.4';
            spinHandle.style.pointerEvents = active ? 'auto' : 'none';
        }
    }

    function updateProgressBar() {
        const total = state.habits.length;
        const completed = state.habits.filter(h => h.isCompleted).length;
        if (remainingCount) remainingCount.textContent = `${total - completed} REMAINING`;
        if (progressPercent) progressPercent.textContent = total ? `${Math.round((completed / total) * 100)}%` : '0%';
    }

    function renderRewardSettings() {
        if (!rewardSettingsEl) return;
        const rewardLines = [
            { key: 'T1', label: 'Tier 1' },
            { key: 'T2', label: 'Tier 2' },
            { key: 'Jackpot', label: 'Jackpot' }
        ];

        rewardSettingsEl.innerHTML = rewardLines.map(item => `
            <div class="reward-row" data-key="${item.key}">
                <div class="reward-row-label">${item.label}</div>
                <div class="reward-row-value">${escHtml(state.rewards[item.key] || '')}</div>
                <button class="reward-edit-btn" data-key="${item.key}" title="Edit reward">
                    <span class="material-symbols-outlined">edit</span>
                </button>
            </div>
        `).join('');

        rewardSettingsEl.querySelectorAll('.reward-edit-btn').forEach(btn => btn.addEventListener('click', () => editRewardItem(btn.dataset.key)));
    }

    function editRewardItem(key) {
        if (!rewardSettingsEl) return;
        const labelMap = { T1: 'Tier 1', T2: 'Tier 2', Jackpot: 'Jackpot' };
        const row = rewardSettingsEl.querySelector(`[data-key="${key}"]`);
        if (!row) return;

        const current = state.rewards[key] || '';
        row.innerHTML = `
            <div class="reward-row-label">${labelMap[key]}</div>
            <div class="reward-edit-row">
                <input class="reward-edit-input" type="text" value="${escHtml(current)}" placeholder="Enter reward text">
                <div class="reward-edit-actions">
                    <button type="button" class="reward-edit-save">Save</button>
                    <button type="button" class="reward-edit-cancel">Cancel</button>
                </div>
            </div>
        `;

        row.querySelector('.reward-edit-save').addEventListener('click', () => {
            const input = row.querySelector('.reward-edit-input');
            const value = input.value.trim() || `New ${labelMap[key]} Reward`;
            state.rewards[key] = value;
            saveState();
            renderRewardSettings();
            renderAll();
        });
        row.querySelector('.reward-edit-cancel').addEventListener('click', renderRewardSettings);
    }

    function renderGoalSettings() {
        if (!goalSettingsEl) return;
        const target = Math.max(3, state.goal.targetTokens || 3);
        const progressPercent = Math.min(100, Math.floor((state.lifetimeTokens / target) * 100));
        const thresholds = [
            Math.ceil(target / 3),
            Math.ceil((target * 2) / 3),
            target
        ];

        goalSettingsEl.innerHTML = `
            <div class="goal-row goal-target-row">
                <label class="goal-label" for="goal-target-input">Target tokens</label>
                <div class="goal-target-input-wrap">
                    <input id="goal-target-input" class="goal-target-input" type="number" min="3" step="1" value="${target}">
                    <button id="goal-target-save" type="button" class="goal-target-save">Save</button>
                </div>
            </div>
            <div class="goal-row goal-progress-row">
                <div class="goal-progress-title">Progress</div>
                <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${progressPercent}%"></div></div>
                <div class="goal-progress-text">${state.lifetimeTokens}/${target} tokens</div>
            </div>
            ${thresholds.map((threshold, index) => `
                <div class="goal-row goal-award-row" data-index="${index}">
                    <div>
                        <div class="goal-award-label">${index + 1}/3 milestone</div>
                        <div class="goal-award-value">${escHtml(state.goal.awards[index] || `Award ${index + 1}`)}</div>
                    </div>
                    <div class="goal-award-actions">
                        <button class="goal-award-edit" data-index="${index}" title="Edit award"><span class="material-symbols-outlined">edit</span></button>
                        ${state.lifetimeTokens >= threshold ? (state.goal.claimed[index] ? '<span class="goal-award-status claimed">Claimed</span>' : `<button class="goal-claim-btn" data-index="${index}">Claim</button>`) : `<span class="goal-award-status">Locked until ${threshold}</span>`}
                    </div>
                </div>
            `).join('')}
        `;

        const saveBtn = document.getElementById('goal-target-save');
        const targetInput = document.getElementById('goal-target-input');
        if (saveBtn && targetInput) {
            saveBtn.addEventListener('click', () => {
                const nextTarget = Math.max(3, parseInt(targetInput.value, 10) || 3);
                state.goal.targetTokens = nextTarget;
                state.goal.claimed = [false, false, false];
                saveState();
                renderGoalSettings();
            });
        }

        goalSettingsEl.querySelectorAll('.goal-award-edit').forEach(btn => btn.addEventListener('click', () => editGoalAward(parseInt(btn.dataset.index, 10))));
        goalSettingsEl.querySelectorAll('.goal-claim-btn').forEach(btn => btn.addEventListener('click', () => claimGoalAward(parseInt(btn.dataset.index, 10))));
    }

    function editGoalAward(index) {
        if (!goalSettingsEl) return;
        const row = goalSettingsEl.querySelector(`.goal-award-row[data-index="${index}"]`);
        if (!row) return;
        const current = state.goal.awards[index] || '';
        row.innerHTML = `
            <div>
                <div class="goal-award-label">${index + 1}/3 milestone</div>
                <input class="reward-edit-input" type="text" value="${escHtml(current)}" placeholder="Enter award text">
            </div>
            <div class="goal-award-actions">
                <button type="button" class="reward-edit-save">Save</button>
                <button type="button" class="reward-edit-cancel">Cancel</button>
            </div>
        `;

        row.querySelector('.reward-edit-save').addEventListener('click', () => {
            const input = row.querySelector('.reward-edit-input');
            const value = input.value.trim() || `Goal award ${index + 1}`;
            state.goal.awards[index] = value;
            saveState();
            renderGoalSettings();
        });
        row.querySelector('.reward-edit-cancel').addEventListener('click', renderGoalSettings);
    }

    function claimGoalAward(index) {
        state.goal.claimed[index] = true;
        saveState();
        showToast(`Goal award unlocked: ${state.goal.awards[index]}`);
        renderGoalSettings();
    }

    function renderPastHabits() {
        if (!pastHabitsContainer || !pastHabitsCount) return;
        pastHabitsCount.textContent = state.pastHabits.length ? `(${state.pastHabits.length})` : '';
        if (!state.pastHabits.length) {
            pastHabitsContainer.innerHTML = '<div class="muted-text">Past habits will appear here after a day change.</div>';
            return;
        }

        pastHabitsContainer.innerHTML = state.pastHabits.map(group => `
            <div class="past-day-group">
                <div class="past-day-header">${group.date}</div>
                <ul class="past-day-list">
                    ${group.habits.map(h => `
                        <li class="past-habit-item">
                            ${escHtml(h.title)} ${h.isCompleted ? '<span class="past-habit-status">(Done)</span>' : '<span class="past-habit-status">(Open)</span>'}
                            ${h.isRepeated ? '<span class="habit-repeat-chip">REPEAT</span>' : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('');
    }

    function renderAll() {
        renderHabits();
        renderRewardSettings();
        renderGoalSettings();
        renderPastHabits();
        renderWallet();
        renderStats();
        renderSpinHistory();
        updateWalletModal();
    }

    function renderSpinHistory() {
        if (!spinHistoryEl) return;
        if (!state.spinHistory.length) {
            spinHistoryEl.innerHTML = '<span class="history-empty">No spins yet</span>';
            return;
        }
        spinHistoryEl.innerHTML = state.spinHistory.map(entry => {
            const cls = entry === 'Miss' ? 'miss' : (entry === 'Jackpot' ? 'jackpot' : 'win');
            return `<span class="history-chip ${cls}">${entry}</span>`;
        }).join('');
    }

    function updateWalletModal() {
        if (!walletModalBalance) return;
        const total = Object.values(state.wallet).reduce((sum, value) => sum + value, 0);
        walletModalBalance.textContent = total.toLocaleString();
    }

    function showWalletModal() {
        if (!walletModal) return;
        walletModal.style.display = 'flex';
        updateWalletModal();
    }

    function hideWalletModal() {
        if (!walletModal) return;
        walletModal.style.display = 'none';
    }

    // ═══════════════════════════════════════════════
    // ANIMATION: COIN RAIN
    // Uses CSS animation only — no canvas, no rAF loop,
    // no main-thread blocking. Each coin auto-removes
    // on animationend.
    // ═══════════════════════════════════════════════
    function triggerCoinRain(token, count = 24) {
        const easings = [
            'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            'cubic-bezier(0.23, 1, 0.32, 1)',
            'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        ];

        for (let i = 0; i < count; i++) {
            const coin = document.createElement('div');
            coin.className = 'coin-rain-coin';

            const leftPct  = 10 + Math.random() * 80;
            const duration = 1.8 + Math.random() * 1.2;
            const delay    = i * 0.08 + Math.random() * 0.3; // Staggered start
            const spinDeg  = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720);
            const easing   = easings[Math.floor(Math.random() * easings.length)];

            coin.style.cssText = `
                left: ${leftPct}vw;
                background: var(${token.var});
                color: rgba(0,0,0,0.7);
                --fall-dur: ${duration}s;
                --fall-delay: ${delay}s;
                --fall-ease: ${easing};
                --spin-deg: ${spinDeg}deg;
                --scale-start: ${1 + Math.random() * 0.5};
            `;
            coin.innerHTML = `<span class="material-symbols-outlined">${token.icon}</span>`;

            document.body.appendChild(coin);
            coin.addEventListener('animationend', () => coin.remove(), { once: true });
        }
    }

    // ═══════════════════════════════════════════════
    // ANIMATION: SINGLE TOKEN FLY TO BADGE
    // ═══════════════════════════════════════════════
    function flyTokenToWallet(sourceRect, token) {
        const startX = sourceRect.left + 14;
        const startY = sourceRect.top + sourceRect.height / 2 - 24;

        const badge     = document.getElementById('remaining-count');
        const badgeRect = badge.getBoundingClientRect();
        const endX = badgeRect.left + badgeRect.width / 2 - 24;
        const endY = badgeRect.top  + badgeRect.height / 2 - 24;

        const coin = document.createElement('div');
        coin.className = 'token-coin';
        coin.style.cssText = `
            left: ${startX}px;
            top: ${startY}px;
            background: var(${token.var});
            color: rgba(0,0,0,0.8);
            --tx: ${endX - startX}px;
            --ty: ${endY - startY}px;
            --tx-mid: ${(endX - startX) * 0.3}px;
            --ty-mid: ${(endY - startY) * 0.2 - 40}px;
            --fly-duration: 1.0s;
            --scale-peak: 1.8;
        `;
        coin.innerHTML = `<span class="material-symbols-outlined">${token.icon}</span>`;
        document.body.appendChild(coin);

        coin.addEventListener('animationend', () => {
            coin.remove();
            // Enhanced badge bump with glow effect
            badge.classList.remove('badge-bump');
            void badge.offsetWidth; // force reflow
            badge.classList.add('badge-bump');
            badge.style.animation = 'badgeGlow 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards';
        }, { once: true });
    }

    function getToastContainer() {
        if (toastContainer) return toastContainer;
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    function showToast(message, token = null) {
        const container = getToastContainer();
        const toast = document.createElement('div');
        toast.className = 'toast-item';
        toast.innerHTML = token
            ? `<span class="toast-icon material-symbols-outlined">${token.icon}</span>${message}`
            : `<div class="toast-copy">${message}</div>`;

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));

        setTimeout(() => toast.classList.remove('visible'), 3200);
        toast.addEventListener('transitionend', () => {
            if (!toast.classList.contains('visible')) toast.remove();
        }, { once: true });
    }

    function showUndoToast(message, buttonLabel, undoCallback) {
        const container = getToastContainer();
        const toast = document.createElement('div');
        toast.className = 'toast-item';
        toast.innerHTML = `
            <div class="toast-copy">${message}</div>
            <button type="button" class="toast-action-btn">${buttonLabel}</button>
        `;

        const actionButton = toast.querySelector('.toast-action-btn');
        actionButton.addEventListener('click', () => {
            undoCallback();
            toast.classList.remove('visible');
        });

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));

        setTimeout(() => toast.classList.remove('visible'), 6000);
        toast.addEventListener('transitionend', () => {
            if (!toast.classList.contains('visible')) toast.remove();
        }, { once: true });
    }

    function getTokenForBet(level) {
        return state.tokenColors.find(token => {
            const required = level === 1 ? 1 : level;
            return (state.wallet[token.name] || 0) >= required;
        });
    }

    function animateTokenInsert(token) {
        if (!coinSlotTrigger || !machineContainer) return;
        const start = coinSlotTrigger.getBoundingClientRect();
        const target = machineContainer.getBoundingClientRect();
        const startX = start.left + start.width / 2 - 28;
        const startY = start.top + start.height / 2 - 28;
        const endX = target.left + target.width / 2 - 28;
        const endY = target.top + target.height / 2 - 28;

        const insert = document.createElement('div');
        insert.className = 'token-insert-coin token-insert-anim';
        insert.style.cssText = `
            left: ${startX}px;
            top: ${startY}px;
            background: var(${token.var});
            color: rgba(0,0,0,0.75);
            --insert-tx: ${endX - startX}px;
            --insert-ty: ${endY - startY}px;
        `;
        insert.innerHTML = `<span class="material-symbols-outlined">${token.icon}</span>`;
        document.body.appendChild(insert);

        insert.addEventListener('animationend', () => insert.remove(), { once: true });
    }

    // ═══════════════════════════════════════════════
    // ANIMATION: SCATTER PARTICLES (slot win / misc)
    // ═══════════════════════════════════════════════
    function createParticles(x, y, colorVar, count = 12, isWin = false) {
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = isWin ? 'win-particle' : 'particle';
            p.style.background = `var(${colorVar})`;

            if (isWin) {
                p.style.left = Math.random() * 100 + 'vw';
                p.style.setProperty('--d', (Math.random() * 3 + 3) + 's');
                p.style.setProperty('--delay', (Math.random() * 0.5) + 's');
                p.style.setProperty('--size', (8 + Math.random() * 12) + 'px');
                document.body.appendChild(p);
                setTimeout(() => p.remove(), 6000);
            } else {
                const angle = Math.random() * Math.PI * 2;
                const dist  = Math.random() * 60 + 20;
                p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
                p.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
                p.style.left = x + 'px';
                p.style.top  = y + 'px';
                p.style.animation = 'particleOut 0.8s ease-out forwards';
                document.body.appendChild(p);
                p.addEventListener('animationend', () => p.remove(), { once: true });
            }
        }
    }

    function triggerWinBurst(x, y, token) {
        // Create a burst of larger coins that radiate outward
        for (let i = 0; i < 12; i++) {
            const coin = document.createElement('div');
            coin.className = 'win-burst-coin';

            const angle = (i / 12) * Math.PI * 2;
            const distance = 150 + Math.random() * 100;
            const duration = 1.5 + Math.random() * 0.8;
            const delay = Math.random() * 0.3;

            coin.style.cssText = `
                left: ${x}px;
                top: ${y}px;
                background: var(--token-4);
                color: rgba(0,0,0,0.8);
                --tx: ${Math.cos(angle) * distance}px;
                --ty: ${Math.sin(angle) * distance}px;
                --burst-dur: ${duration}s;
                --burst-delay: ${delay}s;
                --rotation: ${Math.random() * 720}deg;
            `;
            coin.innerHTML = `<span class="material-symbols-outlined">stars</span>`;
            document.body.appendChild(coin);
            coin.addEventListener('animationend', () => coin.remove(), { once: true });
        }
    }

    // ═══════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════
    function escHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ═══════════════════════════════════════════════
    // EVENT LISTENERS
    // ═══════════════════════════════════════════════
    if (btnResetDay) {
        btnResetDay.addEventListener('click', () => {
            state.habits.forEach(h => { h.isCompleted = false; h.earnedToken = null; });
            saveState();
            renderAll();
        });
    }

    if (btnAddHabit) {
        btnAddHabit.addEventListener('click', addHabit);
    }

    if (spinHandle) spinHandle.addEventListener('click', handleSpin);

    if (coinSlotTrigger) {
        coinSlotTrigger.addEventListener('click', () => {
            if (isSpinning || isLoaded) return;
            coinModal.style.display = 'flex';
            [1, 2, 3].forEach(l => {
                const can = l === 1
                    ? Object.values(state.wallet).some(v => v > 0)
                    : state.tokenColors.some(t => state.wallet[t.name] >= l);
                document.getElementById(`bet-opt-${l}`).disabled = !can;
            });
        });
    }

    if (btnModalCancel) btnModalCancel.addEventListener('click', () => { coinModal.style.display = 'none'; });

    if (walletOpenTrigger) walletOpenTrigger.addEventListener('click', showWalletModal);
    if (btnOpenWallet) btnOpenWallet.addEventListener('click', showWalletModal);
    if (walletModalClose) walletModalClose.addEventListener('click', hideWalletModal);
    if (walletModal) walletModal.addEventListener('click', event => {
        if (event.target === walletModal) hideWalletModal();
    });
    if (walletJiggleBtn) walletJiggleBtn.addEventListener('click', () => {
        if (!walletPhysicsCanvas) return;
        walletPhysicsCanvas.classList.add('wallet-jiggle');
        setTimeout(() => walletPhysicsCanvas.classList.remove('wallet-jiggle'), 300);
    });

    [1, 2, 3].forEach(l => {
        const btn = document.getElementById(`bet-opt-${l}`);
        if (!btn) return;
        btn.addEventListener('click', () => {
            const token = getTokenForBet(l);
            if (!token) return;
            const amount = l === 1 ? 1 : l;
            state.wallet[token.name] -= amount;
            isLoaded = true;
            loadedLevel = l;
            saveState();
            coinModal.style.display = 'none';
            document.getElementById('coin-slot-label').textContent = `L${l} LOADED`;
            coinSlotTrigger.classList.add('loaded');
            animateTokenInsert(token);
            showToast(`${amount} ${amount === 1 ? 'token' : 'tokens'} inserted`, token);
            setTimeout(() => coinSlotTrigger.classList.remove('loaded'), 1200);
            renderAll();
        });
    });

    // ═══════════════════════════════════════════════
    // BOOT
    // ═══════════════════════════════════════════════
    setInitialItems();
    renderAll();
});
