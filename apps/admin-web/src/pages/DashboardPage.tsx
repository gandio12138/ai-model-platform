import { Button, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "../api.js";

type RevenueTrendPoint = {
  date: string;
  label: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  orders: number;
};

type RequestTrendPoint = {
  date: string;
  label: string;
  requests: number;
  tokens: number;
  errorRequests: number;
  avgLatencyMs: number;
};

type TopModel = {
  public_model_code: string;
  requests: number;
  tokens: number;
  errorRequests: number;
  avgLatencyMs: number;
};

type TopTenant = {
  tenant_id: string;
  tenant_name: string;
  revenue: number;
  orders: number;
};

type DashboardData = {
  todayRevenue: number;
  todayCost: number;
  todayGrossProfit: number;
  todayRequests: number;
  todayTokens: number;
  todayAverageLatencyMs: number;
  revenueTrend: RevenueTrendPoint[];
  requestTrend: RequestTrendPoint[];
  modelUsageTop: TopModel[];
  tenantRevenueTop: TopTenant[];
  paymentOrdersByStatus: { status: string; count: string }[];
  requestsByStatus: { status: string; count: string }[];
  providerHealth: any[];
  paymentStatus: any[];
};

function money(cents: number) {
  return `¥ ${(Number(cents || 0) / 100).toFixed(2)}`;
}

function compact(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function linePath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function TrendLineChart({
  data,
  series
}: {
  data: RevenueTrendPoint[];
  series: { key: keyof RevenueTrendPoint; label: string; color: string; formatter: (value: number) => string }[];
}) {
  const width = 680;
  const height = 250;
  const pad = { top: 22, right: 24, bottom: 34, left: 52 };
  const maxValue = Math.max(1, ...data.flatMap((item) => series.map((line) => Number(item[line.key] || 0))));
  const stepX = data.length > 1 ? (width - pad.left - pad.right) / (data.length - 1) : 0;
  const y = (value: number) => pad.top + (1 - value / maxValue) * (height - pad.top - pad.bottom);
  const x = (index: number) => pad.left + index * stepX;

  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <div className="chart-panel">
      <div className="chart-legend">
        {series.map((item) => (
          <span key={String(item.key)}><i style={{ background: item.color }} />{item.label}</span>
        ))}
      </div>
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const gridY = pad.top + ratio * (height - pad.top - pad.bottom);
          const value = maxValue * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={pad.left} x2={width - pad.right} y1={gridY} y2={gridY} className="chart-grid-line" />
              <text x={pad.left - 10} y={gridY + 4} textAnchor="end" className="chart-axis-text">{money(value)}</text>
            </g>
          );
        })}
        {data.map((item, index) => (
          <text key={item.date} x={x(index)} y={height - 10} textAnchor="middle" className="chart-axis-text">
            {index % 2 === 0 || data.length <= 8 ? item.label : ""}
          </text>
        ))}
        {series.map((item) => {
          const points = data.map((row, index) => ({ x: x(index), y: y(Number(row[item.key] || 0)), raw: Number(row[item.key] || 0), label: row.label }));
          return (
            <g key={String(item.key)}>
              <path d={linePath(points)} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point) => (
                <circle key={`${item.key}-${point.label}`} cx={point.x} cy={point.y} r="3.5" fill={item.color}>
                  <title>{`${item.label} ${point.label}: ${item.formatter(point.raw)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RequestBarChart({ data }: { data: RequestTrendPoint[] }) {
  const width = 680;
  const height = 250;
  const pad = { top: 22, right: 18, bottom: 34, left: 46 };
  const maxValue = Math.max(1, ...data.map((item) => item.requests));
  const slot = data.length ? (width - pad.left - pad.right) / data.length : 0;
  const barWidth = Math.max(10, Math.min(28, slot * 0.52));
  const chartHeight = height - pad.top - pad.bottom;

  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <div className="chart-panel">
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const gridY = pad.top + ratio * chartHeight;
          const value = maxValue * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={pad.left} x2={width - pad.right} y1={gridY} y2={gridY} className="chart-grid-line" />
              <text x={pad.left - 10} y={gridY + 4} textAnchor="end" className="chart-axis-text">{compact(value)}</text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const barHeight = (item.requests / maxValue) * chartHeight;
          const x = pad.left + index * slot + (slot - barWidth) / 2;
          const y = pad.top + chartHeight - barHeight;
          return (
            <g key={item.date}>
              <rect className="request-bar" x={x} y={y} width={barWidth} height={Math.max(2, barHeight)} rx="4">
                <title>{`${item.label}: ${compact(item.requests)} 次请求 / ${compact(item.tokens)} Token / 错误率 ${percent(item.errorRequests, item.requests)}`}</title>
              </rect>
              <text x={pad.left + index * slot + slot / 2} y={height - 10} textAnchor="middle" className="chart-axis-text">
                {index % 2 === 0 || data.length <= 8 ? item.label : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TopList({
  title,
  items,
  value,
  renderValue,
  secondary
}: {
  title: string;
  items: any[];
  value: (item: any) => number;
  renderValue: (item: any) => string;
  secondary: (item: any) => string;
}) {
  const maxValue = Math.max(1, ...items.map(value));

  return (
    <Card title={title}>
      {!items.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="top-list">
          {items.map((item, index) => {
            const currentValue = value(item);
            return (
              <div className="top-list-row" key={item.public_model_code ?? item.tenant_id ?? index}>
                <div className="top-list-main">
                  <span className="top-list-name">{item.public_model_code ?? item.tenant_name}</span>
                  <span className="top-list-value">{renderValue(item)}</span>
                </div>
                <div className="top-list-track">
                  <div className="top-list-bar" style={{ width: `${Math.max(4, (currentValue / maxValue) * 100)}%` }} />
                </div>
                <div className="top-list-sub">{secondary(item)}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setData(await apiFetch<DashboardData>("/api/admin/dashboard"));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const requestStatusTotal = useMemo(
    () => (data?.requestsByStatus ?? []).reduce((sum: number, item: any) => sum + Number(item.count ?? 0), 0),
    [data]
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3}>仪表盘</Typography.Title>
          <Typography.Text type="secondary">收入、成本、请求趋势、模型用量和支付状态</Typography.Text>
        </div>
        <Button icon={<RefreshCw size={16} />} onClick={load} loading={loading}>刷新</Button>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} md={8} xl={4}>
          <Card><Statistic title="今日收入" value={money(data?.todayRevenue ?? 0)} /></Card>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <Card><Statistic title="今日成本" value={money(data?.todayCost ?? 0)} /></Card>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <Card><Statistic title="今日毛利" value={money(data?.todayGrossProfit ?? 0)} /></Card>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <Card><Statistic title="今日请求" value={compact(data?.todayRequests ?? 0)} /></Card>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <Card><Statistic title="今日 Token" value={compact(data?.todayTokens ?? 0)} /></Card>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <Card><Statistic title="平均延迟" value={data?.todayAverageLatencyMs ?? 0} suffix="ms" /></Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} className="dashboard-grid">
        <Col xs={24} xl={12}>
          <Card title="14 天收入 / 成本趋势">
            <TrendLineChart
              data={data?.revenueTrend ?? []}
              series={[
                { key: "revenue", label: "收入", color: "#2563eb", formatter: money },
                { key: "cost", label: "成本", color: "#f97316", formatter: money },
                { key: "grossProfit", label: "毛利", color: "#16a34a", formatter: money }
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="14 天请求趋势">
            <RequestBarChart data={data?.requestTrend ?? []} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} className="dashboard-grid">
        <Col xs={24} lg={12}>
          <TopList
            title="7 天模型请求 Top"
            items={data?.modelUsageTop ?? []}
            value={(item: TopModel) => item.requests}
            renderValue={(item: TopModel) => `${compact(item.requests)} 次`}
            secondary={(item: TopModel) => `${compact(item.tokens)} Token / 错误率 ${percent(item.errorRequests, item.requests)} / ${item.avgLatencyMs}ms`}
          />
        </Col>
        <Col xs={24} lg={12}>
          <TopList
            title="30 天租户收入 Top"
            items={data?.tenantRevenueTop ?? []}
            value={(item: TopTenant) => item.revenue}
            renderValue={(item: TopTenant) => money(item.revenue)}
            secondary={(item: TopTenant) => `${compact(item.orders)} 笔已支付订单`}
          />
        </Col>
      </Row>

      <Row gutter={[12, 12]} className="dashboard-grid">
        <Col xs={24} lg={12}>
          <Card title="Provider 健康">
            <Table
              rowKey="code"
              size="small"
              pagination={false}
              dataSource={data?.providerHealth ?? []}
              columns={[
                { title: "Provider", dataIndex: "name" },
                { title: "状态", dataIndex: "health_status", render: (value) => <Tag color={value === "healthy" ? "green" : "orange"}>{value}</Tag> },
                { title: "健康分", dataIndex: "health_score" }
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="支付渠道状态"
            extra={<Typography.Text type="secondary">近 7 天请求状态数：{compact(requestStatusTotal)}</Typography.Text>}
          >
            <Table
              rowKey={(row: any) => `${row.checkout_channel}-${row.status}`}
              size="small"
              pagination={false}
              dataSource={data?.paymentStatus ?? []}
              columns={[
                { title: "渠道", dataIndex: "checkout_channel" },
                { title: "状态", dataIndex: "status" },
                { title: "数量", dataIndex: "count" }
              ]}
            />
            <Space wrap className="status-tags">
              {(data?.requestsByStatus ?? []).map((item: any) => (
                <Tag key={item.status}>{item.status}: {compact(Number(item.count ?? 0))}</Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
