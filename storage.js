const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue, Filter } = require('firebase-admin/firestore');

const bucket = process.env.CYCLIC_BUCKET_NAME || "";
const serviceAccountFileName = process.env.SERVICE_ACCOUNT_FILENAME;



module.exports.init = async function init(s3) {
    if(global.firestoreInited) return getFirestore();

    try {
        const s3File = await s3.getObject({
            Bucket: bucket,
            Key: serviceAccountFileName,
        }).promise();

        const body = s3File.Body.toString();

        const serviceAccount = JSON.parse(body);
        initializeApp({
            credential: cert(serviceAccount)
        });

        global.firestoreInited = true;

        return getFirestore();
    }
    catch(e){
        return Promise.reject(e);
    }
}