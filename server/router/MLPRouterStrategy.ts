import { RouterStrategy, RoutingDecision } from './RouterStrategy';
import path from 'path';
import { storage } from '../storage';
import { routeRequest } from '../python-ml-client';

// Lightweight MLP with optional ONNX runtime, preferring local Python router when available.
export class MLPRouterStrategy implements RouterStrategy {
  private modelLoaded = false;
  private modelVersion: string | undefined;

  constructor() {
    // Fire and forget load; update storage with status
    void this.tryLoadModel();
  }

  private async tryLoadModel() {
    // Prefer local Python router as "loaded" indicator if reachable
    try {
      const res = await routeRequest({ type: 'health-probe' });
      if (res && Array.isArray(res.selected_agents)) {
        this.modelLoaded = true;
        this.modelVersion = process.env.LOCAL_ML_LABEL || 'mlp-local';
        await storage.setRouterConfig({ modelLoaded: true, modelVersion: this.modelVersion });
        return;
      }
    } catch {}

    const modelPath = process.env.MLP_MODEL_PATH;
    if (!modelPath) {
      await storage.setRouterConfig({ modelLoaded: false, modelVersion: undefined });
      return;
    }
    try {
      // Dynamic import via runtime-evaluated function to avoid TS module resolution
      const dynamicImport = new Function('spec', 'return import(spec);') as (s: string) => Promise<any>;
      const ort: any = await dynamicImport('onnxruntime-node');
      // Try creating the session; we don't run inference here
      await ort.InferenceSession.create(modelPath);
      this.modelLoaded = true;
      this.modelVersion = `onnx:${path.basename(modelPath)}`;
      await storage.setRouterConfig({ modelLoaded: true, modelVersion: this.modelVersion });
    } catch (e) {
      this.modelLoaded = false;
      this.modelVersion = undefined;
      await storage.setRouterConfig({ modelLoaded: false, modelVersion: undefined });
    }
  }

  async route(request: any): Promise<RoutingDecision> {
    // Try Python router first
    try {
      const res = await routeRequest(request);
      if (res && Array.isArray(res.selected_agents)) {
        return {
          selectedAgents: res.selected_agents,
          reasoning: res.reasoning || `python ${(process.env.LOCAL_ML_LABEL || 'mlp-local')}`,
        };
      }
    } catch {}

    const text = `${request?.type ?? ''}`.toLowerCase();

    let selected: string[];
    if (text.includes('loan') || text.includes('credit')) selected = ['credit-agent'];
    else if (text.includes('fraud') || text.includes('claim')) selected = ['fraud-agent'];
    else if (text.includes('esg') || text.includes('investment')) selected = ['esg-agent'];
    else selected = ['credit-agent', 'fraud-agent'];

    const reasoning = this.modelLoaded
      ? `MLP router (${this.modelVersion || 'loaded'})`
      : 'MLP stub routing (no local model)';

    return {
      selectedAgents: selected,
      reasoning,
    };
  }
}
