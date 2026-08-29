const puppeteer = require("puppeteer");
const config = require("./ducthinh_app/config");
const fs = require("fs");

async function debugSidebarDOM() {
    console.log("================================================================================");
    console.log("    DEBUG CẤU TRÚC CHI TIẾT CỦA SIDEBAR (BÀI HỌC ĐÃ HỌC VS CHƯA HỌC)          ");
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
    await page.type('input[name="lname"], input[type="text"]', "035099002016", { delay: 40 });
    await page.type('input[type="password"]', "123", { delay: 40 });
    await (await page.$('button.btn-login, button[type="submit"]')).click();
    await new Promise(r => setTimeout(r, 4000));

    console.log("[*] Mở môn Kỹ thuật lái xe...");
    await page.goto("https://ducthinh.huelms.com/student/course/33944255/dashboard", { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 4000));

    console.log("[*] Vào Bài giảng điện tử...");
    await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, button, tr'));
        for (const l of links) {
            if (l.innerText && l.innerText.includes("Bài giảng điện tử")) {
                const a = l.querySelector ? l.querySelector('a') : l;
                if (a) { a.click(); return; }
            }
        }
    });

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

    // Thu thập toàn bộ HTML của sidebar
    const debugInfo = await page.evaluate(() => {
        // Tìm vùng sidebar chứa danh mục bài học
        const sidebar = document.querySelector('.ant-layout-sider, .sidebar, .course-learn__sidebar, .syllabus-tree, .ant-tree') || document.body;

        // Mở rộng tất cả các accordion / switcher
        const switchers = Array.from(document.querySelectorAll('.ant-tree-switcher, [class*="switcher"], .ant-collapse-header, .accordion-toggle'));
        for (const s of switchers) {
            try { s.click(); } catch (e) {}
        }

        // Lấy danh sách tất cả các phần tử có thể click trong sidebar
        const elements = Array.from(document.querySelectorAll('*'));
        const lessonElements = [];

        for (const el of elements) {
            const text = el.innerText ? el.innerText.trim() : "";
            // Kiểm tra xem có phải là mục bài học (ví dụ: 1.1, 1.2, 2.1, 2.16, Video chương...)
            if (text.length > 0 && text.length < 100 && (
                /^\d+\.\d+/.test(text) || text.includes("Video") || text.includes("Đạo đức") || text.includes("Bài") || text.includes("Chương")
            ) && el.children.length <= 3) {
                const html = el.outerHTML;
                const parentHtml = el.parentElement ? el.parentElement.outerHTML : "";
                
                lessonElements.push({
                    tagName: el.tagName,
                    className: el.className,
                    text: text.replace(/\n/g, ' | '),
                    outerHTML: html.slice(0, 150),
                    parentClass: el.parentElement ? el.parentElement.className : ""
                });
            }
        }

        return {
            sidebarHTML: sidebar.innerHTML.slice(0, 3000),
            lessonElements: lessonElements.slice(0, 40)
        };
    });

    fs.writeFileSync("sidebar_debug.json", JSON.stringify(debugInfo, null, 2), "utf8");
    console.log(`[✓] Đã lưu thông tin chi tiết sidebar vào sidebar_debug.json (Tìm thấy ${debugInfo.lessonElements.length} phần tử bài học)`);

    await browser.close();
}

debugSidebarDOM().catch(console.error);
