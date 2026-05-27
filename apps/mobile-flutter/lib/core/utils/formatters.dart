import 'package:intl/intl.dart';

final _currency = NumberFormat.currency(locale: 'zh_CN', symbol: '¥');
final _number = NumberFormat.decimalPattern('zh_CN');
final _date = DateFormat('yyyy-MM-dd HH:mm:ss');

String centsToCurrency(num cents) => _currency.format(cents / 100);

String yuanToCurrency(num yuan) => _currency.format(yuan);

String centsPer1mToCurrencyPer1k(num centsPer1m) {
  final yuanPer1k = centsPer1m / 100000;
  return '¥${yuanPer1k.toStringAsFixed(6).replaceFirst(RegExp(r'\.?0+$'), '')} / 1K';
}

String centsPer1kToCurrencyPer1k(num centsPer1k) {
  final yuanPer1k = centsPer1k / 100;
  return '¥${yuanPer1k.toStringAsFixed(6).replaceFirst(RegExp(r'\.?0+$'), '')} / 1K';
}

String modelTokenPricePer1k({int? centsPer1m, required int centsPer1k}) {
  if (centsPer1m != null && centsPer1m > 0) {
    return centsPer1mToCurrencyPer1k(centsPer1m);
  }
  return centsPer1kToCurrencyPer1k(centsPer1k);
}

String modelUnitPrice({
  int? unitPriceAmount,
  String? unitLabel,
  String? display,
}) {
  if (unitPriceAmount != null && unitPriceAmount > 0) {
    final label = unitLabel == null || unitLabel.isEmpty ? '' : ' / $unitLabel';
    return '¥${(unitPriceAmount / 100).toStringAsFixed(6).replaceFirst(RegExp(r'\.?0+$'), '')}$label';
  }
  return display == null || display.isEmpty ? '-' : display;
}

String compactNumber(num value) => _number.format(value);

String formatDate(DateTime value) => _date.format(value);

int yuanToCents(num yuan) => (yuan * 100).round();
