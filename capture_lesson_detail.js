const puppeteer = require("puppeteer");
const config = require("./ducthinh_app/config");
const path = require("path");

async function captureLessonDetail() {
    const browser = await puppeteer.launch({
        headless: false,
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
        Object.defineProperty(document, "visibilityState", { get: () => "visible" });
        Object.defineProperty(document, "hidden", { get: () => false });
        document.hasFocus = () => true;
    });

    console.log("[*] Đăng nhập...");
    await page.goto(`${config.baseUrl}/user/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[name="lname"], input[type="text"]');
    await page.type('input[name="lname"], input[type="text"]', config.account.username, { delay: 40 });
    await page.type('input[type="password"]', config.account.password, { delay: 40 });
    await (await page.$('button.btn-login, button[type="submit"]')).click();
    await new Promise(r => setTimeout(r, 4000));

    const lessonUrl = "https://ducthinh.huelms.com/learn/course/learn/34391809/31426299-31426299/first/dao-duc-nguoi-lai-xe-van-hoa-giao-thong-va-ky-nang-pccc-va-cuu-nan-cuu-ho.html";
    await page.goto(lessonUrl, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 5000));

    // Đóng popup nếu có
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div.btn'));
        for (const b of btns) {
            const txt = b.innerText.trim();
            if (txt === "Đồng ý" || txt.includes("Tôi đồng ý") || txt === "Xác nhận") b.click();
        }
    });

    await new Promise(r => setTimeout(r, 3000));

    // Phân tích chi tiết các nút điều khiển trên bài giảng
    const controls = await page.evaluate(() => {
        const audioEls = Array.from(document.querySelectorAll('audio')).map(a => ({ src: a.src, duration: a.duration, currentTime: a.currentTime, paused: a.paused }));
        const videoEls = Array.from(document.querySelectorAll('video')).map(v => ({ src: v.src, duration: v.duration, currentTime: v.currentTime, paused: v.paused }));
        const playBtns = Array.from(document.querySelectorAll('.media-audio__play-button, .play-btn, .btn-play, [class*="play"], [class*="next"]')).map(b => ({
            tag: b.tagName,
            class: b.className,
            text: b.innerText.trim()
        }));
        const nextBtns = Array.from(document.querySelectorAll('button, a')).filter(b => b.innerText.includes("Tiếp") || b.innerText.includes("Bài tiếp") || b.innerText.includes("Chuyển bài")).map(b => ({
            tag: b.tagName,
            text: b.innerText.trim()
        }));

        return {
            audioEls,
            videoEls,
            playBtns,
            nextBtns,
            pageTitle: document.title,
            bodySnippet: document.body.innerText.slice(0, 500)
        };
    });

    console.log("\n=== CHI TIẾT ĐIỀU KHIỂN BÀI GIẢNG ===");
    console.log(JSON.stringify(controls, null, 2));

    const screenPath = path.join(__dirname, "lesson_view.png");
    await page.screenshot({ path: screenPath });
    console.log(`[✓] Đã chụp ảnh bài giảng lưu tại: ${screenPath}`);

    await browser.close();
}

captureLessonDetail().catch(console.error);
