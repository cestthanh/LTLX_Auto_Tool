// LTLX AUTO TOOL - FRONTEND DASHBOARD APPLICATION (2-STEP WORKFLOW)
let socket = null;
let workersData = [];
let audioCtx = null;
let lastAlertTimes = {};
const collapsedOverviewSet = new Set(); // Lưu trạng thái thu gọn bảng tiến độ

const urlParams = new URLSearchParams(window.location.search);
const popoutId = urlParams.get('id');

if (popoutId) {
    document.body.classList.add('popout-mode');
}

// Web Audio API Beep
function playAlertBeep() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174, now + 0.1);
        osc.frequency.setValueAtTime(880, now + 0.2);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.4);
    } catch (e) {}
}

// WEBSOCKET
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    socket = new WebSocket(wsUrl);
    const statusEl = document.getElementById('connectionStatus');

    socket.onopen = () => {
        console.log('[WS] Đã kết nối tới Server!');
        if (statusEl) {
            statusEl.innerHTML = '<span class="status-dot online"></span><span class="status-text">Đã kết nối</span>';
        }
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerEvent(data);
        } catch (e) {
            console.error('[WS] Lỗi parse JSON:', e);
        }
    };

    socket.onclose = () => {
        console.log('[WS] Mất kết nối, đang thử lại sau 2s...');
        if (statusEl) {
            statusEl.innerHTML = '<span class="status-dot"></span><span class="status-text">Mất kết nối</span>';
        }
        setTimeout(connectWebSocket, 2000);
    };
}

function handleServerEvent(data) {
    if (data.event === 'init' || data.event === 'state_update') {
        workersData = data.workers || [];
        renderAllCards();
        updateStats();
        checkAlerts();
    } else if (data.event === 'progress') {
        updateSingleWorkerProgress(data.id, data.progress, data.statusMessage, data.status);
        updateStats();
    } else if (data.event === 'log') {
        appendLogToCard(data.id, data.log);
    } else if (data.event === 'screenshot') {
        updateCardScreenshot(data.id, data.screenshot);
    }
}

function sendAction(action, id = null, options = {}) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action, id, options }));
    }
}

function updateStats() {
    const total = workersData.length;
    const running = workersData.filter(w => w.status === 'RUNNING' || w.status === 'STARTING').length;
    const alertCount = workersData.filter(w => w.status === 'PAUSED_CAPTCHA' || w.status === 'ERROR').length;
    const completed = workersData.filter(w => w.status === 'COMPLETED').length;

    const elTotal = document.getElementById('statTotal');
    const elRunning = document.getElementById('statRunning');
    const elAlert = document.getElementById('statAlert');
    const elCompleted = document.getElementById('statCompleted');

    if (elTotal) elTotal.innerText = total;
    if (elRunning) elRunning.innerText = running;
    if (elAlert) elAlert.innerText = alertCount;
    if (elCompleted) elCompleted.innerText = completed;
}

function checkAlerts() {
    workersData.forEach(w => {
        if (w.status === 'PAUSED_CAPTCHA' || (w.alert && w.alert.type === 'CAPTCHA')) {
            const now = Date.now();
            if (!lastAlertTimes[w.id] || now - lastAlertTimes[w.id] > 5000) {
                playAlertBeep();
                lastAlertTimes[w.id] = now;
            }
        }
    });
}

