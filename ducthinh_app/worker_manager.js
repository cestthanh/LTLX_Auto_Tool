const DucthinhBrowser = require("./browser");
const config = require("./config");

class WorkerManager {
    constructor(broadcastCallback) {
        this.broadcast = broadcastCallback || (() => {});
        this.workers = new Map();
        this.nextId = 1;
    }

    /**
     * Tạo một hồ sơ tài khoản mới
     */
    createWorker(options = {}) {
        const id = `acc_${this.nextId++}`;
        const worker = {
            id,
            username: options.username || "",
            password: options.password || "123",
            mode: options.mode || "video", // "video" hoặc "practice"
            course: options.course || "Kỹ thuật lái xe",
            practiceCount: parseInt(options.practiceCount || 20, 10),
            headless: options.headless !== undefined ? options.headless : false,
            status: "IDLE", // IDLE, STARTING, RUNNING, PAUSED_CAPTCHA, ERROR, COMPLETED
            statusMessage: "Sẵn sàng khởi chạy",
            alert: null, // { type: "CAPTCHA" | "LOCK" | "ERROR", message: "...", time: "..." }
            progress: {
                current: 0,
                total: 0,
                percent: 0,
                detail: "Chưa bắt đầu"
            },
            logs: [],
            lastScreenshot: null,
            browserInstance: null,
            isRunning: false
        };

        this.workers.set(id, worker);
        this.notifyState();
        return worker;
    }

    /**
     * Cập nhật thông tin cấu hình tài khoản
     */
    updateWorker(id, options = {}) {
        const worker = this.workers.get(id);
        if (!worker) return null;

        if (options.username !== undefined) worker.username = options.username;
        if (options.password !== undefined) worker.password = options.password;
        if (options.mode !== undefined) worker.mode = options.mode;
        if (options.course !== undefined) worker.course = options.course;
        if (options.practiceCount !== undefined) worker.practiceCount = parseInt(options.practiceCount, 10);
        if (options.headless !== undefined) worker.headless = options.headless;

        this.notifyState();
        return worker;
    }

    /**
     * Xóa một tài khoản
     */
    async deleteWorker(id) {
        await this.stopWorker(id);
        this.workers.delete(id);
        this.notifyState();
    }

    /**
     * Thêm log vào hồ sơ tài khoản
     */
    addLog(id, message, type = "info") {
        const worker = this.workers.get(id);
        if (!worker) return;

        const time = new Date().toLocaleTimeString("vi-VN", { hour12: false });
        const logEntry = { time, message, type };
        worker.logs.push(logEntry);
        if (worker.logs.length > 80) worker.logs.shift(); // Giữ 80 log gần nhất

        this.broadcast({
            event: "log",
            id,
            log: logEntry
        });
    }

    /**
     * Cập nhật tiến độ học
     */
    updateProgress(id, { current, total, percent, detail, statusMessage }) {
        const worker = this.workers.get(id);
        if (!worker) return;

        if (current !== undefined) worker.progress.current = current;
        if (total !== undefined) worker.progress.total = total;
        if (percent !== undefined) worker.progress.percent = Math.min(100, Math.max(0, percent));
        if (detail !== undefined) worker.progress.detail = detail;
        if (statusMessage !== undefined) worker.statusMessage = statusMessage;

        this.broadcast({
            event: "progress",
            id,
            progress: worker.progress,
            statusMessage: worker.statusMessage,
            status: worker.status
        });
    }

    /**
     * Đặt trạng thái cảnh báo / lỗi / Captcha
     */
    setAlert(id, alert) {
        const worker = this.workers.get(id);
        if (!worker) return;

        worker.alert = alert;
        if (alert) {
            if (alert.type === "CAPTCHA") {
                worker.status = "PAUSED_CAPTCHA";
            } else if (alert.type === "ERROR" || alert.type === "LOCK") {
                worker.status = "ERROR";
            }
            worker.statusMessage = alert.message;
        }

        this.notifyState();
    }

    /**
     * Chụp ảnh màn hình live và gửi về UI
     */
    async captureLivePreview(id) {
        const worker = this.workers.get(id);
        if (!worker || !worker.browserInstance || !worker.browserInstance.page) return;

        try {
            if (!worker.browserInstance.page.isClosed()) {
                const b64 = await worker.browserInstance.page.screenshot({
                    type: "jpeg",
                    quality: 40,
                    encoding: "base64"
                });
                worker.lastScreenshot = `data:image/jpeg;base64,${b64}`;
                this.broadcast({
                    event: "screenshot",
                    id,
                    screenshot: worker.lastScreenshot
                });
            }
        } catch (e) {}
    }

