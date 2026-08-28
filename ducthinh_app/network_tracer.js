const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const config = require("./config");

class NetworkTracer {
    constructor() {
        this.logFilePath = path.join(__dirname, "network_trace.log");
        this.jsonLogPath = path.join(__dirname, "network_trace.json");
        this.logs = [];
        // Khởi tạo file log rỗng
        fs.writeFileSync(this.logFilePath, `=== NETWORK TRACE START: ${new Date().toISOString()} ===\n\n`);
        fs.writeFileSync(this.jsonLogPath, "[]");
    }

    logEvent(type, data) {
        const timestamp = new Date().toISOString();
        const entry = { timestamp, type, ...data };
        this.logs.push(entry);

        const textLine = `[${timestamp}] [${type}] ${JSON.stringify(data, null, 2)}\n------------------------------------------------------------\n`;
        fs.appendFileSync(this.logFilePath, textLine);
        fs.writeFileSync(this.jsonLogPath, JSON.stringify(this.logs, null, 2));
    }

    async attach(page) {
        // Lắng nghe Request
        page.on("request", (req) => {
            const url = req.url();
            const method = req.method();
            const postData = req.postData();
            const headers = req.headers();

            if (url.includes("/api/") || url.includes("lotuslms.com") || url.includes("huelms.com")) {
                const reqLog = {
                    method,
                    url,
                    headers: {
                        authorization: headers["authorization"] || undefined,
                        "x-auth-token": headers["x-auth-token"] || undefined,
                        cookie: headers["cookie"] ? "[COOKIES_PRESENT]" : undefined
                    },
                    postData: postData ? (postData.length > 500 ? postData.slice(0, 500) + "...[TRUNCATED]" : postData) : null
                };

                console.log(`\n>>> [REQ] ${method} ${url.split('?')[0]}`);
                if (postData) {
                    console.log(`    Payload: ${postData.slice(0, 180)}`);
                }

                this.logEvent("REQUEST", reqLog);
            }
        });

        // Lắng nghe Response
        page.on("response", async (res) => {
            const url = res.url();
            const status = res.status();

            if (url.includes("/api/") || url.includes("lotuslms.com") || url.includes("huelms.com")) {
                let responseBody = null;
                try {
                    const text = await res.text();
                    try {
                        responseBody = JSON.parse(text);
                    } catch (e) {
                        responseBody = text.slice(0, 300);
                    }
                } catch (err) {
                    responseBody = `[Could not read body: ${err.message}]`;
                }

                const resLog = {
                    status,
                    url,
                    body: responseBody
                };

                const statusColor = status >= 400 ? "❌" : "✅";
                console.log(`<<< [RES ${status}] ${statusColor} ${url.split('?')[0]}`);
                if (status >= 400 || (responseBody && responseBody.success === false)) {
                    console.log(`    ⚠️ PHÁT HIỆN PHẢN HỒI LỖI / BẤT THƯỜNG:`, JSON.stringify(responseBody, null, 2));
                }

                this.logEvent("RESPONSE", resLog);
            }
        });

        // Lắng nghe Console
        page.on("console", (msg) => {
            const text = msg.text();
            if (text.includes("devtools") || text.includes("token") || text.includes("error") || text.includes("warn") || text.includes("blocked")) {
                console.log(`[BROWSER CONSOLE] 📢 ${text}`);
                this.logEvent("CONSOLE", { type: msg.type(), text });
            }
        });
    }
}

async function runTracedSession() {
    console.log("================================================================================");
    console.log("    TRÌNH THEO DÕI TOÀN DIỆN MẠNG & DỮ LIỆU THỰC TẾ (NETWORK TRACER)          ");
    console.log("================================================================================");

    const tracer = new NetworkTracer();
    console.log(`[*] File log chi tiết được lưu tại: ${tracer.logFilePath}`);

    const browser = await puppeteer.launch({
        headless: false, // MỞ CỬA SỔ CHROME TRỰC QUAN ĐỂ BẠN THẤY
        defaultViewport: null,
        args: [
            "--start-maximized",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled"
        ]
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.setUserAgent(config.browser.userAgent);

    // Gắn Tracer theo dõi toàn bộ request/response
    await tracer.attach(page);

    // Chặn bẫy devtools trên client
    await page.evaluateOnNewDocument(() => {
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

    const username = config.account.username;
    const password = config.account.password;

    console.log(`\n[*] 1. Đang truy cập ${config.baseUrl}/user/login...`);
    await page.goto(`${config.baseUrl}/user/login`, { waitUntil: "domcontentloaded", timeout: 60000 });

    console.log(`[*] 2. Điền thông tin đăng nhập: ${username}...`);
    await page.waitForSelector('input[name="lname"], input[type="text"]', { timeout: 20000 });
    await page.type('input[name="lname"], input[type="text"]', username, { delay: 40 });
    await page.type('input[type="password"]', password, { delay: 40 });

    console.log("[*] 3. Bấm Đăng nhập...");
    const btn = await page.$('button.btn-login, button[type="submit"]');
    await btn.click();

    await new Promise(r => setTimeout(r, 4000));
    console.log(`[✓] Đã đăng nhập. URL hiện tại: ${page.url()}`);

    console.log("\n[*] 4. Mở môn học [Phần 2. Hệ thống báo hiệu đường bộ]...");
    await page.waitForSelector('a, tr, td', { timeout: 20000 });
    await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        for (const a of links) {
            if (a.innerText && a.innerText.toLowerCase().includes("hệ thống báo hiệu đường bộ")) {
                a.click();
                return;
            }
        }
    });

    await new Promise(r => setTimeout(r, 4000));
    console.log(`[✓] Đang ở trang môn học: ${page.url()}`);

    console.log("\n[*] 5. Nhấp vào mục [Ôn luyện]...");
    await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr'));
        for (const row of rows) {
            if (row.innerText && row.innerText.toLowerCase().includes("ôn luyện")) {
                const link = row.querySelector('a');
                if (link) { link.click(); return; }
                const b = row.querySelector('button');
                if (b) { b.click(); return; }
            }
        }
    });

    await new Promise(r => setTimeout(r, 4000));

    // Xử lý popup nếu có
    await page.evaluate(() => {
        const cb = document.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) cb.click();
        const btns = Array.from(document.querySelectorAll('button, div.btn'));
        for (const b of btns) {
            const txt = b.innerText.trim();
            if (txt === "Đồng ý" || txt.includes("Tôi đồng ý") || txt === "Xác nhận") {
                b.click();
            }
        }
    });

    await new Promise(r => setTimeout(r, 2000));
    console.log(`[✓] Đang ở màn hình Ôn luyện: ${page.url()}`);

    console.log("\n================================================================================");
    console.log("[*] TOÀN BỘ NETWORK TRAFFIC & DỮ LIỆU THỰC TẾ ĐANG ĐƯỢC GHI NHẬN LIÊN TỤC.");
    console.log("[*] Trình duyệt đang mở trực tiếp trên màn hình của bạn để bạn theo dõi.");
    console.log("================================================================================\n");

    // Giữ kết nối
    await new Promise(() => {});
}

if (require.main === module) {
    runTracedSession().catch(console.error);
}

module.exports = { NetworkTracer, runTracedSession };
