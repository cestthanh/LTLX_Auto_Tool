const puppeteer = require("puppeteer");
const config = require("./ducthinh_app/config");

async function inspectVideoCourse() {
    console.log("================================================================================");
    console.log("    KHẢO SÁT CẤU TRÚC BÀI GIẢNG VIDEO (DUCTHINH.HUELMS.COM)                    ");
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

    // Bypass devtools & enable Always-Active
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

    // Theo dõi các API liên quan đến video và tiến độ học
    page.on("response", async (res) => {
        const url = res.url();
        if (url.includes("/learning-activity") || url.includes("/video") || url.includes("/syllabus") || url.includes("/progress") || url.includes("/item-learning-time")) {
            try {
                const json = await res.json();
                console.log(`\n[API PHÁT HIỆN] [${res.status()}] ${url.split('?')[0]}`);
                console.log("Dữ liệu tóm tắt:", JSON.stringify(json).slice(0, 250));
            } catch (e) {}
        }
    });

    console.log("[*] Đăng nhập...");
    await page.goto(`${config.baseUrl}/user/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[name="lname"], input[type="text"]');
    await page.type('input[name="lname"], input[type="text"]', config.account.username, { delay: 40 });
    await page.type('input[type="password"]', config.account.password, { delay: 40 });
    await (await page.$('button.btn-login, button[type="submit"]')).click();
    await new Promise(r => setTimeout(r, 4000));

    console.log(`[✓] Đã đăng nhập: ${page.url()}`);

    // Lấy danh sách tất cả các môn học trên Dashboard
    const courses = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr, .course-item, a'));
        const items = [];
        for (const r of rows) {
            const text = r.innerText.trim();
            const link = r.querySelector ? r.querySelector('a') : (r.tagName === 'A' ? r : null);
            if (link && link.href && (text.includes("Đạo đức") || text.includes("Kỹ thuật") || text.includes("Cấu tạo") || text.includes("Pháp luật") || text.includes("Phần 1") || text.includes("Phần 2") || text.includes("Phần 3"))) {
                items.push({ text: text.split('\n')[0], href: link.href });
            }
        }
        return items;
    });

    console.log("\n=== DANH SÁCH MÔN HỌC KHẢO SÁT ===");
    console.log(JSON.stringify(courses, null, 2));

    // Mở môn học đầu tiên để khảo sát bài giảng video
    if (courses.length > 0) {
        console.log(`\n[*] Đang mở môn học: ${courses[0].text}...`);
        await page.goto(courses[0].href, { waitUntil: "domcontentloaded" });
        await new Promise(r => setTimeout(r, 4000));

        // Khảo sát các bài giảng / video trong môn học
        const syllabusItems = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a, .item, tr, .syllabus-item'));
            return links.map(l => ({
                text: l.innerText.trim().slice(0, 100).replace(/\n/g, ' - '),
                href: l.href || null
            })).filter(i => i.text.length > 0 && (i.text.includes("Bài") || i.text.includes("Chương") || i.text.includes("Video") || i.text.includes("Giáo trình") || i.text.includes("Học")));
        });

        console.log("\n=== CẤU TRÚC BÀI HỌC / VIDEO TRONG MÔN ===");
        console.log(JSON.stringify(syllabusItems.slice(0, 10), null, 2));
    }

    console.log("\n[*] Khảo sát hoàn tất. Đóng trình duyệt sau 5s...");
    await new Promise(r => setTimeout(r, 5000));
    await browser.close();
}

inspectVideoCourse().catch(console.error);
