const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_SbPs1O9tKVMe@ep-shy-scene-aitqdiz0-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

async function main() {
  await client.connect();
  const res = await client.query('SELECT action, detail, "createdAt" FROM "CertificateLog" ORDER BY "createdAt" DESC LIMIT 15');
  console.log(JSON.stringify(res.rows, null, 2));
}

main().catch(console.error).finally(() => client.end());
