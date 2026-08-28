const DucthinhBrowser = require("./browser");
const config = require("./config");

async function main() {
    // Đọc số câu hỏi từ tham số dòng lệnh (nếu có): ví dụ "node ducthinh_app/index.js 30"
    const args = process.argv.slice(2);
    const cliQuestions = args[0] ? parseInt(args[0], 10) : null;
    const maxQuestions = cliQuestions && !isNaN(cliQuestions) ? cliQuestions : config.practice.maxQuestions;

    console.log("================================================================================");
    console.log("    HỆ THỐNG TỰ ĐỘNG ÔN LUYỆN - ĐÀO TẠO LÁI XE ĐỨC THỊNH (DUCTHINH.HUELMS.COM) ");
    console.log(`    SỐ CÂU HỎI CẦN LÀM: ${maxQuestions} CÂU                                     `);
    console.log("================================================================================");
    
    const app = new DucthinhBrowser();

    try {
        // Bước 1: Mở trình duyệt và đăng nhập
        console.log("\n--- BƯỚC 1: ĐĂNG NHẬP ---");
        await app.login();

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
