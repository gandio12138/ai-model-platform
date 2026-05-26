import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile_flutter/app/bootstrap.dart';
import 'package:mobile_flutter/app/env.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('dev mock app can reach auth or home entry', (tester) async {
    runOTokenApp(AppEnv.dev());
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.textContaining('登录账号'), findsWidgets);
  });
}
