"use strict";

/**
 * DEPLOY INSTRUCTIONS - RENDER & NEON POSTGRESQL
 * 
 * 1) In Neon (Database)
 *    - Create a new Project. 
 *    - Get the Connection String (looks like postgresql://user:pass@ep-cool-snowflake.region.aws.neon.tech/neondb?sslmode=require)
 * 
 * 2) In Render (Backend API)
 *    - Create a "Web Service".
 *    - Connect to your GitHub repository (vtvariaty-svg/NFE_WEB).
 *    - Root Directory: apps/api
 *    - Environment: Node
 *    - Build Command: npm install && npx prisma generate && npx prisma db push && npm run build
 *    - Start Command: npm run start
 *    - Environment Variables:
 *        DATABASE_URL = [Your Neon Connection String]
 *        JWT_SECRET = [A random strong string]
 * 
 * 3) (Auto-Migration is setup in the Build Command via `npx prisma db push`, so no manual shell access is needed).
 * 
 * 4) In Render (Frontend Web)
 *    - Create another "Web Service".
 *    - Connect to same GitHub Repository.
 *    - Root Directory: apps/web
 *    - Environment: Node
 *    - Build Command: npm install && npm run build
 *    - Start Command: npm run start
 *    - Environment Variables:
 *        NEXT_PUBLIC_API_URL = [The URL of the Backend API Service you just created on Render]
 */

console.log("Please refer to the code comments for Deploy Instructions.");
