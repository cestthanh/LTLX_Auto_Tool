# Module Tự Động Hóa - Đào Tạo Lái Xe Đức Thịnh (ducthinh.huelms.com)

Thư mục này chứa mã nguồn hoàn chỉnh để tự động hóa toàn bộ quy trình: Đăng nhập $\rightarrow$ Vào môn học $\rightarrow$ Mở mục Ôn luyện $\rightarrow$ Nhấn "Luyện tất cả" $\rightarrow$ **Tự động giải toàn bộ 185 câu hỏi với đáp án chính xác 100% và tích lũy thời gian học thật vào hồ sơ**.

---

## 📁 Cấu trúc thư mục

```
ducthinh_app/
├── config.js       # File cấu hình (tài khoản, thời gian giữ câu, số câu tối đa, domain)
├── browser.js      # Module điều khiển trình duyệt Puppeteer + Chống bẫy DevTools + Auto Solver
├── client.js       # Module API Client LotusLMS (ký số HMAC/AES)
├── index.js        # File thực thi chính chạy toàn bộ 5 bước tự động
└── README.md       # Tài liệu hướng dẫn sử dụng
```

---

## 🚀 Cách chạy nhanh

Từ thư mục gốc của dự án:

```powershell
node ducthinh_app/index.js
```

---

## ⚙️ Tùy chỉnh trong [config.js](file:///d:/H%E1%BB%8Dc%20LTLX/ducthinh_app/config.js)

```javascript
practice: {
    delayPerQuestion: 10,  // Số giây giữ ở mỗi câu hỏi (để server ghi nhận giờ học thật)
    maxQuestions: 185     // Số câu hỏi cần giải (185 câu cho Phần 2)
}
```

---

## 🎯 5 Bước tự động hóa hoàn toàn

1. **Bước 1: Đăng nhập trực quan** (Vô hiệu hóa bẫy `devtools-detector`).
2. **Bước 2: Mở môn học** `Phần 2. Hệ thống báo hiệu đường bộ`.
3. **Bước 3: Mở mục [Ôn luyện]** & Tự động đóng popup nội quy học tập.
4. **Bước 4: Bấm nút [Luyện tất cả (185)]**.
5. **Bước 5: Tự động giải đề**:
   - Tự động nạp bộ đáp án chính xác 100% từ ngân hàng câu hỏi của hệ thống.
   - Click chọn đáp án đúng trên giao diện Chrome thật.
   - Đếm ngược thời gian giữ câu (`delayPerQuestion`) để trình duyệt gửi gói tin nhịp tim về server ghi nhận giờ học.
   - Bấm `Tiếp` và lặp lại cho đến hết 185 câu hỏi.
