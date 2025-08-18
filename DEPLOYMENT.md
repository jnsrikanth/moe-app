# MoE Dashboard Deployment Guide

## Quick Setup - Frontend to Vercel + Backend on Railway

### Step 1: Deploy Backend to Railway (Free Option)

1. **Go to [railway.app](https://railway.app)** and sign up with GitHub
2. **Click "New Project"** → **"Deploy from GitHub repo"**
3. **Select your MoE repository**
4. **Set Environment Variables** in Railway dashboard:

   ```bash
   GROQ_API_KEY=your_groq_api_key_here
   NODE_ENV=production
   PORT=3000
   ```

5. **Railway will auto-deploy** and give you a URL like: `https://your-app-name.railway.app`

### Step 2: Deploy Frontend to Vercel

1. **Fork/Clone this repository to your GitHub account**

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with your GitHub account
   - Click "New Project" → Import from GitHub
   - Select this repository
   - Set **Root Directory** to `client`

3. **Configure Environment Variables in Vercel:**
   - In Vercel project settings → Environment Variables
   - Add these variables:

     ```bash
     VITE_BACKEND_URL=https://your-railway-app.railway.app
     VITE_WS_URL=wss://your-railway-app.railway.app/ws
     ```

4. **Deploy:**
   - Vercel will automatically build and deploy
   - Your frontend will be live at `https://your-project.vercel.app`

### Step 3: Update CORS Settings

1. **Update your Railway backend** with your Vercel URL in the CORS configuration
2. **Add your Vercel URL** to the `FRONTEND_URL` environment variable in Railway

### Step 4: Test the Setup

1. Open your Vercel URL in a browser
2. Verify the disclaimer banner appears
3. Check the WebSocket connection status in the top right
4. Watch for real-time updates from your Railway backend
5. Test the Groq integration at: `https://your-railway-app.railway.app/api/test-groq`

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │───▶│    Internet      │───▶│   Backend       │
│   (Vercel)      │    │                  │    │   (Railway)     │
│   Static Host   │    │   WebSocket +    │    │   Express +     │
│                 │    │   REST API       │    │   WebSocket     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Benefits of This Setup

✅ **Free for testing** - Railway generous free tier  
✅ **Public URL** - Share with your conference audience  
✅ **Real Groq LLMs** - Actual AI processing with Groq Cloud  
✅ **Professional demo** - Production-ready deployment  
✅ **Easy updates** - Push to GitHub → Auto-deploy to both platforms  
✅ **No cold starts** - Railway keeps your backend always running  

## Alternative: Full Railway Deployment

If you want everything on Railway:

1. Deploy the full-stack app to Railway
2. Railway will serve both frontend and backend
3. Single URL for everything
4. Simpler setup but less scalable

## Troubleshooting

**WebSocket Connection Issues:**

- Ensure your Railway app is deployed and running
- Check VITE_WS_URL uses `wss://` (not `ws://`)
- Verify CORS settings allow your Vercel domain
- Test WebSocket endpoint: `wss://your-railway-app.railway.app/ws`

**API Call Failures:**

- Confirm VITE_BACKEND_URL is correct
- Ensure Railway backend is running
- Test API endpoint: `https://your-railway-app.railway.app/api/test-groq`
- Check browser console for specific errors

**Groq Integration Issues:**

- Verify GROQ_API_KEY is set correctly in Railway
- Check Railway logs for Groq API errors
- Test Groq connection: `curl https://your-railway-app.railway.app/api/test-groq`

**Build Failures:**

- Verify all dependencies are in package.json
- Check for TypeScript errors in build logs
- Ensure environment variables are set correctly
- Check Railway build logs for specific errors

## Environment Variables Summary

**Railway Backend:**
```bash
GROQ_API_KEY=gsk_your_groq_api_key_here
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-vercel-app.vercel.app
```

**Vercel Frontend:**
```bash
VITE_BACKEND_URL=https://your-railway-app.railway.app
VITE_WS_URL=wss://your-railway-app.railway.app/ws
```