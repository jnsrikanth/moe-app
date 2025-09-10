import { BigQuery } from '@google-cloud/bigquery';

export type CostRow = { period: string; service: string; cost_usd: number };

export async function fetchCosts(opts: { billingProjectId: string; dataset: string; table: string; projectIdFilter: string; granularity?: 'day'|'week'|'month'|'all'; start?: string; end?: string; }): Promise<{ rows: CostRow[] }> {
  const { billingProjectId, dataset, table, projectIdFilter } = opts;
  const gran = opts.granularity || 'all';
  const where: string[] = [`project.id = @PROJECT_ID`];
  const params: any = { PROJECT_ID: projectIdFilter };

  if (opts.start) { where.push(`usage_start_time >= @START`); params.START = opts.start; }
  if (opts.end)   { where.push(`usage_end_time   <= @END`);   params.END   = opts.end; }

  const periodExpr = gran === 'day' ? 'FORMAT_DATE("%Y-%m-%d", DATE(usage_start_time))' :
                     gran === 'week' ? 'FORMAT_DATE("%G-W%V", DATE(usage_start_time))' :
                     gran === 'month' ? 'FORMAT_DATE("%Y-%m", DATE(usage_start_time))' :
                     '"ALL_TIME"';

  // Compute net cost including credits (if present). Works for both standard and detailed export.
  const sql = `
    WITH rows AS (
      SELECT
        ${periodExpr} AS period,
        service.description AS service,
        -- Sum credits in-row if present (repeated credits field)
        (SELECT SUM(c.amount) FROM UNNEST(credits) c) AS credit_amount,
        cost
      FROM \`${billingProjectId}.${dataset}.${table}\`
      WHERE ${where.join(' AND ')}
    )
    SELECT
      period,
      service,
      ROUND(SUM(COALESCE(cost, 0) + COALESCE(credit_amount, 0)), 2) AS cost_usd
    FROM rows
    GROUP BY period, service
    ORDER BY period, cost_usd DESC
  `;

  const bq = new BigQuery({ projectId: billingProjectId });
  const [job] = await bq.createQueryJob({
    query: sql,
    params,
    useLegacySql: false,
  });
  const [rows] = await job.getQueryResults();
  return { rows: rows as any };
}
