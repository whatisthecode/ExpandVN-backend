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
app.use(bodyParser.urlencoded({ 
    extended: true 
}));

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
                console.log(data);
                await docRef.set({
                    userId,
                    phoneNumber: data.phoneNumber
                }, {
                    merge: true
                })
                return res.status(200).json({
                    code: !data.error ? response.statusCode : data.error,
                    data: !data.error ? data.data : undefined,
                    message: data.error ? data.message : undefined
                });
            }
            catch (e) {
                console.log(e);
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
                        url: `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleAPIKey}-r8`
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
                                location: !dataa.error ? {
                                    location: location.premise || location.street_address
                                } : undefined
                            }, {
                                merge: true
                            })
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
                catch(e){
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
                if(jsonData.error === -216) {
                    await refreshZaloOAToken();
                    sendNotification(req, res);
                }
                else res.status(200).send(jsonData);
            }
            catch(e) {
                res.status(200).send({
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

    const { refreshToken } = snapshot.data();

    const endpoint = "https://oauth.zaloapp.com/v4/oa/access_token";
    return new Promise((resolve, reject) => {
        request.post({
            url: endpoint,
            headers: {
                secret_key: secretKey,
            },
            form: {
                refresh_token: refreshToken,
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
});

app.post("/add-data/:type", async (req, res) => {
    const type = req.params.type;

    const _data = req.body.data;

    if(typeof _data !== "object" || !_data) return res.status(400).json({
        code: 400,
        message: "Data input must be an array object or an object"
    })

    const data = Array.isArray(_data) ? _data : [_data];

    const firestoreDB = await init(s3);

    const batch = firestoreDB.batch();
    const dataLength = data.length;

    let isValid = false;

    if(type === "seller") {
        isValid = true;
        for(let i = 0; i < dataLength; i++) {
            const item = data[i];
            const docRef = firestoreDB.collection("sellers").doc(item.id);
            batch.set(docRef, {
                ...item
            }, {
                merge: true
            });
        }
    }
    else if(type === "food") {
        isValid = true;
        for(let i = 0; i < dataLength; i++) {
            const item = data[i];
            const docRef = firestoreDB.collection("foods").doc(item.id);
            batch.set(docRef, {
                ...item
            }, {
                merge: true
            });
        }
    }
    else if(type === "banner") {
        isValid = true;
        for(let i = 0; i < dataLength; i++){
            const item = data[i];
            const docRef = firestoreDB.collection("banners").doc(item.id);
            batch.set(docRef, {
                ...item
            }, {
                merge: true
            })
        }
    }

    if(!isValid) {
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
        catch(e){
            return res.status(500).json({
                code: 500,
                message: e.message
            })
        }
    }
});


const CyclicDB = require('@cyclic.sh/dynamodb');
const cylicDB = CyclicDB(process.env.CYCLIC_DB);

app.get("/api/clear-cache/:type", async (req, res) => {
    const cache = cylicDB.collection("cache");
    const type = req.params.type;

    if(type === "all") {
        const data = await cache.delete("api-seller-list");
        return res.status(200).json({
            code: 200,
            data: data
        })
    }

    return res.status(200).json({
        code: 200,
        message: "Nothing happened"
    })
})

app.get("/api/seller-list", async (_, res) => {
    const firestoreDB = await init(s3);

    const cache = cylicDB.collection("cache");
    try {
        const cacheKey = "api-seller-list";
        const sellerListCache = await cache.get(cacheKey);
        let sellerList;
        let cacheStatus = "missing cache";
        if(sellerListCache) {
        
            sellerList = sellerListCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const collectionRef = firestoreDB.collection("sellers");
            const foodRef = firestoreDB.collection("foods");
    

            const docs = await collectionRef.get();
            sellerList = [];

            const sellerLength = docs.docs.length;
        
            for(let i = 0; i < sellerLength; i++){
                const seller = await docs.docs[i].data();
                const queryHasFood = await foodRef.where("sellerSlug", "==", seller.slug).count().get();
                const hasFood = queryHasFood.data().count > 0 ? true : false;
                if(hasFood) sellerList.push(seller);
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
    catch(e){
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
        if(sellerCache) {
            seller = sellerCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const sellerRef = firestoreDB.collection("sellers");
            const foodRef = firestoreDB.collection("foods");

            const querySeller = await sellerRef.where("slug", "==", sellerSlug).get();
            const doc = querySeller.docs[0];
            if(!doc) return res.status(200).json({
                code: 404,
                message: "Seller not found"
            }) ;

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
    catch(e){
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
        if(foodListCache) {
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
                data:  foodList,
                ttl: (Date.now() / 1000) + 300
            });
        }
    
        res.setHeader("X-Data-Cache", cacheStatus);
        res.status(200).json({
            code: 200,
            data: foodList
        })
    }
    catch(e){
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
        if(foodCache) {
            food = foodCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const collectionRef = firestoreDB.collection("foods");
    
            const docs = await collectionRef.where("slug", "==", slug).get();
            const doc = docs.docs[0];
            if(!doc) return res.status(200).json({
                code: 404,
                message: "Food not found"
            });

            food = doc.data();

            await cache.set(cacheKey, {
                data:  food,
                ttl: (Date.now() / 1000) + 300
            });
        }
    
        res.setHeader("X-Data-Cache", cacheStatus);
        res.status(200).json({
            code: 200,
            data: food
        })
    }
    catch(e){
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
        if(bannerCache) {
            banner = bannerCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const collectionRef = firestoreDB.collection("banners");
    
            const docs = await collectionRef.where("active", "==", true).get();
            // banner = [];
            const doc = docs.docs[0];
            if(!doc) return res.status(200).json({
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
    catch(e){
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
        if(userCache) {
            user = userCache.props.data;
            cacheStatus = "hit cache";
        }
        else {
            const collectionRef = firestoreDB.collection("users");
    
            const doc = collectionRef.doc(userId);
            // banner = [];
            const userData = await doc.get();

            if(!userData) return res.status(200).json({
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
    catch(e){
        res.status(200).json({
            code: 500,
            messge: e.message
        })
    } 
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log("Server started at port " + port);
});