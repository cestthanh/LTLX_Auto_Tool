const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const config = require("./config");

async function startLiveTracer() {
    console.log("================================================================================");
    console.log("    LIVE NETWORK TRACER - THEO DÕI TOÀN BỘ GÓI TIN & PHẢN HỒI SERVER        ");
    console.log("================================================================================");

    const logFile = path.join(__dirname, "network_trace.log");
    fs.writeFileSync(logFile, `=== NETWORK TRACE START: ${new Date().toISOString()} ===\n\n`);

    function logTrace(type, data) {
        const time = new Date().toLocaleTimeString();
        const text = `[${time}] [${type}]\n${JSON.stringify(data, null, 2)}\n------------------------------------------------------------\n`;
        fs.appendFileSync(logFile, text);
    }

    const browser = await puppeteer.launch({
        headless: false, // MỞ CỬA SỔ CHROME TRỰC TIẾP
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

    // Ghi nhận Request
    page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        const postData = req.postData();

        if (url.includes("/api/") || url.includes("lotuslms.com")) {
            console.log(`\n🔵 >>> [REQ ${method}] ${url.split('?')[0]}`);
            if (postData) {
                console.log(`       Payload: ${postData.slice(0, 150)}`);
            }
            logTrace("REQUEST", { method, url, postData: postData || null });
        }
    });

    // Ghi nhận Response
    page.on("response", async (res) => {
        const url = res.url();
        const status = res.status();

        if (url.includes("/api/") || url.includes("lotuslms.com")) {
            let body = null;
            try {
                const text = await res.text();
                try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 200); }
            } catch (e) {
                body = "[Unreadable body]";
            }

            const icon = status >= 400 ? "❌ [LỖI]" : "🟢";
            console.log(`   <<< [RES ${status}] ${icon} ${url.split('?')[0]}`);
            
            if (status >= 400 || (body && body.success === false) || (body && body.errors && body.errors.length > 0)) {
                console.log(`   🚨 [CẢNH BÁO / LỖI SERVER]:`, JSON.stringify(body, null, 2));
            }
            logTrace("RESPONSE", { status, url, body });
        }
    });

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

    console.log(`[*] 1. Đang truy cập ${config.baseUrl}/user/login...`);
    await page.goto(`${config.baseUrl}/user/login`, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 2000));

    // Nếu có form đăng nhập thì điền
    const userInput = await page.$('input[name="lname"], input[type="text"]');
    if (userInput) {
        console.log(`[*] 2. Đăng nhập tài khoản: ${username}...`);
        await userInput.type(username, { delay: 40 });
        const passInput = await page.$('input[type="password"]');
        if (passInput) await passInput.type(password, { delay: 40 });

        const btn = await page.$('button.btn-login, button[type="submit"]');
        if (btn) await btn.click();
        await new Promise(r => setTimeout(r, 4000));
    } else {
        console.log(`[*] Đã có phiên đăng nhập sẵn. Bỏ qua bước nhập mật khẩu.`);
    }

    console.log(`[✓] Đang ở URL: ${page.url()}`);

    console.log("\n[*] 3. Vào trực tiếp khóa học [Phần 2. Hệ thống báo hiệu đường bộ]...");
    await page.goto("https://ducthinh.huelms.com/student/course/32672246/dashboard", { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 3000));

    console.log("\n[*] 4. Vào mục [Ôn luyện]...");
    await page.goto("https://ducthinh.huelms.com/learn/course/learn/32672246/31426576-31426576/31426576-31426574-1/phan-2-he-thong-bao-hieu-duong-bo.html", { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 3000));

    // Đóng các popup
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
    console.log("[*] TOÀN BỘ NETWORK LOG ĐANG ĐƯỢC GHI TRỰC TIẾP RA MÀN HÌNH VÀ FILE LOG.");
    console.log(`[*] File log: ${logFile}`);
    console.log("[*] Cửa sổ Chrome đang hiển thị trực tiếp trước mặt bạn.");
    console.log("================================================================================\n");

    // Giữ kết nối
    await new Promise(() => {});
}

startLiveTracer().catch(console.error);
