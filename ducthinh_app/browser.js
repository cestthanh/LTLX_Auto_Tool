const puppeteer = require("puppeteer");
const config = require("./config");
const { QuestionBankEngine } = require("./question_bank_engine");

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
        this.engine = new QuestionBankEngine(); // Engine giải câu hỏi thông minh 100%
        this.questionBank = this.engine.bankById; // Tương thích ngược
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
            try {
                const url = res.url().toLowerCase();
                const contentType = res.headers()["content-type"] || "";
                if (contentType.includes("json") || url.includes("question") || url.includes("exercise") || url.includes("exam") || url.includes("bank") || url.includes("status")) {
                    const json = await res.json();
                    const count = this.engine.feedQuestionsFromJSON(json);
                    if (count > 0) {
                        console.log(`[✓] ĐÃ NẠP TỰ ĐỘNG ${count} CÂU HỎI & ĐÁP ÁN CHUẨN TỪ MÁY CHỦ VÀO ENGINE (Tổng: ${this.engine.bankById.size} câu)!`);
                    }
                }
            } catch (e) {}
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
        
        try {
            await this.page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        } catch (e) {
            // LotusLMS tải hơn 120 file JS chunks ngầm nên sự kiện domcontentloaded có thể bị trễ,
            // ta chỉ cần đợi form đăng nhập xuất hiện trong DOM là tiếp tục ngay!
        }

        console.log(`[*] Nhập tài khoản: ${username}`);
        await this.page.waitForSelector('input[name="lname"], input[type="text"]', { timeout: 30000 });
        
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
     * Lấy bảng tổng quan tiến độ của tất cả các môn học trên Dashboard
     */
    async getCourseProgressOverview() {
        if (!this.page) return [];
        return await this.safeEvaluate(() => {
            // Mở rộng tất cả các nhóm môn học
            const expandIcons = Array.from(document.querySelectorAll('.ant-table-row-expand-icon-collapsed, [class*="expand-icon-collapsed"]'));
            for (const icon of expandIcons) {
                try { icon.click(); } catch(e) {}
            }

            const rows = Array.from(document.querySelectorAll('tr.ant-table-row, tr'));
            const list = [];
            for (const r of rows) {
                const text = r.innerText ? r.innerText.trim() : "";
                if (!text || text.includes("Tên lớp học") || text.includes("Tiến độ")) continue;
                
                const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
                if (cells.length >= 3) {
                    const name = cells[0].replace(/\n/g, ' ').replace(/-/g, '').trim();
                    const progress = cells[1];
                    const hours = cells[2];
                    const status = cells[3] || (cells[1].includes("Đạt") ? "Đạt" : "Chưa đạt");
                    list.push({ name, progress, hours, status });
                }
            }
            return list;
        }) || [];
    }

    /**
     * Nhấp vào môn học theo tên (Ví dụ: "Phần 1", "Phần 2", "Phần 3", "Đạo đức", "Kỹ thuật", "Cấu tạo")
     */
    async openCourse(keyword = "Phần 2. Hệ thống báo hiệu đường bộ") {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");
        
        console.log(`[*] Đang tìm và nhấp vào khóa học: "${keyword}"...`);
        await this.page.waitForSelector('table, tr, a, td', { timeout: 20000 });

        // 1. Mở rộng tất cả các nhóm môn học con và đợi DOM render xong
        await this.safeEvaluate(() => {
            const expandIcons = Array.from(document.querySelectorAll('.ant-table-row-expand-icon-collapsed, [class*="expand-icon-collapsed"], button.ant-table-row-expand-icon, .ant-table-row-expand-icon'));
            for (const icon of expandIcons) {
                if (!icon.classList.contains('ant-table-row-expand-icon-expanded')) {
                    try { icon.click(); } catch (e) {}
                }
            }
        });
        await new Promise(r => setTimeout(r, 1200));

        // 2. Tìm link hoặc hàng khớp từ khóa môn học
        const clicked = await this.safeEvaluate((kw) => {
            // Danh sách từ khóa phụ
            const kwLower = kw.toLowerCase();
            const aliases = [kwLower];
            if (kwLower.includes("phần 1")) aliases.push("luật trật tự");
            if (kwLower.includes("phần 2")) aliases.push("báo hiệu");
            if (kwLower.includes("phần 3")) aliases.push("xử lý các tình huống");
            if (kwLower.includes("đạo đức")) aliases.push("văn hóa");
            if (kwLower.includes("kỹ thuật")) aliases.push("lái xe ô tô");
            if (kwLower.includes("cấu tạo")) aliases.push("sửa chữa");
            if (kwLower.includes("mô phỏng")) aliases.push("tình huống");

            const allElements = Array.from(document.querySelectorAll('a, tr'));
            for (const el of allElements) {
                const txt = el.innerText ? el.innerText.toLowerCase() : "";
                const isMatch = aliases.some(alias => txt.includes(alias));

                if (isMatch) {
                    const link = el.tagName === 'A' ? el : el.querySelector('a');
                    if (link) {
                        link.click();
                        return { success: true, text: link.innerText.trim(), href: link.href };
                    }
                    el.click();
                    return { success: true, text: el.innerText.trim(), href: el.href || null };
                }
            }
            return { success: false };
        }, keyword);

        if (!clicked || !clicked.success) {
            console.log(`[!] Không tìm thấy khóa học khớp "${keyword}", tìm thử thẻ a chứa text...`);
            const fallbackClicked = await this.safeEvaluate((kw) => {
                const links = Array.from(document.querySelectorAll('a'));
                for (const a of links) {
                    if (a.innerText && a.innerText.toLowerCase().includes(kw.toLowerCase())) {
                        a.click();
                        return { success: true, text: a.innerText.trim() };
                    }
                }
                return { success: false };
            }, keyword);

            if (!fallbackClicked || !fallbackClicked.success) {
                throw new Error(`Không tìm thấy môn học: "${keyword}" trên bảng danh sách lớp học.`);
            }
        } else {
            console.log(`[✓] Đã nhấp vào môn học: "${clicked.text}"`);
        }

        await new Promise(r => setTimeout(r, 3500));
        console.log(`[*] URL trang môn học: ${this.page.url()}`);
        return this.page.url();
    }

    /**
     * Nhấp vào nhiệm vụ trong bảng tổng quan môn học (Ví dụ: "Ôn luyện" hoặc "Bài giảng điện tử")
     */
    async openTask(taskKeyword = "Ôn luyện") {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");

        console.log(`[*] Đang tìm và nhấp vào mục: "${taskKeyword}"...`);
        await this.page.waitForSelector('table, tr, a, button, .ant-table-row', { timeout: 20000 });

        const clicked = await this.safeEvaluate((kw) => {
            const kwLower = kw.toLowerCase();
            const searchKeywords = [kwLower];
            if (kwLower.includes("ôn luyện") || kwLower.includes("luyện")) {
                searchKeywords.push("luyện tập", "luyện tất cả", "luyện thi", "trắc nghiệm", "làm bài", "bắt đầu");
            }
            if (kwLower.includes("bài giảng") || kwLower.includes("video")) {
                searchKeywords.push("bài giảng điện tử", "học bài", "bài học", "video", "lý thuyết");
            }

            // 1. Tìm trong các hàng bảng (Table rows)
            const rows = Array.from(document.querySelectorAll('tr, .ant-table-row, .block__item, .task-item'));
            for (const row of rows) {
                const txt = row.innerText ? row.innerText.toLowerCase() : "";
                const matched = searchKeywords.some(k => txt.includes(k));
                if (matched) {
                    const link = row.querySelector('a');
                    if (link) {
                        link.click();
                        return { success: true, text: link.innerText.trim(), href: link.href };
                    }
                    const btn = row.querySelector('button, .ant-btn, div[role="button"]');
                    if (btn) {
                        btn.click();
                        return { success: true, text: btn.innerText.trim(), href: null };
                    }
                    row.click();
                    return { success: true, text: row.innerText.trim(), href: null };
                }
            }

            // 2. Tìm trong tất cả các thẻ a hoặc button trên trang
            const allClickables = Array.from(document.querySelectorAll('a, button, .ant-btn'));
            for (const el of allClickables) {
                const txt = el.innerText ? el.innerText.toLowerCase() : "";
                const matched = searchKeywords.some(k => txt.includes(k));
                if (matched) {
                    el.click();
                    return { success: true, text: el.innerText.trim(), href: el.href || null };
                }
            }

            // 3. Nếu chỉ có duy nhất 1 nhiệm vụ trong bảng, bấm thẳng vào nhiệm vụ đó
            const singleTaskLink = document.querySelector('.ant-table-tbody tr a, table tbody tr a');
            if (singleTaskLink) {
                singleTaskLink.click();
                return { success: true, text: singleTaskLink.innerText.trim(), href: singleTaskLink.href };
            }

            return { success: false };
        }, taskKeyword);

        if (!clicked || !clicked.success) {
            throw new Error(`Không tìm thấy mục: "${taskKeyword}" trên bảng chi tiết môn học.`);
        }

        console.log(`[✓] Đã nhấp vào mục: "${clicked.text || taskKeyword}"`);
        await new Promise(r => setTimeout(r, 4000));

        await this.handleModals();
        return this.page.url();
    }

    /**
     * Tự động xác nhận các hộp thoại popup hệ thống (như popup Xác nhận kết thúc luyện tập, popup Tiếp tục, v.v.)
     */
    async autoConfirmDialogs() {
        if (!this.page) return false;
        return await this.safeEvaluate(() => {
            const modals = Array.from(document.querySelectorAll('.ant-modal-confirm, .ant-modal, [role="dialog"], .ant-modal-content'));
            for (const m of modals) {
                const text = m.innerText || "";
                if (text.includes("kết thúc luyện tập") || text.includes("kết thúc bài") || text.includes("Xác nhận") || text.includes("luyện tập") || text.includes("nộp bài")) {
                    // Tìm nút OK màu xanh hoặc nút có text OK / Đồng ý / Xác nhận
                    const okBtn = m.querySelector('.ant-btn-primary, button.ant-btn-primary, button.btn-primary') ||
                                  Array.from(m.querySelectorAll('button')).find(b => {
                                      const txt = b.innerText.trim().toUpperCase();
                                      return txt === "OK" || txt === "ĐỒNG Ý" || txt === "XÁC NHẬN" || txt === "TIẾP TỤC";
                                  });
                    if (okBtn) {
                        okBtn.click();
                        return { confirmed: true, text: okBtn.innerText.trim() };
                    }
                }
            }
            return { confirmed: false };
        });
    }

    /**
     * Bấm nút "Luyện tất cả"
     */
    async startPracticeAll() {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");

        console.log("[*] Đang tìm và bấm nút [Luyện tất cả]...");
        await new Promise(r => setTimeout(r, 2000));
        await this.autoConfirmDialogs();

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
            console.log("[*] Thử kiểm tra nút bắt đầu luyện tập khác hoặc xác nhận popup...");
            await this.autoConfirmDialogs();
        } else {
            console.log(`[✓] Đã bấm: "${clicked.text}"`);
        }

        await new Promise(r => setTimeout(r, 3000));
        await this.autoConfirmDialogs();
        await new Promise(r => setTimeout(r, 1000));
    }

    /**
     * Tự động giải toàn bộ câu hỏi trong đề ôn luyện với MÔ PHỎNG HÀNH VI (HUMAN SIMULATION) & CHỐNG PHÁT HIỆN
     */
    async solveAllQuestions(options = {}) {
        const minDelay = options.minDelayPerQuestion || this.config.practice.minDelayPerQuestion || 3;
        const maxDelay = options.maxDelayPerQuestion || this.config.practice.maxDelayPerQuestion || 6;
        let requestedMax = options.maxQuestions || this.config.practice.maxQuestions || 185;
        const onProgress = options.onProgress || (() => {});
        const onLog = options.onLog || console.log;
        const isRunningCheck = options.isRunningCheck || (() => true);

        // 1. Luôn nạp ngân hàng câu hỏi trước khi giải
        if (!this.questionBank || this.questionBank.size === 0) {
            onLog("Đang nạp ngân hàng câu hỏi & đáp án chuẩn từ hệ thống...", "info");
            await this.loadQuestionBank();
            onLog(`Đã nạp thành công ${this.questionBank.size} câu hỏi chuẩn!`, "success");
        }

        let completedCount = 0;
        let dynamicTotal = requestedMax;

        for (let i = 1; i <= dynamicTotal; i++) {
            if (!isRunningCheck()) break;

            await new Promise(r => setTimeout(r, 600));

            // Tự động đóng/xác nhận các popup hệ thống nếu có
            await this.autoConfirmDialogs();

            // Kiểm tra và tạm dừng nếu có Captcha / Xác minh người thật
            await this.handleHumanVerificationIfNeeded();

            // 1. ĐỌC TIẾN ĐỘ THỰC TẾ TRÊN GIAO DIỆN (Ví dụ: "Câu hỏi : 115/115")
            const headerProgress = await this.safeEvaluate(() => {
                const allEls = Array.from(document.querySelectorAll('body *'));
                for (const el of allEls) {
                    if (el.children.length === 0 && el.innerText) {
                        const txt = el.innerText.trim();
                        const match = txt.match(/Câu hỏi\s*:\s*(\d+)\s*\/\s*(\d+)/i) || txt.match(/^(\d+)\s*\/\s*(\d+)$/);
                        if (match) {
                            const cur = parseInt(match[1], 10);
                            const tot = parseInt(match[2], 10);
                            if (tot > 0 && cur <= tot) {
                                return { current: cur, total: tot };
                            }
                        }
                    }
                }
                return null;
            });

            if (headerProgress) {
                // Tự động điều chỉnh tổng số câu của phần này (ví dụ: 115 câu cho Phần 3)
                if (dynamicTotal > headerProgress.total || dynamicTotal === 185) {
                    dynamicTotal = headerProgress.total;
                }
            }

            // Kiểm tra nếu bài luyện thi đã kết thúc hoặc xuất hiện bảng điểm
            const isFinished = await this.safeEvaluate(() => {
                const text = document.body.innerText;
                const modalVisible = !!document.querySelector('.ant-modal-confirm, .ant-modal, [role="dialog"]');
                return text.includes("Kết quả luyện tập") || text.includes("Hoàn thành bài luyện") || text.includes("Điểm số của bạn") ||
                       (modalVisible && text.includes("kết thúc luyện tập"));
            });

            if (isFinished) {
                await this.autoConfirmDialogs();
                onLog("🎉 ĐÃ ĐẾN CÂU HỎI CUỐI CÙNG & HOÀN THÀNH TOÀN BỘ ĐỀ THI!", "success");
                onProgress({
                    current: dynamicTotal,
                    total: dynamicTotal,
                    percent: 100,
                    detail: `Hoàn tất toàn bộ ${dynamicTotal}/${dynamicTotal} câu!`,
                    statusMessage: `Đã hoàn thành 100% (${dynamicTotal}/${dynamicTotal} câu)`
                });
                break;
            }

            // Lấy thông tin câu hỏi và toàn bộ danh sách lựa chọn trên DOM
            const qInfo = await this.safeEvaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
                const labels = Array.from(document.querySelectorAll('label, .ant-radio-wrapper, .ant-checkbox-wrapper, .radio-option, [class*="option-item"]'));
                const titleEl = document.querySelector('.question-content, .question-title, .title-question, h4, h3, .content');
                const title = titleEl ? titleEl.innerText.trim() : "";

                let qId = null;
                if (inputs.length > 0 && inputs[0].id) {
                    qId = inputs[0].id.split('-')[0];
                }

                const options = [];
                for (let i = 0; i < labels.length; i++) {
                    const lbl = labels[i];
                    const text = lbl.innerText ? lbl.innerText.trim() : "";
                    const forAttr = lbl.getAttribute('for') || "";
                    const input = lbl.querySelector('input') || (forAttr ? document.getElementById(forAttr) : inputs[i]);
                    const id = input ? input.id : (forAttr || `opt-${i}`);
                    options.push({
                        index: i,
                        id: id,
                        forAttr: forAttr,
                        text: text.replace(/^[0-9A-D\.\-\s]+/, '').trim(), // Bỏ prefix "1 - ", "A. "
                        fullText: text
                    });
                }

                return {
                    qId,
                    title: title.slice(0, 100),
                    options,
                    optionsCount: options.length || labels.length || inputs.length
                };
            });

            if (!qInfo || (!qInfo.qId && qInfo.optionsCount === 0)) {
                await this.autoConfirmDialogs();
                await this.handleModals();
                continue;
            }

            completedCount = headerProgress ? headerProgress.current : (completedCount + 1);

            // Tìm đáp án đúng tối ưu 100% bằng QuestionBankEngine
            const answerDecision = this.engine.findBestAnswer(qInfo);
            const targetIndex = answerDecision.targetIndex || 0;
            const ansText = answerDecision.matchedText || `Phương án ${targetIndex + 1}`;
            
            onLog(`[Câu ${completedCount}/${dynamicTotal}] 🎯 [${answerDecision.strategy}] Đáp án đúng: "${ansText}"`, "info");

            const pct = Math.round((completedCount / dynamicTotal) * 100);
            onProgress({
                current: completedCount,
                total: dynamicTotal,
                percent: Math.min(pct, 100),
                detail: `Câu ${completedCount}/${dynamicTotal} (${qInfo.title}...)`,
                statusMessage: `Đang làm câu ${completedCount}/${dynamicTotal}`
            });

            // 1. MÔ PHỎNG ĐỌC ĐỀ NGẪU NHIÊN (1.5s - 2.5s)
            const readTime = 1.5 + Math.random() * 1.0;
            await new Promise(res => setTimeout(res, Math.round(readTime * 1000)));

            // 2. CUỘN NHẸ TRANG NHƯ NGƯỜI THẬT
            try {
                await this.page.mouse.wheel({ deltaY: 25 + Math.floor(Math.random() * 30) });
                await new Promise(r => setTimeout(r, 250));
            } catch (e) {}

            await this.handleHumanVerificationIfNeeded();

            // 3. DI CHUỘT VÀ CLICK CHÍNH XÁC VÀO ĐÁP ÁN ĐÃ CHỌN
            let clickSuccess = false;
            if (answerDecision.targetOption?.forAttr) {
                clickSuccess = await this.smoothMoveAndClick(`label[for="${answerDecision.targetOption.forAttr}"]`);
            }
            if (!clickSuccess && answerDecision.targetOption?.id) {
                clickSuccess = await this.smoothMoveAndClick(`label[for="${answerDecision.targetOption.id}"]`);
            }
            if (!clickSuccess) {
                try {
                    const labels = await this.page.$$('label, .ant-radio-wrapper, .ant-checkbox-wrapper');
                    if (labels[targetIndex]) {
                        clickSuccess = await this.smoothMoveAndClick(labels[targetIndex]);
                    } else if (labels[0]) {
                        clickSuccess = await this.smoothMoveAndClick(labels[0]);
                    }
                } catch (e) {}
            }

            // 4. GIỮ CÂU NGẪU NHIÊN TỰ NHIÊN (3s - 5.5s)
            const actualDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            for (let s = actualDelay; s > 0; s--) {
                if (!isRunningCheck()) break;
                await new Promise(res => setTimeout(res, 1000));
                if (s % 2 === 0) {
                    await this.handleHumanVerificationIfNeeded();
                }
            }

            if (!isRunningCheck()) break;

            // Nếu đây đã là câu hỏi cuối cùng của đề thi (ví dụ câu 115/115)
            if (completedCount >= dynamicTotal) {
                onLog(`[✓] Đã giải xong câu hỏi cuối cùng (${completedCount}/${dynamicTotal})!`, "success");
                await new Promise(r => setTimeout(r, 1000));
                await this.autoConfirmDialogs();
                break;
            }

            // 5. CHUYỂN TIẾP SANG CÂU SAU BẰNG DI CHUỘT
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
                    const moved = await this.safeEvaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button, .ant-btn, a'));
                        for (const b of buttons) {
                            const txt = b.innerText.trim();
                            if (txt === "Tiếp" || txt === "Tiếp theo") {
                                b.click();
                                return true;
                            }
                        }
                        return false;
                    });
                    if (!moved) {
                        // Không có nút tiếp theo, có thể đã hết câu hỏi
                        console.log("[*] Không tìm thấy nút Tiếp theo, kết thúc bài làm...");
                        break;
                    }
                }
            } catch (e) {}
        }

        return completedCount;
    }

    /**
     * Tự động bấm "Kết thúc luyện thi" và xác nhận nộp bài (Auto Click [OK] trên popup)
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

        // Đợi popup modal "Xác nhận: Bạn có chắc chắn muốn kết thúc luyện tập không?"
        console.log("[*] Đang đợi và tự động xác nhận [OK] trên popup...");
        await new Promise(r => setTimeout(r, 1500));

        // Thử tìm nút OK và di chuột click như người thật
        for (let attempt = 1; attempt <= 3; attempt++) {
            const okBtnHandle = await this.page.evaluateHandle(() => {
                const modals = Array.from(document.querySelectorAll('.ant-modal, .modal, [role="dialog"], .ant-modal-content, .ant-modal-confirm'));
                for (const m of modals) {
                    const btns = Array.from(m.querySelectorAll('button, .ant-btn, div.btn'));
                    for (const b of btns) {
                        const txt = b.innerText.trim().toUpperCase();
                        if (txt === "OK" || txt === "ĐỒNG Ý" || txt === "XÁC NHẬN" || txt === "NỘP BÀI" || b.classList.contains("ant-btn-primary")) {
                            return b;
                        }
                    }
                }
                return null;
            });

            if (okBtnHandle && okBtnHandle.asElement()) {
                await this.smoothMoveAndClick(okBtnHandle.asElement());
                console.log("[✓] Đã tự động di chuột và nhấp nút: [OK] trên hộp thoại xác nhận!");
                break;
            } else {
                // Fallback bằng DOM click
                const confirmed = await this.safeEvaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('.ant-modal-confirm-btns button, .ant-modal button, [role="dialog"] button'));
                    for (const b of buttons) {
                        const txt = b.innerText.trim().toUpperCase();
                        if (txt === "OK" || txt === "ĐỒNG Ý" || txt === "XÁC NHẬN" || txt === "NỘP BÀI" || b.classList.contains("ant-btn-primary")) {
                            b.click();
                            return true;
                        }
                    }
                    return false;
                });
                if (confirmed) {
                    console.log("[✓] Đã xác nhận [OK] thành công!");
                    break;
                }
            }
            await new Promise(r => setTimeout(r, 1000));
        }

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
