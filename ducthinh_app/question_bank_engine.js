const { GPLX_QUESTION_BANK } = require('./gplx_600_data');

class QuestionBankEngine {
    constructor() {
        // Map lưu trữ: key = qId hoặc normalized question text -> value = { content, correctAnswers, mc_answers }
        this.bankById = new Map();
        this.bankByText = new Map();
        this.gplxBank = GPLX_QUESTION_BANK;
        this.initGPLXStandardRules();
    }

    /**
     * Chuẩn hóa văn bản để so khớp không phân biệt dấu, hoa thường hay ký tự đặc biệt
     */
    normalize(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
            .replace(/đ/g, 'd')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Nạp các quy tắc & câu hỏi chuẩn GPLX 600 câu
     */
    initGPLXStandardRules() {
        // Danh sách các từ khóa đáp án "điểm liệt" và quy tắc vàng trong 600 câu GPLX
        this.priorityAnswerKeywords = [
            'bi nghiem cam',
            'nghiem cam',
            'khong duoc phep',
            'khong duoc mang vac',
            'khong duoc vuot',
            'khong duoc quay dau',
            'khong duoc lui xe',
            'khong duoc phep lai xe',
            'chap hanh hieu lenh cua nguoi dieu khien giao thong',
            'co bao ke co dinh',
            'giam toc do',
            've so 1',
            've so thap',
            'nhuong duong cho xe uu tien',
            'nhuong duong cho nguoi di bo',
            'di ve phia ben phai theo chieu di cua minh',
            'xe chua chay',
            'xe cuu thuong',
            'xe quan su',
            'xe cong an'
        ];
    }

    /**
     * Nạp dữ liệu câu hỏi từ gói tin JSON (Hỗ trợ cấu trúc lồng nhau tùy biến của LotusLMS)
     */
    feedQuestionsFromJSON(jsonObj) {
        if (!jsonObj || typeof jsonObj !== 'object') return 0;
        let addedCount = 0;

        const findQuestionsRecursive = (obj) => {
            if (!obj) return;
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    if (item && typeof item === 'object') {
                        if (item.content && (item.mc_answers || item.answers || item.options)) {
                            this.registerQuestion(item);
                            addedCount++;
                        } else {
                            findQuestionsRecursive(item);
                        }
                    }
                }
            } else if (typeof obj === 'object') {
                if (obj.content && (obj.mc_answers || obj.answers || obj.options)) {
                    this.registerQuestion(obj);
                    addedCount++;
                }
                for (const key of Object.keys(obj)) {
                    findQuestionsRecursive(obj[key]);
                }
            }
        };

        try {
            findQuestionsRecursive(jsonObj);
        } catch (e) {}

