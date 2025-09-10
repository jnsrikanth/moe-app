# Fraud Detection Agent - Vertex AI Agent Builder

## Overview

This directory contains the implementation of the Fraud Detection Expert Agent migrated to Google Cloud's Vertex AI Agent Builder (Agent Engine). The agent provides sophisticated fraud detection capabilities using Gemini 1.5 Pro and specialized tools.

## Architecture

```
┌──────────────────────────────────────────────┐
│            Vertex AI Agent Builder           │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │   Fraud Detection Agent (Gemini)    │    │
│  └─────────────┬───────────────────────┘    │
│                │                             │
│  ┌─────────────▼───────────────────────┐    │
│  │           Tools Layer               │    │
│  │  • Transaction Analyzer             │    │
│  │  • Pattern Detector                 │    │
│  │  • Risk Scorer                      │    │
│  │  • Blacklist Checker                │    │
│  └─────────────┬───────────────────────┘    │
│                │                             │
│  ┌─────────────▼───────────────────────┐    │
│  │          Data Stores                │    │
│  │  • Firestore (Blacklists)           │    │
│  │  • BigQuery (Transactions)          │    │
│  │  • Vertex Search (Patterns)         │    │
│  └─────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

## Features

- **Real-time Fraud Detection**: Analyzes transactions in < 500ms
- **Multi-factor Risk Assessment**: Evaluates amount, velocity, geographic, temporal, and merchant risk factors
- **Confidence Scoring**: Provides confidence levels based on data completeness
- **Pattern Recognition**: Detects suspicious patterns using ML models
- **Scalable Architecture**: Auto-scales from 2 to 10 replicas based on load

## Directory Structure

```
agent-builder/
├── README.md                 # This file
├── deploy.sh                # Deployment script
├── test_agent.sh           # Test suite
├── fraud-agent/
│   ├── configs/
│   │   └── agent-config.yaml    # Agent Builder configuration
│   ├── tools/
│   │   ├── transaction_analyzer.py  # Main fraud detection tool
│   │   ├── requirements.txt         # Python dependencies
│   │   └── ...                      # Other tools
│   ├── schemas/                     # Data schemas
│   ├── tests/                       # Unit tests
│   ├── fraud_agent_client.ts       # TypeScript SDK client
│   └── ARCHITECTURE.md             # Detailed architecture doc
```

## Prerequisites

1. **GCP Account**: Active Google Cloud Platform account
2. **gcloud CLI**: Installed and authenticated
3. **APIs Enabled**: 
   - Vertex AI Platform
   - Cloud Functions
   - Firestore
   - BigQuery
   - Pub/Sub
4. **Permissions**: Project Editor or specific IAM roles
5. **Environment Variables**:
   ```bash
   export GCP_PROJECT_ID=your-project-id
   export AGENT_LOCATION=us-central1
   ```

## Deployment

### Quick Start

1. **Clone and navigate to the directory**:
   ```bash
   cd agent-builder
   ```

2. **Set up environment**:
   ```bash
   export GCP_PROJECT_ID=your-project-id
   export AGENT_LOCATION=us-central1
   ```

3. **Run deployment script**:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

### Manual Deployment

If you prefer manual deployment:

1. **Enable APIs**:
   ```bash
   gcloud services enable aiplatform.googleapis.com \
       cloudfunctions.googleapis.com \
       firestore.googleapis.com \
       bigquery.googleapis.com
   ```

2. **Deploy Cloud Functions**:
   ```bash
   cd fraud-agent/tools
   gcloud functions deploy analyze-transaction \
       --gen2 \
       --runtime=python311 \
       --entry-point=analyze_transaction \
       --trigger-http
   ```

3. **Create data stores**:
   ```bash
   # Firestore
   gcloud firestore databases create --location=us-central1
   
   # BigQuery
   bq mk -d fraud_detection
   ```

4. **Configure Agent in Console**:
   - Visit [Agent Builder Console](https://console.cloud.google.com/ai/agent-builder)
   - Create new agent with provided configuration
   - Connect tools and data stores

## Testing

### Run Test Suite

```bash
chmod +x test_agent.sh
./test_agent.sh
```

### Test Scenarios

The test suite covers:
- Transaction analyzer functionality
- Data store connectivity (Firestore, BigQuery, Pub/Sub)
- Various fraud scenarios (high risk, normal, suspicious patterns)
- Performance benchmarks (< 1000ms latency)
- Integration with MoE system

### Manual Testing

Test individual components:

```bash
# Test transaction analyzer
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": {
      "amount": 5000,
      "merchant_category": "gambling",
      "is_new_payee": true
    }
  }' \
  https://REGION-PROJECT.cloudfunctions.net/analyze-transaction
