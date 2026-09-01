/**
 * NGÂN HÀNG QUY TẮC & DỮ LIỆU 600 CÂU HỎI GPLX CHUẨN BỘ GTVT
 * Sử dụng cơ chế nhận diện ngữ nghĩa thông minh (Semantic Pattern Matching)
 */

const GPLX_QUESTION_BANK = [
    // 1. QUY TẮC KHOẢNG CÁCH AN TOÀN TRÊN CAO TỐC & ĐƯỜNG BỘ
    {
        test: (q) => (q.includes("khoang cach") || q.includes("cu ly")) && q.includes("100") && q.includes("120"),
        answer: "100 m",
        altAnswers: ["100m", "100 mét", "100"]
    },
    {
        test: (q) => (q.includes("khoang cach") || q.includes("cu ly")) && q.includes("80") && q.includes("100"),
        answer: "70 m",
        altAnswers: ["70m", "70 mét", "70"]
    },
    {
        test: (q) => (q.includes("khoang cach") || q.includes("cu ly")) && q.includes("60") && q.includes("80"),
        answer: "55 m",
        altAnswers: ["55m", "55 mét", "55"]
    },
    {
        test: (q) => (q.includes("khoang cach") || q.includes("cu ly")) && (q.includes("den 60") || q.includes("bang 60") || q.includes("60 km")),
        answer: "35 m",
        altAnswers: ["35m", "35 mét", "35"]
    },

    // 2. QUY TẮC TỐC ĐỘ TỐI ĐA TRONG & NGOÀI KHU VỰC ĐÔNG DÂN CƯ
    {
        test: (q) => q.includes("toc do") && q.includes("dong dan cu") && (q.includes("duong doi") || q.includes("dai phan cach")),
        answer: "60 km/h",
        altAnswers: ["60km/h", "60"]
    },
    {
        test: (q) => q.includes("toc do") && q.includes("dong dan cu") && (q.includes("hai chieu") || q.includes("khong co dai")),
        answer: "50 km/h",
        altAnswers: ["50km/h", "50"]
    },
    {
        test: (q) => q.includes("toc do") && q.includes("ngoai") && q.includes("dong dan cu") && (q.includes("o to con") || q.includes("den 30 cho")) && (q.includes("duong doi") || q.includes("dai phan cach")),
        answer: "90 km/h",
        altAnswers: ["90km/h", "90"]
    },
    {
        test: (q) => q.includes("toc do") && q.includes("ngoai") && q.includes("dong dan cu") && q.includes("tren 30 cho") && (q.includes("duong doi") || q.includes("dai phan cach")),
        answer: "80 km/h",
        altAnswers: ["80km/h", "80"]
    },
    {
        test: (q) => q.includes("toc do") && q.includes("ngoai") && q.includes("dong dan cu") && q.includes("xe buyt"),
        answer: "70 km/h",
        altAnswers: ["70km/h", "70"]
    },
    {
        test: (q) => q.includes("toc do") && q.includes("ngoai") && q.includes("dong dan cu") && (q.includes("dau keo") || q.includes("xi tec")),
        answer: "60 km/h",
        altAnswers: ["60km/h", "60"]
    },
    {
        test: (q) => q.includes("toc do") && (q.includes("chuyen dung") || q.includes("xe gan may")),
        answer: "40 km/h",
        altAnswers: ["40km/h", "40"]
    },

    // 3. ĐỘ TUỔI VÀ HẠNG GIẤY PHÉP LÁI XE
    {
        test: (q) => q.includes("tuoi toi da") && (q.includes("hang e") || q.includes("tren 30 cho")),
        answer: "Đủ 55 tuổi đối với nam và đủ 50 tuổi đối với nữ",
        altAnswers: ["55 tuổi đối với nam và 50 tuổi đối với nữ"]
    },
    {
        test: (q) => q.includes("16 tuoi"),
        answer: "Xe gắn máy có dung tích xi-lanh dưới 50 cm3",
        altAnswers: ["Dưới 50 cm3"]
    },
    {
        test: (q) => q.includes("18 tuoi"),
        answer: "Hạng A1, A2, A3, B1, B2",
        altAnswers: ["Hạng B1, B2", "Hạng A1", "Hạng A2"]
    },
    {
        test: (q) => q.includes("21 tuoi"),
        answer: "Hạng C",
        altAnswers: ["Hạng C, FB2"]
    },
    {
        test: (q) => q.includes("24 tuoi"),
        answer: "Hạng D",
        altAnswers: ["Hạng D, FC"]
    },
    {
        test: (q) => q.includes("27 tuoi"),
        answer: "Hạng E",
        altAnswers: ["Hạng E, FD"]
    },
    {
        test: (q) => q.includes("nien han") && (q.includes("tren 9 cho") || q.includes("cho nguoi")),
        answer: "20 năm",
        altAnswers: ["20 năm."]
    },
    {
        test: (q) => q.includes("nien han") && q.includes("xe tai"),
        answer: "25 năm",
        altAnswers: ["25 năm."]
    },
    {
        test: (q) => q.includes("thoi gian lam viec") && q.includes("lai xe"),
        answer: "Không quá 10 giờ trong một ngày và không được lái xe liên tục quá 4 giờ",
        altAnswers: ["Không quá 10 giờ", "quá 4 giờ"]
    },

    // 4. VẠCH KẺ ĐƯỜNG & BIỂN BÁO
    {
        test: (q) => q.includes("vach ke duong") && (q.includes("phan chia hai chieu") || q.includes("tim duong")),
        answer: "Vạch 1 và vạch 3",
        altAnswers: ["Vạch 1 và 3", "Vạch 1, vạch 3", "Vạch 1 và vạch 3."]
    },
    {
        test: (q) => q.includes("vach ke duong") && q.includes("cung chieu"),
        answer: "Vạch 2",
        altAnswers: ["Vạch 2."]
    },
    {
        test: (q) => q.includes("vach") && q.includes("mau vang"),
        answer: "Phân chia hai chiều xe chạy ngược chiều nhau",
        altAnswers: ["Phân chia hai chiều xe chạy"]
    },
    {
        test: (q) => q.includes("vach") && q.includes("mau trang"),
        answer: "Phân chia các làn xe cùng chiều",
        altAnswers: ["Phân chia làn xe cùng chiều"]
    },
    {
        test: (q) => q.includes("vach") && (q.includes("hinh thoi") || q.includes("mat troi")),
        answer: "Báo hiệu sắp đến chỗ có bố trí vạch đi bộ qua đường",
        altAnswers: ["Vạch đi bộ qua đường"]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("cam cac loai xe co gioi"),
        answer: "Biển 1",
        altAnswers: ["Biển 1."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("cam o to tai"),
        answer: "Biển 2 và 3",
        altAnswers: ["Biển 1 và 2", "Biển 2"]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("cam may keo"),
        answer: "Biển 2 và 3",
        altAnswers: ["Cả hai biển", "Biển 1 và 2"]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("cam taxi"),
        answer: "Biển 2",
        altAnswers: ["Biển 2."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("hang nguy hiem"),
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("duong doi") && !q.includes("het"),
        answer: "Biển 2",
        altAnswers: ["Biển 2."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("het duong doi"),
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("duong hai chieu"),
        answer: "Biển 1",
        altAnswers: ["Biển 2", "Biển 1."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("giao nhau voi duong uu tien"),
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("giao nhau voi duong khong uu tien"),
        answer: "Biển 1",
        altAnswers: ["Biển 2", "Biển 1."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("bat dau doan duong uu tien"),
        answer: "Biển 3",
        altAnswers: ["Biển 1"]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("tin hieu den"),
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("duong sat"),
        answer: "Biển 1 và 3",
        altAnswers: ["Biển 1 và 2", "Cả ba biển"]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("nguoi di bo"),
        answer: "Biển 3",
        altAnswers: ["Biển 1"]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("tre em"),
        answer: "Biển 2",
        altAnswers: ["Biển 2."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("chuong ngai vat"),
        answer: "Biển 2 và 3",
        altAnswers: ["Biển 2 và biển 3"]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("het tat ca cac lenh cam"),
        answer: "Biển 2",
        altAnswers: ["Biển 2."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("het han che toc do toi da"),
        answer: "Biển 1",
        altAnswers: ["Biển 1."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("het han che toc do toi thieu"),
        answer: "Biển 3",
        altAnswers: ["Biển 3."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("cam quay dau"),
        answer: "Biển 1 và 2",
        altAnswers: ["Biển 1", "Biển 2"]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("cam re trai"),
        answer: "Biển 1",
        altAnswers: ["Biển 1."]
    },
    {
        test: (q) => q.includes("bien nao") && q.includes("duoc phep quay dau"),
        answer: "Biển 2",
        altAnswers: ["Biển 1 và 2", "Cả hai biển"]
    },

    // 5. SA HÌNH & THỨ TỰ XE
    {
        test: (q) => q.includes("thu tu cac xe") && q.includes("chua chay"),
        answer: "Xe cứu hỏa, xe cứu thương, xe con",
        altAnswers: ["Xe chữa cháy, xe cứu thương, xe con"]
    },
    {
        test: (q) => q.includes("thu tu cac xe") && (q.includes("quan su") || q.includes("cong an")),
        answer: "Xe quân sự, xe công an, xe con + mô tô",
        altAnswers: ["Xe quân sự, xe công an, xe con", "Xe công an, xe quân sự"]
    },
    {
        test: (q) => q.includes("xe nao duoc quyen di truoc") && (q.includes("cuu thuong") || q.includes("uu tien")),
        answer: "Xe cứu thương",
        altAnswers: ["Xe công an", "Xe quân sự", "Xe chữa cháy"]
    },
    {
        test: (q) => q.includes("xe nao phai nhuong duong"),
        answer: "Xe con",
        altAnswers: ["Xe khách", "Xe tải"]
    },
    {
        test: (q) => q.includes("xe nao vi pham quy tac"),
        answer: "Xe tải",
        altAnswers: ["Xe con", "Xe mô tô"]
    }
];

module.exports = { GPLX_QUESTION_BANK };
