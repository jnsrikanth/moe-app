# MoE (Mixture of Experts) Routing System Dashboard

## 🚨 PROOF OF CONCEPT - TECHNOLOGY DEMONSTRATION ONLY
**This system uses fictitious data and non-proprietary datasets for demonstration purposes. Not for production use in banking environments.**

## Overview

A comprehensive real-time monitoring dashboard for a Mixture of Experts (MoE) AI system designed for BFSI (Banking, Financial Services, and Insurance) applications. The system demonstrates intelligent request routing between specialized expert agents for credit scoring, fraud detection, and ESG analysis.

## 🎯 Features

### Real-Time MoE Routing Visualization
- **Left-to-Right Flow**: Incoming requests → MoE Router → Expert Agents
- **Color-Coded Status**: Grey (idle) → Green (processing) for all components
- **Live Processing Logs**: Real-time analysis dialog on MoE Router
- **Dynamic Load Balancing**: Automatic agent scaling based on load thresholds

### Expert Agent Monitoring
- **Three Specialized Agents**: Credit Check, Fraud Detection, ESG Analysis
- **Performance Metrics**: CPU usage, memory consumption, tokens/minute
- **Auto-Scaling**: Visual representation of instance spawning
- **Load Awareness**: Queue depth and response time tracking

### MoE Router Intelligence
- **Routing Parameters**: Context size, response threshold, algorithm type
- **Decision Criteria**: Agent load (40%), specialization (35%), response time (25%)
- **Load Balancing**: Weighted round-robin with threshold monitoring
- **Real-Time Analytics**: Live processing logs and routing decisions

### System Analytics
- **Performance Metrics**: Throughput, success rate, error tracking
- **Model Information**: TinyLlama 1.1B experts + Phi-3 Mini 3.8B router
- **Alert System**: Auto-scaling notifications and load warnings
- **Log Export**: Detailed system logs with timestamp filtering

## 🛠 Technology Stack

### Frontend
- **React + TypeScript** with Vite build system
- **Tailwind CSS** + Shadcn/ui components
- **WebSocket** for real-time updates
- **TanStack Query** for state management

### Backend  
- **Node.js + Express** with TypeScript
- **WebSocket Server** for live communication
- **In-Memory Storage** for demo purposes
- **Simulated LLM Processing** with realistic delays

### Deployment Options
- **Option 1**: Frontend (Vercel) + Backend (Replit Public)
- **Option 2**: Full Replit deployment with Core plan

## 🚀 Quick Start

### Local Development
```bash
npm install
npm run dev
```

### Vercel Deployment
See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed setup instructions.

## 📊 MoE System Architecture

```
Incoming Request → MoE Router → Expert Agent Selection
                      ↓
                Load Balancer → Agent Instance Management
                      ↓
            Response Aggregation → Final Decision
```

### Expert Agents
1. **Credit Check Agent**: Credit scoring and risk assessment
2. **Fraud Detection Agent**: Transaction pattern analysis
3. **ESG Analysis Agent**: Environmental, social, governance scoring

### Router Decision Factors
- **Agent Specialization**: Task-to-agent matching
- **Current Load**: CPU usage and queue depth
- **Response Time**: Historical performance
- **Availability**: Instance health and scaling status

## 🔧 Configuration

### Environment Variables
```bash
VITE_BACKEND_URL=https://your-replit-project.replit.dev
VITE_WS_URL=wss://your-replit-project.replit.dev/ws
```

### Load Balancing Thresholds
- Credit Agent: 70% CPU threshold
- Fraud Agent: 80% CPU threshold  
- ESG Agent: 60% CPU threshold

## 📈 Real-Time Features

- **Live Request Processing**: Watch requests flow through the system
- **Dynamic Scaling**: See new agent instances spawn automatically
- **Performance Monitoring**: Real-time CPU, memory, and token metrics
- **WebSocket Updates**: Sub-second latency for status changes

## 🎯 Demo Scenarios

The system automatically generates various request types:
- Loan applications requiring credit checks
- Insurance claims triggering fraud detection
- Investment reports needing ESG analysis
- Mixed requests utilizing multiple expert agents

## 📱 Mobile Responsive

Fully responsive design optimized for presentation on various screen sizes.

## 🔒 Security & Privacy

- No real customer data used
- All processing simulated with synthetic datasets
- Public deployment safe for demonstration purposes
- Secrets properly managed through environment variables

## 📄 License

MIT License - Free for educational and demonstration use.

---

**Built for internal conference technology demonstration - showcasing AI routing capabilities for BFSI applications.**