const DucthinhBrowser = require("./browser");
const config = require("./config");

async function main() {
    console.log("================================================================================");
    console.log("    HỆ THỐNG TỰ ĐỘNG HÓA - ĐÀO TẠO LÁI XE ĐỨC THỊNH (DUCTHINH.HUELMS.COM)     ");
    console.log("================================================================================");
    
    const app = new DucthinhBrowser();

    try {
        // 1. Mở trình duyệt và đăng nhập
        await app.login();

        // 2. Lấy thông tin Dashboard
        const info = await app.getDashboardInfo();
        console.log(`[+] Xin chào: ${info.userName}`);
        console.log(`[+] Đang ở trang: ${info.title} (${info.url})`);

        // 3. Giữ trình duyệt để phát triển các tính năng tiếp theo
        await app.keepAlive();
    } catch (error) {
        console.error("[!] Đã xảy ra lỗi:", error.message);
    }
}

if (require.main === module) {
    main();
}

module.exports = { DucthinhBrowser, config };
