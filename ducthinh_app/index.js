const DucthinhBrowser = require("./browser");
const config = require("./config");

async function main() {
    console.log("================================================================================");
    console.log("    HỆ THỐNG TỰ ĐỘNG HÓA - ĐÀO TẠO LÁI XE ĐỨC THỊNH (DUCTHINH.HUELMS.COM)     ");
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

        // Hiển thị thông tin màn hình đạt được
        const info = await app.getScreenInfo();
        console.log("\n================================================================================");
        console.log("[✓] ĐÃ TỰ ĐỘNG ĐẾN MÀN HÌNH ÔN LUYỆN THÀNH CÔNG!");
        console.log(`[*] URL: ${info.url}`);
        console.log("================================================================================");

        // Duy trì phiên làm việc trực quan cho người dùng quan sát và tiếp tục phát triển
        await app.keepAlive();
    } catch (error) {
        console.error("\n[!] Đã xảy ra lỗi trong quá trình thực thi:", error.message);
    }
}

if (require.main === module) {
    main();
}

module.exports = { DucthinhBrowser, config };
