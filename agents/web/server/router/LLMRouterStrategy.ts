import { RouterStrategy, RoutingDecision } from './RouterStrategy';

export class LLMRouterStrategy implements RouterStrategy {
  private delegate: (request: any) => Promise<RoutingDecision>;

  constructor(delegate: (request: any) => Promise<RoutingDecision>) {
    this.delegate = delegate;
  }

  async route(request: any): Promise<RoutingDecision> {
    return this.delegate(request);
  }
}
