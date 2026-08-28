const DucthinhBrowser = require("./browser");
const config = require("./config");

async function main() {
    // Hỗ trợ tham số linh hoạt:
    // Chế độ 1 (Ôn luyện trắc nghiệm):
    //   node ducthinh_app/index.js [số_câu] [--headless]
    //   node ducthinh_app/index.js [số_câu] [tài_khoản] [mật_khẩu] [--headless]
    //
    // Chế độ 2 (Học bài giảng điện tử & Video):
    //   node ducthinh_app/index.js --video [tên_môn_học] [--headless]
    //   node ducthinh_app/index.js --video "Đạo đức"
    //   node ducthinh_app/index.js --video "Kỹ thuật lái xe"

    const rawArgs = process.argv.slice(2);
    const isVideoMode = rawArgs.includes("--video") || rawArgs.includes("-v") || rawArgs.includes("--mode=video");
    const isHeadlessCli = rawArgs.includes("--headless") || rawArgs.includes("-h");
    const args = rawArgs.filter(a => a !== "--headless" && a !== "-h" && a !== "--video" && a !== "-v" && a !== "--mode=video");

    let maxQuestions = config.practice.maxQuestions;
    let username = config.account.username;
    let password = config.account.password;
    let targetCourse = isVideoMode ? (args[0] || "Đạo đức") : "Phần 2. Hệ thống báo hiệu đường bộ";

    if (!isVideoMode) {
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
    } else {
        if (args.length >= 2) {
            username = args[1];
            if (args.length >= 3) password = args[2];
        }
    }

    const headlessMode = isHeadlessCli ? "new" : config.browser.headless;

    console.log("================================================================================");
    console.log("    HỆ THỐNG TỰ ĐỘNG HÓA HỌC TẬP - ĐÀO TẠO LÁI XE ĐỨC THỊNH (DUCTHINH.HUELMS.COM)");
    console.log(`    CHẾ ĐỘ HOẠT ĐỘNG  : ${isVideoMode ? "🎬 TỰ ĐỘNG HỌC BÀI GIẢNG & VIDEO" : "📝 TỰ ĐỘNG ÔN LUYỆN TRẮC NGHIỆM"}`);
    console.log(`    TÀI KHOẢN HỌC VIÊN: ${username}                                            `);
    if (!isVideoMode) {
        console.log(`    SỐ CÂU HỎI CẦN LÀM: ${maxQuestions} CÂU                                     `);
    } else {
        console.log(`    MÔN HỌC MỤC TIÊU  : ${targetCourse}                                         `);
    }
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

        if (isVideoMode) {
            // === CHẾ ĐỘ 2: HỌC BÀI GIẢNG ĐIỆN TỬ & VIDEO ===
            console.log(`\n--- BƯỚC 2: MỞ KHÓA HỌC [${targetCourse}] ---`);
            await app.openCourse(targetCourse);

            console.log("\n--- BƯỚC 3: MỞ MỤC [BÀI GIẢNG ĐIỆN TỬ] & XỬ LÝ POPUP ---");
            await app.openTask("Bài giảng điện tử");

            console.log("\n--- BƯỚC 4: TỰ ĐỘNG HỌC TOÀN BỘ BÀI GIẢNG & VIDEO ---");
            await app.learnAllLessonsInCourse(targetCourse, config.video.maxLessons);

        } else {
            // === CHẾ ĐỘ 1: ÔN LUYỆN TRẮC NGHIỆM ===
            console.log("\n--- BƯỚC 2: MỞ KHÓA HỌC [PHẦN 2] ---");
            await app.openCourse("Phần 2. Hệ thống báo hiệu đường bộ");

            console.log("\n--- BƯỚC 3: MỞ MỤC [ÔN LUYỆN] & XỬ LÝ POPUP ---");
            await app.openTask("Ôn luyện");

            console.log("\n--- BƯỚC 4: BẮT ĐẦU [LUYỆN TẤT CẢ] ---");
            await app.startPracticeAll();

            console.log("\n--- BƯỚC 5: TỰ ĐỘNG GIẢI CÂU HỎI & TÍCH LŨY GIỜ HỌC ---");
            await app.solveAllQuestions({
                minDelayPerQuestion: config.practice.minDelayPerQuestion,
                maxDelayPerQuestion: config.practice.maxDelayPerQuestion,
                readTimePerQuestion: config.practice.readTimePerQuestion,
                maxQuestions: maxQuestions
            });

            console.log("\n--- BƯỚC 6: NỘP BÀI VÀ KẾT THÚC LUYỆN THI ---");
            await app.finishPractice();
        }

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
