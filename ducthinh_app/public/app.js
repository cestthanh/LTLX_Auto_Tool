// LTLX AUTO TOOL - FRONTEND DASHBOARD APPLICATION
let socket = null;
let workersData = [];
let audioCtx = null;
let lastAlertTimes = {};

// Kiểm tra xem trang có đang mở ở chế độ Popout (Tách cửa sổ con) không
const urlParams = new URLSearchParams(window.location.search);
const popoutId = urlParams.get('id');

if (popoutId) {
    document.body.classList.add('popout-mode');
}

// Khởi tạo âm thanh cảnh báo bằng Web Audio API
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
        osc.frequency.setValueAtTime(880, now); // Nốt A5
        osc.frequency.setValueAtTime(1174, now + 0.1); // Nốt D6
        osc.frequency.setValueAtTime(880, now + 0.2);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.4);
    } catch (e) {}
}

// KẾT NỐI WEBSOCKET
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

// XỬ LÝ SỰ KIỆN TỪ SERVER
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

// GỬI HÀNH ĐỘNG TỚI SERVER
function sendAction(action, id = null, options = {}) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action, id, options }));
    }
}

// CẬP NHẬT THỐNG KÊ TỔNG QUAN
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

// KIỂM TRA PHÁT ÂM THANH BÁO ĐỘNG
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

// RENDER TOÀN BỘ DANH SÁCH THẺ
function renderAllCards() {
    const container = document.getElementById('cardsContainer');
    if (!container) return;

    // Nếu ở chế độ Popout, chỉ hiển thị đúng thẻ được chọn
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

    // Xóa các card không còn tồn tại
    const existingCards = container.querySelectorAll('.account-card');
    existingCards.forEach(c => {
        const id = c.id.replace('card_', '');
        if (!displayList.some(w => w.id === id)) {
            c.remove();
        }
    });
}