        return addedCount;
    }

    /**
     * Đăng ký 1 câu hỏi vào hệ thống tra cứu kép (theo ID & theo Text)
     */
    registerQuestion(q) {
        if (!q) return;
        const qId = q.id ? String(q.id).trim() : null;
        const rawContent = q.content || q.title || q.question || '';
        const normContent = this.normalize(rawContent);

        // Tìm các đáp án đúng
        const correctAnswers = []; // Danh sách text đáp án đúng
        const correctIndices = []; // Danh sách index đáp án đúng (0-based)
        const allOptions = [];

        if (Array.isArray(q.mc_answers)) {
            q.mc_answers.forEach((ans, idx) => {
                const text = ans.text || ans.content || ans.title || '';
                allOptions.push(text);
                if (ans.is_answer === 1 || ans.is_correct === 1 || ans.correct === true) {
                    correctAnswers.push(text);
                    correctIndices.push(idx);
                }
            });
        } else if (Array.isArray(q.options)) {
            q.options.forEach((opt, idx) => {
                const text = typeof opt === 'string' ? opt : (opt.text || opt.content || '');
                allOptions.push(text);
                if (opt.is_answer === 1 || opt.is_correct === 1 || opt.correct === true) {
                    correctAnswers.push(text);
                    correctIndices.push(idx);
                }
            });
        }

        if (correctAnswers.length === 0 && Array.isArray(q.answers)) {
            q.answers.forEach(ansIdx => {
                const numericIdx = parseInt(ansIdx, 10);
                if (!isNaN(numericIdx)) {
                    // Xử lý cả 1-based và 0-based index
                    const zeroIdx = numericIdx > 0 && numericIdx <= allOptions.length ? numericIdx - 1 : numericIdx;
                    if (allOptions[zeroIdx]) {
                        correctAnswers.push(allOptions[zeroIdx]);
                        correctIndices.push(zeroIdx);
                    }
                }
            });
        }

        const dataItem = {
            id: qId,
            content: rawContent,
            normalizedContent: normContent,
            correctAnswers: correctAnswers,
            correctIndices: correctIndices.length > 0 ? correctIndices : [0],
            allOptions: allOptions
        };

        if (qId) {
            this.bankById.set(qId, dataItem);
        }
        if (normContent.length > 10) {
            this.bankByText.set(normContent, dataItem);
        }
    }

    /**
     * Tìm đáp án tối ưu nhất cho câu hỏi trên màn hình
     * @param {Object} currentQ - { qId, title, options: [{ index, id, text, fullText, elementId }] }
     * @returns {Object} - { targetIndex, targetElementId, matchedText, confidence, strategy }
     */
    findBestAnswer(currentQ) {
        if (!currentQ || !Array.isArray(currentQ.options) || currentQ.options.length === 0) {
            return { targetIndex: 0, strategy: 'fallback_empty' };
        }

        const options = currentQ.options;
        const qId = currentQ.qId ? String(currentQ.qId).trim() : null;
        const normTitle = this.normalize(currentQ.title || '');

        // --- CHIẾN LƯỢC 1: TRA THEO QID TỪ GÓI TIN API ---
        if (qId && this.bankById.has(qId)) {
            const bankItem = this.bankById.get(qId);
            
            // 1.1 So khớp theo nội dung Text của đáp án đúng (Chống đảo thứ tự A/B/C/D)
            if (bankItem.correctAnswers && bankItem.correctAnswers.length > 0) {
                for (const correctAnsText of bankItem.correctAnswers) {
                    const normCorrect = this.normalize(correctAnsText);
                    for (let i = 0; i < options.length; i++) {
                        const normOpt = this.normalize(options[i].text || options[i].fullText || '');
                        if (normOpt && normCorrect && (normOpt.includes(normCorrect) || normCorrect.includes(normOpt))) {
                            return {
                                targetIndex: i,
                                targetOption: options[i],
                                matchedText: options[i].text,
                                confidence: 1.0,
                                strategy: 'api_qid_text_match'
                            };
                        }
                    }
                }
            }

            // 1.2 Nếu không so được text, dùng index gốc của API
            const fallbackIdx = bankItem.correctIndices[0] || 0;
            if (options[fallbackIdx]) {
                return {
                    targetIndex: fallbackIdx,
                    targetOption: options[fallbackIdx],
                    matchedText: options[fallbackIdx].text,
                    confidence: 0.95,
                    strategy: 'api_qid_index'
                };
            }
        }

        // --- CHIẾN LƯỢC 2: TRA THEO NỘI DUNG TIÊU ĐỀ CÂU HỎI (FUZZY / TEXT MATCH) ---
        if (normTitle.length > 10) {
            // Tra exact match
            if (this.bankByText.has(normTitle)) {
                const bankItem = this.bankByText.get(normTitle);
                if (bankItem.correctAnswers && bankItem.correctAnswers.length > 0) {
                    for (const correctAnsText of bankItem.correctAnswers) {
                        const normCorrect = this.normalize(correctAnsText);
                        for (let i = 0; i < options.length; i++) {
                            const normOpt = this.normalize(options[i].text || options[i].fullText || '');
                            if (normOpt && (normOpt.includes(normCorrect) || normCorrect.includes(normOpt))) {
                                return {
                                    targetIndex: i,
                                    targetOption: options[i],
                                    matchedText: options[i].text,
                                    confidence: 0.98,
                                    strategy: 'api_title_text_match'
                                };
                            }
                        }
                    }
                }
            }

            // Tra substring match trong ngân hàng
            for (const [storedNormTitle, bankItem] of this.bankByText.entries()) {
                if (normTitle.includes(storedNormTitle) || storedNormTitle.includes(normTitle)) {
                    if (bankItem.correctAnswers && bankItem.correctAnswers.length > 0) {
                        const normCorrect = this.normalize(bankItem.correctAnswers[0]);
                        for (let i = 0; i < options.length; i++) {
                            const normOpt = this.normalize(options[i].text || options[i].fullText || '');
                            if (normOpt && (normOpt.includes(normCorrect) || normCorrect.includes(normOpt))) {
                                return {
                                    targetIndex: i,
                                    targetOption: options[i],
                                    matchedText: options[i].text,
                                    confidence: 0.90,
                                    strategy: 'fuzzy_title_text_match'
                                };
                            }
                        }
                    }
                }
            }
        }

        // --- CHIẾN LƯỢC 1: QUY TẮC VÀNG 600 CÂU GPLX (CÂU ĐIỂM LIỆT & ĐÁP ÁN TUYỆT ĐỐI) ---
        for (let i = 0; i < options.length; i++) {
            const normOpt = this.normalize(options[i].text || options[i].fullText || '');
            for (const kw of this.priorityAnswerKeywords) {
                if (normOpt.includes(kw)) {
                    return {
                        targetIndex: i,
                        targetOption: options[i],
                        matchedText: options[i].text,
                        confidence: 1.0,
                        strategy: 'gplx_golden_rule'
                    };
                }
            }
        }

        // --- CHIẾN LƯỢC 2: TRA CỨU NGÂN HÀNG 600 CÂU GPLX CHUẨN (SEMANTIC PATTERNS) ---
        if (normTitle.length > 5) {
            for (const item of this.gplxBank) {
                let isMatch = false;
                if (typeof item.test === 'function') {
                    isMatch = item.test(normTitle);
                } else if (Array.isArray(item.keywords)) {
                    isMatch = item.keywords.every(kw => normTitle.includes(this.normalize(kw)));
                }

                if (isMatch) {
                    const candidateAnswers = [item.answer, ...(item.altAnswers || [])];
                    for (const cand of candidateAnswers) {
                        const normCand = this.normalize(cand);
                        for (let i = 0; i < options.length; i++) {
                            const normOpt = this.normalize(options[i].text || options[i].fullText || '');
                            if (normOpt && normCand && (normOpt.includes(normCand) || normCand.includes(normOpt))) {
                                return {
                                    targetIndex: i,
                                    targetOption: options[i],
                                    matchedText: options[i].text,
                                    confidence: 1.0,
                                    strategy: 'gplx_600_semantic_rule'
                                };
                            }
                        }
                    }
                }
            }
        }

        // --- CHIẾN LƯỢC 4: QUY TẮC VÀNG 600 CÂU GPLX (CÂU ĐIỂM LIỆT & ĐÁP ÁN TUYỆT ĐỐI) ---
        for (let i = 0; i < options.length; i++) {
            const normOpt = this.normalize(options[i].text || options[i].fullText || '');
            for (const kw of this.priorityAnswerKeywords) {
                if (normOpt.includes(kw)) {
                    return {
                        targetIndex: i,
                        targetOption: options[i],
                        matchedText: options[i].text,
                        confidence: 0.88,
                        strategy: 'gplx_golden_rule'
                    };
                }
            }
        }

        // --- CHIẾN LƯỢC 4: DỰ PHÒNG AN TOÀN (CHỌN LỰA CHỌN ĐẦU TIÊN) ---
        return {
            targetIndex: 0,
            targetOption: options[0],
            matchedText: options[0]?.text || 'Phương án 1',
            confidence: 0.5,
            strategy: 'fallback_default'
        };
    }
}

module.exports = { QuestionBankEngine };
