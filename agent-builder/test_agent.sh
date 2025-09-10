#!/bin/bash

# Test script for Fraud Detection Agent
# Tests various scenarios to validate the agent's functionality

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load environment variables
if [ -f ".env.agent-builder" ]; then
    export $(cat .env.agent-builder | grep -v '^#' | xargs)
fi

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Print functions
print_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Test Cloud Function (Transaction Analyzer)
test_transaction_analyzer() {
    print_test "Testing Transaction Analyzer Cloud Function..."
    
    # Prepare test payload
    PAYLOAD=$(cat <<EOF
{
  "transaction": {
    "transaction_id": "TEST-001",
    "amount": 10000,
    "merchant_id": "MERCHANT-123",
    "merchant_category": "crypto_exchange",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "location": {
      "lat": 40.7128,
      "lng": -74.0060,
      "country": "US"
    },
    "is_new_payee": true
  },
  "user_profile": {
    "avg_transaction_amount": 500,
    "transaction_amount_std": 200,
    "typical_transaction_hours": [9, 10, 11, 12, 13, 14, 15, 16, 17]
  },
  "history": [
    {
      "amount": 450,
      "merchant_id": "MERCHANT-456",
      "timestamp": "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)",
      "location": {
        "lat": 40.7128,
        "lng": -74.0060
      }
    }
  ]
}
EOF
    )
    
    # Call the function
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "$TRANSACTION_ANALYZER_URL" 2>/dev/null || echo "{\"error\": \"Failed to call function\"}")
    
    # Check response
    if echo "$RESPONSE" | grep -q "risk_score"; then
        print_pass "Transaction Analyzer returned valid response"
        print_info "Risk Score: $(echo "$RESPONSE" | grep -o '"risk_score":[0-9.]*' | cut -d: -f2)"
    else
        print_fail "Transaction Analyzer failed: $RESPONSE"
    fi
}

# Test Firestore connectivity
test_firestore() {
    print_test "Testing Firestore connectivity..."
    
    # Try to write a test document
    gcloud firestore documents create \
        --project="$GCP_PROJECT_ID" \
        --collection-path="fraud-blacklist" \
        --document-id="TEST-ENTITY" \
        --data='{"entity_type":"test","risk_level":"low","reason":"test entry","added_date":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
        2>/dev/null
    
    if [ $? -eq 0 ]; then
        print_pass "Firestore write successful"
        
        # Clean up test document
        gcloud firestore documents delete \
            --project="$GCP_PROJECT_ID" \
            --collection-path="fraud-blacklist" \
            --document-id="TEST-ENTITY" \
            --quiet 2>/dev/null
    else
        print_fail "Firestore write failed"
    fi
}

# Test BigQuery connectivity
test_bigquery() {
    print_test "Testing BigQuery connectivity..."
    
    # Try to query the table
    QUERY="SELECT COUNT(*) as count FROM fraud_detection.transactions LIMIT 1"
    
    RESULT=$(bq query --project_id="$GCP_PROJECT_ID" --use_legacy_sql=false "$QUERY" 2>/dev/null || echo "error")
    
    if [ "$RESULT" != "error" ]; then
        print_pass "BigQuery query successful"
    else
        print_fail "BigQuery query failed"
    fi
}

# Test Pub/Sub
test_pubsub() {
    print_test "Testing Pub/Sub connectivity..."
    
    # Publish a test message
    MESSAGE='{"test": "message", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
    
    gcloud pubsub topics publish fraud-detection-events \
        --project="$GCP_PROJECT_ID" \
        --message="$MESSAGE" \
        2>/dev/null
    
    if [ $? -eq 0 ]; then
        print_pass "Pub/Sub publish successful"
    else
        print_fail "Pub/Sub publish failed"
    fi
}

