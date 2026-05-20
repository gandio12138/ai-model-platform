import 'app/bootstrap.dart';
import 'app/env.dart';

Future<void> main() async {
  await runOneTokenApp(AppEnv.dev());
}
