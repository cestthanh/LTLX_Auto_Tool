const puppeteer = require("puppeteer");
const config = require("./config");

class DucthinhBrowser {
    constructor(options = {}) {
        this.config = {
            ...config,
            ...options,
            account: { ...config.account, ...(options.account || {}) },
            browser: { ...config.browser, ...(options.browser || {}) },
            practice: { ...config.practice, ...(options.practice || {}) },
            video: { ...config.video, ...(options.video || {}) }
        };
        this.browser = null;
        this.page = null;
        this.questionBank = new Map(); // Bộ nhớ lưu trữ đáp án đúng 100%
    }

    /**
     * Thực thi evaluate an toàn, tự động thử lại nếu gặp lỗi detached Frame hoặc reload DOM
     */
    async safeEvaluate(fn, ...args) {
        for (let retry = 0; retry < 5; retry++) {
            try {
                if (!this.page || this.page.isClosed()) return null;
                return await this.page.evaluate(fn, ...args);
            } catch (err) {
                const msg = err.message || "";
                if (msg.includes("detached Frame") || msg.includes("Execution context") || msg.includes("Target closed")) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                return null;
            }
        }
        return null;
    }

    /**
     * Khởi chạy trình duyệt và tiêm cơ chế Always-Active + Bypass DevTools
     */
    async launch() {
        console.log("[*] Khởi chạy trình duyệt Chrome trực quan (Hỗ trợ chạy ngầm / Chuyển màn hình)...");
        this.browser = await puppeteer.launch({
            headless: this.config.browser.headless,
            defaultViewport: this.config.browser.viewport,
            args: [
                ...this.config.browser.args,
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding"
            ]
        });

        const pages = await this.browser.pages();
        this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
        await this.page.setUserAgent(this.config.browser.userAgent);

        // 1. Vô hiệu hóa bẫy devtools + Khóa cứng trạng thái Always-Visible / Always-Focused
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });
            console.table = function() {};
            console.clear = function() {};
            const origFunction = window.Function;
            window.Function = function(...args) {
                if (args.length > 0 && typeof args[args.length - 1] === "string" && args[args.length - 1].includes("debugger")) {
                    return function() {};
                }
                return origFunction.apply(this, args);
            };
            window.Function.prototype = origFunction.prototype;

            // 🛡️ ALWAYS-VISIBLE & ALWAYS-FOCUSED (Cho phép chuyển tab / tắt màn hình không bị cảnh báo)
            Object.defineProperty(document, "visibilityState", { get: () => "visible" });
            Object.defineProperty(document, "hidden", { get: () => false });
            Object.defineProperty(document, "webkitVisibilityState", { get: () => "visible" });
            Object.defineProperty(document, "webkitHidden", { get: () => false });
            document.hasFocus = () => true;

            // Chặn các sự kiện báo chuyển tab / mất tiêu điểm
            window.addEventListener("visibilitychange", (e) => e.stopImmediatePropagation(), true);
            document.addEventListener("visibilitychange", (e) => e.stopImmediatePropagation(), true);
            window.addEventListener("webkitvisibilitychange", (e) => e.stopImmediatePropagation(), true);
            window.addEventListener("blur", (e) => e.stopImmediatePropagation(), true);
            window.addEventListener("focusout", (e) => e.stopImmediatePropagation(), true);
        });

        // 2. Tự động bắt gói tin nạp ngân hàng câu hỏi để lấy đáp án đúng 100%
        this.page.on("response", async (res) => {
            const url = res.url();
            if (url.includes("get-question-bank-status") || url.includes("get-practice-questions") || url.includes("get_exercise_detail")) {
                try {
                    const json = await res.json();
                    const qList = json?.result?.questions?.result || json?.result?.questions || [];
                    if (Array.isArray(qList) && qList.length > 0) {
                        for (const q of qList) {
                            const correctIndices = [];
                            if (Array.isArray(q.mc_answers)) {
                                q.mc_answers.forEach((ans, idx) => {
                                    if (ans.is_answer === 1) correctIndices.push(idx);
                                });
                            }
                            if (correctIndices.length === 0 && Array.isArray(q.answers)) {
                                correctIndices.push(...q.answers);
                            }
                            this.questionBank.set(q.id, {
                                id: q.id,
                                content: q.content,
                                correctIndices: correctIndices.length > 0 ? correctIndices : [0],
                                mc_answers: q.mc_answers || []
                            });
                        }
                        console.log(`[✓] ĐÃ NẠP TỰ ĐỘNG ${this.questionBank.size} CÂU HỎI VÀ ĐÁP ÁN CHUẨN 100% VÀO BỘ NHỚ!`);
                    }
                } catch (e) {}
            }
        });

        return this.page;
    }

    /**
     * Di chuyển chuột mượt mà tới vị trí mục tiêu và nhấn click thật
     */
    async smoothMoveAndClick(selectorOrHandle) {
        try {
            let box = null;
            if (typeof selectorOrHandle === "string") {
                const el = await this.page.$(selectorOrHandle);
                if (el) box = await el.boundingBox();
            } else if (selectorOrHandle && selectorOrHandle.boundingBox) {
                box = await selectorOrHandle.boundingBox();
            }

            if (box) {
                const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
                const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);
                const steps = 12 + Math.floor(Math.random() * 10);
                await this.page.mouse.move(targetX, targetY, { steps });
                await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 150)));
                await this.page.mouse.click(targetX, targetY);
                return true;
            }
        } catch (e) {}
        return false;
    }

    /**
     * Kiểm tra xem trên màn hình có xuất hiện Captcha / Hộp thoại xác minh người thật không
     */
    async checkForHumanVerification() {
        return await this.safeEvaluate(() => {
            const captchaIframes = document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="captcha"], iframe[src*="hcaptcha"], iframe[src*="geetest"]');
            if (captchaIframes.length > 0) {
                for (const f of captchaIframes) {
                    const rect = f.getBoundingClientRect();
                    if (rect.width > 20 && rect.height > 20 && rect.top < window.innerHeight && rect.bottom > 0) {
                        return { isVerification: true, type: "CAPTCHA_IFRAME", message: "Phát hiện Google reCAPTCHA / Captcha trên màn hình" };
                    }
                }
            }

            const modals = Array.from(document.querySelectorAll('.ant-modal, .modal, .ant-modal-content, [role="dialog"]'));
            for (const modal of modals) {
                const text = modal.innerText || "";
                if (text.includes("xác nhận người thật") || text.includes("Tôi không phải người máy") || 
                    text.includes("mã bảo vệ") || text.includes("mã xác thực") || 
                    text.includes("hoạt động bất thường") || text.includes("Tài khoản tạm thời bị khóa") ||
                    text.includes("Xác minh") || text.includes("Verification")) {
                    return { isVerification: true, type: "MODAL_VERIFICATION", message: text.slice(0, 80).replace(/\n/g, ' ') };
                }
            }

            return { isVerification: false };
        }) || { isVerification: false };
    }

    /**
     * Tự động tạm dừng khi có Captcha/Xác minh và TỰ ĐỘNG TIẾP TỤC khi người dùng bấm xong
     */
    async handleHumanVerificationIfNeeded() {
        const check = await this.checkForHumanVerification();
        if (check && check.isVerification) {
            process.stdout.write('\x07');
            console.log("\n================================================================================");
            console.log(`🔔🔔🔔 [CẦN BẠN XÁC NHẬN] ${check.message}`);
            console.log(`👉 Vui lòng thao tác bấm xác nhận trực tiếp trên cửa sổ Chrome.`);
            console.log(`⏳ Bot đang tạm dừng và sẽ TỰ ĐỘNG TIẾP TỤC NGAY khi bạn hoàn tất...`);
            console.log("================================================================================\n");

            while (true) {
                await new Promise(r => setTimeout(r, 1000));
                const currentCheck = await this.checkForHumanVerification();
                if (!currentCheck || !currentCheck.isVerification) {
                    console.log("\n[✓] XÁC NHẬN THÀNH CÔNG! Đã phát hiện hộp thoại đóng lại.");
                    console.log("[*] Đang tiếp tục tự động...\n");
                    await new Promise(r => setTimeout(r, 1500));
                    break;
                }
            }
        }
    }

    /**
     * Đăng nhập vào hệ thống
     */
    async login(username = this.config.account.username, password = this.config.account.password) {
        if (!this.page) await this.launch();

        const loginUrl = `${this.config.baseUrl}/user/login`;
        console.log(`[*] Đang truy cập ${loginUrl}...`);
        await this.page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

        console.log(`[*] Nhập tài khoản: ${username}`);
        await this.page.waitForSelector('input[name="lname"], input[type="text"]', { timeout: 20000 });
        
        const userInput = await this.page.$('input[name="lname"], input[type="text"]');
        await userInput.type(username, { delay: 40 });

        const passInput = await this.page.$('input[type="password"]');
        await passInput.type(password, { delay: 40 });

        console.log("[*] Bấm Đăng nhập...");
        const btn = await this.page.$('button.btn-login, button[type="submit"]');
        await btn.click();

        await new Promise(r => setTimeout(r, 4000));

        const currentUrl = this.page.url();
        if (currentUrl.includes("/user/login")) {
            throw new Error("Đăng nhập không thành công hoặc bị trả về trang login.");
        }

        console.log(`[✓] ĐÃ ĐĂNG NHẬP THÀNH CÔNG!`);
        console.log(`[*] URL Dashboard: ${currentUrl}`);
        return currentUrl;
    }

    /**
     * Nhấp vào môn học theo tên (Ví dụ: "Phần 2. Hệ thống báo hiệu đường bộ" hoặc "Kỹ thuật lái xe")
     */
    async openCourse(keyword = "Phần 2. Hệ thống báo hiệu đường bộ") {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");
        
        console.log(`[*] Đang tìm và nhấp vào khóa học: "${keyword}"...`);
        await this.page.waitForSelector('a, tr, td', { timeout: 20000 });

        const clicked = await this.safeEvaluate((kw) => {
            const links = Array.from(document.querySelectorAll('a'));
            for (const a of links) {
                if (a.innerText && a.innerText.toLowerCase().includes(kw.toLowerCase())) {
                    a.click();
                    return { success: true, text: a.innerText.trim(), href: a.href };
                }
            }
            return { success: false };
        }, keyword);

        if (!clicked || !clicked.success) {
            console.log(`[!] Không tìm thấy link chứa từ khóa: "${keyword}", thử mở môn học đầu tiên...`);
            await this.safeEvaluate(() => {
                const firstLink = document.querySelector('tr a, .course-item a');
                if (firstLink) firstLink.click();
            });
        } else {
            console.log(`[✓] Đã nhấp vào môn học: "${clicked.text}"`);
        }

        await new Promise(r => setTimeout(r, 3000));
        console.log(`[*] URL trang môn học: ${this.page.url()}`);
        return this.page.url();
    }

    /**
     * Nhấp vào nhiệm vụ trong bảng tổng quan môn học (Ví dụ: "Ôn luyện" hoặc "Bài giảng điện tử")
     */
    async openTask(taskKeyword = "Ôn luyện") {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");

        console.log(`[*] Đang tìm và nhấp vào mục: "${taskKeyword}"...`);
        await this.page.waitForSelector('table, tr, a, button', { timeout: 20000 });

        const clicked = await this.safeEvaluate((kw) => {
            const rows = Array.from(document.querySelectorAll('tr'));
            for (const row of rows) {
                if (row.innerText && row.innerText.toLowerCase().includes(kw.toLowerCase())) {
                    const link = row.querySelector('a');
                    if (link) {
                        link.click();
                        return { success: true, text: link.innerText.trim(), href: link.href };
                    }
                    const btn = row.querySelector('button, div[role="button"]');
                    if (btn) {
                        btn.click();
                        return { success: true, text: btn.innerText.trim(), href: null };
                    }
                }
            }

            const links = Array.from(document.querySelectorAll('a, button'));
            for (const l of links) {
                if (l.innerText && l.innerText.toLowerCase().includes(kw.toLowerCase())) {
                    l.click();
                    return { success: true, text: l.innerText.trim() };
                }
            }
            return { success: false };
        }, taskKeyword);

        if (!clicked || !clicked.success) {
            throw new Error(`Không tìm thấy mục: "${taskKeyword}" trên bảng chi tiết môn học.`);
        }

        console.log(`[✓] Đã nhấp vào mục: "${taskKeyword}"`);
        await new Promise(r => setTimeout(r, 4000));

        await this.handleModals();
        return this.page.url();
    }

    /**
     * Bấm nút "Luyện tất cả"
     */
    async startPracticeAll() {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");

        console.log("[*] Đang tìm và bấm nút [Luyện tất cả]...");
        await new Promise(r => setTimeout(r, 2000));

        const clicked = await this.safeEvaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
            for (const b of buttons) {
                if (b.innerText && b.innerText.includes("Luyện tất cả")) {
                    b.click();
                    return { success: true, text: b.innerText.trim() };
                }
            }
            return { success: false };
        });

        if (!clicked || !clicked.success) {
            throw new Error("Không tìm thấy nút [Luyện tất cả] trên màn hình.");
        }

        console.log(`[✓] Đã bấm: "${clicked.text}"`);
        await new Promise(r => setTimeout(r, 4000));
    }

    /**
     * Tự động giải toàn bộ câu hỏi trong đề ôn luyện với MÔ PHỎNG HÀNH VI & SMART RESUME
     */
    async solveAllQuestions(options = {}) {
        const minDelay = options.minDelayPerQuestion || this.config.practice.minDelayPerQuestion || 3;
        const maxDelay = options.maxDelayPerQuestion || this.config.practice.maxDelayPerQuestion || 5;
        const maxQuestions = options.maxQuestions || this.config.practice.maxQuestions || 185;

        console.log(`\n================================================================================`);
        console.log(`    BẮT ĐẦU TỰ ĐỘNG GIẢI ${maxQuestions} CÂU HỎI (TỰ ĐỘNG TẠM DỪNG / TIẾP TỤC)     `);
        console.log(`    Thời gian giữ mỗi câu tối đa: ${maxDelay}s (siêu tốc & tự nhiên)`);
        console.log(`================================================================================\n`);

        let completedCount = 0;

        for (let i = 1; i <= maxQuestions; i++) {
            await new Promise(r => setTimeout(r, 600));

            // 1. Kiểm tra và tạm dừng nếu có Captcha / Xác minh người thật
            await this.handleHumanVerificationIfNeeded();

            // 2. Kiểm tra nếu bài luyện thi đã kết thúc
            const isFinished = await this.safeEvaluate(() => {
                const text = document.body.innerText;
                return text.includes("Kết quả luyện tập") || text.includes("Hoàn thành bài luyện") || text.includes("Điểm số của bạn");
            });

            if (isFinished) {
                console.log("\n[🎉] ĐÃ HOÀN THÀNH TOÀN BỘ BÀI LUYỆN TẬP!");
                break;
            }

            // 3. Lấy thông tin câu hỏi và ID câu hỏi từ giao diện
            const qInfo = await this.safeEvaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
                const labels = Array.from(document.querySelectorAll('label, .ant-radio-wrapper'));
                const title = document.querySelector('.question-content, .question-title, h4, h3, .content')?.innerText?.trim() || "";

                let qId = null;
                if (inputs.length > 0 && inputs[0].id) {
                    qId = inputs[0].id.split('-')[0];
                }

                return {
                    qId,
                    title: title.slice(0, 80),
                    optionsCount: labels.length || inputs.length
                };
            });

            if (!qInfo || (!qInfo.qId && qInfo.optionsCount === 0)) {
                await this.handleModals();
                continue;
            }

            completedCount++;

            // 4. Tìm đáp án đúng trong ngân hàng câu hỏi
            let targetIndex = 0;
            if (qInfo.qId && this.questionBank.has(qInfo.qId)) {
                const bankItem = this.questionBank.get(qInfo.qId);
                targetIndex = bankItem.correctIndices[0] || 0;
                const answerText = bankItem.mc_answers?.[targetIndex]?.text || `Phương án ${targetIndex + 1}`;
                console.log(`[Câu ${completedCount}/${maxQuestions}] 🎯 Đáp án đúng: "${answerText}"\n    Câu hỏi: "${qInfo.title}..."`);
            } else {
                console.log(`[Câu ${completedCount}/${maxQuestions}] ℹ️ Câu hỏi: "${qInfo.title}..." (Chọn phương án 1)`);
            }

            // 5. Mô phỏng đọc đề nhanh (1s) + cuộn nhẹ trang
            const readTime = Math.max(1, this.config.practice.readTimePerQuestion || 1);
            process.stdout.write(`    📖 Đang đọc đề (${readTime}s) `);
            for (let r = 0; r < readTime; r++) {
                process.stdout.write(".");
                await new Promise(res => setTimeout(res, 1000));
            }
            process.stdout.write("\n");

            try {
                await this.page.mouse.wheel({ deltaY: 30 + Math.floor(Math.random() * 30) });
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {}

            await this.handleHumanVerificationIfNeeded();

            // 6. Di chuột thật và bấm chọn đáp án
            let clickSuccess = false;
            if (qInfo.qId) {
                const targetSelector = `label[for="${qInfo.qId}-${targetIndex}"]`;
                clickSuccess = await this.smoothMoveAndClick(targetSelector);
            }
            if (!clickSuccess) {
                try {
                    const labels = await this.page.$$('label, .ant-radio-wrapper');
                    if (labels[targetIndex]) {
                        await this.smoothMoveAndClick(labels[targetIndex]);
                    } else if (labels[0]) {
                        await this.smoothMoveAndClick(labels[0]);
                    }
                } catch (e) {}
            }

            // 7. Tính toán thời gian giữ câu ngẫu nhiên (tổng thời gian 3s - 5s)
            const remainingDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay - readTime;
            const actualDelay = Math.max(1, remainingDelay);

            process.stdout.write(`    ⏳ Giữ câu ${actualDelay}s: `);
            for (let s = actualDelay; s > 0; s--) {
                process.stdout.write(`${s}s `);
                await new Promise(res => setTimeout(res, 1000));
                
                if (s % 2 === 0) {
                    await this.handleHumanVerificationIfNeeded();
                }
            }
            process.stdout.write(` -> Chuyển câu!\n\n`);

            // 8. Di chuyển chuột tới nút [Tiếp] và click
            try {
                const nextBtn = await this.page.evaluateHandle(() => {
                    const buttons = Array.from(document.querySelectorAll('button, .ant-btn, a'));
                    return buttons.find(b => {
                        const txt = b.innerText.trim();
                        return txt === "Tiếp" || txt === "Tiếp theo";
                    }) || null;
                });

                if (nextBtn && nextBtn.asElement()) {
                    await this.smoothMoveAndClick(nextBtn.asElement());
                } else {
                    await this.safeEvaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button, .ant-btn, a'));
                        for (const b of buttons) {
                            const txt = b.innerText.trim();
                            if (txt === "Tiếp" || txt === "Tiếp theo") {
                                b.click();
                                return;
                            }
                        }
                    });
                }
            } catch (e) {}
        }

        console.log(`\n================================================================================`);
        console.log(`[✓] ĐÃ HOÀN THÀNH TỰ ĐỘNG GIẢI ${completedCount} CÂU HỎI!`);
        console.log(`================================================================================\n`);
    }

    /**
     * Tự động bấm "Kết thúc luyện thi" và xác nhận nộp bài
     */
    async finishPractice() {
        if (!this.page) return;

        console.log("\n[*] Đang tìm và bấm nút [Kết thúc luyện thi] để nộp bài...");
        await new Promise(r => setTimeout(r, 1500));

        const finishBtn = await this.page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button, .ant-btn, a, div[role="button"]'));
            return buttons.find(b => {
                const txt = b.innerText.trim();
                return txt.includes("Kết thúc luyện thi") || txt === "Kết thúc" || txt.includes("Nộp bài") || txt.includes("Hoàn thành bài");
            }) || null;
        });

        if (finishBtn && finishBtn.asElement()) {
            await this.smoothMoveAndClick(finishBtn.asElement());
            console.log("[✓] Đã bấm nút: [Kết thúc luyện thi]");
        } else {
            const clicked = await this.safeEvaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, .ant-btn, a, div[role="button"]'));
                for (const b of buttons) {
                    const txt = b.innerText.trim();
                    if (txt.includes("Kết thúc luyện thi") || txt === "Kết thúc" || txt.includes("Nộp bài") || txt.includes("Hoàn thành bài")) {
                        b.click();
                        return { success: true, text: txt };
                    }
                }
                return { success: false };
            });
            if (clicked && clicked.success) {
                console.log(`[✓] Đã bấm: "${clicked.text}"`);
            } else {
                console.log("[!] Không tìm thấy nút Kết thúc luyện thi (có thể bài đã kết thúc trước đó).");
            }
        }

        await new Promise(r => setTimeout(r, 2000));

        // Xác nhận popup nộp bài nếu có ("Xác nhận", "Đồng ý", "Nộp bài")
        await this.safeEvaluate(() => {
            const modals = Array.from(document.querySelectorAll('.ant-modal, .modal, [role="dialog"], .ant-modal-content'));
            for (const m of modals) {
                const btns = Array.from(m.querySelectorAll('button, .ant-btn, div.btn'));
                for (const b of btns) {
                    const txt = b.innerText.trim();
                    if (txt === "Đồng ý" || txt === "Xác nhận" || txt === "Nộp bài" || txt.includes("Đồng ý")) {
                        b.click();
                        return;
                    }
                }
            }
        });

        await new Promise(r => setTimeout(r, 3000));

        const resultSummary = await this.safeEvaluate(() => {
            const summaryEl = document.querySelector('.result-summary, .exam-result, .practice-result, .ant-card, .result');
            return {
                title: document.title,
                summary: summaryEl ? summaryEl.innerText.trim().slice(0, 300) : ""
            };
        });

        console.log("\n================================================================================");
        console.log("🎉 ĐÃ NỘP BÀI THÀNH CÔNG VÀ KẾT THÚC BÀI LUYỆN THI!");
        if (resultSummary && resultSummary.summary) {
            console.log(`\nKết quả chi tiết:\n${resultSummary.summary}\n`);
        }
        console.log("================================================================================\n");
    }

    // =========================================================================
    //   MODULE TỰ ĐỘNG HỌC BÀI GIẢNG ĐIỆN TỬ & VIDEO (VIDEO/AUDIO AUTO-PLAYER)
    // =========================================================================

    /**
     * Tự động phát Media (Audio hoặc Video), thiết lập tốc độ và tắt tiếng
     */
    async playCurrentMedia(playbackRate = this.config.video.playbackRate || 1.25, muteAudio = true) {
        if (!this.page) return null;

        await this.handleModals();

        const mediaInfo = await this.safeEvaluate((rate, mute) => {
            const audios = Array.from(document.querySelectorAll('audio'));
            const videos = Array.from(document.querySelectorAll('video'));
            const activeMedia = videos.find(v => v.duration > 0) || audios.find(a => a.duration > 0) || videos[0] || audios[0];

            let title = document.querySelector('.lesson-title, .header-title, h1, h2, h3, .current-item')?.innerText?.trim() || document.title;

            if (activeMedia) {
                activeMedia.muted = !!mute;
                try { activeMedia.playbackRate = rate; } catch (e) {}
                if (activeMedia.paused) {
                    activeMedia.play().catch(() => {});
                }

                return {
                    hasMedia: true,
                    type: activeMedia.tagName.toLowerCase(),
                    duration: Math.round(activeMedia.duration) || 0,
                    currentTime: Math.round(activeMedia.currentTime) || 0,
                    paused: activeMedia.paused,
                    title
                };
            }

            const playBtn = document.querySelector('.media-audio__play-button, .play-btn, .vjs-big-play-button, .vjs-play-control');
            if (playBtn) {
                playBtn.click();
                return { hasMedia: true, type: "button_click", duration: 60, currentTime: 0, paused: false, title };
            }

            return { hasMedia: false, title };
        }, playbackRate, muteAudio);

        return mediaInfo;
    }

    /**
     * Theo dõi tiến độ phát bài giảng/video cho đến khi hoàn thành (Bảo vệ chống detached Frame)
     */
    async waitForMediaCompletion() {
        if (!this.page) return;

        let lastCurrentTime = -1;
        let stuckCount = 0;
        let nullStatusCount = 0;

        while (true) {
            await new Promise(r => setTimeout(r, 2000));

            // 1. Kiểm tra và tạm dừng nếu có Captcha/xác minh người thật
            await this.handleHumanVerificationIfNeeded();

            // 2. Lấy trạng thái phát an toàn qua safeEvaluate
            const status = await this.safeEvaluate(() => {
                const audios = Array.from(document.querySelectorAll('audio'));
                const videos = Array.from(document.querySelectorAll('video'));
                const media = videos.find(v => v.duration > 0) || audios.find(a => a.duration > 0) || videos[0] || audios[0];

                if (media) {
                    if (media.paused && media.currentTime < (media.duration - 1)) {
                        media.play().catch(() => {});
                    }

                    const isEnded = media.ended || (media.duration > 0 && media.currentTime >= (media.duration - 0.8));
                    return {
                        exists: true,
                        currentTime: Math.round(media.currentTime),
                        duration: Math.round(media.duration),
                        isEnded
                    };
                }

                return { exists: false, isEnded: true };
            });

            // Nếu frame đang reload/transition, chờ 1 nhịp thay vì ngắt luồng
            if (!status) {
                nullStatusCount++;
                if (nullStatusCount >= 3) break;
                continue;
            }
            nullStatusCount = 0;

            if (!status.exists || status.isEnded) {
                console.log("\n[✓] Đã phát hoàn thành bài học hiện tại!");
                break;
            }

            // In tiến độ phát
            const curMin = Math.floor(status.currentTime / 60).toString().padStart(2, '0');
            const curSec = (status.currentTime % 60).toString().padStart(2, '0');
            const durMin = Math.floor(status.duration / 60).toString().padStart(2, '0');
            const durSec = (status.duration % 60).toString().padStart(2, '0');
            process.stdout.write(`\r    ▶ Đang học: [${curMin}:${curSec} / ${durMin}:${durSec}] (${this.config.video.playbackRate || 1.25}x)   `);

            // Kiểm tra chống kẹt
            if (status.currentTime === lastCurrentTime) {
                stuckCount++;
                if (stuckCount >= 10) {
                    console.log("\n[!] Nhận thấy tiến độ không đổi, tự động kích hoạt Play lại...");
                    await this.playCurrentMedia();
                    stuckCount = 0;
                }
            } else {
                lastCurrentTime = status.currentTime;
                stuckCount = 0;
            }
        }
    }

    /**
     * Bấm chuyển sang bài học / video kế tiếp
     */
    async nextLesson() {
        if (!this.page) return false;

        console.log("\n[*] Chuyển sang bài học tiếp theo...");
        await new Promise(r => setTimeout(r, 1500));

        const moved = await this.safeEvaluate(() => {
            const nextBtn = document.querySelector('.footer-navigator__item-next, [class*="item-next"], .btn-next');
            if (nextBtn) {
                nextBtn.click();
                return { success: true, text: nextBtn.innerText.trim().replace(/\n/g, ' - ') };
            }

            const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
            for (const b of buttons) {
                const txt = b.innerText.trim();
                if (txt === "Tiếp theo" || txt.includes("Tiếp theo") || txt.includes("Bài tiếp") || txt === "Bài sau") {
                    b.click();
                    return { success: true, text: txt };
                }
            }
            return { success: false };
        });

        if (moved && moved.success) {
            console.log(`[✓] Đã bấm: "${moved.text}"`);
            await new Promise(r => setTimeout(r, 4000));
            await this.handleModals();
            return true;
        }

        console.log("[!] Không tìm thấy nút [Tiếp theo], có thể đã hoàn thành toàn bộ khóa học.");
        return false;
    }

    /**
     * Tự động tìm và nhấp vào bài học / video CHƯA HỌC đầu tiên trên danh mục
     */
    async jumpToFirstUncompletedLesson() {
        if (!this.page) return;

        console.log("[*] Đang quét danh mục bài học để tìm bài CHƯA HỌC (bỏ qua các bài đã học)...");
        await new Promise(r => setTimeout(r, 4000));
        await this.handleModals();

        const result = await this.safeEvaluate(() => {
            // Lấy tất cả các mục bài học trong sidebar của LotusLMS
            const navItems = Array.from(document.querySelectorAll('.learn-nav-item, tr.row-item'));
            
            for (let i = 0; i < navItems.length; i++) {
                const item = navItems[i];
                const textEl = item.querySelector('.learn-nav-item__title, .title') || item;
                const text = textEl.innerText ? textEl.innerText.trim().replace(/\n/g, ' - ') : "";
                
                // Kiểm tra trạng thái hoàn thành: class chứa "--finish" hoặc title="Bạn đã hoàn thành phần này"
                const statusEl = item.querySelector('.learn-nav-item__status');
                const statusClass = statusEl ? statusEl.className : "";
                const isFinished = statusClass.includes('--finish') || (statusEl && statusEl.getAttribute('title') === 'Bạn đã hoàn thành phần này');

                // Nếu bài này CHƯA HOÀN THÀNH (chưa học hoặc đang học dở dang)
                if (!isFinished && text.length > 0 && !text.includes("Chương") && !text.includes("Kiểm tra")) {
                    // Tìm link hoặc thẻ bấm
                    const clickTarget = item.closest('a') || item.querySelector('a') || item.closest('tr') || item;
                    if (clickTarget) {
                        clickTarget.click();
                        return { success: true, jumped: true, title: text, index: i + 1 };
                    }
                }
            }

            return { success: true, jumped: false };
        });

        if (result && result.jumped) {
            console.log(`\n================================================================================`);
            console.log(`[🎯 TÌM THẤY BÀI CHƯA HOÀN THÀNH]`);
            console.log(`👉 Tự động nhảy thẳng đến: "${result.title}" (Bài số ${result.index})`);
            console.log(`   (Đã bỏ qua toàn bộ các bài đã hoàn thành trước đó)`);
            console.log(`================================================================================\n`);
            await new Promise(r => setTimeout(r, 4000));
            await this.handleModals();
        } else {
            console.log("[*] Đang ở bài học hiện tại, tiếp tục phát...");
        }
    }

    /**
     * Tự động học toàn bộ bài giảng điện tử & video trong khóa học
     */
    async learnAllLessonsInCourse(courseKeyword = "Đạo đức", maxLessons = this.config.video.maxLessons || 50) {
        console.log(`\n================================================================================`);
        console.log(`    BẮT ĐẦU TỰ ĐỘNG HỌC BÀI GIẢNG ĐIỆN TỬ & VIDEO                               `);
        console.log(`    Môn học: "${courseKeyword}" | Tốc độ: ${this.config.video.playbackRate || 1.25}x | Tắt tiếng: BẬT`);
        console.log(`================================================================================\n`);

        // Tự động tìm và nhảy đến bài chưa học đầu tiên
        await this.jumpToFirstUncompletedLesson();

        let completedLessons = 0;

        for (let i = 1; i <= maxLessons; i++) {
            await new Promise(r => setTimeout(r, 2000));

            // 1. Khởi chạy phát bài học hiện tại
            const media = await this.playCurrentMedia(this.config.video.playbackRate, this.config.video.muteAudio);
            completedLessons++;

            if (media && media.hasMedia) {
                console.log(`\n[Bài ${completedLessons}] 🎬 ${media.title}`);
                console.log(`    Thời lượng: ~${Math.round(media.duration / 60)} phút | Loại: ${media.type.toUpperCase()}`);
                
                // 2. Chờ phát hoàn thành
                await this.waitForMediaCompletion();
            } else {
                console.log(`\n[Bài ${completedLessons}] 📄 Bài đọc / Khảo sát (Giữ 15s để tích lũy giờ)...`);
                for (let s = 15; s > 0; s--) {
                    process.stdout.write(`\r    ⏳ Đang ghi nhận: ${s}s... `);
                    await new Promise(res => setTimeout(res, 1000));
                }
                process.stdout.write("\n");
            }

            // 3. Chuyển sang bài kế tiếp
            const hasNext = await this.nextLesson();
            if (!hasNext) {
                console.log("\n🎉 [HOÀN THÀNH] ĐÃ HỌC XONG TOÀN BỘ CÁC BÀI TRONG MÔN HỌC!");
                break;
            }
        }

        console.log(`\n================================================================================`);
        console.log(`[✓] ĐÃ HOÀN THÀNH TỰ ĐỘNG HỌC ${completedLessons} BÀI HỌC / VIDEO!`);
        console.log(`================================================================================\n`);
    }

    /**
     * Tự động xác nhận các popup nội quy học tập hoặc thiết bị mới nếu xuất hiện
     */
    async handleModals() {
        if (!this.page) return;

        for (let round = 1; round <= 3; round++) {
            const handled = await this.safeEvaluate(() => {
                const checkbox = document.querySelector('input[type="checkbox"], .ant-checkbox-input, .ant-checkbox');
                if (checkbox && !checkbox.checked) {
                    checkbox.click();
                }

                const buttons = Array.from(document.querySelectorAll('button, div.btn'));
                for (const b of buttons) {
                    const txt = b.innerText.trim();
                    if (txt === "Đồng ý" || txt.includes("Tôi đồng ý") || txt === "Xác nhận") {
                        b.click();
                        return { clicked: true, text: txt };
                    }
                }
                return { clicked: false };
            });

            if (handled && handled.clicked) {
                console.log(`[+] Đã tự động đóng popup: "${handled.text}"`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    /**
     * Giữ trình duyệt mở
     */
    async keepAlive() {
        console.log("[*] Trình duyệt đang được duy trì phiên làm việc trực quan.");
        return new Promise(() => {}); // Giữ vô hạn
    }

    /**
     * Đóng trình duyệt
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

module.exports = DucthinhBrowser;
