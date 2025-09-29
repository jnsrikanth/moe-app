# GCP Deployment Access Alternatives for the MoE Agent Router Dashboard

This document outlines practical, enterprise-friendly ways to make the MoE Agent Router web dashboard accessible when Cloud Run endpoints are private or otherwise difficult to reach in a locked-down GCP environment. Each option summarizes when to use it, how to wire it, and special notes for WebSockets and authentication.

Quick guide
- Need a secure public URL quickly: Use External HTTPS Load Balancer + IAP in front of Cloud Run (Option 1).
- Must keep access private to your corporate/VPC network: Use Internal HTTPS Load Balancer with private DNS (Option 2) or Private Service Connect (Option 3).
- Prefer Docker Compose and direct VM control: Run on GCE with Compose, fronted by External HTTPS LB + IAP (Option 4).
- Need fast validation from inside GCP without exposing public endpoints: Use Cloud Workstations (Option 5).
- Temporary/testing reverse proxy: IAP-protected bastion/NGINX proxy (Option 6).
- Public UI, private APIs: Host UI on Vercel, proxy to private GCP backend via an IAP-secured gateway (Option 7).

WebSockets note
- Cloud Run behind External HTTPS LB supports WebSockets. If corporate proxies block them, add an SSE fallback in the dashboard.

Variables used below
- PROJECT_ID, REGION, CLOUD_RUN_SERVICE, CERT_NAME, RESERVED_IP, ALLOWED_GOOGLE_GROUP, DOMAIN_NAME, VPC, SUBNET.


## Option 1: External HTTPS Load Balancer + IAP in front of Cloud Run (recommended)

When to use
- You want a public HTTPS URL, but strictly gated via Google Identity-Aware Proxy (IAP) and optionally Cloud Armor.
- Works well for the dashboard and APIs, including WebSockets.

High-level
```
Client → External HTTPS LB (IAP + Cloud Armor) → Serverless NEG → Cloud Run Service
```

Steps (gcloud sketch)
```bash path=null start=null
# 1) Create a serverless NEG pointing to your Cloud Run service
gcloud compute network-endpoint-groups create moe-cr-neg \
  --region=$REGION \
  --network-endpoint-type=serverless \
  --cloud-run-service=$CLOUD_RUN_SERVICE

# 2) Create backend service and attach the NEG
gcloud compute backend-services create moe-backend \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --protocol=HTTP

gcloud compute backend-services add-backend moe-backend \
  --global \
  --network-endpoint-group=moe-cr-neg \
  --network-endpoint-group-region=$REGION

# 3) URL map, HTTPS proxy, cert, and forwarding rule
# Assume you already created a managed cert named $CERT_NAME for $DOMAIN_NAME

gcloud compute url-maps create moe-url-map --default-service=moe-backend

gcloud compute target-https-proxies create moe-https-proxy \
  --url-map=moe-url-map \
  --ssl-certificates=$CERT_NAME

gcloud compute forwarding-rules create moe-https-fr \
  --global \
  --target-https-proxy=moe-https-proxy \
  --ports=443 \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --address=$RESERVED_IP

# 4) Enable IAP for the backend service and grant access
# (Users will authenticate via Google sign-in. Add a group to control access.)
gcloud iap web enable --resource-type=backend-services --service=moe-backend

gcloud iap web add-iam-policy-binding \
  --resource-type=backend-services \
  --service=moe-backend \
  --member=group:$ALLOWED_GOOGLE_GROUP \
  --role=roles/iap.httpsResourceAccessor
```

Notes
- Add Cloud Armor policies if you want additional allowlist/geo/IP controls.
- WebSockets: ensure the dashboard uses wss:// and same domain; LB supports WS.


## Option 2: Internal HTTPS Load Balancer + private DNS to Cloud Run (fully private)

When to use
- Access strictly from inside your VPC (and corp network via VPN/Interconnect). No public exposure.

High-level
```
Corp Network/VPN → Internal HTTPS LB (Regional) → Serverless NEG → Cloud Run Service
             ↘ Private DNS: dashboard.internal.example.com → ILB IP
```

Steps (outline)
1) Create serverless NEG referencing the Cloud Run service (as in Option 1).
2) Create a Regional Internal HTTPS Load Balancer in your VPC/subnet and attach the serverless NEG as the backend.
3) Reserve an internal IP and create the internal forwarding rule.
4) Create a private DNS A record (in the same VPC) mapping your internal hostname to the ILB IP.
5) Enforce app-layer auth (OIDC) or use organization-level controls; Cloud Armor policies can also be attached to internal LBs.

Notes
- Ensure corporate proxies or egress rules allow WebSockets if you need real-time dashboard features.
- This pattern keeps everything private to your enterprise network.


## Option 3: Private Service Connect (PSC) to an internal LB

When to use
- You have multiple VPCs (hub-and-spoke) or different teams/projects that need private access to the dashboard.

High-level
```
Consumer VPC(s) → PSC Endpoint(s) → Producer VPC Internal HTTPS LB → Serverless NEG → Cloud Run
```

Steps (outline)
- Publish the service via an Internal HTTPS LB in a producer VPC (Option 2), then expose it to consumer VPCs via PSC.
- Consumers create PSC endpoints and private DNS for seamless access.

Notes
- Clean VPC boundaries and private DNS routing; no internet exposure.