function renderAllCards() {
    const container = document.getElementById('cardsContainer');
    if (!container) return;

    const displayList = popoutId ? workersData.filter(w => w.id === popoutId) : workersData;

    if (displayList.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
                <div style="font-size: 48px; margin-bottom: 12px;">👥</div>
                <h3 style="color: var(--text-main); margin-bottom: 8px;">Chưa có tài khoản nào</h3>
                <p>Hãy nhấn nút <strong>"+ Thêm Tài Khoản Mới"</strong> ở góc trên để bắt đầu!</p>
            </div>
        `;
        return;
    }

    displayList.forEach((worker, index) => {
        let card = document.getElementById(`card_${worker.id}`);
        if (!card) {
            card = document.createElement('div');
            card.id = `card_${worker.id}`;
            card.className = 'account-card';
            container.appendChild(card);
        }
        updateCardContent(card, worker, index + 1);
    });

    const existingCards = container.querySelectorAll('.account-card');
    existingCards.forEach(c => {
        const id = c.id.replace('card_', '');
        if (!displayList.some(w => w.id === id)) {
            c.remove();
        }
    });
}

function updateCardContent(card, worker, displayIndex) {
    const isRunning = worker.isRunning || worker.status === 'RUNNING' || worker.status === 'STARTING';
    const isScanning = worker.status === 'SCANNING';
    const isAlert = worker.status === 'PAUSED_CAPTCHA' || worker.status === 'ERROR';
    const isCompleted = worker.status === 'COMPLETED';
    const hasOverview = worker.courseOverview && worker.courseOverview.length > 0;

    card.className = `account-card ${isRunning ? 'is-running' : ''} ${isScanning ? 'is-scanning' : ''} ${isAlert ? 'is-alert' : ''} ${isCompleted ? 'is-completed' : ''}`;

    let statusBadge = '';
    if (worker.status === 'RUNNING') {
        statusBadge = '<span class="status-badge text-success">🟢 Đang học</span>';
    } else if (worker.status === 'STARTING') {
        statusBadge = '<span class="status-badge text-primary">⏳ Đang khởi động...</span>';
    } else if (worker.status === 'SCANNING') {
        statusBadge = '<span class="status-badge text-primary" style="animation: pulse 1s infinite;">🔍 Đang quét 6 môn...</span>';
    } else if (worker.status === 'PAUSED_CAPTCHA') {
        statusBadge = '<span class="status-badge text-warning" style="animation: alertPulse 1s infinite;">🔔 CẦN XÁC NHẬN CAPTCHA</span>';
    } else if (worker.status === 'ERROR') {
        statusBadge = '<span class="status-badge text-danger">❌ Bị lỗi / Chặn</span>';
    } else if (worker.status === 'COMPLETED') {
        statusBadge = '<span class="status-badge text-primary">🎉 Đã hoàn thành</span>';
    } else if (hasOverview) {
        statusBadge = '<span class="status-badge text-success">✓ Đã quét tiến độ</span>';
    } else {
        statusBadge = '<span class="status-badge" style="color: var(--text-dim);">⚪ Chờ quét tiến độ</span>';
    }

    // Bảng tiến độ các môn học
    let overviewHtml = '';
    if (hasOverview) {
        const isCollapsed = collapsedOverviewSet.has(worker.id);
        overviewHtml = `
            <div class="course-overview-box">
                <div class="overview-header-row">
                    <div class="overview-header-left">
                        <span class="overview-title">📊 Tiến Độ 6 Môn Học:</span>
                        <button class="btn-toggle-collapse" onclick="toggleOverviewCollapse('${worker.id}')" title="Ẩn/Hiện bảng tiến độ">
                            <span>${isCollapsed ? '▼ Mở rộng' : '▲ Thu gọn'}</span>
                        </button>
                    </div>
                    <button class="btn-rescan" onclick="scanAccount('${worker.id}')" ${isRunning || isScanning ? 'disabled' : ''} title="Quét lại tiến độ mới nhất">🔄 Quét lại</button>
                </div>
                <div class="overview-grid ${isCollapsed ? 'is-collapsed' : ''}" id="overview_grid_${worker.id}">
                    ${worker.courseOverview.map((c, cIdx) => `
                        <div class="overview-row ${c.status === 'Đạt' ? 'status-pass' : 'status-fail'}" 
                             onclick="showCourseDetailPopup('${worker.id}', ${cIdx})" 
                             title="👉 Nhấp để xem chi tiết 3 phần: Video bài giảng, Ôn luyện trắc nghiệm, Kiểm tra">
                            <span class="c-name">
                                <span>${c.name}</span>
                                <span class="c-info-badge">🔍</span>
                            </span>
                            <span class="c-prog">${c.progress}</span>
                            <span class="c-hours">${c.hours}</span>
                            <span class="c-badge">${c.status}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="card-header">
            <div class="card-title-group">
                <span class="card-index">#${displayIndex}</span>
                <span class="card-username">${worker.username || 'Tài khoản mới'}</span>
                ${statusBadge}
            </div>
            <div class="card-actions">
                ${!popoutId ? `<button class="btn-popout" title="Tách ra cửa sổ riêng để chia 4 góc màn hình" onclick="openPopout('${worker.id}')">↗ Tách ô</button>` : ''}
                ${!isRunning && !isScanning ? `<button class="btn-delete-card" title="Xóa tài khoản này" onclick="deleteAccount('${worker.id}')">🗑</button>` : ''}
            </div>
        </div>

        ${worker.alert ? `
            <div class="alert-banner">
                <div class="alert-text">
                    <span>⚠️</span>
                    <span>${worker.alert.message || 'Cần can thiệp người dùng!'}</span>
                </div>
            </div>
        ` : ''}

        <!-- BƯỚC 1: NHẬP THÔNG TIN VÀ QUÉT TIẾN ĐỘ -->
        <div class="step-container">
            <div class="step-title">
                <span class="step-badge">BƯỚC 1</span>
                <span>Nhập thông tin tài khoản & Chế độ:</span>
            </div>
            <div class="card-form-grid">
                <div class="form-group">
                    <label>Số CCCD / Tên Đăng Nhập:</label>
                    <input type="text" class="form-control" value="${worker.username}" ${isRunning || isScanning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'username', this.value)" placeholder="Ví dụ: 035099002016">
                </div>
                <div class="form-group">
                    <label>Mật Khẩu:</label>
                    <input type="password" class="form-control" value="${worker.password}" ${isRunning || isScanning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'password', this.value)">
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Chế độ học mong muốn:</label>
                    <select class="form-control" ${isRunning || isScanning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'mode', this.value)">
                        <option value="video" ${worker.mode === 'video' ? 'selected' : ''}>🎬 Tự động Học Video & Lý Thuyết (Tích lũy giờ)</option>
                        <option value="practice" ${worker.mode === 'practice' ? 'selected' : ''}>📝 Tự động Ôn Luyện Trắc Nghiệm</option>
                    </select>
                </div>
            </div>

            ${!hasOverview && !isRunning ? `
                <button class="btn btn-primary btn-glow btn-scan-action" onclick="scanAccount('${worker.id}')" ${isScanning ? 'disabled' : ''}>
                    ${isScanning ? '⏳ ĐANG QUÉT TIẾN ĐỘ 6 MÔN HỌC...' : '🔍 QUÉT TIẾN ĐỘ KHÓA HỌC (KIỂM TRA 6 MÔN)'}
                </button>
            ` : ''}
        </div>

        ${overviewHtml}

        <!-- BƯỚC 2: CHỌN MÔN & BẮT ĐẦU HỌC (HIỆN RÕ SAU KHI QUÉT HOẶC KHI ĐANG CHẠY) -->
        <div class="step-container ${!hasOverview && !isRunning ? 'step-locked' : ''}">
            <div class="step-title">
                <span class="step-badge">BƯỚC 2</span>
                <span>Chọn mục tiêu và Bắt đầu học:</span>
            </div>

            <div class="form-group" style="margin-bottom: 10px;">
                <label>${worker.mode === 'video' ? 'Chọn Môn Học Cần Cày Giờ:' : 'Chọn Phần Ôn Luyện & Số Câu:'}</label>
                ${worker.mode === 'video' ? `
                    <select class="form-control" ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'course', this.value)">
                        <option value="all_incomplete" ${worker.course === 'all_incomplete' ? 'selected' : ''}>🚀 Tự động cày TẤT CẢ các môn chưa đạt (Khuyên dùng)</option>
                        <option value="Kỹ thuật lái xe" ${worker.course === 'Kỹ thuật lái xe' ? 'selected' : ''}>Kỹ thuật lái xe ô tô (20h)</option>
                        <option value="Đạo đức" ${worker.course === 'Đạo đức' ? 'selected' : ''}>Đạo đức, Văn hóa GT & PCCC (14h)</option>
                        <option value="Cấu tạo" ${worker.course === 'Cấu tạo' ? 'selected' : ''}>Cấu tạo sửa chữa (8h)</option>
                        <option value="Phần 1" ${worker.course === 'Phần 1' ? 'selected' : ''}>Phần 1. Luật Trật tự ATGT (25h)</option>
                        <option value="Phần 2" ${worker.course === 'Phần 2' ? 'selected' : ''}>Phần 2. Hệ thống báo hiệu đường bộ (40h)</option>
                        <option value="Phần 3" ${worker.course === 'Phần 3' ? 'selected' : ''}>Phần 3. Xử lý tình huống giao thông (25h)</option>
                        <option value="Mô phỏng" ${worker.course === 'Mô phỏng' ? 'selected' : ''}>Mô phỏng các tình huống GT</option>
                    </select>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <select class="form-control" ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'practiceCourse', this.value)">
                            <option value="Phần 1" ${worker.practiceCourse === 'Phần 1' ? 'selected' : ''}>Phần 1. Luật Trật tự, ATGT đường bộ</option>
                            <option value="Phần 2" ${worker.practiceCourse === 'Phần 2' ? 'selected' : ''}>Phần 2. Hệ thống báo hiệu đường bộ</option>
                            <option value="Phần 3" ${worker.practiceCourse === 'Phần 3' ? 'selected' : ''}>Phần 3. Xử lý các tình huống giao thông</option>
                            <option value="Kỹ thuật lái xe" ${worker.practiceCourse === 'Kỹ thuật lái xe' ? 'selected' : ''}>Kỹ thuật lái xe ô tô</option>
                            <option value="Cấu tạo" ${worker.practiceCourse === 'Cấu tạo' ? 'selected' : ''}>Cấu tạo sửa chữa xe ô tô</option>
                            <option value="Đạo đức" ${worker.practiceCourse === 'Đạo đức' ? 'selected' : ''}>Đạo đức, Văn hóa GT & PCCC</option>
                            <option value="Mô phỏng" ${worker.practiceCourse === 'Mô phỏng' ? 'selected' : ''}>Mô phỏng các tình huống giao thông</option>
                        </select>
                        <select class="form-control" ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'practiceCount', this.value)">
                            <option value="20" ${worker.practiceCount == 20 ? 'selected' : ''}>Làm 20 câu trắc nghiệm</option>
                            <option value="35" ${worker.practiceCount == 35 ? 'selected' : ''}>Làm 35 câu (Đề thi chuẩn B2)</option>
                            <option value="50" ${worker.practiceCount == 50 ? 'selected' : ''}>Làm 50 câu trắc nghiệm</option>
                            <option value="60" ${worker.practiceCount == 60 ? 'selected' : ''}>Làm 60 câu trắc nghiệm</option>
                            <option value="185" ${worker.practiceCount == 185 ? 'selected' : ''}>Làm 185 câu (Toàn bộ phần)</option>
                        </select>
                    </div>
                `}
            </div>

            <div class="card-controls-row">
                <label class="toggle-headless">
                    <input type="checkbox" ${worker.headless ? 'checked' : ''} ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'headless', this.checked)">
                    <span>Ẩn trình duyệt (Headless)</span>
                </label>
                ${!isRunning ? `
                    <button class="btn btn-success btn-card-action" onclick="startAccount('${worker.id}')" ${isScanning ? 'disabled' : ''}>
                        <span>▶</span> BẮT ĐẦU HỌC
                    </button>
                ` : `
                    <button class="btn btn-danger btn-card-action" onclick="stopAccount('${worker.id}')">
                        <span>⏹</span> DỪNG LẠI
                    </button>
                `}
            </div>
        </div>

        <!-- THANH TIẾN ĐỘ THỜI GIAN THỰC -->
        <div class="progress-section">
            <div class="progress-header">
                <span class="progress-status-msg" id="status_msg_${worker.id}">${worker.statusMessage || 'Sẵn sàng'}</span>
                <span class="progress-pct" id="pct_${worker.id}">${worker.progress ? worker.progress.percent : 0}%</span>
            </div>
            <div class="progress-bar-track">
                <div class="progress-bar-fill" id="fill_${worker.id}" style="width: ${worker.progress ? worker.progress.percent : 0}%;"></div>
            </div>
            <span class="progress-detail" id="detail_${worker.id}">${worker.progress ? worker.progress.detail : 'Chưa bắt đầu'}</span>
        </div>

        <!-- KHUNG LIVE CONSOLE LOG -->
        <div class="log-terminal" id="logs_${worker.id}">
            ${(worker.logs || []).map(l => `
                <div class="log-line ${l.type}">
                    <span class="log-time">[${l.time}]</span>
                    <span class="log-msg">${l.message}</span>
                </div>
            `).join('')}
        </div>
    `;

    const logBox = document.getElementById(`logs_${worker.id}`);
    if (logBox) logBox.scrollTop = logBox.scrollHeight;
}

