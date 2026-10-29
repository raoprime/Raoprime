# 🚀 Raoprime Vercel & MongoDB Deployment Guide (Emergency / Fast)

## Option 1: 1-Click Desktop Deployer (Fastest)
1. Double-click the file on your Desktop:
   **`Deploy Raoprime To Vercel.bat`**
2. It will open terminal and ask you to log in to Vercel (or confirm project settings).
3. Press `Y` (Yes) for defaults.
4. Your site will be **LIVE on Vercel** with a public URL (e.g. `https://raoprime.vercel.app`) in under 60 seconds!

---

## Option 2: GitHub + Vercel (Standard & Free)
1. Create a new repository on [GitHub](https://github.com/new) named `raoprime`.
2. Run these 3 commands in PowerShell inside `C:\Users\DELL\.gemini\antigravity\scratch\client-document-portal`:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/raoprime.git
   git branch -M main
   git push -u origin main
   ```
3. Go to [vercel.com/new](https://vercel.com/new), click **Import** next to `raoprime`, and click **Deploy**!

---

## 🗄️ Setting Up Free Database (MongoDB Atlas)
Because Vercel serverless functions are ephemeral (their filesystem wipes after each request), we have added **MongoDB Atlas + GridFS** support for permanent cloud storage of messages and documents:

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) (100% Free M0 Cluster forever).
2. Click **Create Cluster** (takes 30 seconds).
3. Create a Database User (e.g. `admin` and a password).
4. Click **Connect** -> **Drivers** (Node.js) -> Copy connection string:
   `mongodb+srv://admin:<password>@cluster0.mongodb.net/raoprime?retryWrites=true&w=majority`
5. In your **Vercel Project Dashboard**:
   - Go to **Settings** -> **Environment Variables**.
   - Add:
     - `MONGODB_URI` = `mongodb+srv://admin:<password>@cluster0.mongodb.net/raoprime?retryWrites=true&w=majority`
     - `ADMIN_SECRET` = `RDMY_MASTER_SALT_98214`
6. Click **Redeploy**! All messages, chats, and uploaded files are now permanently stored in the cloud database!
