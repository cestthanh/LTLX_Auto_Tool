const puppeteer = require("puppeteer");
const config = require("./config");

class DucthinhBrowser {
    constructor(options = {}) {
        this.config = {
            ...config,
            ...options,
            account: { ...config.account, ...(options.account || {}) },
            browser: { ...config.browser, ...(options.browser || {}) },
            practice: { ...config.practice, ...(options.practice || {}) }
        };
        this.browser = null;
        this.page = null;
        this.questionBank = new Map(); // Bộ nhớ lưu trữ đáp án đúng 100%
    }

    /**
     * Khởi chạy trình duyệt và tiêm cơ chế vô hiệu hóa bẫy devtools-detector
     */
    async launch() {
        console.log("[*] Khởi chạy trình duyệt Chrome trực quan...");
        this.browser = await puppeteer.launch({
            headless: this.config.browser.headless,
            defaultViewport: this.config.browser.viewport,
            args: this.config.browser.args
        });

        const pages = await this.browser.pages();
        this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
        await this.page.setUserAgent(this.config.browser.userAgent);

        // Vô hiệu hóa bẫy devtools-detector trước khi bất kỳ script nào tải
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
        });

        // Tự động bắt gói tin nạp ngân hàng câu hỏi để lấy đáp án đúng 100%
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
        let box = null;
        if (typeof selectorOrHandle === "string") {
            const el = await this.page.$(selectorOrHandle);
            if (el) box = await el.boundingBox();
        } else if (selectorOrHandle && selectorOrHandle.boundingBox) {
            box = await selectorOrHandle.boundingBox();
        }

        if (box) {
            // Tọa độ ngẫu nhiên bên trong phần tử
            const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
            const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

            // Di chuyển chuột mượt mà với nhiều bước
            const steps = 12 + Math.floor(Math.random() * 10);
            await this.page.mouse.move(targetX, targetY, { steps });
            await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 150)));
            await this.page.mouse.click(targetX, targetY);
            return true;
        }
        return false;
    }

    /**
     * Kiểm tra xem trên màn hình có xuất hiện Captcha / Hộp thoại xác minh người thật không
     */
    async checkForHumanVerification() {
        if (!this.page) return { isVerification: false };

        return await this.page.evaluate(() => {
            // 1. Kiểm tra iframe Google reCAPTCHA / hCaptcha / Geetest
            const captchaIframes = document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="captcha"], iframe[src*="hcaptcha"], iframe[src*="geetest"]');
            if (captchaIframes.length > 0) {
                for (const f of captchaIframes) {
                    const rect = f.getBoundingClientRect();
                    if (rect.width > 20 && rect.height > 20 && rect.top < window.innerHeight && rect.bottom > 0) {
                        return { isVerification: true, type: "CAPTCHA_IFRAME", message: "Phát hiện Google reCAPTCHA / Captcha trên màn hình" };
                    }
                }
            }

            // 2. Kiểm tra modal xác thực người dùng / robot / hoạt động bất thường
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
        });
    }

    /**
     * Tự động tạm dừng khi có Captcha/Xác minh và TỰ ĐỘNG TIẾP TỤC khi người dùng bấm xong
     */
    async handleHumanVerificationIfNeeded() {
        const check = await this.checkForHumanVerification();
        if (check.isVerification) {
            // Phát âm thanh cảnh báo Beep ra loa
            process.stdout.write('\x07');
            
            console.log("\n================================================================================");
            console.log(`🔔🔔🔔 [CẦN BẠN XÁC NHẬN] ${check.message}`);
            console.log(`👉 Vui lòng thao tác bấm xác nhận trực tiếp trên cửa sổ Chrome.`);
            console.log(`⏳ Bot đang tạm dừng và sẽ TỰ ĐỘNG TIẾP TỤC NGAY khi bạn hoàn tất...`);
            console.log("================================================================================\n");

            // Vòng lặp chờ người dùng thao tác xong và popup biến mất
            while (true) {
                await new Promise(r => setTimeout(r, 1000));
                const currentCheck = await this.checkForHumanVerification();
                if (!currentCheck.isVerification) {
                    console.log("\n[✓] XÁC NHẬN THÀNH CÔNG! Đã phát hiện hộp thoại đóng lại.");
                    console.log("[*] Đang tiếp tục giải bài tự động...\n");
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
     * Nhấp vào môn học theo tên (Ví dụ: "Phần 2. Hệ thống báo hiệu đường bộ")
     */
    async openCourse(keyword = "Phần 2. Hệ thống báo hiệu đường bộ") {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");
        
        console.log(`[*] Đang tìm và nhấp vào khóa học: "${keyword}"...`);
        await this.page.waitForSelector('a, tr, td', { timeout: 20000 });

        const clicked = await this.page.evaluate((kw) => {
            const links = Array.from(document.querySelectorAll('a'));
            for (const a of links) {
                if (a.innerText && a.innerText.toLowerCase().includes(kw.toLowerCase())) {
                    a.click();
                    return { success: true, text: a.innerText.trim(), href: a.href };
                }
            }
            return { success: false };
        }, keyword);

        if (!clicked.success) {
            const fallbackUrl = `${this.config.baseUrl}/student/course/${this.config.courses.phan2.iid}/dashboard`;
            console.log(`[!] Không tìm thấy link trong DOM, điều hướng trực tiếp tới: ${fallbackUrl}`);
            await this.page.goto(fallbackUrl, { waitUntil: "domcontentloaded" });
        } else {
            console.log(`[✓] Đã nhấp vào môn học: "${clicked.text}"`);
        }

        await new Promise(r => setTimeout(r, 3000));
        console.log(`[*] URL trang môn học: ${this.page.url()}`);
        return this.page.url();
    }

    /**
     * Nhấp vào nhiệm vụ trong bảng tổng quan môn học (Ví dụ: "Ôn luyện")
     */
    async openTask(taskKeyword = "Ôn luyện") {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");

        console.log(`[*] Đang tìm và nhấp vào mục: "${taskKeyword}"...`);
        await this.page.waitForSelector('table, tr, a, button', { timeout: 20000 });

        const clicked = await this.page.evaluate((kw) => {
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
            return { success: false };
        }, taskKeyword);

        if (!clicked.success) {
            throw new Error(`Không tìm thấy mục: "${taskKeyword}" trên bảng chi tiết môn học.`);
        }

        console.log(`[✓] Đã nhấp vào mục: "${taskKeyword}"`);
        await new Promise(r => setTimeout(r, 4000));

        // Tự động xử lý các popup nội quy học tập / thiết bị mới
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

        const clicked = await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
            for (const b of buttons) {
                if (b.innerText && b.innerText.includes("Luyện tất cả")) {
                    b.click();
                    return { success: true, text: b.innerText.trim() };
                }
            }
            return { success: false };
        });

        if (!clicked.success) {
            throw new Error("Không tìm thấy nút [Luyện tất cả] trên màn hình.");
        }

        console.log(`[✓] Đã bấm: "${clicked.text}"`);
        await new Promise(r => setTimeout(r, 4000));
    }

    /**
     * Tự động giải toàn bộ câu hỏi trong đề ôn luyện với MÔ PHỎNG HÀNH VI & SMART RESUME
     */
    async solveAllQuestions(options = {}) {
        const minDelay = options.minDelayPerQuestion || this.config.practice.minDelayPerQuestion || 15;
        const maxDelay = options.maxDelayPerQuestion || this.config.practice.maxDelayPerQuestion || 25;
        const maxQuestions = options.maxQuestions || this.config.practice.maxQuestions || 185;

        console.log(`\n================================================================================`);
        console.log(`    BẮT ĐẦU TỰ ĐỘNG GIẢI ${maxQuestions} CÂU HỎI (TỰ ĐỘNG TẠM DỪNG / TIẾP TỤC)     `);
        console.log(`    Thời gian giữ mỗi câu ngẫu nhiên: ${minDelay}s - ${maxDelay}s (tích lũy giờ học thật)`);
        console.log(`================================================================================\n`);

        let completedCount = 0;

        for (let i = 1; i <= maxQuestions; i++) {
            await new Promise(r => setTimeout(r, 1200));

            // 1. Kiểm tra và tạm dừng nếu có Captcha / Xác minh người thật
            await this.handleHumanVerificationIfNeeded();

            // 2. Kiểm tra nếu bài luyện thi đã kết thúc
            const isFinished = await this.page.evaluate(() => {
                const text = document.body.innerText;
                return text.includes("Kết quả luyện tập") || text.includes("Hoàn thành bài luyện") || text.includes("Điểm số của bạn");
            });

            if (isFinished) {
                console.log("\n[🎉] ĐÃ HOÀN THÀNH TOÀN BỘ BÀI LUYỆN TẬP!");
                break;
            }

            // 3. Lấy thông tin câu hỏi và ID câu hỏi từ giao diện
            const qInfo = await this.page.evaluate(() => {
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

            // 5. Mô phỏng đọc đề: Chờ ngẫu nhiên 2 - 4 giây + cuộn nhẹ trang
            const readTime = 2 + Math.floor(Math.random() * 3);
            process.stdout.write(`    📖 Đang đọc đề (${readTime}s) `);
            for (let r = 0; r < readTime; r++) {
                process.stdout.write(".");
                await new Promise(res => setTimeout(res, 1000));
            }
            process.stdout.write("\n");

            // Cuộn trang nhẹ nhàng mô phỏng mắt người nhìn
            await this.page.mouse.wheel({ deltaY: 50 + Math.floor(Math.random() * 50) });
            await new Promise(r => setTimeout(r, 400));

            // Kiểm tra lại trước khi click
            await this.handleHumanVerificationIfNeeded();

            // 6. Di chuột thật và bấm chọn đáp án
            let clickSuccess = false;
            if (qInfo.qId) {
                const targetSelector = `label[for="${qInfo.qId}-${targetIndex}"]`;
                clickSuccess = await this.smoothMoveAndClick(targetSelector);
            }
            if (!clickSuccess) {
                // Fallback click trực quan
                const labels = await this.page.$$('label, .ant-radio-wrapper');
                if (labels[targetIndex]) {
                    await this.smoothMoveAndClick(labels[targetIndex]);
                } else if (labels[0]) {
                    await this.smoothMoveAndClick(labels[0]);
                }
            }

            // 7. Tính toán thời gian giữ câu ngẫu nhiên (để tích lũy giờ học thật)
            const remainingDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay - readTime;
            const actualDelay = Math.max(8, remainingDelay);

            process.stdout.write(`    ⏳ Giữ câu ${actualDelay}s để ghi nhận thời gian: `);
            for (let s = actualDelay; s > 0; s--) {
                process.stdout.write(`${s}s `);
                await new Promise(res => setTimeout(res, 1000));
                
                // Kiểm tra xem có popup nhảy ra trong lúc giữ câu không
                if (s % 3 === 0) {
                    await this.handleHumanVerificationIfNeeded();
                }
            }
            process.stdout.write(` -> Chuyển câu!\n\n`);

            // 8. Di chuyển chuột tới nút [Tiếp] và click
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
                // Fallback nếu không bắt được element handle
                await this.page.evaluate(() => {
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
        }

        console.log(`\n================================================================================`);
        console.log(`[✓] ĐÃ HOÀN THÀNH TỰ ĐỘNG GIẢI ${completedCount} CÂU HỎI!`);
        console.log(`================================================================================\n`);
    }

    /**
     * Tự động xác nhận các popup nội quy học tập hoặc thiết bị mới nếu xuất hiện
     */
    async handleModals() {
        if (!this.page) return;

        for (let round = 1; round <= 3; round++) {
            const handled = await this.page.evaluate(() => {
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

            if (handled.clicked) {
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