function updateSingleWorkerProgress(id, progress, statusMessage, status) {
    const pctEl = document.getElementById(`pct_${id}`);
    const fillEl = document.getElementById(`fill_${id}`);
    const detailEl = document.getElementById(`detail_${id}`);
    const statusMsgEl = document.getElementById(`status_msg_${id}`);

    if (pctEl) pctEl.innerText = `${progress.percent || 0}%`;
    if (fillEl) fillEl.style.width = `${progress.percent || 0}%`;
    if (detailEl) detailEl.innerText = progress.detail || '';
    if (statusMsgEl) statusMsgEl.innerText = statusMessage || '';
}

function appendLogToCard(id, log) {
    const logBox = document.getElementById(`logs_${id}`);
    if (logBox) {
        const line = document.createElement('div');
        line.className = `log-line ${log.type}`;
        line.innerHTML = `<span class="log-time">[${log.time}]</span> <span class="log-msg">${log.message}</span>`;
        logBox.appendChild(line);
        logBox.scrollTop = logBox.scrollHeight;
    }
}

function updateAccountField(id, field, value) {
    sendAction('update', id, { [field]: value });
}

function scanAccount(id) {
    sendAction('scan', id);
}

function startAccount(id) {
    sendAction('start', id);
}

function stopAccount(id) {
    sendAction('stop', id);
}

