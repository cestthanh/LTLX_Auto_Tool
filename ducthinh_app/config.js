/**
 * Cấu hình hệ thống cho trường đào tạo Đức Thịnh (ducthinh.huelms.com)
 */
module.exports = {
    domain: "ducthinh",
    baseUrl: "https://ducthinh.huelms.com",
    apiUrl: "https://staging-api.lotuslms.com",
    
    // Thông tin tài khoản mặc định
    account: {
        username: "001198003037",
        password: "123"
    },

    // Thông tin các khóa học chính
    courses: {
        phan1: {
            iid: 32672244,
            name: "Phần 1. Luật Trật tự, an toàn giao thông đường bộ"
        },
        phan2: {
            iid: 32672246,
            name: "Phần 2. Hệ thống báo hiệu đường bộ",
            totalQuestions: 182
        },
        phan3: {
            iid: 32672248,
            name: "Phần 3. Xử lý các tình huống giao thông"
        }
    },

    // Cấu hình trình duyệt
    browser: {
        headless: false, // Mở cửa sổ trực quan
        viewport: null,
        args: [
            "--start-maximized",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled"
        ],
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
};