# Test various fraud scenarios
test_fraud_scenarios() {
    print_test "Testing fraud detection scenarios..."
    
    scenarios=(
        '{"name": "High Risk Transaction", "amount": 15000, "merchant_category": "gambling", "is_new_payee": true, "expected_risk": "high"}'
        '{"name": "Normal Transaction", "amount": 50, "merchant_category": "grocery", "is_new_payee": false, "expected_risk": "low"}'
        '{"name": "Suspicious Pattern", "amount": 5000, "merchant_category": "wire_transfer", "is_new_payee": true, "expected_risk": "high"}'
    )
    
    for scenario in "${scenarios[@]}"; do
        NAME=$(echo "$scenario" | grep -o '"name":"[^"]*' | cut -d'"' -f4)
        AMOUNT=$(echo "$scenario" | grep -o '"amount":[0-9]*' | cut -d: -f2)
        CATEGORY=$(echo "$scenario" | grep -o '"merchant_category":"[^"]*' | cut -d'"' -f4)
        NEW_PAYEE=$(echo "$scenario" | grep -o '"is_new_payee":[^,}]*' | cut -d: -f2)
        EXPECTED=$(echo "$scenario" | grep -o '"expected_risk":"[^"]*' | cut -d'"' -f4)
        
        print_info "Scenario: $NAME"
        
        PAYLOAD=$(cat <<EOF
{
  "transaction": {
    "transaction_id": "SCENARIO-$(date +%s)",
    "amount": $AMOUNT,
    "merchant_id": "TEST-MERCHANT",
    "merchant_category": "$CATEGORY",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "is_new_payee": $NEW_PAYEE
  }
}
EOF
        )
        
        RESPONSE=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -d "$PAYLOAD" \
            "$TRANSACTION_ANALYZER_URL" 2>/dev/null || echo "{}")
        
        if echo "$RESPONSE" | grep -q "risk_score"; then
            RISK_SCORE=$(echo "$RESPONSE" | grep -o '"risk_score":[0-9.]*' | cut -d: -f2)
            
            if [ "$EXPECTED" = "high" ] && (( $(echo "$RISK_SCORE > 60" | bc -l) )); then
                print_pass "$NAME: Correctly identified as high risk (score: $RISK_SCORE)"
            elif [ "$EXPECTED" = "low" ] && (( $(echo "$RISK_SCORE < 40" | bc -l) )); then
                print_pass "$NAME: Correctly identified as low risk (score: $RISK_SCORE)"
            else
                print_fail "$NAME: Risk assessment mismatch (expected: $EXPECTED, score: $RISK_SCORE)"
            fi
        else
            print_fail "$NAME: Failed to get response"
        fi
    done
}

# Performance test
test_performance() {
    print_test "Testing performance metrics..."
    
    ITERATIONS=5
    TOTAL_TIME=0
    
    for i in $(seq 1 $ITERATIONS); do
        START=$(date +%s%N)
        
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -d '{"transaction": {"amount": 100, "merchant_id": "TEST"}}' \
            "$TRANSACTION_ANALYZER_URL" \
            -o /dev/null 2>/dev/null
        
        END=$(date +%s%N)
        ELAPSED=$((($END - $START) / 1000000))
        TOTAL_TIME=$(($TOTAL_TIME + $ELAPSED))
    done
    
    AVG_TIME=$(($TOTAL_TIME / $ITERATIONS))
    
    if [ $AVG_TIME -lt 1000 ]; then
        print_pass "Performance test passed (avg: ${AVG_TIME}ms)"
    else
        print_fail "Performance test failed (avg: ${AVG_TIME}ms, expected < 1000ms)"
    fi
}

# Integration test with mock MoE request
test_integration() {
    print_test "Testing integration with MoE system..."
    
    # Simulate a request from MoE router
    MOE_REQUEST=$(cat <<EOF
{
  "request_id": "MOE-$(date +%s)",
  "type": "fraud_detection",
  "data": {
    "transaction": {
      "transaction_id": "TXN-$(date +%s)",
      "user_id": "USER-123",
      "amount": 2500,
      "merchant_id": "MERCHANT-789",
      "merchant_category": "electronics",
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "location": {
        "lat": 37.7749,
        "lng": -122.4194,
        "country": "US"
      }
    }
  }
}
EOF
    )
    
    # Process through transaction analyzer
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$MOE_REQUEST" \
        "$TRANSACTION_ANALYZER_URL" 2>/dev/null || echo "{}")
    
    if echo "$RESPONSE" | grep -q "risk_score"; then
        print_pass "Integration test successful"
        
        # Parse response for MoE format
        RISK_SCORE=$(echo "$RESPONSE" | grep -o '"risk_score":[0-9.]*' | cut -d: -f2)
        CONFIDENCE=$(echo "$RESPONSE" | grep -o '"confidence":[0-9.]*' | cut -d: -f2)
        
        print_info "MoE Integration Response:"
        print_info "  Risk Score: $RISK_SCORE"
        print_info "  Confidence: $CONFIDENCE"
    else
        print_fail "Integration test failed"
    fi
}

# Main test execution
main() {
    echo "========================================="
    echo "Fraud Detection Agent Test Suite"
    echo "========================================="
    echo ""
    
    # Check prerequisites
    if [ -z "$GCP_PROJECT_ID" ]; then
        print_fail "GCP_PROJECT_ID not set"
        exit 1
    fi
    
    if [ -z "$TRANSACTION_ANALYZER_URL" ]; then
        print_info "TRANSACTION_ANALYZER_URL not set, using default"
        TRANSACTION_ANALYZER_URL="https://us-central1-$GCP_PROJECT_ID.cloudfunctions.net/analyze-transaction"
    fi
    
    # Run tests
    test_transaction_analyzer
    test_firestore
    test_bigquery
    test_pubsub
    test_fraud_scenarios
    test_performance
    test_integration
    
    # Summary
    echo ""
    echo "========================================="
    echo "Test Summary"
    echo "========================================="
    echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Failed:${NC} $TESTS_FAILED"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        exit 1
    fi
}

# Run main
main "$@"
