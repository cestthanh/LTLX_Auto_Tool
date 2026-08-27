const crypto = require("crypto");

class LotusClient {
    constructor(domain = "dtlxlongbien") {
        this.domain = domain;
        this.apiUrl = "https://staging-api.lotuslms.com";
        this.token = null;
        this.userIid = null;
        this.userId = null;
        this.userInfo = null;
    }

    async login(username, password) {
        const body = new URLSearchParams({
            lname: username,
            pass: password,
            _sand_domain: this.domain,
            submit: 1,
            _sand_ajax: 1,
            _sand_platform: 3,
            _sand_readmin: 1
        }).toString();

        const res = await fetch(`${this.apiUrl}/user/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            },
            body
        });

        const data = await res.json();
        if (!data.success) {
            throw new Error(`Login failed: ${JSON.stringify(data)}`);
        }

        this.userInfo = data.result;
        this.token = data.result.token;
        this.userIid = data.result.iid;
        this.userId = data.result.id;
        console.log(`[+] Logged in as: ${this.userInfo.name} (IID: ${this.userIid})`);
        return this.userInfo;
    }

    hmacSha256Int(key, msg) {
        const hex = crypto.createHmac("sha256", key).update(String(msg)).digest("hex");
        return parseInt(hex.substring(0, 8), 16) >>> 0;
    }

    computeOpeSyncToken(timestamp, token) {
        const buf = Buffer.alloc(8);
        buf.writeDoubleBE(timestamp, 0);
        const o = buf.readUInt32BE(0);
        const a = buf.readUInt32BE(4);
        const isNegative = (o & 0x80000000) !== 0;
        const c = isNegative ? ~a >>> 0 : a;
        const s = Math.floor((2 ** 48) / (2 ** 32));
        const half = Math.floor(s / 2);
        const mult = half + (this.hmacSha256Int(token, "ope:multiplier") % half);
        const offset = this.hmacSha256Int(token, "ope:offset") % half;
        return c * mult + offset;
    }

    generateSignature() {
        const e = (2 * this.userIid + 2451) + " t i a v s t";
        const n = crypto.createHash("md5").update(e).digest("hex");
        const r = crypto.createHash("md5").update(crypto.randomUUID() + Date.now()).digest("hex");
        const key = crypto.createHash("sha256").update(n).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        let ciphertext = cipher.update(r, "utf8", "base64");
        ciphertext += cipher.final("base64");
        return {
            requestId: r,
            requestToken: iv.toString("hex") + ":" + ciphertext
        };
    }

    async request(endpoint, params = {}, method = "POST", webUrl = null) {
        if (!this.token) {
            throw new Error("Client not logged in");
        }
        if (!webUrl) {
            webUrl = `https://${this.domain}.huelms.com`;
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const syncToken = this.computeOpeSyncToken(timestamp, this.token);
        const sig = this.generateSignature();

        const fullParams = {
            submit: 1,
            _sand_ajax: 1,
            _sand_platform: 3,
            _sand_readmin: 1,
            _sand_domain: this.domain,
            _sand_token: this.token,
            _sand_uiid: this.userIid,
            _sand_uid: this.userId,
            _sand_client_sync_token: syncToken,
            _sand_ri: sig.requestId,
            _sand_rit: sig.requestToken,
            _sand_web_url: webUrl,
            ...params
        };

        // Flatten object params to URL-encoded form fields if needed
        const urlParams = new URLSearchParams();
        const flatten = (obj, prefix = "") => {
            for (const [k, v] of Object.entries(obj)) {
                const key = prefix ? `${prefix}[${k}]` : k;
                if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                    flatten(v, key);
                } else if (Array.isArray(v)) {
                    v.forEach((item, idx) => {
                        if (item !== null && typeof item === "object") {
                            flatten(item, `${key}[${idx}]`);
                        } else {
                            urlParams.append(`${key}[]`, item);
                        }
                    });
                } else if (v !== undefined && v !== null) {
                    urlParams.append(key, v);
                }
            }
        };
        flatten(fullParams);

        let url = this.apiUrl + endpoint;
        let options = {
            method,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            }
        };

        if (method === "GET") {
            url += "?" + urlParams.toString();
        } else {
            options.headers["Content-Type"] = "application/x-www-form-urlencoded";
            options.body = urlParams.toString();
        }

        const res = await fetch(url, options);
        return await res.json();
    }
}

module.exports = LotusClient;
