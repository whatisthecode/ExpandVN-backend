const express = require('express')
const request = require("request");
const bodyParser = require("body-parser");
const cors = require('cors')
const { createHash, randomBytes } = require("crypto");
const base64url = require("base64url");
const path = require("path");
const fs = require("fs");

const https = require("https");

const endpoint = "https://graph.zalo.me/v2.0/me/info";

const secretKey = process.env.ZALO_APP_SECRET_KEY || "";
const appId = process.env.ZALO_APP_ID || "";

const app = express();
const AWS = require("aws-sdk");
const { init } = require('./storage');
const s3 = new AWS.S3();

const bucket = process.env.CYCLIC_BUCKET_NAME || "";

app.use(cors());
app.use(bodyParser.json());

app.get('/user-phone', (req, res) => {
    const userAccessToken = req.headers["X-User-Access-Token"] || req.headers["x-user-access-token"];
    const token = req.headers["X-Token"] || req.headers["x-token"];

    if (!secretKey) return res.status(200).json({
        code: 500,
        message: "Permission denined"
    });

    if (!userAccessToken) return res.status(200).json({
        code: 400,
        message: "Missing user access token"
    });

    if (!token) return res.status(200).json({
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
            catch (e) {
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

    if (!secretKey) return res.status(200).json({
        code: 500,
        message: "Permission denined"
    });

    if (!userAccessToken) return res.status(200).json({
        code: 400,
        message: "Missing user access token"
    });

    if (!token) return res.status(200).json({
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
            try {
                const data = JSON.parse(body);

                if (!data.error) {
                    const { latitude, longitude } = data.data;
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
                                if (r.types[0] === "street_address" && !location.street_address) {
                                    location.street_address = r.formatted_address;
                                }
                                else if (r.types[0] === "premise" && !location.premise) {
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
            catch (e) {
                const data = JSON.parse(body);
                return res.status(500).json({
                    code: 500,
                    messge: e.messge
                });
            }
        }
    });
})

app.get("/generate-challenge-code", async (req, res) => {
    const randomHex = Buffer.from(randomBytes(32), "hex");
    const random = randomHex.toString("base64");
    const verifierCode = random.replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
    const _challengeCode = createHash("sha256").update(verifierCode).digest("base64");
    const challengeCode = _challengeCode.replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");

    const firestoreDB = await init(s3);
    
    const docRef = firestoreDB.collection('configs').doc("code");
    
    try {
        await docRef.set({
            verifierCode,
            challengeCode
        }, {
            merge: true
        });

        res.status(200).json({
            verifierCode,
            challengeCode
        });
    }
    catch (e) {
        res.status(500).json({
            code: 500,
            message: e.message
        })
    }



});

app.get("/verify-app", async (req, res) => {
    const query = req.query;

    if (!query.code) return res.status(400).json({ "message": "Missing authorization code" });
    // if(!query.oa_ia) return res.status(400).json({"message": "Missing zalo app id"});


    // const codePath = path.join(__dirname, "code.json");
    // const isExists = await fileExists(codePath);
    // if(!isExists) return res.status(500).json({
    //     code: 500,
    //     message: "Missing code"
    // });

    // const code = require(codePath);

    // if(!code.verifierCode) return res.status(500).json({
    //     code: 500,
    //     message: "Missing verifier code"
    // });

    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('configs').doc("code");

    const snapshot = await docRef.get();

    const data = snapshot.data();

    const {
        verifierCode 
    } = data;

    const queries = {
        "code": query.code,
        "app_id": appId,
        "grant_type": "authorization_code",
        "code_verifier": verifierCode,
    }

    const endpoint = "https://oauth.zaloapp.com/v4/oa/access_token";
    const options = {
        url: endpoint,
        headers: {
            secret_key: secretKey
        },
        form: queries
    };

    request.post(options, async (error, response, body) => {
        if (error) {
            console.log(error);
            res.status(400).json({
                message: error.message
            });
        }
        else {
            if (response.statusCode === 200) {
                const oaToken = JSON.parse(body);
                const docRef = firestoreDB.collection('configs').doc("tokens");
                try {
                    await docRef.set({
                        oaAccessToken: oaToken.access_token,
                        oaRefreshToken: oaToken.refresh_token
                    });
                }
                catch(e){
                    res.status(500).json({
                        code: 500,
                        message: e.message
                    })
                }
                res.status(200).json(oaToken);
            }
            else res.status(400).json(JSON.parse(body));
        }
    });
});

app.post("/send-order-notification", async (req, res) => {
    if (!req.body.recipient) return res.status(200).json({
        code: 400,
        message: "Missing recipient"
    });

    if (!req.body.content) return res.status(200).json({
        code: 400,
        message: "Missing content"
    });

    // const credentialPath = path.join(__dirname, "zalo-credentials.json");
    // const isExists = await fileExists(credentialPath);
    // if(!isExists) return res.status(500).json({
    //     code: 500,
    //     message: "Missing zalo credential. Please set up first"
    // });

    // const zaloCredentials = require(credentialPath) || {};
    // if(!zaloCredentials.accessToken) return res.status(500).json({
    //     code: 500,
    //     message: "Missing zalo oa access token. Please set up first"
    // });


    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('configs').doc("code");

    const snapshot = await docRef.get();

    const { oaAccessToken } = snapshot.data();

    const reqt = https.request({
        method: "POST",
        host: "openapi.zalo.me",
        path: "/v3.0/oa/message/transaction",
        headers: {
            "access_token": oaAccessToken,
            "Content-Type": "application/json"
        }
    }, (response) => {
        let data = "";
        response.on("data", (chunk) => {
            data += chunk.toString();
        }).once("end", () => {
            res.status(200).send(data);
        });
    });

    reqt.write(JSON.stringify({
        "recipient": {
            "user_id": req.body.recipient
        },
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
                            "content": "• Cảm ơn bạn đã mua hàng.<br>• Thông tin đơn hàng của bạn như sau:"
                        },
                        {
                            "type": "table",
                            "content": req.body.content
                        },
                        {
                            "type": "text",
                            "align": "center",
                            "content": "📱Lưu ý điện thoại. Xin cảm ơn!"
                        }
                    ],
                    // "buttons": [
                    //     {
                    //         "title": "Liên hệ tổng đài",
                    //         "image_icon": "gNf2KPUOTG-ZSqLJaPTl6QTcKqIIXtaEfNP5Kv2NRncWPbDJpC4XIxie20pTYMq5gYv60DsQRHYn9XyVcuzu4_5o21NQbZbCxd087DcJFq7bTmeUq9qwGVie2ahEpZuLg2KDJfJ0Q12c85jAczqtKcSYVGJJ1cZMYtKR",
                    //         "type": "oa.open.phone",
                    //         "payload": {
                    //             "phone_code":"84123456789"
                    //         }
                    //     }
                    // ]
                }
            }
        }
    }));

    reqt.end();
});

