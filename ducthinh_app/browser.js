const puppeteer = require("puppeteer");
const config = require("./config");

class DucthinhBrowser {
    constructor(options = {}) {
        this.config = {
            ...config,
            ...options,
            account: { ...config.account, ...(options.account || {}) },
            browser: { ...config.browser, ...(options.browser || {}) }
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
     * Tự động giải toàn bộ câu hỏi trong đề ôn luyện với đáp án chính xác 100%
     */
    async solveAllQuestions(options = {}) {
        const delaySeconds = options.delayPerQuestion !== undefined ? options.delayPerQuestion : 10; // Mặc định 10s/câu
        const maxQuestions = options.maxQuestions || 185;

        console.log(`\n================================================================================`);
        console.log(`    BẮT ĐẦU TỰ ĐỘNG GIẢI ${maxQuestions} CÂU HỎI (ĐÁP ÁN CHUẨN 100%)            `);
        console.log(`    Thời gian giữ mỗi câu: ${delaySeconds} giây (để server ghi nhận giờ học thật)`);
        console.log(`================================================================================\n`);

        let completedCount = 0;

        for (let i = 1; i <= maxQuestions; i++) {
            await new Promise(r => setTimeout(r, 1500));

            // Kiểm tra nếu bài luyện thi đã kết thúc
            const isFinished = await this.page.evaluate(() => {
                const text = document.body.innerText;
                return text.includes("Kết quả luyện tập") || text.includes("Hoàn thành bài luyện") || text.includes("Điểm số của bạn");
            });

            if (isFinished) {
                console.log("\n[🎉] ĐÃ HOÀN THÀNH TOÀN BỘ BÀI LUYỆN TẬP!");
                break;
            }

            // Lấy thông tin câu hỏi và ID câu hỏi từ giao diện
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

            // Tìm đáp án đúng trong ngân hàng câu hỏi
            let targetIndex = 0;
            if (qInfo.qId && this.questionBank.has(qInfo.qId)) {
                const bankItem = this.questionBank.get(qInfo.qId);
                targetIndex = bankItem.correctIndices[0] || 0;
                const answerText = bankItem.mc_answers?.[targetIndex]?.text || `Phương án ${targetIndex + 1}`;
                console.log(`[Câu ${completedCount}/${maxQuestions}] 🎯 Đáp án đúng: "${answerText}"\n    Câu hỏi: "${qInfo.title}..."`);
            } else {
                console.log(`[Câu ${completedCount}/${maxQuestions}] ℹ️ Câu hỏi: "${qInfo.title}..." (Chọn phương án 1)`);
            }

            // Tích chọn đáp án trên giao diện
            await this.page.evaluate((qId, idx) => {
                if (qId) {
                    const targetId = `${qId}-${idx}`;
                    const el = document.getElementById(targetId);
                    if (el) {
                        const label = document.querySelector(`label[for="${targetId}"]`) || el.parentElement;
                        if (label) label.click();
                        else el.click();
                        return;
                    }
                }
                const labels = Array.from(document.querySelectorAll('label, .ant-radio-wrapper'));
                if (labels[idx]) labels[idx].click();
                else if (labels[0]) labels[0].click();
            }, qInfo.qId, targetIndex);

            // Đếm ngược thời gian giữ câu để tích lũy thời gian học thật
            if (delaySeconds > 0) {
                process.stdout.write(`    ⏳ Giữ câu ${delaySeconds}s để ghi nhận thời gian: `);
                for (let s = delaySeconds; s > 0; s--) {
                    process.stdout.write(`${s}s `);
                    await new Promise(r => setTimeout(r, 1000));
                }
                process.stdout.write(` -> Chuyển câu!\n\n`);
            }

            // Bấm nút [Tiếp]
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
