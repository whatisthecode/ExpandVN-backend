const express = require('express')
const request = require("request");
const bodyParser = require("body-parser");
const cors = require('cors')
const { createHash, randomBytes } = require("crypto");
const base64url = require("base64url")


const endpoint = "https://graph.zalo.me/v2.0/me/info";

const secretKey = process.env.ZALO_APP_SECRET_KEY || "";

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.get('/user-phone', (req, res) => {
    const userAccessToken = req.headers["X-User-Access-Token"] || req.headers["x-user-access-token"];
    const token = req.headers["X-Token"] || req.headers["x-token"];

    if(!secretKey) return res.status(200).json({
        code: 500,
        message: "Permission denined"
    });

    if(!userAccessToken) return res.status(200).json({
        code: 400,
        message: "Missing user access token"
    });

    if(!token) return res.status(200).json({
        code: 401,
        message: "Missing token"
    });

    const options = {
        url: endpoint,
        headers: {
            access_token: userAccessToken,
            code: token,
            secret_key: secretKey
        }
    };

    request(options, (error, response, body) => {
        if (error) {
            // console.error("Error:", error);
            return res.status(200).json({
                code: error.code,
                message: error.message,
                input: options
            })
        } else {
            // console.log("Response Code:", response.statusCode);
            // console.log("Response Body:", body);
            try {
                const data = JSON.parse(body);
                return res.status(200).json({
                    code: !data.error ? response.statusCode : data.error,
                    data: !data.error ? data.data : undefined,
                    message: data.error ? data.message : undefined
                });
            }
            catch(e){
                const data = JSON.parse(body);
                return res.status(500).json({
                    code: 500,
                    messge: e.messge
                });
            }
        }
    });
})
app.get('/user-location', (req, res) => {
    const userAccessToken = req.headers["X-User-Access-Token"] || req.headers["x-user-access-token"];
    const token = req.headers["X-Token"] || req.headers["x-token"];

    if(!secretKey) return res.status(200).json({
        code: 500,
        message: "Permission denined"
    });

    if(!userAccessToken) return res.status(200).json({
        code: 400,
        message: "Missing user access token"
    });

    if(!token) return res.status(200).json({
        code: 401,
        message: "Missing token"
    });

    const options = {
        url: endpoint,
        headers: {
            access_token: userAccessToken,
            code: token,
            secret_key: secretKey
        }
    };

    request(options, (error, response, body) => {
        if (error) {
            // console.error("Error:", error);
            return res.status(200).json({
                code: error.code,
                message: error.message,
                input: options
            })
        } else {
            // console.log("Response Code:", response.statusCode);
            // console.log("Response Body:", body);
            try {
                const data = JSON.parse(body);

                if(!data.error) {
                    const {latitude, longitude} = data.data;
                    const optionss = {
                        url: `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=AIzaSyDr3fhrxYjKoUWG1de5OCeWV66as9t3-r8`
                    }
                    request(optionss, (errorr, responsee, bodyy) => {
                        if (errorr) {
                            // console.error("Error:", error);
                            return res.status(200).json({
                                code: errorr.code,
                                message: errorr.message,
                                input: optionss
                            })
                        }
                        else {
                            const dataa = JSON.parse(bodyy);

                            const results = dataa.error ? [] : (dataa.results || []);
                            
                            const location = {
                                premise: "",
                                street_address: ""
                            }

                            results.map(r => {
                                if(r.types[0] === "street_address" && !location.street_address) {
                                    location.street_address = r.formatted_address;
                                }
                                else if(r.types[0] === "premise" && !location.premise) {
                                    location.premise = r.formatted_address;
                                }
                            });

                            return res.status(200).json({
                                code: !dataa.error ? responsee.statusCode : dataa.error,
                                data: !dataa.error ? {
                                    location: location.premise || location.street_address
                                } : undefined,
                                message: dataa.error ? dataa.message : undefined,
                                input: data.data
                            });
                        }
                    });
                }

                else {
                    return res.status(200).json({
                        code: !data.error ? response.statusCode : data.error,
                        data: !data.error ? data.data : undefined,
                        message: data.error ? data.message : undefined
                    });
                }
            }
            catch(e){
                const data = JSON.parse(body);
                return res.status(500).json({
                    code: 500,
                    messge: e.messge
                });
            }
        }
    });
})

