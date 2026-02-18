const crypto = require('crypto');

const secret = 'bibLCGTxVAig5To3OLLKPJQMlRR7Pefp';
const merchantId = '758055f4a8044779a35f6ceb69f858b3';
const msisdn = '9647829744545';

function base64url(str) {
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createToken(data, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64url(Buffer.from(JSON.stringify(header)).toString('base64'));
    const encodedData = base64url(Buffer.from(JSON.stringify(data)).toString('base64'));
    const token = encodedHeader + '.' + encodedData;
    const signature = crypto.createHmac('sha256', secret).update(token).digest('base64');
    return token + '.' + base64url(signature);
}

const data = {
    amount: 1000,
    serviceType: 'Test',
    msisdn: msisdn,
    orderId: 'ORD_' + Date.now(),
    redirectUrl: 'https://example.com',
    uid: merchantId,
    iat: Math.floor(Date.now() / 1000) - 30,
    exp: Math.floor(Date.now() / 1000) + 60 * 60
};

async function test() {
    console.log('Testing V2 Credentials on Legacy Endpoint...');
    const token = createToken(data, secret);
    const response = await fetch('https://test.zaincash.iq/transaction/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: token,
            merchantId: merchantId,
            lang: 'en'
        })
    });
    console.log('Status:', response.status);
    console.log('Body:', await response.text());
}

test();