function deleteAccount(id) {
    if (confirm('Bạn có chắc chắn muốn xóa thẻ tài khoản này không?')) {
        sendAction('delete', id);
    }
}

function openPopout(id) {
    const width = 620;
    const height = 820;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(`/index.html?id=${id}`, `Popout_${id}`, `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
}

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();

    const btnStartAll = document.getElementById('btnStartAll');
    const btnStopAll = document.getElementById('btnStopAll');
    if (btnStartAll) btnStartAll.onclick = () => sendAction('start_all');
    if (btnStopAll) btnStopAll.onclick = () => sendAction('stop_all');

    const btnGrid = document.getElementById('btnGridMode');
    const btnList = document.getElementById('btnListMode');
    const container = document.getElementById('cardsContainer');

    if (btnGrid && btnList && container) {
        btnGrid.onclick = () => {
            btnGrid.classList.add('active');
            btnList.classList.remove('active');
            container.className = 'cards-container grid-layout';
        };
        btnList.onclick = () => {
            btnList.classList.add('active');
            btnGrid.classList.remove('active');
            container.className = 'cards-container list-layout';
        };
    }

    const modal = document.getElementById('modalAdd');
    const btnAdd = document.getElementById('btnAddAccount');
    const btnClose = document.getElementById('btnCloseModal');
    const btnCancel = document.getElementById('btnCancelAdd');
    const btnSubmit = document.getElementById('btnSubmitAdd');

    if (btnAdd) btnAdd.onclick = () => modal.classList.add('show');
    if (btnClose) btnClose.onclick = () => modal.classList.remove('show');
    if (btnCancel) btnCancel.onclick = () => modal.classList.remove('show');

    if (btnSubmit) {
        btnSubmit.onclick = () => {
            const username = document.getElementById('newUsername').value.trim();
            const password = document.getElementById('newPassword').value.trim();
            const mode = document.getElementById('newMode').value;
            const course = document.getElementById('newCourse').value;
            const headless = document.getElementById('newHeadless').checked;

            if (!username) {
                alert('Vui lòng nhập số CCCD / Tên đăng nhập!');
                return;
            }

            sendAction('create', null, { username, password, mode, course, headless });
            modal.classList.remove('show');
            document.getElementById('newUsername').value = '';
        };
    }
});

// =========================================================================
//   XỬ LÝ THU GỌN / MỞ RỘNG BẢNG TIẾN ĐỘ & POPUP CHI TIẾT 3 PHẦN MÔN HỌC
// =========================================================================

function toggleOverviewCollapse(workerId) {
    if (collapsedOverviewSet.has(workerId)) {
        collapsedOverviewSet.delete(workerId);
    } else {
        collapsedOverviewSet.add(workerId);
    }
    const card = document.getElementById(`card_${workerId}`);
    if (card) {
        const grid = card.querySelector(`#overview_grid_${workerId}`);
        const btnText = card.querySelector('.btn-toggle-collapse span');
        if (grid && btnText) {
            const isNowCollapsed = collapsedOverviewSet.has(workerId);
            grid.classList.toggle('is-collapsed', isNowCollapsed);
            btnText.innerText = isNowCollapsed ? '▼ Mở rộng' : '▲ Thu gọn';
        }
    }
}