app.get("/generate-challenge-code", (req, res) => {
    const randomHex = Buffer.from(randomBytes(32), "hex");
    const random = randomHex.toString("base64");
    const verifierCode = base64url(random);
    // const challengeCode = base64url(Buffer.from(createHash("sha256").update(verifierCode).digest("hex")).toString());
    const _challengeCode = createHash("sha256").update(verifierCode).digest("base64");
    const challengeCode = _challengeCode.replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");

    res.status(200).json({
        verifierCode,
        challengeCode
    });
});

app.get("/verify-app", (req, res) => {
    const query = req.query;

    if(!query.code) return res.status(400).json({"message": "Missing authorization code"});
    if(!query.oa_ia) return res.status(400).json({"message": "Missing zalo app id"});


    const queries = {
        "code":  query.code,
        "app_id" : query.oa_id,
        "grant_type": "authorization_code",
        "code_verifier" : "eWZqNlUvbFZwTUhhL25qM2ZFaGxSaXFhajFqZDJOWDJMS1diaFhvV2YrWT0",
    }

    const endpoint = "https://oauth.zaloapp.com/v4/oa/access_token";
    const options = {
        url: endpoint,
        headers: {
            secret_key: secretKey
        },
        form: queries
    };

    request.post(options, (error, response, body) => {
        if (error) {
            console.log(error);
            res.status(400).json({
                message: error.message
            });
        }
        else {
            if(response.statusCode === 200) res.status(200).json(JSON.parse(body));
            else res.status(400).json(JSON.parse(body));
        }
    });
});

app.post("/send-order-notification", (req, res) => {
    if(!req.body.recipient) return res.status(200).json({
        code: 400,
        message: "Missing recipient"
    });

    const zaloOAAcessToken = process.env.ZALO_OA_ACCESS_TOKEN;
    const zaloOARefreshToken = process.env.ZALO_OA_REFRESH_TOKEN;

    const endpoint = "https://openapi.zalo.me/v3.0/oa/message/transaction";

    request.post(endpoint, {
        "headers": {
            "access_token": zaloOAAcessToken,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "recipient": req.body.recipient,
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "transaction_order",
                        "language": "VI",
                        "elements": [
                            {
                                "type": "header",
                                "content": "Xác nhận đơn hàng",
                                "align": "left"
                            },
                            {
                                "type": "text",
                                "align": "left",
                                "content": "• Cảm ơn bạn đã mua hàng tại cửa hàng.<br>• Thông tin đơn hàng của bạn như sau:"
                            },
                            {
                                "type": "table",
                                "content": [
                                    {
                                        "value": "F-01332973223",
                                        "key":"Mã khách hàng"
                                    },
                                    {
                                        "style": "yellow",
                                        "value": "Đang giao",
                                        "key": "Trạng thái"
                                    },
                                    {
                                        "value": "250,000đ",
                                        "key": "Giá tiền"
                                    }
                                ]
                            },
                            {
                                "type": "text",
                                "align": "center",
                                "content": "📱Lưu ý điện thoại. Xin cảm ơn!"
                            }
                        ],
                        "buttons": [
                            {
                                "title": "Liên hệ tổng đài",
                                "image_icon": "gNf2KPUOTG-ZSqLJaPTl6QTcKqIIXtaEfNP5Kv2NRncWPbDJpC4XIxie20pTYMq5gYv60DsQRHYn9XyVcuzu4_5o21NQbZbCxd087DcJFq7bTmeUq9qwGVie2ahEpZuLg2KDJfJ0Q12c85jAczqtKcSYVGJJ1cZMYtKR",
                                "type": "oa.open.phone",
                                "payload": {
                                    "phone_code":"84123456789"
                                }
                            }
                        ]
                    }
                }
            }
        })
    }, (error, response, body) => {
        if(error) {
            return res.status(400).json({
                code: error.code,
                message: error.message
            })
        } 
        else {
            if(response.statusCode === 200) {
                return res.status(200).send(body);
            }
            else {
                return res.status(400).send(body);
            }
        }
    });
});

app.listen(process.env.PORT || 3000)