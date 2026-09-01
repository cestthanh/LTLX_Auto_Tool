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
            course: options.course || "all_incomplete",
            practiceCourse: options.practiceCourse || "Phần 1",
            practiceCount: parseInt(options.practiceCount || 20, 10),
            headless: options.headless !== undefined ? options.headless : false,
            step: "SETUP", // SETUP -> SCANNED -> RUNNING -> COMPLETED
            status: "IDLE", // IDLE, SCANNING, STARTING, RUNNING, PAUSED_CAPTCHA, ERROR, COMPLETED
            statusMessage: "Vui lòng nhập tài khoản và bấm [🔍 Quét tiến độ]",
            alert: null,
            progress: {
                current: 0,
                total: 0,
                percent: 0,
                detail: "Chưa bắt đầu"
            },
            courseOverview: [], // [ { name, progress, hours, status } ]
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
        if (options.practiceCourse !== undefined) worker.practiceCourse = options.practiceCourse;
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
        if (worker.logs.length > 80) worker.logs.shift();

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
     * BƯỚC 1: QUÉT TIẾN ĐỘ TOÀN BỘ CÁC MÔN HỌC
     */
    async scanWorkerProgress(id) {
        const worker = this.workers.get(id);
        if (!worker || worker.isRunning) return;

        if (!worker.username || !worker.username.trim()) {
            this.addLog(id, "Vui lòng nhập số CCCD / Tài khoản học viên!", "error");
            return;
        }

        worker.status = "SCANNING";
        worker.statusMessage = "Đang kết nối để quét tiến độ các môn học...";
        worker.alert = null;
        this.notifyState();

        this.addLog(id, `🔍 Bắt đầu quét tiến độ cho tài khoản: ${worker.username}...`);

        let lastErr = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            let app = null;
            try {
                if (attempt > 1) {
                    this.addLog(id, `🔄 Đang thử lại lượt ${attempt} kết nối máy chủ...`, "warning");
                    await new Promise(r => setTimeout(r, 2000));
                }

                app = new DucthinhBrowser({
                    account: {
                        username: worker.username.trim(),
                        password: worker.password.trim()
                    },
                    browser: {
                        headless: "new" // Luôn quét ngầm nhanh chóng
                    }
                });

                await app.login(worker.username, worker.password);
                this.addLog(id, "Đăng nhập thành công! Đang lấy bảng tiến độ 6 môn học...", "info");

                const overview = await app.getCourseProgressOverview();
                if (!overview || overview.length === 0) {
                    throw new Error("Dữ liệu bảng môn học chưa sẵn sàng từ máy chủ (đang thử lại...)");
                }

                worker.courseOverview = overview;
                worker.step = "SCANNED";
                worker.status = "IDLE";
                worker.statusMessage = `Đã quét xong: Tìm thấy ${overview.length} môn học!`;

                this.addLog(id, `[✓] Quét hoàn tất! Đã cập nhật trạng thái chi tiết của tất cả các môn (${overview.length} môn).`, "success");
                await app.close();
                lastErr = null;
                break;

            } catch (err) {
                lastErr = err;
                if (app) try { await app.close(); } catch(e) {}
            }
        }

        if (lastErr) {
            console.error(`[Worker ${id} Scan Error]:`, lastErr);
            worker.status = "ERROR";
            worker.statusMessage = `Lỗi quét tiến độ: ${lastErr.message}`;
            this.setAlert(id, {
                type: "ERROR",
                message: `Quét thất bại: ${lastErr.message}`,
                time: new Date().toLocaleTimeString("vi-VN")
            });
            this.addLog(id, `❌ Lỗi quét: ${lastErr.message}`, "error");
        }
        this.notifyState();
    }

    /**
     * BƯỚC 2: BẮT ĐẦU CHẠY HỌC / ÔN LUYỆN
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
        worker.step = "RUNNING";
        worker.statusMessage = "Đang khởi chạy trình duyệt...";
        worker.alert = null;
        worker.progress = { current: 0, total: 0, percent: 0, detail: "Đang kết nối..." };
        this.notifyState();

        this.addLog(id, `🚀 Bắt đầu phiên làm việc [Tài khoản: ${worker.username} | Chế độ: ${worker.mode.toUpperCase()}]`);

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

                // Hook kiểm tra Captcha
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

                // ĐĂNG NHẬP
                this.addLog(id, "Đang đăng nhập vào hệ thống ducthinh.huelms.com...");
                await app.login(worker.username, worker.password);
                this.addLog(id, "Đăng nhập thành công!", "success");
                await this.captureLivePreview(id);

                // Cập nhật lại bảng tiến độ mới nhất
                const overview = await app.getCourseProgressOverview();
                if (overview.length > 0) {
                    worker.courseOverview = overview;
                    this.notifyState();
                }

                worker.status = "RUNNING";
                this.notifyState();

                if (worker.mode === "video") {
                    // === CHẾ ĐỘ 1: HỌC BÀI GIẢNG ĐIỆN TỬ & VIDEO ===
                    let coursesToLearn = [];

                    if (worker.course === "all_incomplete" || !worker.course) {
                        coursesToLearn = [
                            "Kỹ thuật lái xe",
                            "Cấu tạo",
                            "Phần 1",
                            "Phần 2",
                            "Phần 3",
                            "Đạo đức"
                        ];
                        this.addLog(id, "Chế độ [Tự động học tất cả môn]: Sẽ lần lượt quét và học toàn bộ các môn!", "info");
                    } else {
                        coursesToLearn = [worker.course];
                    }

                    for (const targetCourse of coursesToLearn) {
                        if (!worker.isRunning) break;

                        this.addLog(id, `\n=== MỞ KHÓA HỌC: "${targetCourse}" ===`);
                        try {
                            try {
                                await app.page.goto(`${config.baseUrl}/student/ep`, { waitUntil: "domcontentloaded", timeout: 15000 });
                            } catch (e) {}
                            await new Promise(r => setTimeout(r, 2500));

                            await app.openCourse(targetCourse);
                            await this.captureLivePreview(id);

                            this.addLog(id, `Mở mục "Bài giảng điện tử" trong môn ${targetCourse}...`);
                            await app.openTask("Bài giảng điện tử");
                            await this.captureLivePreview(id);

                            this.addLog(id, "Quét danh mục và tự động học các bài/video CHƯA HOÀN THÀNH...");
                            await app.jumpToFirstUncompletedLesson();

                            for (let lessonIdx = 1; lessonIdx <= 60; lessonIdx++) {
                                if (!worker.isRunning) break;

                                const media = await app.playCurrentMedia(1.25, true);
                                await this.captureLivePreview(id);

                                if (media && media.hasMedia) {
                                    const dur = media.duration || 120;
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
                                            statusMessage: `[${targetCourse}] Đang học: ${media.title}`
                                        });

                                        if (cur % 12 === 0) {
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
                                            statusMessage: `[${targetCourse}] Tài liệu đọc (${s}s)`
                                        });
                                        await new Promise(r => setTimeout(r, 1000));
                                    }
                                }

                                if (!worker.isRunning) break;

                                const hasNext = await app.nextLesson();
                                await this.captureLivePreview(id);

                                if (!hasNext) {
                                    this.addLog(id, `🎉 Đã hoàn thành toàn bộ bài giảng trong môn: "${targetCourse}"!`, "success");
                                    break;
                                }
                            }
                        } catch (courseErr) {
                            this.addLog(id, `Lưu ý môn ${targetCourse}: ${courseErr.message}`, "warning");
                        }
                    }

                } else {
                    // === CHẾ ĐỘ 2: ÔN LUYỆN TRẮC NGHIỆM ===
                    const practiceCourse = worker.practiceCourse || "Phần 1";
                    const count = worker.practiceCount || 20;

                    this.addLog(id, `Mở khóa học: "${practiceCourse}" để ôn luyện...`);
                    await app.openCourse(practiceCourse);
                    await this.captureLivePreview(id);

                    this.addLog(id, `Mở mục "Ôn luyện"...`);
                    await app.openTask("Ôn luyện");
                    await this.captureLivePreview(id);

                    this.addLog(id, `Bấm "Luyện tất cả"...`);
                    await app.startPracticeAll();
                    await this.captureLivePreview(id);

                    this.addLog(id, `Bắt đầu tự động giải ${count} câu hỏi trắc nghiệm trong ${practiceCourse}...`);

                    await app.solveAllQuestions({
                        maxQuestions: count,
                        minDelayPerQuestion: 3,
                        maxDelayPerQuestion: 6,
                        isRunningCheck: () => worker.isRunning,
                        onLog: (msg, type) => {
                            this.addLog(id, msg, type || "info");
                        },
                        onProgress: (prog) => {
                            this.updateProgress(id, {
                                current: prog.current,
                                total: prog.total,
                                percent: prog.percent,
                                detail: prog.detail,
                                statusMessage: `[${practiceCourse}] ${prog.statusMessage}`
                            });
                            this.captureLivePreview(id);
                        }
                    });

                    if (worker.isRunning) {
                        this.addLog(id, "Bấm kết thúc luyện thi và nộp bài...", "info");
                        await new Promise(r => setTimeout(r, 2000));
                        await app.finishPractice();
                        await this.captureLivePreview(id);
                        this.addLog(id, "🎉 Nộp bài ôn luyện hoàn tất thành công!", "success");

                        // Tự động kiểm tra và thực hiện tiếp bài [Kiểm tra kết thúc môn] (đặc biệt là Phần 3 hoặc môn có bài kiểm tra)
                        try {
                            this.addLog(id, "🔍 Đang tự động kiểm tra bài [Kiểm tra kết thúc môn]...", "info");
                            await new Promise(r => setTimeout(r, 2500));
                            await app.autoConfirmDialogs();

                            // Thử tìm mục Kiểm tra trong môn
                            await app.openTask("Kiểm tra");
                            await this.captureLivePreview(id);

                            this.addLog(id, "🚀 Bắt đầu tự động làm bài Kiểm tra kết thúc môn để lấy điểm ĐẠT 100%...", "info");
                            await app.solveExamFlow({
                                isRunningCheck: () => worker.isRunning,
                                onLog: (msg, type) => this.addLog(id, msg, type || "info"),
                                onProgress: (prog) => {
                                    this.updateProgress(id, {
                                        current: prog.current,
                                        total: prog.total,
                                        percent: prog.percent,
                                        detail: `[Kiểm tra] ${prog.detail}`,
                                        statusMessage: `[${practiceCourse}] Đang thi: câu ${prog.current}/${prog.total}`
                                    });
                                    this.captureLivePreview(id);
                                }
                            });
                            await this.captureLivePreview(id);
                            this.addLog(id, "🏆 ĐÃ HOÀN TẤT VÀ ĐẠT ĐIỂM BÀI KIỂM TRA KẾT THÚC MÔN!", "success");
                        } catch (examErr) {
                            // Nếu môn không có bài kiểm tra riêng (như Phần 1, 2)
                            console.log(`[Worker ${id}] Info: Môn không có bài kiểm tra riêng hoặc đã hoàn thành (${examErr.message}).`);
                        }
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
            await new Promise(r => setTimeout(r, 2500));
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
                practiceCourse: w.practiceCourse,
                practiceCount: w.practiceCount,
                headless: w.headless,
                step: w.step || "SETUP",
                status: w.status,
                statusMessage: w.statusMessage,
                alert: w.alert,
                progress: w.progress,
                courseOverview: w.courseOverview || [],
                logs: w.logs.slice(-25),
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