// CẬP NHẬT NỘI DUNG 1 THẺ
function updateCardContent(card, worker, displayIndex) {
    const isRunning = worker.isRunning || worker.status === 'RUNNING' || worker.status === 'STARTING';
    const isAlert = worker.status === 'PAUSED_CAPTCHA' || worker.status === 'ERROR';
    const isCompleted = worker.status === 'COMPLETED';

    card.className = `account-card ${isRunning ? 'is-running' : ''} ${isAlert ? 'is-alert' : ''} ${isCompleted ? 'is-completed' : ''}`;

    let statusBadge = '';
    if (worker.status === 'RUNNING') {
        statusBadge = '<span class="status-badge text-success">🟢 Đang chạy</span>';
    } else if (worker.status === 'STARTING') {
        statusBadge = '<span class="status-badge text-primary">⏳ Đang khởi động...</span>';
    } else if (worker.status === 'PAUSED_CAPTCHA') {
        statusBadge = '<span class="status-badge text-warning" style="animation: alertPulse 1s infinite;">🔔 CẦN XÁC NHẬN CAPTCHA</span>';
    } else if (worker.status === 'ERROR') {
        statusBadge = '<span class="status-badge text-danger">❌ Bị lỗi / Chặn</span>';
    } else if (worker.status === 'COMPLETED') {
        statusBadge = '<span class="status-badge text-primary">🎉 Đã hoàn thành</span>';
    } else {
        statusBadge = '<span class="status-badge" style="color: var(--text-dim);">⚪ Sẵn sàng</span>';
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
                ${!isRunning ? `<button class="btn-delete-card" title="Xóa tài khoản này" onclick="deleteAccount('${worker.id}')">🗑</button>` : ''}
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

        <div class="card-form-grid">
            <div class="form-group">
                <label>Số CCCD / Tên Đăng Nhập:</label>
                <input type="text" class="form-control" value="${worker.username}" ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'username', this.value)" placeholder="Ví dụ: 035099002016">
            </div>
            <div class="form-group">
                <label>Mật Khẩu:</label>
                <input type="password" class="form-control" value="${worker.password}" ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'password', this.value)">
            </div>
            <div class="form-group">
                <label>Chế độ học:</label>
                <select class="form-control" ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'mode', this.value)">
                    <option value="video" ${worker.mode === 'video' ? 'selected' : ''}>🎬 Học Video Bài Giảng</option>
                    <option value="practice" ${worker.mode === 'practice' ? 'selected' : ''}>📝 Ôn Luyện Trắc Nghiệm</option>
                </select>
            </div>
            <div class="form-group">
                <label>${worker.mode === 'video' ? 'Môn học mục tiêu:' : 'Số câu hỏi làm:'}</label>
                ${worker.mode === 'video' ? `
                    <select class="form-control" ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'course', this.value)">
                        <option value="Kỹ thuật lái xe" ${worker.course === 'Kỹ thuật lái xe' ? 'selected' : ''}>Kỹ thuật lái xe ô tô</option>
                        <option value="Đạo đức" ${worker.course === 'Đạo đức' ? 'selected' : ''}>Đạo đức & Văn hóa giao thông</option>
                        <option value="Cấu tạo" ${worker.course === 'Cấu tạo' ? 'selected' : ''}>Cấu tạo sửa chữa</option>
                    </select>
                ` : `
                    <select class="form-control" ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'practiceCount', this.value)">
                        <option value="20" ${worker.practiceCount == 20 ? 'selected' : ''}>20 câu trắc nghiệm</option>
                        <option value="50" ${worker.practiceCount == 50 ? 'selected' : ''}>50 câu trắc nghiệm</option>
                        <option value="60" ${worker.practiceCount == 60 ? 'selected' : ''}>60 câu (Phần 1)</option>
                        <option value="185" ${worker.practiceCount == 185 ? 'selected' : ''}>185 câu (Phần 2 trọn bộ)</option>
                    </select>
                `}
            </div>
        </div>

        <div class="card-controls-row">
            <label class="toggle-headless">
                <input type="checkbox" ${worker.headless ? 'checked' : ''} ${isRunning ? 'disabled' : ''} onchange="updateAccountField('${worker.id}', 'headless', this.checked)">
                <span>Ẩn trình duyệt (Headless)</span>
            </label>
            ${!isRunning ? `
                <button class="btn btn-success btn-card-action" onclick="startAccount('${worker.id}')">
                    <span>▶</span> BẮT ĐẦU
                </button>
            ` : `
                <button class="btn btn-danger btn-card-action" onclick="stopAccount('${worker.id}')">
                    <span>⏹</span> DỪNG LẠI
                </button>
            `}
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

    // Tự động cuộn log xuống cuối
    const logBox = document.getElementById(`logs_${worker.id}`);
    if (logBox) logBox.scrollTop = logBox.scrollHeight;
}

// CẬP NHẬT TIẾN ĐỘ ĐƠN LẺ KHÔNG LÀM MẤT FOCUS FORM
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

// THÊM DÒNG LOG MỚI
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

// CÁC HÀM TƯƠNG TÁC TỪ GIAO DIỆN
function updateAccountField(id, field, value) {
    sendAction('update', id, { [field]: value });
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
    const width = 600;
    const height = 750;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(`/index.html?id=${id}`, `Popout_${id}`, `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
}

// SỰ KIỆN NÚT TOÀN CỤC
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();

    // Nút Bắt đầu tất cả / Dừng tất cả
    const btnStartAll = document.getElementById('btnStartAll');
    const btnStopAll = document.getElementById('btnStopAll');
    if (btnStartAll) btnStartAll.onclick = () => sendAction('start_all');
    if (btnStopAll) btnStopAll.onclick = () => sendAction('stop_all');

    // Chuyển đổi chế độ xem 4 Ô Lưới / Danh Sách
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

    // Modal Thêm Tài Khoản
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