function fileExists(filePath) {
    return new Promise((resolve) => {
        fs.access(filePath, (err) => {
            if (err) resolve(false);
            else resolve(true);
        });
    });
}

app.post("/set-app-id", async (req, res) => {
    const body = req.body;

    if (!body.appId) return res.status(400).json({
        code: 400,
        message: "Missing zalo app id"
    });

    // const credentialPath = path.join(__dirname, "zalo-credentials.json");
    // const isExists = await fileExists(credentialPath);

    // if(!isExists) fs.writeFileSync(credentialPath, "{}");

    // const zaloCredentials = require(credentialPath) || {};

    // zaloCredentials.appId = body.appId;

    res.status(200).send("OK");
})

app.post("/set-zalo-oa-access-token", async (req, res) => {
    const body = req.body;
    if (!body.accessToken) return res.status(400).json({
        code: 400,
        message: "Missing zalo oa access token"
    });

    if (!body.refreshToken) return res.status(400).json({
        code: 400,
        message: "Missing zalo oa refresh token"
    });

    // const credentialPath = path.join(__dirname, "zalo-credentials.json");
    // const isExists = await fileExists(credentialPath);

    // if(!isExists) fs.writeFileSync(credentialPath, "{}");

    // const zaloCredentials = require(credentialPath) || {};

    // zaloCredentials.accessToken = body.accessToken;
    // zaloCredentials.refreshToken = body.refreshToken;

    // fs.writeFileSync(credentialPath, JSON.stringify(zaloCredentials, null, 4));

    res.status(200).send("OK");
})

