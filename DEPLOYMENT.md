# MoE Dashboard Deployment Guide

## Quick Setup - Frontend to Vercel + Backend on Replit

### Step 1: Make Your Replit Project Public (Free Option)

1. In your Replit project, click on the project name in the top left corner
2. Toggle from "Private" to "Public" 
3. Copy the generated public URL (e.g., `https://your-project-name.replit.dev`)

### Step 2: Deploy Frontend to Vercel

1. **Fork/Clone this repository to your GitHub account**
2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with your GitHub account
   - Click "New Project" → Import from GitHub
   - Select this repository

3. **Configure Environment Variables in Vercel:**
   - In Vercel project settings → Environment Variables
   - Add these variables:
     ```
     VITE_BACKEND_URL = https://your-replit-project.replit.dev
     VITE_WS_URL = wss://your-replit-project.replit.dev/ws
     ```

4. **Deploy:**
   - Vercel will automatically build and deploy
   - Your frontend will be live at `https://your-project.vercel.app`

### Step 3: Test the Setup

1. Open your Vercel URL in a browser
2. Verify the disclaimer banner appears
3. Check the WebSocket connection status in the top right
4. Watch for real-time updates from your Replit backend

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │───▶│    Internet      │───▶│   Backend       │
│   (Vercel)      │    │                  │    │   (Replit)      │
│   Static Host   │    │   WebSocket +    │    │   Express +     │
│                 │    │   REST API       │    │   WebSocket     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Benefits of This Setup

✅ **Free for testing** - No Replit Core required  
✅ **Public URL** - Share with your conference audience  
✅ **Real LLMs** - Actual AI processing, not simulation  
✅ **Professional demo** - Production-ready deployment  
✅ **Easy updates** - Push to GitHub → Auto-deploy to Vercel  

## Alternative: Full Replit Deployment

If you want everything on Replit:
1. Upgrade to Replit Core ($20/month)
2. Use Replit Deployments for a persistent public URL
3. No environment variables needed

## Troubleshooting

**WebSocket Connection Issues:**
- Ensure your Replit project is public and running
- Check VITE_WS_URL uses `wss://` (not `ws://`)
- Verify CORS settings allow your Vercel domain

**API Call Failures:**
- Confirm VITE_BACKEND_URL is correct
- Ensure Replit backend is running
- Check browser console for specific errors

**Build Failures:**
- Verify all dependencies are in package.json
- Check for TypeScript errors in build logs
- Ensure environment variables are set correctly