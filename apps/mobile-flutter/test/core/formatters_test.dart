import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_flutter/core/network/api_models.dart';
import 'package:mobile_flutter/core/utils/formatters.dart';

void main() {
  test('formats cents as RMB', () {
    expect(centsToCurrency(3520), contains('35.20'));
  });

  test('converts yuan to cents', () {
    expect(yuanToCents(35.2), 3520);
  });

  test('formats model token price per 1k without trailing zeros', () {
    expect(modelTokenPricePer1k(centsPer1m: 4818, centsPer1k: 5), '¥0.04818/1K');
    expect(modelTokenPricePer1k(centsPer1m: null, centsPer1k: 2), '¥0.02/1K');
  });

  test('parses app config payment switches', () {
    final config = AppConfig.fromJson({
      'tenant_id': 't1',
      'project_id': 'p1',
      'available_payment_methods': ['apple_iap'],
      'show_web_payment_link': false,
      'legal_approved': true,
      'developer_api_enabled': true,
    });
    expect(config.tenantId, 't1');
    expect(config.availablePaymentMethods, ['apple_iap']);
    expect(config.showWebPaymentLink, isFalse);
  });

  test('parses chat estimate balance result', () {
    final estimate = ChatEstimate.fromJson({
      'model': 'gpt-4o',
      'input_tokens': 1240,
      'output_token_limit': 2000,
      'estimated_cost': 83,
      'current_balance': 3520,
    });
    expect(estimate.balanceEnough, isTrue);
    expect(estimate.estimatedCost, 83);
  });

  test('parses payment status', () {
    final order = PaymentOrder.fromJson({
      'id': '1',
      'order_no': 'o1',
      'status': 'fulfilled',
    });
    expect(order.fulfilled, isTrue);
  });

  test('paid payment order still waits for fulfillment', () {
    final order = PaymentOrder.fromJson({
      'id': '1',
      'order_no': 'o1',
      'status': 'PAID',
    });
    expect(order.fulfilled, isFalse);
    expect(order.paidWaitingFulfillment, isTrue);
    expect(order.statusLabel, '已支付，待入账');
  });

  test('parses billing record', () {
    final record = LedgerRecord.fromJson({
      'id': 'l1',
      'event_type': 'usage.charge',
      'amount': 61,
      'direction': 'debit',
      'created_at': '2026-05-18T14:25:10Z',
      'request_id': 'req_1',
    });
    expect(record.type, 'usage.charge');
    expect(record.amount, 61);
    expect(record.relatedId, 'req_1');
  });
}
