const DucthinhBrowser = require("./browser");
const config = require("./config");

async function main() {
    console.log("================================================================================");
    console.log("    HỆ THỐNG TỰ ĐỘNG ÔN LUYỆN - ĐÀO TẠO LÁI XE ĐỨC THỊNH (DUCTHINH.HUELMS.COM) ");
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

        // Bước 5: Tự động giải toàn bộ 185 câu hỏi với đáp án chuẩn 100%
        console.log("\n--- BƯỚC 5: TỰ ĐỘNG GIẢI CÂU HỎI & TÍCH LŨY GIỜ HỌC ---");
        await app.solveAllQuestions({
            delayPerQuestion: config.practice.delayPerQuestion,
            maxQuestions: config.practice.maxQuestions
        });

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
