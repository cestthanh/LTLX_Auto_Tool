const DucthinhBrowser = require("./browser");
const config = require("./config");

async function main() {
    // Hỗ trợ tham số linh hoạt:
    // node ducthinh_app/index.js [số_câu] [--headless]
    // node ducthinh_app/index.js [số_câu] [tài_khoản] [mật_khẩu] [--headless]
    const rawArgs = process.argv.slice(2);
    const isHeadlessCli = rawArgs.includes("--headless") || rawArgs.includes("-h");
    const args = rawArgs.filter(a => a !== "--headless" && a !== "-h");

    let maxQuestions = config.practice.maxQuestions;
    let username = config.account.username;
    let password = config.account.password;

    if (args.length === 1) {
        if (!isNaN(parseInt(args[0], 10)) && args[0].length < 6) {
            maxQuestions = parseInt(args[0], 10);
        } else {
            username = args[0];
        }
    } else if (args.length === 2) {
        if (!isNaN(parseInt(args[0], 10)) && args[0].length < 6) {
            maxQuestions = parseInt(args[0], 10);
            username = args[1];
        } else {
            username = args[0];
            password = args[1];
        }
    } else if (args.length >= 3) {
        maxQuestions = parseInt(args[0], 10);
        username = args[1];
        password = args[2];
    }

    const headlessMode = isHeadlessCli ? "new" : config.browser.headless;

    console.log("================================================================================");
    console.log("    HỆ THỐNG TỰ ĐỘNG ÔN LUYỆN - ĐÀO TẠO LÁI XE ĐỨC THỊNH (DUCTHINH.HUELMS.COM) ");
    console.log(`    TÀI KHOẢN HỌC VIÊN: ${username}                                            `);
    console.log(`    SỐ CÂU HỎI CẦN LÀM: ${maxQuestions} CÂU                                     `);
    console.log(`    CHẾ ĐỘ HIỂN THỊ   : ${headlessMode === "new" ? "CHẠY ẨN (HEADLESS)" : "TRỰC QUAN (VISIBLE)"}`);
    console.log("================================================================================");
    
    const app = new DucthinhBrowser({
        account: { username, password },
        browser: { headless: headlessMode }
    });

    try {
        // Bước 1: Mở trình duyệt và đăng nhập
        console.log("\n--- BƯỚC 1: ĐĂNG NHẬP ---");
        await app.login(username, password);

        // Bước 2: Nhấp vào môn học [Phần 2. Hệ thống báo hiệu đường bộ]
        console.log("\n--- BƯỚC 2: MỞ KHÓA HỌC [PHẦN 2] ---");
        await app.openCourse("Phần 2. Hệ thống báo hiệu đường bộ");

        // Bước 3: Nhấp vào mục [Ôn luyện] và tự động xử lý các popup
        console.log("\n--- BƯỚC 3: MỞ MỤC [ÔN LUYỆN] & XỬ LÝ POPUP ---");
        await app.openTask("Ôn luyện");

        // Bước 4: Nhấp nút "Luyện tất cả"
        console.log("\n--- BƯỚC 4: BẮT ĐẦU [LUYỆN TẤT CẢ] ---");
        await app.startPracticeAll();

        // Bước 5: Tự động giải câu hỏi với số lượng được chỉ định
        console.log("\n--- BƯỚC 5: TỰ ĐỘNG GIẢI CÂU HỎI & TÍCH LŨY GIỜ HỌC ---");
        await app.solveAllQuestions({
            minDelayPerQuestion: config.practice.minDelayPerQuestion,
            maxDelayPerQuestion: config.practice.maxDelayPerQuestion,
            readTimePerQuestion: config.practice.readTimePerQuestion,
            maxQuestions: maxQuestions
        });

        // Bước 6: Tự động bấm "Kết thúc luyện thi" và nộp bài
        console.log("\n--- BƯỚC 6: NỘP BÀI VÀ KẾT THÚC LUYỆN THI ---");
        await app.finishPractice();

        // Giữ trình duyệt để người dùng xem kết quả
        await app.keepAlive();
    } catch (error) {
        console.error("\n[!] Đã xảy ra lỗi trong quá trình thực thi:", error.message);
    }
}

if (require.main === module) {
    main();
}

module.exports = { DucthinhBrowser, config };
