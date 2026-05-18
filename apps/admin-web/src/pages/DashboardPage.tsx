import { Card, Col, Row, Statistic, Table, Tag, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "antd";
import { apiFetch } from "../api.js";

function money(cents: number) {
  return `¥ ${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setData(await apiFetch("/api/admin/dashboard"));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3}>仪表盘</Typography.Title>
          <Typography.Text type="secondary">收入、成本、请求、支付和 Provider 健康状态</Typography.Text>
        </div>
        <Button icon={<RefreshCw size={16} />} onClick={load} loading={loading}>刷新</Button>
      </div>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={6}>
          <Card><Statistic title="今日收入" value={money(data?.todayRevenue)} /></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><Statistic title="今日成本" value={money(data?.todayCost)} /></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><Statistic title="今日毛利" value={money(data?.todayGrossProfit)} /></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><Statistic title="24h 请求状态数" value={data?.requestsByStatus?.length ?? 0} /></Card>
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
          <Card title="支付渠道状态">
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
          </Card>
        </Col>
      </Row>
    </div>
  );
}