    /**
     * Bắt đầu chạy một tài khoản
     */
    async startWorker(id) {
        const worker = this.workers.get(id);
        if (!worker || worker.isRunning) return;

        if (!worker.username || !worker.username.trim()) {
            this.addLog(id, "Vui lòng nhập số CCCD / Tài khoản học viên!", "error");
            return;
        }

        worker.isRunning = true;
        worker.status = "STARTING";
        worker.statusMessage = "Đang khởi chạy trình duyệt...";
        worker.alert = null;
        worker.progress = { current: 0, total: 0, percent: 0, detail: "Đang kết nối..." };
        this.notifyState();

        this.addLog(id, `Bắt đầu phiên làm việc [Tài khoản: ${worker.username} | Chế độ: ${worker.mode.toUpperCase()}]`);

        // Khởi chạy ngầm trong background
        (async () => {
            let app = null;
            try {
                app = new DucthinhBrowser({
                    account: {
                        username: worker.username.trim(),
                        password: worker.password.trim()
                    },
                    browser: {
                        headless: worker.headless ? "new" : false
                    },
                    video: {
                        playbackRate: 1.25,
                        muteAudio: true,
                        maxLessons: 60
                    }
                });

                worker.browserInstance = app;

                // Hook vào bắt Captcha của browser
                const origHandleVerification = app.handleHumanVerificationIfNeeded.bind(app);
                app.handleHumanVerificationIfNeeded = async () => {
                    const check = await app.checkForHumanVerification();
                    if (check && check.isVerification) {
                        this.setAlert(id, {
                            type: "CAPTCHA",
                            message: check.message,
                            time: new Date().toLocaleTimeString("vi-VN")
                        });
                        this.addLog(id, `🔔 [CẢNH BÁO] ${check.message} -> Tạm dừng chờ bạn xác nhận!`, "warning");
                    }
                    await origHandleVerification();
                    if (worker.status === "PAUSED_CAPTCHA") {
                        worker.status = "RUNNING";
                        worker.alert = null;
                        this.addLog(id, `[✓] Đã xác nhận thành công! Tiếp tục học...`, "success");
                        this.notifyState();
                    }
                };

                // Hook ghi log vào UI
                const origPlayMedia = app.playCurrentMedia.bind(app);
                app.playCurrentMedia = async (...args) => {
                    const info = await origPlayMedia(...args);
                    if (info && info.hasMedia) {
                        this.addLog(id, `🎬 Phát: "${info.title}" (~${Math.round(info.duration/60)} phút)`, "info");
                    }
                    return info;
                };

                // BƯỚC 1: ĐĂNG NHẬP
                this.addLog(id, "Đang đăng nhập vào hệ thống ducthinh.huelms.com...");
                await app.login(worker.username, worker.password);
                this.addLog(id, "Đăng nhập thành công!", "success");
                await this.captureLivePreview(id);

                worker.status = "RUNNING";
                this.notifyState();

                if (worker.mode === "video") {
                    // CHẾ ĐỘ 1: HỌC BÀI GIẢNG ĐIỆN TỬ & VIDEO
                    const targetCourse = worker.course || "Kỹ thuật lái xe";
                    this.addLog(id, `Mở khóa học: "${targetCourse}"...`);
                    await app.openCourse(targetCourse);
                    await this.captureLivePreview(id);

                    this.addLog(id, `Mở mục "Bài giảng điện tử"...`);
                    await app.openTask("Bài giảng điện tử");
                    await this.captureLivePreview(id);

                    // Tự động tìm bài chưa học và học tiếp
                    this.addLog(id, "Quét danh mục và tự động học các bài/video CHƯA HOÀN THÀNH...");
                    await app.jumpToFirstUncompletedLesson();

                    // Vòng lặp học bài
                    for (let lessonIdx = 1; lessonIdx <= 60; lessonIdx++) {
                        if (!worker.isRunning) break;

                        const media = await app.playCurrentMedia(1.25, true);
                        await this.captureLivePreview(id);

                        if (media && media.hasMedia) {
                            const dur = media.duration || 120;
                            // Theo dõi thời gian phát
                            while (worker.isRunning) {
                                await new Promise(r => setTimeout(r, 2000));
                                await app.handleHumanVerificationIfNeeded();

                                const status = await app.safeEvaluate(() => {
                                    const audios = Array.from(document.querySelectorAll('audio'));
                                    const videos = Array.from(document.querySelectorAll('video'));
                                    const m = videos.find(v => v.duration > 0) || audios.find(a => a.duration > 0) || videos[0] || audios[0];
                                    if (m) {
                                        if (m.paused && m.currentTime < (m.duration - 1)) m.play().catch(() => {});
                                        return {
                                            currentTime: Math.round(m.currentTime),
                                            duration: Math.round(m.duration),
                                            isEnded: m.ended || (m.duration > 0 && m.currentTime >= (m.duration - 0.8))
                                        };
                                    }
                                    return { isEnded: true };
                                });

                                if (!status || status.isEnded) break;

                                const cur = status.currentTime || 0;
                                const total = status.duration || dur;
                                const pct = Math.round((cur / (total || 1)) * 100);
                                const curM = Math.floor(cur / 60).toString().padStart(2, '0');
                                const curS = (cur % 60).toString().padStart(2, '0');
                                const totM = Math.floor(total / 60).toString().padStart(2, '0');
                                const totS = (total % 60).toString().padStart(2, '0');

                                this.updateProgress(id, {
                                    current: cur,
                                    total: total,
                                    percent: pct,
                                    detail: `[${curM}:${curS} / ${totM}:${totS}] (${media.title})`,
                                    statusMessage: `Đang xem: ${media.title}`
                                });

                                if (cur % 10 === 0) {
                                    await this.captureLivePreview(id);
                                }
                            }
                            this.addLog(id, `✓ Hoàn thành: "${media.title}"`, "success");
                        } else {
                            this.addLog(id, "📄 Đang xem tài liệu đọc (giữ 15s để tích lũy giờ)...");
                            for (let s = 15; s > 0; s--) {
                                if (!worker.isRunning) break;
                                this.updateProgress(id, {
                                    current: 15 - s,
                                    total: 15,
                                    percent: Math.round(((15 - s) / 15) * 100),
                                    detail: `Ghi nhận tài liệu: ${s}s`,
                                    statusMessage: `Tài liệu đọc (${s}s)`
                                });
                                await new Promise(r => setTimeout(r, 1000));
                            }
                        }

                        if (!worker.isRunning) break;

                        // Chuyển bài kế tiếp
                        this.addLog(id, "Chuyển sang bài học tiếp theo...");
                        const hasNext = await app.nextLesson();
                        await this.captureLivePreview(id);

                        if (!hasNext) {
                            this.addLog(id, "🎉 Đã hoàn thành toàn bộ bài giảng trong môn học!", "success");
                            break;
                        }
                    }

                } else {
                    // CHẾ ĐỘ 2: ÔN LUYỆN TRẮC NGHIỆM
                    const count = worker.practiceCount || 20;
                    this.addLog(id, `Mở khóa học Phần 2 (Hệ thống báo hiệu đường bộ)...`);
                    await app.openCourse("Phần 2. Hệ thống báo hiệu đường bộ");
                    await this.captureLivePreview(id);

                    this.addLog(id, `Mở mục "Ôn luyện"...`);
                    await app.openTask("Ôn luyện");
                    await this.captureLivePreview(id);

                    this.addLog(id, `Bấm "Luyện tất cả"...`);
                    await app.startPracticeAll();
                    await this.captureLivePreview(id);

                    this.addLog(id, `Bắt đầu tự động giải ${count} câu hỏi trắc nghiệm...`);

                    // Giải câu hỏi với thanh tiến độ realtime
                    for (let q = 1; q <= count; q++) {
                        if (!worker.isRunning) break;

                        await app.handleHumanVerificationIfNeeded();

                        const qInfo = await app.safeEvaluate(() => {
                            const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
                            const labels = Array.from(document.querySelectorAll('label, .ant-radio-wrapper'));
                            const title = document.querySelector('.question-content, .question-title, h4, h3, .content')?.innerText?.trim() || "";
                            let qId = inputs.length > 0 && inputs[0].id ? inputs[0].id.split('-')[0] : null;
                            return { qId, title: title.slice(0, 70), optionsCount: labels.length || inputs.length };
                        });

                        if (!qInfo || (!qInfo.qId && qInfo.optionsCount === 0)) {
                            await app.handleModals();
                            continue;
                        }

                        let targetIndex = 0;
                        if (qInfo.qId && app.questionBank.has(qInfo.qId)) {
                            const bankItem = app.questionBank.get(qInfo.qId);
                            targetIndex = bankItem.correctIndices[0] || 0;
                            const ansText = bankItem.mc_answers?.[targetIndex]?.text || `Đáp án ${targetIndex + 1}`;
                            this.addLog(id, `[Câu ${q}/${count}] Đáp án đúng: "${ansText}"`);
                        } else {
                            this.addLog(id, `[Câu ${q}/${count}] Chọn đáp án 1`);
                        }

                        const pct = Math.round((q / count) * 100);
                        this.updateProgress(id, {
                            current: q,
                            total: count,
                            percent: pct,
                            detail: `Câu ${q}/${count} (${qInfo.title}...)`,
                            statusMessage: `Đang làm câu ${q}/${count}`
                        });

                        // Đọc đề và cuộn
                        await new Promise(r => setTimeout(r, 1000));
                        try { await app.page.mouse.wheel({ deltaY: 30 }); } catch (e) {}

                        // Click đáp án
                        let clicked = false;
                        if (qInfo.qId) {
                            clicked = await app.smoothMoveAndClick(`label[for="${qInfo.qId}-${targetIndex}"]`);
                        }
                        if (!clicked) {
                            try {
                                const labels = await app.page.$$('label, .ant-radio-wrapper');
                                if (labels[targetIndex]) await app.smoothMoveAndClick(labels[targetIndex]);
                            } catch (e) {}
                        }

                        // Giữ câu 3s
                        await new Promise(r => setTimeout(r, 3000));
                        await this.captureLivePreview(id);

                        // Bấm Tiếp
                        await app.safeEvaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button, .ant-btn, a'));
                            for (const b of btns) {
                                const txt = b.innerText.trim();
                                if (txt === "Tiếp" || txt === "Tiếp theo") { b.click(); return; }
                            }
                        });
                    }

                    if (worker.isRunning) {
                        this.addLog(id, "Bấm kết thúc luyện thi và nộp bài...", "info");
                        await app.finishPractice();
                        await this.captureLivePreview(id);
                        this.addLog(id, "🎉 Nộp bài hoàn tất!", "success");
                    }
                }

                worker.status = "COMPLETED";
                worker.statusMessage = "Đã hoàn thành phiên học!";
                this.updateProgress(id, { percent: 100, detail: "Hoàn tất 100%" });
                this.addLog(id, "Phiên làm việc đã hoàn thành 100%!", "success");

            } catch (err) {
                console.error(`[Worker ${id}] Error:`, err);
                worker.status = "ERROR";
                worker.statusMessage = `Lỗi: ${err.message}`;
                this.setAlert(id, {
                    type: "ERROR",
                    message: err.message,
                    time: new Date().toLocaleTimeString("vi-VN")
                });
                this.addLog(id, `❌ Lỗi: ${err.message}`, "error");
            } finally {
                worker.isRunning = false;
                this.notifyState();
            }
        })();
    }

    /**
     * Dừng một tài khoản
     */
    async stopWorker(id) {
        const worker = this.workers.get(id);
        if (!worker) return;

        worker.isRunning = false;
        worker.status = "IDLE";
        worker.statusMessage = "Đã dừng";
        this.addLog(id, "Đã gửi lệnh dừng tiến trình.", "warning");

        if (worker.browserInstance) {
            try {
                await worker.browserInstance.close();
            } catch (e) {}
            worker.browserInstance = null;
        }

        this.notifyState();
    }

    /**
     * Bắt đầu tất cả các tài khoản
     */
    async startAll() {
        for (const [id] of this.workers) {
            await this.startWorker(id);
            await new Promise(r => setTimeout(r, 2000)); // Giãn cách 2s để không mở đồng loạt quá tải
        }
    }

    /**
     * Dừng tất cả các tài khoản
     */
    async stopAll() {
        for (const [id] of this.workers) {
            await this.stopWorker(id);
        }
    }

    /**
     * Trả về toàn bộ danh sách tài khoản cho UI
     */
    getAllState() {
        const list = [];
        for (const [id, w] of this.workers) {
            list.push({
                id: w.id,
                username: w.username,
                password: w.password,
                mode: w.mode,
                course: w.course,
                practiceCount: w.practiceCount,
                headless: w.headless,
                status: w.status,
                statusMessage: w.statusMessage,
                alert: w.alert,
                progress: w.progress,
                logs: w.logs.slice(-20),
                lastScreenshot: w.lastScreenshot,
                isRunning: w.isRunning
            });
        }
        return list;
    }

    /**
     * Thông báo cập nhật toàn bộ trạng thái tới các client WebSocket
     */
    notifyState() {
        this.broadcast({
            event: "state_update",
            workers: this.getAllState()
        });
    }
}

module.exports = WorkerManager;
