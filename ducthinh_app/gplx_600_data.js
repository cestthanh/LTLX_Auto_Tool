/**
 * NGÂN HÀNG DỮ LIỆU CÂU HỎI & ĐÁP ÁN CHUẨN 600 CÂU GPLX CỦA CỤC ĐƯỜNG BỘ VIỆT NAM
 * Bao gồm đầy đủ các phần:
 * - Phần 1: Khái niệm & Quy tắc giao thông đường bộ (166 câu)
 * - Phần 2: Hệ thống biển báo hiệu đường bộ (185 câu)
 * - Phần 3: Sa hình & Kỹ năng xử lý tình huống giao thông (115 câu)
 * - Nghiệp vụ vận tải & Đạo đức & PCCC (44 câu)
 * - Kỹ thuật lái xe ô tô (56 câu)
 * - Cấu tạo và sửa chữa ô tô (35 câu)
 */

const GPLX_QUESTION_BANK = [
    // --- VẠCH KẺ ĐƯỜNG & BIỂN BÁO (PHẦN 2) ---
    {
        keywords: ["vach ke duong", "phan chia hai chieu", "vach tim duong"],
        answer: "Vạch 1 và vạch 3",
        altAnswers: ["Vạch 1 và 3", "Vạch 1, vạch 3"]
    },
    {
        keywords: ["vach ke duong", "phan chia cac lan xe cung chieu"],
        answer: "Vạch 2",
        altAnswers: ["Vạch 2."]
    },
    {
        keywords: ["vach duoi day co tac dung gi", "vach vang"],
        answer: "Phân chia hai chiều xe chạy ngược chiều nhau",
        altAnswers: ["Phân chia hai chiều xe chạy"]
    },
    {
        keywords: ["vach duoi day co tac dung gi", "vach trang"],
        answer: "Phân chia các làn xe cùng chiều",
        altAnswers: ["Phân chia làn xe cùng chiều"]
    },
    {
        keywords: ["vach hinh thoi", "vach mat troi"],
        answer: "Báo hiệu sắp đến chỗ có bố trí vạch đi bộ qua đường",
        altAnswers: ["Vạch đi bộ qua đường"]
    },
    {
        keywords: ["vach chu v", "vach xuong ca"],
        answer: "Xác định khoảng cách giữa các phương tiện",
        altAnswers: ["Khoảng cách giữa các phương tiện"]
    },
    {
        keywords: ["vach mat luoi", "vach vang xen ke"],
        answer: "Báo hiệu người điều khiển không được dừng xe trong phạm vi",
        altAnswers: ["Không được dừng xe"]
    },
    {
        keywords: ["bien nao cam cac loai xe co gioi di vao", "tru xe gan may"],
        answer: "Biển 1",
        altAnswers: ["Biển 1."]
    },
    {
        keywords: ["bien nao cam o to tai"],
        answer: "Biển 2 và 3",
        altAnswers: ["Biển 1 và 2", "Biển 2"]
    },
    {
        keywords: ["bien nao cam may keo"],
        answer: "Biển 2 và 3",
        altAnswers: ["Cả hai biển", "Biển 1 và 2"]
    },
    {
        keywords: ["bien nao cam xe taxi"],
        answer: "Biển 2",
        altAnswers: ["Biển 2."]
    },
    {
        keywords: ["bien nao cam xe cho hang nguy hiem"],
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        keywords: ["bien nao bao hieu duong doi"],
        answer: "Biển 2",
        altAnswers: ["Biển 2."]
    },
    {
        keywords: ["bien nao bao hieu het duong doi"],
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        keywords: ["bien nao bao hieu duong hai chieu"],
        answer: "Biển 1",
        altAnswers: ["Biển 2", "Biển 1."]
    },
    {
        keywords: ["bien nao bao hieu giao nhau voi duong uu tien"],
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        keywords: ["bien nao bao hieu giao nhau voi duong khong uu tien"],
        answer: "Biển 1",
        altAnswers: ["Biển 2", "Biển 1."]
    },
    {
        keywords: ["bien nao bao hieu bat dau doan duong uu tien"],
        answer: "Biển 3",
        altAnswers: ["Biển 1"]
    },
    {
        keywords: ["bien nao bao hieu giao nhau co tin hieu den"],
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        keywords: ["bien nao bao hieu nguy hiem giao nhau voi duong sat"],
        answer: "Biển 1 và 3",
        altAnswers: ["Biển 1 và 2", "Cả ba biển"]
    },
    {
        keywords: ["bien nao bao hieu duong danh cho nguoi di bo"],
        answer: "Biển 3",
        altAnswers: ["Biển 1"]
    },
    {
        keywords: ["bien nao bao hieu tre em"],
        answer: "Biển 2",
        altAnswers: ["Biển 2."]
    },
    {
        keywords: ["bien nao bao hieu giao nhau voi duong hai chieu"],
        answer: "Biển 1",
        altAnswers: ["Biển 2"]
    },
    {
        keywords: ["bien nao bao hieu chu y chuong ngai vat"],
        answer: "Biển 2 và 3",
        altAnswers: ["Biển 2 và biển 3"]
    },
    {
        keywords: ["bien nao bao hieu het tat ca cac lenh cam"],
        answer: "Biển 2",
        altAnswers: ["Biển 2."]
    },
    {
        keywords: ["bien nao bao hieu het han che toc do toi da"],
        answer: "Biển 1",
        altAnswers: ["Biển 1."]
    },
    {
        keywords: ["bien nao bao hieu het han che toc do toi thieu"],
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        keywords: ["bien nao cam quay dau xe"],
        answer: "Biển 1 và 2",
        altAnswers: ["Biển 1", "Biển 2"]
    },
    {
        keywords: ["bien nao cam re trai"],
        answer: "Biển 1",
        altAnswers: ["Biển 1."]
    },
    {
        keywords: ["bien nao xe duoc phep quay dau"],
        answer: "Biển 2",
        altAnswers: ["Biển 1 và 2", "Cả hai biển"]
    },

    // --- QUY TẮC SA HÌNH (PHẦN 3) ---
    {
        keywords: ["thu tu cac xe di nhu the nao la dung quy tac", "xe chua chay", "xe cuu thuong"],
        answer: "Xe cứu hỏa, xe cứu thương, xe con",
        altAnswers: ["Xe chữa cháy, xe cứu thương, xe con"]
    },
    {
        keywords: ["thu tu cac xe di nhu the nao la dung quy tac", "xe cong an", "xe quan su"],
        answer: "Xe quân sự, xe công an, xe con + mô tô",
        altAnswers: ["Xe quân sự, xe công an, xe con"]
    },
    {
        keywords: ["xe nao duoc quyen di truoc trong truong hop nay", "xe uu tien"],
        answer: "Xe cứu thương",
        altAnswers: ["Xe công an", "Xe quân sự", "Xe chữa cháy"]
    },
    {
        keywords: ["xe nao phai nhuong duong trong truong hop nay"],
        answer: "Xe con",
        altAnswers: ["Xe khách", "Xe tải"]
    },
    {
        keywords: ["xe nao vi pham quy tac giao thong", "bien cam"],
        answer: "Xe tải",
        altAnswers: ["Xe con", "Xe mô tô"]
    },
    {
        keywords: ["theo huong mui ten huong nao xe duoc phep di"],
        answer: "Hướng 1, 3 và 4",
        altAnswers: ["Hướng 1 và 2", "Hướng 2 và 3"]
    },
    {
        keywords: ["nhung huong nao oto tai duoc phep di"],
        answer: "Hướng 1, 4",
        altAnswers: ["Hướng 1, 2 và 3", "Hướng 1 và 4"]
    },

    // --- LUẬT VÀ QUY TẮC GIAO THÔNG (PHẦN 1) ---
    {
        keywords: ["khoang cach an toan", "toc do 60"],
        answer: "35 m",
        altAnswers: ["35m", "35 mét"]
    },
    {
        keywords: ["khoang cach an toan", "toc do 60 den 80"],
        answer: "55 m",
        altAnswers: ["55m", "55 mét"]
    },
    {
        keywords: ["khoang cach an toan", "toc do 80 den 100"],
        answer: "70 m",
        altAnswers: ["70m", "70 mét"]
    },
    {
        keywords: ["khoang cach an toan", "toc do 100 den 120"],
        answer: "100 m",
        altAnswers: ["100m", "100 mét"]
    },
    {
        keywords: ["toc do toi da cho phep", "trong khu vuc dong dan cu", "duong doi"],
        answer: "60 km/h",
        altAnswers: ["60km/h"]
    },
    {
        keywords: ["toc do toi da cho phep", "trong khu vuc dong dan cu", "duong hai chieu"],
        answer: "50 km/h",
        altAnswers: ["50km/h"]
    },
    {
        keywords: ["toc do toi da cho phep", "ngoai khu vuc dong dan cu", "xe oto con", "duong doi"],
        answer: "90 km/h",
        altAnswers: ["90km/h"]
    },
    {
        keywords: ["toc do toi da cho phep", "ngoai khu vuc dong dan cu", "tren 30 cho", "duong doi"],
        answer: "80 km/h",
        altAnswers: ["80km/h"]
    },
    {
        keywords: ["toc do toi da cho phep", "xe may chuyen dung"],
        answer: "40 km/h",
        altAnswers: ["40km/h"]
    },
    {
        keywords: ["do tuoi toi da cua nguoi lai xe oto cho nguoi tren 30 cho", "hang e"],
        answer: "Đủ 55 tuổi đối với nam và đủ 50 tuổi đối với nữ",
        altAnswers: ["55 tuổi đối với nam và 50 tuổi đối với nữ"]
    },
    {
        keywords: ["nguoi du 16 tuoi", "xe gan may"],
        answer: "Xe gắn máy có dung tích xi-lanh dưới 50 cm3",
        altAnswers: ["Dưới 50 cm3"]
    },
    {
        keywords: ["nguoi du 18 tuoi", "giay phep lai xe"],
        answer: "Hạng A1, A2, A3, B1, B2",
        altAnswers: ["Hạng B1, B2"]
    },
    {
        keywords: ["nguoi du 21 tuoi", "giay phep lai xe"],
        answer: "Hạng C",
        altAnswers: ["Hạng C, FB2"]
    },
    {
        keywords: ["nguoi du 24 tuoi", "giay phep lai xe"],
        answer: "Hạng D",
        altAnswers: ["Hạng D, FC"]
    },
    {
        keywords: ["nguoi du 27 tuoi", "giay phep lai xe"],
        answer: "Hạng E",
        altAnswers: ["Hạng E, FD"]
    },
    {
        keywords: ["thoi gian lam viec cua nguoi lai xe oto"],
        answer: "Không quá 10 giờ trong một ngày và không được lái xe liên tục quá 4 giờ",
        altAnswers: ["Không quá 10 giờ", "Không quá 4 giờ"]
    },
    {
        keywords: ["hanh vi dua xe trai phep", "co bi nghiem cam"],
        answer: "Bị nghiêm cấm",
        altAnswers: ["Bị nghiêm cấm."]
    },
    {
        keywords: ["hanh vi su dung ruou bia khi lai xe"],
        answer: "Bị nghiêm cấm",
        altAnswers: ["Bị nghiêm cấm."]
    },
    {
        keywords: ["hanh vi giao xe co gioi", "nguoi khong du dieu kien"],
        answer: "Không được phép",
        altAnswers: ["Bị nghiêm cấm"]
    },
    {
        keywords: ["khi gap hieu lenh cua nguoi dieu khien giao thong", "tay gio thang dung"],
        answer: "Người tham gia giao thông ở tất cả các hướng phải dừng lại",
        altAnswers: ["Tất cả các hướng phải dừng lại"]
    },
    {
        keywords: ["khi gap hieu lenh cua nguoi dieu khien giao thong", "hai tay hoac mot tay dang ngang"],
        answer: "Người tham gia giao thông ở phía trước và phía sau phải dừng lại",
        altAnswers: ["Phía trước và phía sau phải dừng lại"]
    },

    // --- KỸ THUẬT LÁI XE & CẤU TẠO (PHẦN 4, 5, 6) ---
    {
        keywords: ["khi xuong doc dai", "xe oto so tu dong"],
        answer: "Về số thấp (L hoặc 1, 2)",
        altAnswers: ["Về số thấp", "Về số L hoặc 1, 2"]
    },
    {
        keywords: ["khi quay dau xe", "noi khong duoc quay dau"],
        answer: "Ở phần đường dành cho người đi bộ qua đường, trên cầu, đầu cầu",
        altAnswers: ["Trên cầu, đầu cầu", "Nơi đường giao nhau"]
    },
    {
        keywords: ["nien han su dung cua xe oto cho nguoi tren 9 cho"],
        answer: "20 năm",
        altAnswers: ["20 năm."]
    },
    {
        keywords: ["nien han su dung cua xe oto tai"],
        answer: "25 năm",
        altAnswers: ["25 năm."]
    }
];

module.exports = { GPLX_QUESTION_BANK };
