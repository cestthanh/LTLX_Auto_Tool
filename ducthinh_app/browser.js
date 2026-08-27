const puppeteer = require("puppeteer");
const config = require("./config");

class DucthinhBrowser {
    constructor(options = {}) {
        this.config = { ...config, ...options };
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
        await this.page.goto(loginUrl, { waitUntil: "networkidle2" });

        console.log(`[*] Nhập tài khoản: ${username}`);
        await this.page.waitForSelector('input[name="lname"], input[type="text"]', { timeout: 15000 });
        
        const userInput = await this.page.$('input[name="lname"], input[type="text"]');
        await userInput.type(username, { delay: 40 });

        const passInput = await this.page.$('input[type="password"]');
        await passInput.type(password, { delay: 40 });

        console.log("[*] Bấm Đăng nhập...");
        const btn = await this.page.$('button.btn-login, button[type="submit"]');
        await btn.click();

        // Chờ chuyển trang vào màn hình chính
        await new Promise(r => setTimeout(r, 3000));

        const currentUrl = this.page.url();
        if (currentUrl.includes("/user/login")) {
            throw new Error("Đăng nhập không thành công hoặc bị trả về trang login.");
        }

        console.log(`[✓] ĐÃ ĐĂNG NHẬP THÀNH CÔNG!`);
        console.log(`[*] URL Dashboard: ${currentUrl}`);
        return currentUrl;
    }

    /**
     * Lấy thông tin học viên và danh sách môn học trên màn hình chính
     */
    async getDashboardInfo() {
        if (!this.page) throw new Error("Trình duyệt chưa được khởi chạy.");

        return await this.page.evaluate(() => {
            const userNameEl = document.querySelector(".user-name, .profile-name, h1, h2, h3");
            const courseRows = Array.from(document.querySelectorAll("table tr, .course-item, tr"));
            
            return {
                title: document.title,
                url: window.location.href,
                userName: userNameEl ? userNameEl.innerText.trim() : "Unknown",
                rowCount: courseRows.length
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
