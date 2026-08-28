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
            // 1. Tắt cờ webdriver
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });

            // 2. Vô hiệu hóa bẫy performance / console.table -> performanceChecker luôn trả về false (không mở DevTools)
            console.table = function() {};
            console.clear = function() {};

            // 3. Chặn Function constructor "debugger"
            const origFunction = window.Function;
            window.Function = function(...args) {
                if (args.length > 0 && typeof args[args.length - 1] === "string" && args[args.length - 1].includes("debugger")) {
                    return function() {};
                }
                return origFunction.apply(this, args);
            };
            window.Function.prototype = origFunction.prototype;
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

        // Chờ chuyển trang vào màn hình chính
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
            // Fallback: nếu không tìm thấy qua thẻ a, điều hướng trực tiếp qua IID cấu hình
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
        console.log(`[*] URL màn hình luyện tập: ${this.page.url()}`);

        // Tự động xử lý các popup nếu xuất hiện
        await this.handleModals();

        return this.page.url();
    }

    /**
     * Tự động xác nhận các popup nội quy học tập hoặc thiết bị mới nếu xuất hiện
     */
    async handleModals() {
        if (!this.page) return;

        for (let round = 1; round <= 3; round++) {
            const handled = await this.page.evaluate(() => {
                // Tích chọn checkbox đồng ý nếu có
                const checkbox = document.querySelector('input[type="checkbox"], .ant-checkbox-input, .ant-checkbox');
                if (checkbox && !checkbox.checked) {
                    checkbox.click();
                }

                // Nhấp nút Xác nhận hoặc Đồng ý
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
     * Lấy thông tin tóm tắt màn hình hiện tại
     */
    async getScreenInfo() {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");

        return await this.page.evaluate(() => {
            return {
                title: document.title,
                url: window.location.href,
                bodySnippet: document.body.innerText.slice(0, 500)
            };
        });
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