function showCourseDetailPopup(workerId, courseIndex) {
    const worker = workersData.find(w => w.id === workerId);
    if (!worker || !worker.courseOverview || !worker.courseOverview[courseIndex]) return;

    const course = worker.courseOverview[courseIndex];
    const modal = document.getElementById('modalCourseDetail');
    if (!modal) return;

    const isPass = course.status === 'Đạt';
    let numericPct = 0;
    const pctMatch = course.progress ? course.progress.match(/([\d.]+)%/) : null;
    if (pctMatch) numericPct = parseFloat(pctMatch[1]) || 0;

    // 1. Tên môn học
    document.getElementById('modalCourseTitle').innerText = course.name;

    // 2. Khối chính: Số giờ & Tiến độ
    document.getElementById('compactHours').innerHTML = `${course.hours} <span class="unit">giờ</span>`;
    document.getElementById('compactPct').innerText = course.progress || '0%';
    const statusEl = document.getElementById('compactStatus');
    statusEl.innerText = isPass ? 'Đạt' : 'Chưa đạt';
    statusEl.className = `compact-badge ${isPass ? 'pass' : 'fail'}`;
    document.getElementById('compactFill').style.width = `${Math.min(numericPct, 100)}%`;

    // 3. Danh sách 3 mục ngắn gọn (Tập trung số giờ)
    // Mục 1: Video & Lý thuyết
    document.getElementById('subVideoHours').innerText = course.hours;
    document.getElementById('subVideoPct').innerText = course.progress || '0%';
    const svStatus = document.getElementById('subVideoStatus');
    svStatus.innerText = isPass ? 'Đạt' : 'Chưa đạt';
    svStatus.className = `part-status ${isPass ? 'pass' : 'fail'}`;

    // Mục 2: Ôn luyện trắc nghiệm
    document.getElementById('subPracticeHours').innerText = isPass ? 'Đã hoàn thành' : 'Đang học';
    document.getElementById('subPracticePct').innerText = isPass ? '100%' : (course.progress || '0%');
    const spStatus = document.getElementById('subPracticeStatus');
    spStatus.innerText = isPass ? 'Đạt' : 'Chưa đạt';
    spStatus.className = `part-status ${isPass ? 'pass' : 'fail'}`;

    // Mục 3: Kiểm tra kết thúc môn
    document.getElementById('subExamHours').innerText = isPass ? 'Đạt chuẩn' : 'Chưa làm';
    document.getElementById('subExamPct').innerText = isPass ? '100%' : '-';
    const seStatus = document.getElementById('subExamStatus');
    seStatus.innerText = isPass ? 'Đạt' : 'Chưa đạt';
    seStatus.className = `part-status ${isPass ? 'pass' : 'fail'}`;

    modal.classList.add('show');
}

function closeCourseDetailModal(event) {
    if (event && event.target && event.target.id !== 'modalCourseDetail' && !event.target.classList.contains('btn-close') && event.target.tagName !== 'BUTTON') {
        return;
    }
    const modal = document.getElementById('modalCourseDetail');
    if (modal) modal.classList.remove('show');
}

// Đóng modal khi nhấn phím Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCourseDetailModal();
        const modalAdd = document.getElementById('modalAdd');
        if (modalAdd) modalAdd.classList.remove('show');
    }
});

// Gán tường minh vào window cho inline onclick
window.toggleOverviewCollapse = toggleOverviewCollapse;
window.showCourseDetailPopup = showCourseDetailPopup;
window.closeCourseDetailModal = closeCourseDetailModal;
