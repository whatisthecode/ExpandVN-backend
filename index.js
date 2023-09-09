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

const zohoClientId = process.env.ZOHO_CLIENT_ID || "";
const zohoClientSecret = process.env.ZOHO_CLIENT_SECRET || "";

const app = express();
const AWS = require("aws-sdk");
const { init } = require('./storage');
const s3 = new AWS.S3();

const bucket = process.env.CYCLIC_BUCKET_NAME || "";

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

const CyclicDB = require('@cyclic.sh/dynamodb');
const cylicDB = CyclicDB(process.env.CYCLIC_DB);

app.get('/user-phone', async (req, res) => {
    const userAccessToken = req.headers["X-User-Access-Token"] || req.headers["x-user-access-token"];
    const userId = req.headers["X-User-Id"] || req.headers["x-user-id"];
    const token = req.headers["X-Token"] || req.headers["x-token"];

    if (!secretKey) return res.status(200).json({
        code: 500,
        message: "Permission denined"
    });

    if (!userAccessToken) return res.status(200).json({
        code: 400,
        message: "Missing user access token"
    });

    if (!userId) return res.status(200).json({
        code: 400,
        message: "Missing user id"
    })

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

    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('users').doc(userId);

    const cache = cylicDB.collection("cache");
    const cacheKey = "api-user-" + userId;

    request(options, async (error, response, body) => {
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
                await docRef.set({
                    userId,
                    phoneNumber: !data.error ? data.data.number : ""
                }, {
                    merge: true
                })
                await cache.delete(cacheKey);
                return res.status(200).json({
                    code: !data.error ? response.statusCode : data.error,
                    data: !data.error ? data.data : undefined,
                    message: data.error ? data.message : undefined
                });
            }
            catch (e) {
                return res.status(500).json({
                    code: 500,
                    messge: e.messge
                });
            }
        }
    });
});

const googleAPIKey = process.env.GOOGLE_API_KEY || "";

app.get('/user-location', async (req, res) => {
    const userAccessToken = req.headers["X-User-Access-Token"] || req.headers["x-user-access-token"];
    const userId = req.headers["X-User-Id"] || req.headers["x-user-id"];
    const token = req.headers["X-Token"] || req.headers["x-token"];

    if (!secretKey) return res.status(200).json({
        code: 500,
        message: "Permission denined"
    });

    if (!userAccessToken) return res.status(200).json({
        code: 400,
        message: "Missing user access token"
    });

    if (!userId) return res.status(200).json({
        code: 400,
        message: "Missing user id"
    })

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

    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('users').doc(userId);
    const cache = cylicDB.collection("cache");
    const cacheKey = "api-user-" + userId;

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
                        url: `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleAPIKey}`
                    }
                    request(optionss, async (errorr, responsee, bodyy) => {
                        if (errorr) {
                            // console.error("Error:", error);
                            return res.status(200).json({
                                code: errorr.code,
                                message: errorr.message,
                                input: optionss
                            });
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
                            await docRef.set({
                                userId,
                                location: !dataa.error ? (location.premise || location.street_address) : ""
                            }, {
                                merge: true
                            })
                            await cache.delete(cacheKey);
                            return res.status(200).json({
                                code: !dataa.error ? responsee.statusCode : dataa.error,
                                data: !dataa.error ? {
                                    location: location.premise || location.street_address
                                } : undefined,
                                message: dataa.error ? dataa.message : undefined,
                                input: data,
                                raw: dataa
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
                    res.status(200).json(oaToken);
                }
                catch (e) {
                    res.status(500).json({
                        code: 500,
                        message: e.message
                    })
                }
            }
            else res.status(400).json(JSON.parse(body));
        }
    });
});

async function sendNotification(req, res) {
    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('configs').doc("tokens");

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
        }).once("end", async () => {
            try {
                const jsonData = JSON.parse(data);
                if (jsonData.error === -216) {
                    await refreshZaloOAToken();
                    sendNotification(req, res);
                }
                else res.status(200).json(jsonData);
            }
            catch (e) {
                res.status(200).json({
                    code: 500,
                    message: e.message,
                    raw: data
                });
            }
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
}

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


    sendNotification(req, res);
});

