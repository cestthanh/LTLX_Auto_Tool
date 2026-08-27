# Module Tự Động Hóa - Đào Tạo Lái Xe Đức Thịnh (ducthinh.huelms.com)

Thư mục này chứa toàn bộ mã nguồn chuẩn đã được kiểm chứng thành công để mở trình duyệt trực quan và đăng nhập vào hệ thống LMS Đức Thịnh mà không bị bẫy bảo mật kích ra ngoài (`/?logout=1`).

---

## 📁 Cấu trúc thư mục

```
ducthinh_app/
├── config.js       # File cấu hình tập trung (tài khoản, domain, danh mục khóa học, options trình duyệt)
├── browser.js      # Module điều khiển trình duyệt Puppeteer + cơ chế vô hiệu hóa devtools-detector
├── index.js        # File thực thi chính để mở trình duyệt đăng nhập trực quan
└── README.md       # Tài liệu hướng dẫn sử dụng và ghi chú kỹ thuật
```

---

## 🚀 Cách chạy nhanh

Từ thư mục gốc của dự án, chạy lệnh:

```powershell
node ducthinh_app/index.js
```

Script sẽ:
1. Mở cửa sổ Google Chrome thật trên màn hình.
2. Tự động tiêm lớp bảo vệ vô hiệu hóa bẫy `devtools-detector` (`console.table` + `debugger`).
3. Điều hướng tới `https://ducthinh.huelms.com/user/login`.
4. Điền tài khoản (`001198003037` / `123`) và đăng nhập.
5. Chuyển vào Dashboard kế hoạch học tập (`/student/ep/32672234`) và giữ nguyên cửa sổ trình duyệt cho bạn phát triển tiếp.

---

## 🛠 Cơ chế kỹ thuật vượt qua bẫy DevTools

1. **Vô hiệu hóa Performance Checker:** Gán `console.table = function() {}` và `console.clear = function() {}` trong `evaluateOnNewDocument` $\rightarrow$ Thư viện `devtools-detector` đo được $\Delta t = 0$, kết luận không mở DevTools và không kích hoạt lệnh `system_check_devtools` logout.
2. **Vô hiệu hóa Debugger Constructor:** Hook `window.Function` để chặn các lệnh tạo `debugger` ngầm.
3. **Ẩn dấu vết tự động hóa:** Xóa thuộc tính `navigator.webdriver`.
