/**
 * Cấu hình hệ thống cho trường đào tạo Đức Thịnh (ducthinh.huelms.com)
 */
module.exports = {
    domain: "ducthinh",
    baseUrl: "https://ducthinh.huelms.com",
    apiUrl: "https://staging-api.lotuslms.com",
    
    // Thông tin tài khoản mặc định
    account: {
        username: "035099002016",
        password: "123"
    },

    // Danh sách toàn bộ các môn học trong chương trình đào tạo
    allCourses: [
        {
            key: "dao_duc",
            shortName: "Đạo đức",
            fullName: "Đạo đức người lái xe, văn hóa giao thông và kỹ năng PCCC và cứu nạn, cứu hộ",
            requiredHours: 14,
            hasVideo: true,
            hasPractice: true
        },
        {
            key: "ky_thuat",
            shortName: "Kỹ thuật lái xe",
            fullName: "Kỹ thuật lái xe ô tô",
            requiredHours: 20,
            hasVideo: true,
            hasPractice: true
        },
        {
            key: "cau_tao",
            shortName: "Cấu tạo",
            fullName: "Cấu tạo sửa chữa",
            requiredHours: 8,
            hasVideo: true,
            hasPractice: true
        },
        {
            key: "phan1",
            shortName: "Phần 1",
            fullName: "Phần 1. Luật Trật tự, an toàn giao thông đường bộ",
            requiredHours: 25,
            hasVideo: true,
            hasPractice: true
        },
        {
            key: "phan2",
            shortName: "Phần 2",
            fullName: "Phần 2. Hệ thống báo hiệu đường bộ",
            requiredHours: 40,
            totalQuestions: 185,
            hasVideo: true,
            hasPractice: true
        },
        {
            key: "phan3",
            shortName: "Phần 3",
            fullName: "Phần 3. Xử lý các tình huống giao thông",
            requiredHours: 25,
            hasVideo: true,
            hasPractice: true
        },
        {
            key: "mo_phong",
            shortName: "Mô phỏng",
            fullName: "Mô phỏng các tình huống giao thông",
            requiredHours: 0,
            hasVideo: false,
            hasPractice: true
        }
    ],

    // Cấu hình luyện thi trắc nghiệm
    practice: {
        minDelayPerQuestion: 3,  // Thời gian giữ tối thiểu mỗi câu (giây)
        maxDelayPerQuestion: 5,  // Thời gian giữ tối đa mỗi câu (giây)
        readTimePerQuestion: 1,  // Thời gian giả lập đọc đề nhanh (giây)
        maxQuestions: 185        // Số câu hỏi tối đa cần làm trong đề
    },

    // Cấu hình học bài giảng điện tử & video
    video: {
        playbackRate: 1.25,      // Tốc độ phát bài giảng (1.0x - 1.5x)
        muteAudio: true,         // Tự động tắt tiếng để không làm phiền bạn
        maxLessons: 60,          // Số bài học/video tối đa trong 1 phiên
        maxHoursPerDay: 8        // Giới hạn giờ học tối đa theo quy định (8h/ngày)
    },

    // Cấu hình trình duyệt
    browser: {
        headless: false,
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
