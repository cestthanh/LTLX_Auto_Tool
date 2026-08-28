# Hệ Thống Tự Động Hóa Học Tập - Trường Lái Xe Đức Thịnh (ducthinh.huelms.com)

Hệ thống tự động hóa toàn diện quy trình học tập trực tuyến trên nền tảng LotusLMS dành cho học viên trường Đức Thịnh.

---

## 🌟 Các Tính Năng Nổi Bật

1. **Vô hiệu hóa 100% bẫy DevTools & Anti-Cheat**: Tự động vô hiệu hóa `devtools-detector` và các cơ chế bẫy `client_sync_token`.
2. **Cơ chế Always-Active & Anti-Blur**: Thoải mái chuyển tab, chuyển màn hình, thu nhỏ Chrome (minimize) hoặc tắt màn hình mà hệ thống không bao giờ báo vi phạm hay dừng phát.
3. **Smart Captcha Auto-Resume**: Tự động phát chuông báo khi có Captcha/xác minh, tạm dừng và tự động làm tiếp ngay khi bạn xác nhận xong trên Chrome.
4. **Mô phỏng hành vi tự nhiên (Human-like Simulation)**: Di chuyển chuột mượt mà (smooth mouse movement), thời gian giữ câu ngẫu nhiên, đọc đề trước khi chọn đáp án.
5. **Tự động Nộp bài (Finish Practice)**: Tự động bấm *Kết thúc luyện thi* và xác nhận nộp bài sau khi giải xong.
6. **Module Học Bài Giảng Điện Tử & Video**: Tự động phát toàn bộ slides âm thanh và video bài giảng, tự động tắt tiếng (mute) và chuyển bài liên tục.

---

## 🚀 Hướng Dẫn Sử Dụng

### 1. Chế độ 1: Tự động Ôn luyện Trắc nghiệm (Đề chuẩn 100%)

* **Giải 20 câu hỏi:**
  ```powershell
  node ducthinh_app/index.js 20
  ```
* **Giải 50 câu hỏi chạy ẩn hoàn toàn:**
  ```powershell
  node ducthinh_app/index.js 50 --headless
  ```
* **Giải với tài khoản khác:**
  ```powershell
  node ducthinh_app/index.js 25 001198003037 123
  ```

---

### 2. Chế độ 2: Tự động Học Bài Giảng Điện Tử & Video

* **Tự động học môn mặc định ("Đạo đức người lái xe"):**
  ```powershell
  node ducthinh_app/index.js --video
  ```
* **Tự động học môn cụ thể (ví dụ: "Kỹ thuật lái xe ô tô"):**
  ```powershell
  node ducthinh_app/index.js --video "Kỹ thuật lái xe"
  ```
* **Tự động học môn cụ thể (ví dụ: "Cấu tạo sửa chữa"):**
  ```powershell
  node ducthinh_app/index.js --video "Cấu tạo"
  ```
* **Tự động học video chạy ẩn hoàn toàn:**
  ```powershell
  node ducthinh_app/index.js --video --headless
  ```

---

## ⚙️ Cấu Hình Tùy Chỉnh

Mọi thông tin tài khoản, thời gian giữ câu, tốc độ phát video có thể điều chỉnh tại file `ducthinh_app/config.js`:

```javascript
module.exports = {
    account: {
        username: "025098009525", // Tài khoản mặc định
        password: "123"
    },
    practice: {
        minDelayPerQuestion: 3,  // Giữ tối thiểu mỗi câu (giây)
        maxDelayPerQuestion: 5,  // Giữ tối đa mỗi câu (giây)
        maxQuestions: 185
    },
    video: {
        playbackRate: 1.25,      // Tốc độ phát video (1.0x - 1.5x)
        muteAudio: true,         // Tự động tắt tiếng
        maxLessons: 50           // Số bài tối đa trong 1 phiên
    }
};
```
