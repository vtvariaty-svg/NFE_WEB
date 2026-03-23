require('dotenv').config({path:'apps/api/.env'});
const {Client} = require('pg');
const client = new Client({connectionString: process.env.DATABASE_URL});
client.connect().then(() => client.query('SELECT * FROM "CertificateLog" ORDER BY "createdAt" DESC LIMIT 5'))
.then(r => { console.log(JSON.stringify(r.rows, null, 2)); })
.catch(console.error).finally(()=>client.end());
