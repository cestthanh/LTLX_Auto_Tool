const puppeteer = require("puppeteer");
const config = require("./ducthinh_app/config");

async function inspectVideoPlayer() {
    console.log("================================================================================");
    console.log("    KHẢO SÁT PLAYER BÀI GIẢNG ĐIỆN TỬ (VIDEO LECTURE)                          ");
    console.log("================================================================================");

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

    const videoUrl = "https://ducthinh.huelms.com/learn/course/learn/34391809/31426299-31426299/first/dao-duc-nguoi-lai-xe-van-hoa-giao-thong-va-ky-nang-pccc-va-cuu-nan-cuu-ho.html";
    console.log(`[*] Mở bài giảng điện tử: ${videoUrl}`);
    await page.goto(videoUrl, { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 5000));

    // Khảo sát các thành phần player trên DOM
    const playerInfo = await page.evaluate(() => {
        const videos = Array.from(document.querySelectorAll('video'));
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({ src: f.src, id: f.id, class: f.className }));
        const buttons = Array.from(document.querySelectorAll('button, .vjs-button, .play-btn, .next-btn, [role="button"]')).map(b => b.innerText.trim() || b.className);
        const sidebarItems = Array.from(document.querySelectorAll('.ant-tree-node-content-wrapper, .menu-item, .lesson-item, .item-title, .ant-menu-item')).map(i => i.innerText.trim().replace(/\n/g, ' - '));

        return {
            hasVideoTag: videos.length > 0,
            videoCount: videos.length,
            videoSrc: videos.map(v => ({ src: v.src, currentSrc: v.currentSrc, duration: v.duration, currentTime: v.currentTime, paused: v.paused })),
            iframes,
            buttonsCount: buttons.length,
            sampleButtons: buttons.slice(0, 15),
            sidebarLessonsCount: sidebarItems.length,
            sampleLessons: sidebarItems.slice(0, 15)
        };
    });

    console.log("\n=== KẾT QUẢ KHẢO SÁT PLAYER ===");
    console.log(JSON.stringify(playerInfo, null, 2));

    console.log("\n[*] Chờ 10 giây để quan sát...");
    await new Promise(r => setTimeout(r, 10000));
    await browser.close();
}

inspectVideoPlayer().catch(console.error);