## Option 4: GCE VM with Docker Compose, fronted by External HTTPS LB + IAP

When to use
- You prefer Docker Compose (aligns with the project’s docker-compose setup) and want full control over runtime and volumes.
- Useful if serverless/LB wiring is constrained by org policies.

High-level
```
Client → External HTTPS LB (IAP) → (Un)Managed Instance Group → GCE VM → Docker Compose (router + agents + dashboard)
```

Steps (outline)
1) Provision a hardened GCE VM (or a small MIG for auto-heal). Place it in the right VPC/subnet.
2) Deploy the MoE stack with docker-compose (persist volumes for registry/decisions). Ensure health checks.
3) Create an External HTTPS LB that targets the instance group. Attach a managed SSL cert and enable IAP on the backend.
4) Lock down the VM with firewall rules; optionally remove its public IP and rely solely on the LB.

Notes
- This pattern gives you durable local volumes and straightforward ops with Compose while retaining enterprise auth via IAP.


## Option 5: Google Cloud Workstations (or Cloud Shell) with Web Preview

When to use
- You need fast validation from inside Google-managed infrastructure without exposing services publicly.

High-level
```
Browser → Workstations (Web Preview tunnel) → VPC → Cloud Run / ILB / VM
```

Steps (outline)
- Spin up a Workstation in the same project/VPC. Run the dashboard (Cloud Run URL or internal LB). Use Web Preview to securely tunnel your browser session.

Notes
- Great for debugging connectivity and WebSockets internally before committing to LB or DNS changes.


## Option 6: Temporary IAP-protected bastion/NGINX reverse proxy

When to use
- Short-term bridge to validate dashboard access and behavior before moving to a formal LB.

High-level
```
Client → IAP (on GCE bastion) → NGINX reverse proxy → Cloud Run internal URL / ILB
```

Sample NGINX site (reverse proxy to backend)
```nginx path=null start=null
server {
  listen 443 ssl http2;
  server_name $DOMAIN_NAME;

  ssl_certificate     /etc/ssl/certs/fullchain.pem;
  ssl_certificate_key /etc/ssl/private/privkey.pem;

  location / {
    proxy_pass https://BACKEND_URL; # e.g., internal LB or Cloud Run URL
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Notes
- Put IAP in front of the bastion’s backend service for auth. Migrate to a proper LB once validated.


## Option 7: Public UI on Vercel, private GCP APIs behind an IAP-secured gateway

When to use
- You want a globally accessible, performant UI while keeping APIs private within GCP.
- Matches a Vercel + Next.js preference for production-grade frontends.

High-level
```
Browser → Vercel (UI) → API Gateway / HTTPS LB + IAP → Cloud Run / ILB / PSC
```

Steps (outline)
1) Deploy the Next.js dashboard to Vercel (UI only; no sensitive server-side logic).
2) Expose a single GCP gateway endpoint (External HTTPS LB + IAP or API Gateway with IAP) that proxies API/WebSocket traffic to private backends.
3) Configure the UI to call the gateway domain. Ensure CORS and cookies (IAP) work correctly.

Notes
- Ensure the gateway supports WebSockets or provide an SSE fallback in the UI.
- Keep secrets server-side in GCP; never expose credentials in the UI.


## WebSockets and SSE fallback

If some corporate proxies block WebSockets, add Server-Sent Events (SSE) as a fallback for real-time updates.

Client SSE example (React)
```ts path=null start=null
useEffect(() => {
  const url = `/api/events`; // same origin as your gateway/LB
  const es = new EventSource(url, { withCredentials: true });

  es.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    // handle update
  };

  es.onerror = () => {
    es.close();
  };

  return () => es.close();
}, []);
```

Server SSE endpoint (Node/Express-style)
```ts path=null start=null
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const timer = setInterval(() => send({ type: 'heartbeat', ts: Date.now() }), 15000);

  req.on('close', () => {
    clearInterval(timer);
  });
});
```


## Decision matrix (quick chooser)
- Broad enterprise access with strong auth, minimal friction: Option 1
- Fully private, VPC-only reachability: Option 2
- Multi-VPC private access: Option 3
- Docker Compose runtime and volume control: Option 4
- Rapid internal validation: Option 5
- Temporary bridge/proxy: Option 6
- Public UI + private APIs: Option 7


## Troubleshooting checklist
- 403 with IAP: confirm user/group has roles/iap.httpsResourceAccessor on the backend service.
- DNS/SAN mismatch: ensure managed cert covers your DOMAIN_NAME and DNS A record points to the LB IP.
- WebSockets not connecting: check corporate proxies, try SSE fallback; confirm LB backend protocol and headers support Upgrade/Connection.
- CORS with IAP: prefer same-origin calls from the UI; if cross-origin, configure CORS carefully at the gateway and avoid exposing credentials.
- Cloud Run timeouts: increase request timeout if the dashboard streams logs/updates; ensure health checks pass.
- VPC reachability (internal patterns): verify firewall rules, subnet routes, and that clients resolve the private DNS to the ILB IP.


## References (conceptual)
- Serverless NEGs with Cloud Run
- External HTTPS Load Balancing with IAP
- Regional Internal HTTPS Load Balancer
- Private Service Connect
- Cloud Armor
- Google Cloud Workstations

This document provides implementation sketches. Tailor IAM, network, and domain settings to your org’s policies.
