export type RoutingDecision = {
  selectedAgents: string[];
  reasoning: string;
};

export interface RouterStrategy {
  route(request: any): Promise<RoutingDecision>;
}
