# Hệ Thống Tự Động Hóa Học Tập - Trường Lái Xe Đức Thịnh (ducthinh.huelms.com)

Hệ thống tự động hóa toàn diện quy trình học tập trực tuyến trên nền tảng LotusLMS dành cho học viên trường Đức Thịnh, hỗ trợ cả **Giao diện Web Dashboard Trực quan** và **Dòng lệnh CLI**.

---

## 🌟 GIAO DIỆN WEB DASHBOARD ĐA TÀI KHOẢN (MỚI)

Giao diện Web Dashboard cục bộ giúp bạn dễ dàng quản lý và cày giờ cho nhiều học viên song song:

### 🚀 Cách mở Giao diện:
Chỉ cần chạy lệnh sau trong Terminal:
```powershell
npm run gui
# hoặc
node gui.js
```
Trình duyệt sẽ tự động mở trang Dashboard: **`http://localhost:3000`**

### 🎯 Các Tính Năng Nổi Bật Trên Giao Diện:
1. **Quản lý Đa Tài Khoản Song Song:** Thêm 1, 2, 4 hoặc nhiều học viên cùng lúc. Nhập CCCD, mật khẩu, chọn môn học hoặc số câu ôn luyện.
2. **Chia 4 Ô Màn Hình (Lưới 2x2):** Bố cục dạng lưới 4 ô cân đối hoặc danh sách dọc.
3. **Tách Cửa Sổ Riêng Biệt (Popout Window):** Nút **`[ ↗ Tách ô ]`** mở riêng từng tài khoản ra một cửa sổ popup độc lập, cho phép bạn dùng phím `Win + Phím mũi tên` để ghim vào 4 góc màn hình desktop.
4. **Tùy chọn Ẩn / Hiện Chrome:** Mỗi tài khoản có thể bật/tắt chế độ `Headless` (Ẩn trình duyệt để tiết kiệm RAM và không lo chạm chuột).
5. **Thanh Tiến Độ & Live Log Thời Gian Thực:** Hiển thị phần trăm `%`, thời lượng đếm ngược video `[02:15 / 10:46]` hoặc tiến độ giải trắc nghiệm.
6. **Cảnh Báo Tức Thời (Âm Thanh & Nhấp Nháy Đỏ):** Tự động phát âm thanh cảnh báo khi phát hiện Captcha / Xác minh người thật / Khóa tài khoản, giúp bạn can thiệp kịp thời.

---

## 💻 DÒNG LỆNH CLI (Nâng Cao)

* **Ôn luyện 20 câu trắc nghiệm:**
  ```powershell
  node ducthinh_app/index.js 20
  ```
* **Tự động học Video bài giảng môn "Kỹ thuật lái xe":**
  ```powershell
  node ducthinh_app/index.js --video "Kỹ thuật lái xe"
  ```
* **Tự động học Video bài giảng môn "Cấu tạo sửa chữa":**
  ```powershell
  node ducthinh_app/index.js --video "Cấu tạo"
  ```
* **Chạy ẩn hoàn toàn:**
  ```powershell
  node ducthinh_app/index.js --video --headless
  ```