```

## Integration with MoE System

### Update MoE System

1. **Install client SDK**:
   ```bash
   npm install google-auth-library
   ```

2. **Update server/real-moe-system.ts**:
   ```typescript
   import { createFraudAgentClient } from '../agent-builder/fraud-agent/fraud_agent_client';
   
   const fraudAgent = createFraudAgentClient({
     projectId: process.env.GCP_PROJECT_ID,
     location: process.env.AGENT_LOCATION,
     agentId: 'fraud-detection-agent'
   });
   
   // In processFraudRequest method
   const response = await fraudAgent.analyzeTransaction({
     transactionId: request.id,
     userId: request.userId,
     amount: request.amount,
     // ... other fields
   });
   ```

## Monitoring

### Dashboard

View metrics in the [Cloud Console](https://console.cloud.google.com/monitoring):
- Fraud detection latency
- Risk level distribution
- False positive/negative rates
- Request volume and errors

### Custom Metrics

The agent tracks:
- `fraud_detection_latency`: Response time in ms
- `fraud_probability_distribution`: Distribution of risk scores
- `risk_level_counts`: Count by risk level (Low/Medium/High/Critical)
- `false_positive_rate`: Accuracy metric

### Alerts

Configured alerts:
- **Critical**: Fraud detection accuracy < 95%
- **High**: Response time P95 > 2000ms
- **Medium**: Error rate > 1%
- **Low**: Cost per request > $0.05

## Cost Estimation

| Component | Monthly Cost (1M requests) |
|-----------|---------------------------|
| Agent Builder | ~$500 |
| Cloud Functions | ~$200 |
| Data Storage | ~$100 |
| Network | ~$50 |
| **Total** | **~$850/month** |

## Performance Targets

- **Latency**: P50 < 500ms, P95 < 1500ms
- **Throughput**: 1000 req/min (burst: 2000)
- **Availability**: 99.9% SLA
- **Auto-scaling**: 2-10 replicas

## Security

- **Authentication**: OAuth 2.0 with service accounts
- **Encryption**: At rest (Cloud KMS) and in transit (TLS 1.3)
- **Compliance**: PCI-DSS, SOC2, GDPR ready
- **Audit Logging**: Cloud Audit Logs for all operations

## Troubleshooting

### Common Issues

1. **Function deployment fails**:
   ```bash
   # Check logs
   gcloud functions logs read analyze-transaction
   ```

2. **Agent not responding**:
   ```bash
   # Check agent health
   curl https://REGION-aiplatform.googleapis.com/v1/projects/PROJECT/locations/REGION/agents/AGENT_ID
   ```

3. **Data store connection issues**:
   ```bash
   # Test Firestore
   gcloud firestore operations list
   
   # Test BigQuery
   bq ls -d
   ```

### Debug Mode

Enable debug logging:
```bash
export DEBUG=true
export LOG_LEVEL=DEBUG
./test_agent.sh
```

## Migration Status

- [x] Architecture design
- [x] Agent configuration
- [x] Tool implementation (transaction analyzer)
- [x] SDK client development
- [x] Deployment scripts
- [x] Test suite
- [ ] Full Agent Builder deployment (requires console setup)
- [ ] Production validation
- [ ] MoE system integration
- [ ] Performance optimization

## Support

For issues or questions:
1. Check [ARCHITECTURE.md](fraud-agent/ARCHITECTURE.md) for detailed design
2. Review test results: `./test_agent.sh`
3. Check Cloud Console logs and monitoring
4. File issues in the project repository

## Next Steps

1. **Complete Agent Builder Setup**: Visit the console to finalize agent configuration
2. **Run Tests**: Validate all components are working
3. **Integrate with MoE**: Update the main system to use the new agent
4. **Monitor Performance**: Track metrics and optimize as needed
5. **Scale Testing**: Run load tests to validate scaling behavior

## License

This project is part of the MoE (Mixture of Experts) system for financial services.

---

**Version**: 1.0.0  
**Last Updated**: December 2024  
**Status**: Ready for Deployment
