import 'package:intl/intl.dart';

final _currency = NumberFormat.currency(locale: 'zh_CN', symbol: '¥');
final _number = NumberFormat.decimalPattern('zh_CN');
final _date = DateFormat('yyyy-MM-dd HH:mm:ss');

String centsToCurrency(num cents) => _currency.format(cents / 100);

String yuanToCurrency(num yuan) => _currency.format(yuan);

String compactNumber(num value) => _number.format(value);

String formatDate(DateTime value) => _date.format(value);

int yuanToCents(num yuan) => (yuan * 100).round();