app.get("/app-info", async (req, res) => {

    // const credentialPath = path.join(__dirname, "zalo-credentials.json");
    // const isExists = await fileExists(credentialPath);
    // if(!isExists) return res.status(500).json({
    // code: 500,
    // message: "Missing zalo credential. Please set up first"
    // });

    // const zaloCredentials = require(credentialPath) || {};
    // if(!zaloCredentials.accessToken) return res.status(500).json({
    // code: 500,
    // message: "Missing zalo oa access token. Please set up first"
    // });

    res.status(200).json({
        accessToken: process.env.ZALO_OA_ACCESS_TOKEN,
        appId: appId
    });
});

async function refreshZaloOAToken() {
    // const credentialPath = path.join(__dirname, "zalo-credentials.json");
    // const isExists = await fileExists(credentialPath);
    // if(!isExists) return Promise.reject({
    // code: 500,
    // message: "Missing zalo credential. Please set up first"
    // });

    // const zaloCredentials = require(credentialPath) || {};
    // if(!zaloCredentials.accessToken) return Promise.reject({
    // code: 500,
    // message: "Missing zalo oa access token. Please set up first"
    // });

    // if(!zaloCredentials.appId) return Promise.reject({
    //     code: 500,
    //     message: "Missing zalo app id. Please set up first"
    // });

    // if(!zaloCredentials.refreshToken) return Promise.reject({
    //     code: 500,
    //     message: "Missing zalo oa refresh token. Please set up first"
    // });

    const endpoint = "https://oauth.zaloapp.com/v4/oa/access_token";
    return new Promise((resolve, reject) => {
        request.post({
            url: endpoint,
            headers: {
                secret_key: secretKey,
            },
            form: {
                refresh_token: process.env.ZALO_OA_REFRESH_TOKEN,
                app_id: appId,
                grant_type: "refresh_token"
            }
        }, (error, response, body) => {
            if (error) reject(error);
            else {
                if (response.statusCode === 200) resolve(JSON.parse(body));
                else reject({
                    code: response.statusCode,
                    ...JSON.parse(body)
                })
            }
        })
    })
}

app.post('/save-json', async (req, res) => {
    const filename = req.body.filename;

    if (!filename) return res.status(400).json({
        code: 400,
        message: "Missing filename"
    });

    const content = req.body.content;
    if (!content) return res.status(400).json({
        code: 400,
        message: "Missing content"
    })

    try {
        await s3.putObject({
            Body: JSON.stringify(content),
            Bucket: bucket,
            Key: filename,
        }).promise()

        res.set('Content-type', 'text/plain');
        res.send('ok').end();
    }
    catch (e) {
        res.status(500).json({
            code: 500,
            message: e.message
        })
    }
})

app.get('/load-json/:filename', async (req, res) => {
    const filename = req.params.filename;

    if (!filename) return res.status(400).json({
        code: 400,
        message: "Missing filename"
    });
    try {
        let s3File = await s3.getObject({
            Bucket: bucket,
            Key: filename,
        }).promise();

        res.set('Content-type', s3File.ContentType)
        res.send(s3File.Body.toString()).end()
    }
    catch (e) {
        if (e.code === 'NoSuchKey') {
            res.status(404).json({
                code: 404,
                message: `No such key ${filename}`
            });
        } else {
            res.status(500).json({
                code: 500,
                message: e.message
            });
        }
    }
})

app.listen(process.env.PORT || 3000)