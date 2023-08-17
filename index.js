const express = require('express')
const request = require("request");
const bodyParser = require("body-parser");
const cors = require('cors')
const { createHash } = require("crypto");
const base64url = require("base64url")

const endpoint = "https://graph.zalo.me/v2.0/me/info";

const secretKey = process.env.ZALO_APP_SECRET_KEY || ""

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
    const length = 43;
    let verifierCode = "";
    const sets = [];
    for(let i = 0; i < length; i++) {
        const set = Math.floor(Math.random() * 3) + 1;
        sets.push(set);
        if(set === 1) {
            const code = Math.floor(Math.random() * 25) + 65;
            verifierCode += String.fromCharCode(code);
        }
        else if(set === 2){
            const code = Math.floor(Math.random() * 25) + 97;
            verifierCode += String.fromCharCode(code);
        }
        else {
            const code = Math.floor(Math.random() * 10) + 48;
            verifierCode += String.fromCharCode(code);
        }
    }

    const challengeCode = base64url(Buffer.from(createHash('sha256').update(verifierCode).digest("hex")).toString());

    res.status(200).json({
        verifierCode,
        challengeCode
    });
});

app.get("/verify-app", (req, res) => {
    const query = req.query;

    res.status(200).json(query);
})
app.listen(process.env.PORT || 3000)