app.post("/request-notification", async (req, res) => {
    if (!req.body.userId) return res.status(200).json({
        code: 400,
        message: "Missing user id"
    });

    const userId = req.body.userId;
    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('users').doc(userId);
    if (!docRef || !docRef.id) return res.status(200).json({
        code: 400,
        message: "User not found"
    })


    await docRef.set({
        allowedNotification: true
    }, {
        merge: true
    });

    const cache = cylicDB.collection("cache");
    const cacheKey = "api-user-" + userId;
    await cache.delete(cacheKey);

    res.status(200).json({
        code: 200,
        success: true
    });
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

app.get("/get-zoho-code-link", (req, res) => {
    const {
        scope,
        redirect_uri,
    } = req.query;

    if (!scope) return res.status(400).send("Missing scope");
    if (!redirect_uri) return res.status(400).send("Missing redirect_uri");

    const clientIdReplacer = "<$clientId>";
    const scopeReplacer = "<$scope>";
    const redirectURIReplacer = "<$redirectURI>";

    const baseURL = `https://accounts.zoho.com/oauth/v2/auth?response_type=code&client_id=${clientIdReplacer}&scope=${scopeReplacer}&redirect_uri=${redirectURIReplacer}&access_type=offline&prompt=consent`;

    const resultURL = baseURL.replace(clientIdReplacer, zohoClientId).replace(scopeReplacer, scope).replace(redirectURIReplacer, redirect_uri);

    res.status(200).send(resultURL);
});

app.get("/verify-zoho", async (req, res) => {
    const {
        code
    } = req.query;

    if (!code) return res.status(400).send("Missing code");

    const clientIdReplacer = "<$clientId>";
    const clientSecretReplacer = "<$clientSecret>";
    const redirectURIReplacer = "<$redirectURI>";
    const codeReplacer = "<$code>";

    const baseEndpoint = `https://accounts.zoho.com/oauth/v2/token?grant_type=authorization_code&client_id=${clientIdReplacer}&client_secret=${clientSecretReplacer}&redirect_uri=${redirectURIReplacer}&code=${codeReplacer}`;
    const endpoint = baseEndpoint.replace(clientIdReplacer, zohoClientId).replace(clientSecretReplacer, zohoClientSecret).replace(redirectURIReplacer, encodeURIComponent("https://expand.vn/verify-zoho")).replace(codeReplacer, code);

    const options = {
        url: endpoint,
        method: "POST"
    }

    const firestoreDB = await init(s3);

    request.post(options, async (error, response, body) => {
        if (error) {
            console.log(error);
            res.status(400).json({
                message: error.message
            });
        }
        else {
            if (response.statusCode === 200) {
                const zohoToken = JSON.parse(body);
                const docRef = firestoreDB.collection('configs').doc("tokens");
                try {
                    await docRef.set({
                        zohoAccessToken: zohoToken.access_token,
                        ...zohoToken.refresh_token ? { zohoRefreshToken: zohoToken.refresh_token } : {},
                    }, {
                        merge: true
                    });
                    res.status(200).json(zohoToken);
                }
                catch (e) {
                    res.status(500).json({
                        code: 500,
                        message: e.message
                    })
                }
            }
            else res.status(400).json(JSON.parse(body));
        }
    });

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

    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('configs').doc("tokens");

    const snapshot = await docRef.get();

    const { oaAccessToken } = snapshot.data();

    res.status(200).json({
        accessToken: oaAccessToken,
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

    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('configs').doc("tokens");

    const snapshot = await docRef.get();

    const { oaRefreshToken } = snapshot.data();

    const endpoint = "https://oauth.zaloapp.com/v4/oa/access_token";
    return new Promise((resolve, reject) => {
        request.post({
            url: endpoint,
            headers: {
                secret_key: secretKey,
            },
            form: {
                refresh_token: oaRefreshToken,
                app_id: appId,
                grant_type: "refresh_token"
            }
        }, async (error, response, body) => {
            if (error) reject(error);
            else {
                if (response.statusCode === 200) {
                    const result = JSON.parse(body);
                    console.log(result);
                    await docRef.set({
                        oaAccessToken: result.access_token,
                        oaRefreshToken: result.refresh_token
                    }, { merge: true })
                    resolve(result);
                }
                else reject({
                    code: response.statusCode,
                    ...JSON.parse(body)
                })
            }
        })
    })
}

async function refreshZohoToken() {
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

    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('configs').doc("tokens");

    const snapshot = await docRef.get();

    const { zohoRefreshToken } = snapshot.data();

    const endpoint = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${zohoRefreshToken}&client_id=${zohoClientId}&client_secret=${zohoClientSecret}&grant_type=refresh_token`;
    return new Promise((resolve, reject) => {
        request.post({
            url: endpoint
        }, async (error, response, body) => {
            if (error) reject(error);
            else {
                if (response.statusCode === 200) {
                    const result = JSON.parse(body);
                    await docRef.set({
                        zohoAccessToken: result.access_token
                    }, { merge: true })
                    resolve(result);
                }
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
});

app.post("/add-data/:type", async (req, res) => {
    const type = req.params.type;

    const _data = req.body.data;

    if (typeof _data !== "object" || !_data) return res.status(400).json({
        code: 400,
        message: "Data input must be an array object or an object"
    })

    const data = Array.isArray(_data) ? _data : [_data];

    const firestoreDB = await init(s3);

    const batch = firestoreDB.batch();
    const dataLength = data.length;

    let isValid = false;

    if (type === "seller") {
        isValid = true;
        for (let i = 0; i < dataLength; i++) {
            const item = data[i];
            const docRef = firestoreDB.collection("sellers").doc(item.id);
            batch.set(docRef, {
                ...item
            }, {
                merge: true
            });
        }
    }
    else if (type === "food") {
        isValid = true;
        for (let i = 0; i < dataLength; i++) {
            const item = data[i];
            const docRef = firestoreDB.collection("foods").doc(item.id);
            batch.set(docRef, {
                ...item
            }, {
                merge: true
            });
        }
    }
    else if (type === "banner") {
        isValid = true;
        for (let i = 0; i < dataLength; i++) {
            const item = data[i];
            const docRef = firestoreDB.collection("banners").doc(item.id);
            batch.set(docRef, {
                ...item
            }, {
                merge: true
            })
        }
    }

    if (!isValid) {
        return res.status(200).json({
            code: 200,
            message: "Nothing happened"
        });
    }
    else {
        try {
            const result = await batch.commit();
            return res.status(200).json({
                code: 200,
                data: result
            })
        }
        catch (e) {
            return res.status(500).json({
                code: 500,
                message: e.message
            })
        }
    }
});

app.get("/api/clear-cache/:key", async (req, res) => {
    const cache = cylicDB.collection("cache");
    const key = req.params.key;

    if (key === "all") {
        const data = await cache.delete("api-seller-list");
        return res.status(200).json({
            code: 200,
            data: data
        })
    }
    else {
        const data = await cache.delete(key);
        return res.status(200).json({
            code: 200,
            data: data
        })
    }
})

app.get("/api/seller-list", async (_, res) => {
    const firestoreDB = await init(s3);

    const cache = cylicDB.collection("cache");
    try {
        const cacheKey = "api-seller-list";
        const sellerListCache = await cache.get(cacheKey);
        let sellerList;
        let cacheStatus = "missing cache";
        if (sellerListCache) {

            sellerList = sellerListCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const collectionRef = firestoreDB.collection("sellers");
            const foodRef = firestoreDB.collection("foods");


            const docs = await collectionRef.get();
            sellerList = [];

            const sellerLength = docs.docs.length;

            for (let i = 0; i < sellerLength; i++) {
                const seller = await docs.docs[i].data();
                const queryHasFood = await foodRef.where("sellerSlug", "==", seller.slug).count().get();
                const hasFood = queryHasFood.data().count > 0 ? true : false;
                if (hasFood) sellerList.push(seller);
            }

            await cache.set(cacheKey, {
                data: sellerList,
                ttl: (Date.now() / 1000) + 300
            });
        }

        res.setHeader("X-Data-Cache", cacheStatus);
        res.status(200).json({
            code: 200,
            data: sellerList
        })
    }
    catch (e) {
        res.status(200).json({
            code: 500,
            messge: e.message
        })
    }
});

app.get("/api/seller/:sellerSlug", async (req, res) => {
    const sellerSlug = req.params.sellerSlug;
    const firestoreDB = await init(s3);

    const cache = cylicDB.collection("cache");
    try {
        const cacheKey = "api-seller-" + sellerSlug;
        const sellerCache = await cache.get(cacheKey);
        let seller;
        let cacheStatus = "missing cache";
        if (sellerCache) {
            seller = sellerCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const sellerRef = firestoreDB.collection("sellers");
            const foodRef = firestoreDB.collection("foods");

            const querySeller = await sellerRef.where("slug", "==", sellerSlug).get();
            const doc = querySeller.docs[0];
            if (!doc) return res.status(200).json({
                code: 404,
                message: "Seller not found"
            });

            seller = doc.data();

            const queryFoods = await foodRef.where("sellerSlug", "==", sellerSlug).get();

            foodList = [];

            queryFoods.forEach((doc) => {
                foodList.push(doc.data());
            });

            seller.foodList = foodList;

            await cache.set(cacheKey, {
                data: seller,
                ttl: (Date.now() / 1000) + 300
            });
        }

        res.setHeader("X-Data-Cache", cacheStatus);
        res.status(200).json({
            code: 200,
            data: seller
        })
    }
    catch (e) {
        res.status(200).json({
            code: 500,
            messge: e.message
        })
    }
});

app.get("/api/food-list/:sellerSlug", async (req, res) => {
    const sellerSlug = req.params.sellerSlug;
    const firestoreDB = await init(s3);

    const cache = cylicDB.collection("cache");
    try {
        const cacheKey = "api-food-list-" + sellerSlug;
        const foodListCache = await cache.get(cacheKey);
        let foodList;
        let cacheStatus = "missing cache";
        if (foodListCache) {
            foodList = foodListCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const collectionRef = firestoreDB.collection("foods");

            const docs = await collectionRef.where("sellerSlug", "==", sellerSlug).get();
            foodList = [];

            docs.forEach((doc) => {
                foodList.push(doc.data());
            });

            await cache.set(cacheKey, {
                data: foodList,
                ttl: (Date.now() / 1000) + 300
            });
        }

        res.setHeader("X-Data-Cache", cacheStatus);
        res.status(200).json({
            code: 200,
            data: foodList
        })
    }
    catch (e) {
        res.status(200).json({
            code: 500,
            messge: e.message
        })
    }
});

app.get("/api/food/:slug", async (req, res) => {
    const slug = req.params.slug;
    const firestoreDB = await init(s3);

    const cache = cylicDB.collection("cache");
    try {
        const cacheKey = "api-food-" + slug;
        const foodCache = await cache.get(cacheKey);
        let food;
        let cacheStatus = "missing cache";
        if (foodCache) {
            food = foodCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const collectionRef = firestoreDB.collection("foods");

            const docs = await collectionRef.where("slug", "==", slug).get();
            const doc = docs.docs[0];
            if (!doc) return res.status(200).json({
                code: 404,
                message: "Food not found"
            });

            food = doc.data();

            await cache.set(cacheKey, {
                data: food,
                ttl: (Date.now() / 1000) + 300
            });
        }

        res.setHeader("X-Data-Cache", cacheStatus);
        res.status(200).json({
            code: 200,
            data: food
        })
    }
    catch (e) {
        res.status(200).json({
            code: 500,
            messge: e.message
        })
    }
});

app.get("/api/banner", async (req, res) => {
    const firestoreDB = await init(s3);

    const cache = cylicDB.collection("cache");
    try {
        const cacheKey = "api-banner";
        const bannerCache = await cache.get(cacheKey);
        let banner;
        let cacheStatus = "missing cache";
        if (bannerCache) {
            banner = bannerCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const collectionRef = firestoreDB.collection("banners");

            const docs = await collectionRef.where("active", "==", true).get();
            // banner = [];
            const doc = docs.docs[0];
            if (!doc) return res.status(200).json({
                code: 200,
                data: null
            })

            banner = doc.data();
            // docs.forEach((doc) => {
            //     sellerList.push(doc.data());
            // });

            // await cache.set(cacheKey, {
            //     data: banner,
            //     ttl: (Date.now() / 1000) + 300   
            // });
        }

        res.setHeader("X-Data-Cache", cacheStatus);
        res.status(200).json({
            code: 200,
            data: banner
        })
    }
    catch (e) {
        res.status(200).json({
            code: 500,
            messge: e.message
        })
    }
});

app.get("/api/user/:id", async (req, res) => {
    const userId = req.params.id;

    const firestoreDB = await init(s3);

    const cache = cylicDB.collection("cache");
    try {
        const cacheKey = "api-user-" + userId;
        const userCache = await cache.get(cacheKey);
        let user;
        let cacheStatus = "missing cache";
        if (userCache) {
            user = userCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const collectionRef = firestoreDB.collection("users");

            const doc = collectionRef.doc(userId);
            // banner = [];
            const userData = await doc.get();

            if (!userData) return res.status(200).json({
                code: 404,
                message: "User not found"
            })

            user = userData.data();

            await cache.set(cacheKey, {
                data: user,
                ttl: (Date.now() / 1000) + 300
            });
        }

        res.setHeader("X-Data-Cache", cacheStatus);
        res.status(200).json({
            code: 200,
            data: user
        })
    }
    catch (e) {
        res.status(200).json({
            code: 500,
            messge: e.message
        })
    }
});

function getFullDateString(dateNumber) {
    if (dateNumber < 10) return `0${dateNumber}`;
    return dateNumber.toString();
}

let currentOrderCount = -1;

function getFullOrderIdString(orderNo) {
    let prefix = "";
    if (orderNo < 10) prefix = "000";
    else if (orderNo < 100) prefix = "00";
    else prefix = "000";

    return `${prefix}${orderNo}`;
}

function isTimestampDiff(timestamp1, timestamp2) {
    if (timestamp2 - timestamp1 >= (1000 * 60 * 60 * 24)) return true;
    return false;
}

async function generateOrderId(timestamp) {
    const date = new Date(timestamp);
    const dateString = getFullDateString(date.getDate());
    const monthString = getFullDateString(date.getMonth() + 1);
    const yearString = date.getFullYear();
    let orderId = `EXPD${dateString}${monthString}${yearString}`;

    if (currentOrderCount < 0) {
        currentOrderCount = 1;
        const firestoreDB = await init(s3);
        const docRef = firestoreDB.collection('configs').doc("order");
        const doc = await docRef.get();

        if (!doc.exists) {
            await docRef.set({
                currentTimestamp: (+new Date(date.getFullYear(), date.getMonth(), date.getDate())),
                count: currentOrderCount
            }, {
                merge: true
            });
        }
        else {
            const data = doc.data();
            const {count} = data;
            
            const { currentTimestamp } = data;
            if (isTimestampDiff(currentTimestamp, timestamp)) {
                currentOrderCount = 1;
                await docRef.set({
                    currentTimestamp: (+new Date(date.getFullYear(), date.getMonth(), date.getDate())),
                    count: currentOrderCount
                }, {
                    merge: true
                });
            }
            else {
                currentOrderCount = count + 1;
                await docRef.set({
                    count: currentOrderCount
                }, {
                    merge: true
                });
            }
        }
    }
    else {
        currentOrderCount += 1;
        const firestoreDB = await init(s3);
        const docRef = firestoreDB.collection('configs').doc("order");
        await docRef.set({
            count: currentOrderCount
        }, {
            merge: true
        });
    }

    orderId += getFullOrderIdString(currentOrderCount);

    return orderId;
}

async function createOrder(req, res) {
    const body = req.body;
    if (!body.timestamp) return res.status(200).json({
        code: 400,
        message: "Missing timestamp"
    })

    const timestamp = body.timestamp;
    delete body.timestamp;

    const requestBody = {
        ...body
    }
    requestBody.Order_ID = await generateOrderId(timestamp);

    const isDev = (req.headers["X-Environment"] || req.headers["x-environment"]) === "development";

    const endpoint = isDev ? "https://creatorapp.zoho.com/khoanguyen9/pos-expand-sandbox/#Form:Test_API" : "https://creator.zoho.com/api/v2/khoanguyen9/pos-expand/form/Test_API";

    const firestoreDB = await init(s3);

    const docRef = firestoreDB.collection('configs').doc("tokens");

    const snapshot = await docRef.get();

    const { zohoAccessToken } = snapshot.data();

    request.post({
        url: endpoint,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Zoho-oauthtoken ${zohoAccessToken}`,
            //...(isDev ? {"environment": "development"} : {})
        },
        body: {
            data: requestBody
        },
        json: true
    }, async (error, response, body) => {
        if (error) res.status(500).json(error);
        else {
            if (response.statusCode === 200) {
                const result = typeof body === "string" ? JSON.parse(body) : body;
                const data = result.data;
                if(data) {
                    const dataResult = {};
                    if(data.ID) dataResult.zohoOrderId = result.data.ID;
                    dataResult.orderId = requestBody.Order_ID;
    
                    res.status(200).json({
                        code: 200,
                        data: dataResult
                    });
                }
                else {
                    res.status(200).json(result);
                }
            }
            else if (response.statusCode === 401) {
                const result = typeof body === "string" ? JSON.parse(body) : body;
                if (result.code === 1030) {
                    await refreshZohoToken();
                    createOrder(req, res);
                }
                else res.status(401).json(result);
            }
            else res.status(500).json({
                code: response.statusCode,
                ...(typeof body === "string" ? JSON.parse(body) : body)
            })
        }
    })
}

app.post("/api/create-order", async (req, res) => {
    createOrder(req, res);
})

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log("Server started at port " + port);
});